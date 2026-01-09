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
  /**
   * Make authenticated HTTP request to Opinion API with rate limiting
   * Requirement 6.1: Include HTTP header "apikey" with API key
   * Requirement 6.5: Implement rate limit mitigation mechanisms
   */
  private async makeRequest<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
    // Ensure endpoint starts with / for proper URL construction
    const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
    // Base URL already includes /openapi, so we append the endpoint
    // Example: https://openapi.opinion.trade/openapi + /market = https://openapi.opinion.trade/openapi/market
    const url = new URL(this.baseUrl + normalizedEndpoint)

    // Add query parameters if provided
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, value)
      })
    }

    // Create request key for deduplication
    const requestKey = `${endpoint}:${JSON.stringify(params || {})}`

    // Execute request with enhanced rate limiting protections
    return rateLimiter.executeRequest(requestKey, async () => {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), this.timeout)

      try {
        const fullUrl = url.toString()
        console.log(`[OpinionClient] Making request to: ${fullUrl}`)

        const response = await fetch(fullUrl, {
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
          const errorText = await response.text().catch(() => '')
          console.error(`[OpinionClient] HTTP error ${response.status}: ${errorText}`)
          throw new Error(`Opinion API error: ${response.status} ${response.statusText}`)
        }

        const data = await response.json()
        console.log(`[OpinionClient] Response received for ${endpoint}:`, {
          code: data.code,
          hasResult: !!data.result,
          resultType: data.result ? typeof data.result : 'none'
        })
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
   * Get paginated markets with rate limiting
   * Maps Opinion API response to internal Market interface
   * Returns empty array on failure - no fallback data
   * 
   * API Documentation: GET /market?status=activated&limit=20&page=1&sortBy=3
   * Response: { code: 0, msg: "success", result: { total: number, list: Market[] } }
   * sortBy: 3 = volume desc (default per requirements)
   */
  async getMarkets(page: number = 1, sortBy: number = 3, limit: number = 50): Promise<{ markets: Market[], total: number }> {
    try {
      // Use exponential backoff for critical requests
      // sortBy=3 sorts by volume descending (default per requirements)
      const response = await ExponentialBackoff.executeWithBackoff(
        () => this.makeRequest<any>('/market', {
          status: 'activated',
          limit: String(limit),
          page: String(page),
          sortBy: String(sortBy)
        }),
        2, // Max 2 attempts
        1000 // 1 second base delay
      )

      // Handle Opinion API response structure: { code: 0, msg: "success", result: { total: number, list: Market[] } }
      if (!response) {
        console.warn('[OpinionClient] Empty response for markets')
        return { markets: [], total: 0 }
      }

      // Check for API-level errors (code !== 0 means error per API documentation)
      // Some responses may not have code field, so we check if it exists and is non-zero
      if (response.code !== undefined && response.code !== 0) {
        console.warn(`[OpinionClient] API returned error for markets: code=${response.code}, msg=${response.msg || response.errmsg || ''}`)
        return { markets: [], total: 0 }
      }

      // Also check errno field (used by some endpoints like positions)
      if (response.errno !== undefined && response.errno !== 0) {
        console.warn(`[OpinionClient] API returned error for markets: errno=${response.errno}, errmsg=${response.errmsg || ''}`)
        return { markets: [], total: 0 }
      }

      // Data is in result.list according to documentation
      if (!response.result) {
        console.warn('[OpinionClient] No result field in markets response:', response)
        return { markets: [], total: 0 }
      }

      if (!Array.isArray(response.result.list)) {
        console.warn('[OpinionClient] result.list is not an array:', {
          result: response.result,
          resultType: typeof response.result,
          listType: typeof response.result.list
        })
        return { markets: [], total: 0 }
      }

      const total = response.result.total || 0
      const markets = response.result.list.map((market: any) => ({
        id: market.marketId || market.id || 0,
        title: market.marketTitle || market.title || '',
        yesTokenId: market.yesTokenId || '',
        noTokenId: market.noTokenId || '',
        cutoffAt: market.cutoffAt || 0,
        status: market.statusEnum || market.status || 'unknown',
        volume24h: market.volume24h || '0',
        marketType: market.marketType || 0,
        questionId: market.questionId,
        rules: market.rules,
        yesLabel: market.yesLabel,
        noLabel: market.noLabel,
        childMarkets: market.childMarkets ? market.childMarkets.map((cm: any) => ({
          id: cm.marketId,
          title: cm.marketTitle,
          yesTokenId: cm.yesTokenId,
          noTokenId: cm.noTokenId,
          cutoffAt: cm.cutoffAt,
          status: cm.statusEnum,
          volume24h: cm.volume,
          marketType: 0, // Child markets are effectively binary
          questionId: cm.questionId,
          rules: cm.rules,
          yesLabel: cm.yesLabel,
          noLabel: cm.noLabel
        })) : []
      }))

      console.log(`[OpinionClient] Successfully parsed ${markets.length} markets (page ${page}, total: ${total})`)

      return { markets, total }
    } catch (error) {
      console.error('[OpinionClient] Failed to fetch markets:', error)
      return { markets: [], total: 0 }
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

      // Checking for price=0 case specifically
      if (response && response.result && (response.result.price === '0' || response.result.price === 0)) {
        console.log(`[OpinionClient] Token ${tokenId} has explicit 0 price from API.`)
      }

      // Check for API-level errors (code !== 0 means error per API documentation)
      if (response.code !== undefined && response.code !== 0) {
        console.warn(`[OpinionClient] API returned error for token ${tokenId} price: code=${response.code}, msg=${response.msg || response.errmsg || ''}`)
        return { tokenId, price: '0', timestamp: Date.now() }
      }

      // Data is in result according to documentation: { code: 0, result: { tokenId, price, side, size, timestamp } }
      if (!response.result) {
        console.warn(`[OpinionClient] No result field in price response for token ${tokenId}:`, response)
        return { tokenId, price: '0', timestamp: Date.now() }
      }

      const priceData = response.result
      const parsedPrice = priceData.price || '0'
      const parsedTimestamp = priceData.timestamp || Date.now()

      console.log(`[OpinionClient] Successfully fetched price for token ${tokenId}: ${parsedPrice} at ${new Date(parsedTimestamp).toISOString()}`)

      return {
        tokenId: priceData.tokenId || tokenId,
        price: parsedPrice,
        timestamp: parsedTimestamp,
      }
    } catch (error) {
      console.error(`[OpinionClient] Failed to fetch price for token ${tokenId}:`, error)
      return { tokenId, price: '0', timestamp: Date.now() }
    }
  }

  /**
   * Get multiple prices in batch with concurrency control
   * Returns Map<tokenId, PriceData> for fast access
   * Uses enhanced rate limiter with real parallelism
   * Requirements: 3.1, 3.5
   */
  async getMultiplePrices(tokenIds: string[]): Promise<Map<string, PriceData>> {
    const priceMap = new Map<string, PriceData>()
    
    if (tokenIds.length === 0) {
      return priceMap
    }

    console.log(`[OpinionClient] Fetching prices for ${tokenIds.length} tokens with enhanced parallelism`)

    try {
      // Use Promise.all with the enhanced rate limiter
      // The rate limiter already handles concurrency control and rate limiting
      const pricePromises = tokenIds.map(async (tokenId) => {
        const priceData = await this.getLatestPrice(tokenId)
        return { tokenId, priceData }
      })

      const results = await Promise.all(pricePromises)
      
      // Build the Map for fast access
      results.forEach(({ tokenId, priceData }) => {
        priceMap.set(tokenId, priceData)
      })

      console.log(`[OpinionClient] Successfully fetched ${priceMap.size} prices out of ${tokenIds.length} requested`)
      
      return priceMap
    } catch (error) {
      console.error(`[OpinionClient] Failed to fetch multiple prices:`, error)
      
      // Return partial results with fallback data for failed requests
      tokenIds.forEach(tokenId => {
        if (!priceMap.has(tokenId)) {
          priceMap.set(tokenId, { tokenId, price: '0', timestamp: Date.now() })
        }
      })
      
      return priceMap
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

      // Check for API-level errors (code !== 0 means error per API documentation)
      if (response.code !== undefined && response.code !== 0) {
        console.warn(`[OpinionClient] API returned error for token ${tokenId} price history: code=${response.code}, msg=${response.msg || response.errmsg || ''}`)
        return []
      }

      // Data is in result.history according to documentation: { code: 0, result: { history: [{ t, p }] } }
      if (!response.result) {
        console.warn(`[OpinionClient] No result field in price history response for token ${tokenId}:`, response)
        return []
      }

      if (!Array.isArray(response.result.history)) {
        console.warn(`[OpinionClient] result.history is not an array for token ${tokenId}:`, {
          result: response.result,
          historyType: typeof response.result.history
        })
        return []
      }

      console.log(`[OpinionClient] Successfully fetched ${response.result.history.length} price history points for token ${tokenId}`)

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
  /**
   * Get detailed market information
   * Handles both Binary and Categorical markets based on isCategorical flag
   */
  async getMarketDetail(marketId: number, isCategorical: boolean = false): Promise<Market | null> {
    try {
      const endpoint = isCategorical
        ? `/market/categorical/${marketId}`
        : `/market/${marketId}`

      const response = await this.makeRequest<any>(endpoint)

      if (!response || !response.result || !response.result.data) {
        console.warn(`[OpinionClient] Empty response for market detail ${marketId}. Raw:`, JSON.stringify(response))
        return null
      }

      const data = response.result.data

      return {
        id: data.marketId || data.id || 0,
        title: data.marketTitle || data.title || '',
        yesTokenId: data.yesTokenId || '',
        noTokenId: data.noTokenId || '',
        cutoffAt: data.cutoffAt || 0,
        status: data.statusEnum || data.status || 'unknown',
        volume24h: data.volume24h || '0',
        marketType: data.marketType || (isCategorical ? 1 : 0),
        questionId: data.questionId,
        rules: data.rules,
        yesLabel: data.yesLabel,
        noLabel: data.noLabel,
        childMarkets: data.childMarkets ? data.childMarkets.map((cm: any) => ({
          id: cm.marketId,
          title: cm.marketTitle,
          yesTokenId: cm.yesTokenId,
          noTokenId: cm.noTokenId,
          cutoffAt: cm.cutoffAt,
          status: cm.statusEnum,
          volume24h: cm.volume,
          marketType: 0,
          questionId: cm.questionId,
          rules: cm.rules,
          yesLabel: cm.yesLabel,
          noLabel: cm.noLabel
        })) : []
      }
    } catch (error) {
      console.error(`[OpinionClient] Failed to fetch market detail for ${marketId}:`, error)
      return null
    }
  }

  /**
   * Get orderbook for a specific token
   */
  async getOrderbook(tokenId: string): Promise<import('./types').Orderbook | null> {
    try {
      const response = await this.makeRequest<any>('/token/orderbook', { token_id: tokenId })

      if (!response || !response.result) {
        console.warn(`[OpinionClient] Empty response for orderbook ${tokenId}`)
        return null
      }

      return {
        market: response.result.market,
        tokenId: response.result.tokenId,
        timestamp: response.result.timestamp,
        bids: Array.isArray(response.result.bids) ? response.result.bids : [],
        asks: Array.isArray(response.result.asks) ? response.result.asks : []
      }
    } catch (error) {
      console.error(`[OpinionClient] Failed to fetch orderbook for ${tokenId}:`, error)
      return null
    }
  }
}

/**
 * Default Opinion API client instance
 */
export const opinionClient = new OpinionClient()