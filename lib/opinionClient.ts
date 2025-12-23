import { Market, PriceData, PriceHistoryPoint, UserPosition } from './types'
import { getConfig } from './config'
import { rateLimiter, ExponentialBackoff } from './rateLimiter'

/**
 * Opinion API Client for interacting with Opinion OpenAPI
 * Handles authentication, error handling, and rate limiting
 */
export class OpinionClient {
  private readonly baseUrl: string
  private readonly apiKey: string
  private readonly timeout: number

  constructor() {
    const config = getConfig()
    this.baseUrl = config.OPINION_BASE_URL
    this.apiKey = config.OPINION_API_KEY
    this.timeout = config.API_TIMEOUT || 10000
  }

  /**
   * Make authenticated HTTP request to Opinion API with rate limiting
   * Requirement 6.1: Include HTTP header "apikey" with API key
   * Requirement 6.5: Implement rate limit mitigation mechanisms
   */
  private async makeRequest<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
    // Ensure endpoint starts with / for proper URL construction
    const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
    // Base URL already includes /openapi, so we append the endpoint
    const url = new URL(this.baseUrl + normalizedEndpoint)
    
    // Add query parameters if provided
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, value)
      })
    }

    // Create request key for deduplication
    const requestKey = `${endpoint}:${JSON.stringify(params || {})}`

    // Execute request with rate limiting protections
    return rateLimiter.executeRequest(requestKey, async () => {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), this.timeout)

      try {
        const response = await fetch(url.toString(), {
          method: 'GET',
          headers: {
            'apikey': this.apiKey,
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        // Requirement 6.4: Handle external API unavailability
        if (!response.ok) {
          // Handle rate limiting specifically
          if (response.status === 429) {
            const retryAfter = response.headers.get('Retry-After')
            const delay = retryAfter ? parseInt(retryAfter) * 1000 : 5000
            throw new Error(`Rate limit exceeded (429). Retry after ${delay}ms`)
          }
          throw new Error(`Opinion API error: ${response.status} ${response.statusText}`)
        }

        const data = await response.json()
        return data
      } catch (error) {
        clearTimeout(timeoutId)
        
        // Requirement 6.2: Handle responses with missing data gracefully
        if (error instanceof Error) {
          if (error.name === 'AbortError') {
            throw new Error('Opinion API request timeout')
          }
          throw new Error(`Opinion API request failed: ${error.message}`)
        }
        throw new Error('Unknown Opinion API error')
      }
    })
  }

  /**
   * Get all available markets with rate limiting
   * Maps Opinion API response to internal Market interface
   * Returns empty array on failure - no fallback data
   * 
   * API Documentation: GET /market?status=activated&limit=20&sortBy=5
   * Response: { code: 0, msg: "success", result: { total: number, list: Market[] } }
   * sortBy: 5 = volume24h desc (according to API docs)
   */
  async getMarkets(): Promise<Market[]> {
    try {
      // Use exponential backoff for critical requests
      // sortBy=5 sorts by volume24h descending (per API documentation)
      const response = await ExponentialBackoff.executeWithBackoff(
        () => this.makeRequest<any>('/market', { 
          status: 'activated', 
          limit: '20',
          sortBy: '5' // volume24h desc
        }),
        2, // Max 2 attempts
        1000 // 1 second base delay
      )
      
      // Handle Opinion API response structure: { code: 0, result: { list: Market[] } }
      if (!response) {
        console.warn('[OpinionClient] Empty response for markets')
        return []
      }

      // Check for API-level errors (code !== 0 means error)
      if (response.code !== undefined && response.code !== 0) {
        console.warn(`[OpinionClient] API returned error for markets: code=${response.code}, errmsg=${response.errmsg || ''}`)
        return []
      }

      // Data is in result.list according to documentation
      if (!response.result || !Array.isArray(response.result.list)) {
        console.warn('[OpinionClient] Unexpected markets response structure:', response)
        return []
      }

      return response.result.list.map((market: any) => ({
        id: market.marketId || market.id || 0,
        title: market.marketTitle || market.title || '',
        yesTokenId: market.yesTokenId || '',
        noTokenId: market.noTokenId || '',
        cutoffAt: market.cutoffAt || 0,
        status: market.statusEnum || market.status || 'unknown',
        volume24h: market.volume24h || '0',
      }))
    } catch (error) {
      console.error('[OpinionClient] Failed to fetch markets:', error)
      return []
    }
  }

  /**
   * Get latest price for a specific token with rate limiting
   * Returns current price data with timestamp
   * Returns zero price on failure - no fallback data
   * 
   * API Documentation: GET /token/latest-price?token_id={id}
   * Response: { code: 0, result: { tokenId, price, timestamp } }
   */
  async getLatestPrice(tokenId: string): Promise<PriceData> {
    try {
      // Fix: Use correct endpoint /token/latest-price?token_id={id}
      const response = await this.makeRequest<any>('/token/latest-price', { token_id: tokenId })
      
      if (!response) {
        console.warn(`[OpinionClient] Empty response for token ${tokenId} price`)
        return { tokenId, price: '0', timestamp: Date.now() }
      }

      // Check for API-level errors (code !== 0 means error)
      if (response.code !== undefined && response.code !== 0) {
        console.warn(`[OpinionClient] API returned error for token ${tokenId} price: code=${response.code}, errmsg=${response.errmsg || ''}`)
        return { tokenId, price: '0', timestamp: Date.now() }
      }

      // Data is in result according to documentation
      if (!response.result) {
        console.warn(`[OpinionClient] Unexpected price response structure for token ${tokenId}:`, response)
        return { tokenId, price: '0', timestamp: Date.now() }
      }

      const priceData = response.result
      return {
        tokenId: priceData.tokenId || tokenId,
        price: priceData.price || '0',
        timestamp: priceData.timestamp || Date.now(),
      }
    } catch (error) {
      console.error(`[OpinionClient] Failed to fetch price for token ${tokenId}:`, error)
      return { tokenId, price: '0', timestamp: Date.now() }
    }
  }

  /**
   * Get price history for a specific token with rate limiting
   * Returns array of historical price points
   * Returns empty array on failure - no fallback data
   * 
   * API Documentation: GET /token/price-history?token_id={id}&interval={1h|1d}
   * Response: { code: 0, result: { history: PricePoint[] } }
   */
  async getPriceHistory(tokenId: string, interval: string = '1h'): Promise<PriceHistoryPoint[]> {
    try {
      // Fix: Use correct endpoint /token/price-history?token_id={id}&interval={1h|1d}
      const response = await this.makeRequest<any>('/token/price-history', { 
        token_id: tokenId,
        interval: interval
      })
      
      if (!response) {
        console.warn(`[OpinionClient] Empty response for token ${tokenId} price history`)
        return []
      }

      // Check for API-level errors (code !== 0 means error)
      if (response.code !== undefined && response.code !== 0) {
        console.warn(`[OpinionClient] API returned error for token ${tokenId} price history: code=${response.code}, errmsg=${response.errmsg || ''}`)
        return []
      }

      // Data is in result.history according to documentation
      if (!response.result || !Array.isArray(response.result.history)) {
        console.warn(`[OpinionClient] Unexpected price history response structure for token ${tokenId}:`, response)
        return []
      }

      return response.result.history.map((point: any) => ({
        t: point.t || point.timestamp || 0,
        p: point.p || point.price || '0',
      }))
    } catch (error) {
      console.error(`[OpinionClient] Failed to fetch price history for token ${tokenId}:`, error)
      return []
    }
  }

  /**
   * Get user positions for a wallet address
   * Frontend-facing helper: returns [] on failure to avoid breaking UI flows
   * 
   * API Response structure:
   * {
   *   errmsg: string,
   *   errno: number,
   *   result: {
   *     total: number,
   *     list: Position[]
   *   }
   * }
   */
  async getUserPositions(walletAddress: string): Promise<UserPosition[]> {
    try {
      const response = await this.makeRequest<any>(`/positions/user/${walletAddress}`)

      // Handle Opinion API response structure: { errmsg, errno, result: { total, list } }
      if (!response) {
        console.warn(`[OpinionClient] Empty response for positions of ${walletAddress}`)
        return []
      }

      // Check for API-level errors
      // Note: Positions endpoint uses errno (not code) based on actual API response
      if (response.errno !== undefined && response.errno !== 0) {
        console.warn(`[OpinionClient] API returned error for positions: errno=${response.errno}, errmsg=${response.errmsg || ''}`)
        return []
      }

      // Also check code field if present
      if (response.code !== undefined && response.code !== 0) {
        console.warn(`[OpinionClient] API returned error for positions: code=${response.code}, errmsg=${response.errmsg || ''}`)
        return []
      }

      // Extract positions from result.list
      if (response.result && Array.isArray(response.result.list)) {
        console.log(`[OpinionClient] Successfully fetched ${response.result.list.length} positions (total: ${response.result.total})`)
        return response.result.list
      }

      // Fallback: try direct array or data property (for backwards compatibility)
      if (Array.isArray(response)) {
        return response
      }

      if (response.data && Array.isArray(response.data)) {
        return response.data
      }

      console.warn(`[OpinionClient] Unexpected response structure for positions:`, response)
      return []
    } catch (error) {
      // Log detailed error information
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error(`[OpinionClient] Failed to fetch user positions for ${walletAddress}:`, {
        error: errorMessage,
        endpoint: `/positions/user/${walletAddress}`,
        baseUrl: this.baseUrl
      })
      
      // Return empty array to keep UI functional
      return []
    }
  }

  /**
   * Get rate limiter status for monitoring
   */
  getRateLimiterStatus(): { circuitBreakerState: string } {
    return {
      circuitBreakerState: rateLimiter.getCircuitBreakerState()
    }
  }
}

/**
 * Default Opinion API client instance
 */
export const opinionClient = new OpinionClient()