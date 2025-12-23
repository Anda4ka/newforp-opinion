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
    const url = new URL(endpoint, this.baseUrl)
    
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
   */
  async getMarkets(): Promise<Market[]> {
    try {
      // Use exponential backoff for critical requests
      const response = await ExponentialBackoff.executeWithBackoff(
        () => this.makeRequest<any>('/markets'),
        2, // Max 2 attempts
        1000 // 1 second base delay
      )
      
      // Handle Opinion API response structure: { errmsg, errno, result: { data } }
      if (!response) {
        console.warn('[OpinionClient] Empty response for markets')
        return []
      }

      // Check for API-level errors
      if (response.errno !== undefined && response.errno !== 0) {
        console.warn(`[OpinionClient] API returned error for markets: errno=${response.errno}, errmsg=${response.errmsg}`)
        return []
      }

      // Try different response structures
      let marketsData: any[] = []
      
      if (response.result && Array.isArray(response.result.data)) {
        marketsData = response.result.data
      } else if (response.result && Array.isArray(response.result)) {
        marketsData = response.result
      } else if (Array.isArray(response.data)) {
        marketsData = response.data
      } else if (Array.isArray(response)) {
        marketsData = response
      } else {
        console.warn('[OpinionClient] Unexpected markets response structure:', response)
        return []
      }

      return marketsData.map((market: any) => ({
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
   */
  async getLatestPrice(tokenId: string): Promise<PriceData> {
    try {
      const response = await this.makeRequest<any>(`/tokens/${tokenId}/price`)
      
      if (!response) {
        console.warn(`[OpinionClient] Empty response for token ${tokenId} price`)
        return { tokenId, price: '0', timestamp: Date.now() }
      }

      // Check for API-level errors
      if (response.errno !== undefined && response.errno !== 0) {
        console.warn(`[OpinionClient] API returned error for token ${tokenId} price: errno=${response.errno}, errmsg=${response.errmsg}`)
        return { tokenId, price: '0', timestamp: Date.now() }
      }

      // Try different response structures
      let priceData: any = null
      
      if (response.result && response.result.data) {
        priceData = response.result.data
      } else if (response.result && response.result.price !== undefined) {
        priceData = response.result
      } else if (response.data) {
        priceData = response.data
      } else if (response.price !== undefined) {
        priceData = response
      } else {
        console.warn(`[OpinionClient] Unexpected price response structure for token ${tokenId}:`, response)
        return { tokenId, price: '0', timestamp: Date.now() }
      }

      return {
        tokenId,
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
   */
  async getPriceHistory(tokenId: string, interval: string = '1h'): Promise<PriceHistoryPoint[]> {
    try {
      const params = { interval }
      const response = await this.makeRequest<any>(`/tokens/${tokenId}/price-history`, params)
      
      if (!response) {
        console.warn(`[OpinionClient] Empty response for token ${tokenId} price history`)
        return []
      }

      // Check for API-level errors
      if (response.errno !== undefined && response.errno !== 0) {
        console.warn(`[OpinionClient] API returned error for token ${tokenId} price history: errno=${response.errno}, errmsg=${response.errmsg}`)
        return []
      }

      // Try different response structures
      let historyData: any[] = []
      
      if (response.result && Array.isArray(response.result.data)) {
        historyData = response.result.data
      } else if (response.result && Array.isArray(response.result)) {
        historyData = response.result
      } else if (Array.isArray(response.data)) {
        historyData = response.data
      } else if (Array.isArray(response)) {
        historyData = response
      } else {
        console.warn(`[OpinionClient] Unexpected price history response structure for token ${tokenId}:`, response)
        return []
      }

      return historyData.map((point: any) => ({
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
      if (response.errno !== undefined && response.errno !== 0) {
        console.warn(`[OpinionClient] API returned error for positions: errno=${response.errno}, errmsg=${response.errmsg || ''}`)
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