import { Market, PriceData, PriceHistoryPoint } from './types'
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
   */
  async getMarkets(): Promise<Market[]> {
    try {
      // Use exponential backoff for critical requests
      const response = await ExponentialBackoff.executeWithBackoff(
        () => this.makeRequest<any>('/markets'),
        2, // Max 2 attempts
        1000 // 1 second base delay
      )
      
      // Requirement 6.2: Handle responses with missing data gracefully
      if (!response || !Array.isArray(response.data)) {
        console.warn('Opinion API returned invalid markets response, using fallback data')
        return this.getFallbackMarkets()
      }

      return response.data.map((market: any) => ({
        id: market.marketId || market.id || 0,
        title: market.marketTitle || market.title || '',
        yesTokenId: market.yesTokenId || '',
        noTokenId: market.noTokenId || '',
        cutoffAt: market.cutoffAt || 0,
        status: market.statusEnum || market.status || 'unknown',
        volume24h: market.volume24h || '0',
      }))
    } catch (error) {
      // Requirement 6.2: Handle errors gracefully without application crash
      console.error('Failed to fetch markets:', error)
      console.warn('Using fallback market data due to API unavailability')
      return this.getFallbackMarkets()
    }
  }

  /**
   * Get latest price for a specific token with rate limiting
   * Returns current price data with timestamp
   */
  async getLatestPrice(tokenId: string): Promise<PriceData> {
    try {
      const response = await this.makeRequest<any>(`/tokens/${tokenId}/price`)
      
      // Requirement 6.2: Handle responses with missing data gracefully
      if (!response || !response.data) {
        console.warn(`No price data from API for token ${tokenId}, using fallback`)
        return this.getFallbackPrice(tokenId)
      }

      const priceData = response.data
      return {
        tokenId,
        price: priceData.price || '0',
        timestamp: priceData.timestamp || Date.now(),
      }
    } catch (error) {
      // Requirement 6.2: Handle errors gracefully without application crash
      console.error(`Failed to fetch price for token ${tokenId}:`, error)
      console.warn(`Using fallback price for token ${tokenId}`)
      return this.getFallbackPrice(tokenId)
    }
  }

  /**
   * Get price history for a specific token with rate limiting
   * Returns array of historical price points
   */
  async getPriceHistory(tokenId: string, interval: string = '1h'): Promise<PriceHistoryPoint[]> {
    try {
      const params = { interval }
      const response = await this.makeRequest<any>(`/tokens/${tokenId}/price-history`, params)
      
      // Requirement 6.2: Handle responses with missing data gracefully
      if (!response || !Array.isArray(response.data)) {
        console.warn(`No price history from API for token ${tokenId}, using fallback`)
        return this.getFallbackPriceHistory(tokenId, interval)
      }

      return response.data.map((point: any) => ({
        t: point.t || point.timestamp || 0,
        p: point.p || point.price || '0',
      }))
    } catch (error) {
      // Requirement 6.2: Handle errors gracefully without application crash
      console.error(`Failed to fetch price history for token ${tokenId}:`, error)
      console.warn(`Using fallback price history for token ${tokenId}`)
      return this.getFallbackPriceHistory(tokenId, interval)
    }
  }

  /**
   * Get user positions for a wallet address
   * Frontend-facing helper: returns [] on failure to avoid breaking UI flows
   */
  async getUserPositions(walletAddress: string): Promise<any[]> {
    try {
      const response = await this.makeRequest<any>(`/positions/user/${walletAddress}`)

      if (!response || !Array.isArray(response.data)) {
        return []
      }

      return response.data
    } catch (error) {
      console.error(`Failed to fetch user positions for ${walletAddress}:`, error)
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
   * Fallback market data when API is unavailable
   * Provides sample data for development and testing
   */
  private getFallbackMarkets(): Market[] {
    const now = Math.floor(Date.now() / 1000)
    const oneHour = 3600
    const oneDay = 86400

    return [
      {
        id: 1,
        title: "Will Bitcoin reach $100,000 by end of 2024?",
        yesTokenId: "btc-100k-yes",
        noTokenId: "btc-100k-no", 
        cutoffAt: now + oneDay * 30, // 30 days from now
        status: "activated",
        volume24h: "125000"
      },
      {
        id: 2,
        title: "Will Ethereum 2.0 launch successfully in Q1 2024?",
        yesTokenId: "eth2-q1-yes",
        noTokenId: "eth2-q1-no",
        cutoffAt: now + oneDay * 15, // 15 days from now
        status: "activated", 
        volume24h: "87500"
      },
      {
        id: 3,
        title: "Will Tesla stock price exceed $300 this month?",
        yesTokenId: "tsla-300-yes",
        noTokenId: "tsla-300-no",
        cutoffAt: now + oneDay * 7, // 7 days from now
        status: "activated",
        volume24h: "65000"
      },
      {
        id: 4,
        title: "Will AI achieve AGI breakthrough in 2024?",
        yesTokenId: "agi-2024-yes", 
        noTokenId: "agi-2024-no",
        cutoffAt: now + oneHour * 6, // 6 hours from now
        status: "activated",
        volume24h: "45000"
      },
      {
        id: 5,
        title: "Will SpaceX successfully land on Mars in 2024?",
        yesTokenId: "spacex-mars-yes",
        noTokenId: "spacex-mars-no", 
        cutoffAt: now + oneHour * 2, // 2 hours from now
        status: "activated",
        volume24h: "32000"
      }
    ]
  }

  /**
   * Fallback price data when API is unavailable
   */
  private getFallbackPrice(tokenId: string): PriceData {
    // Generate realistic price based on token ID
    const basePrice = tokenId.includes('yes') ? 0.45 : 0.55
    const variation = (Math.random() - 0.5) * 0.2 // ±10% variation
    const price = Math.max(0.01, Math.min(0.99, basePrice + variation))

    return {
      tokenId,
      price: price.toFixed(3),
      timestamp: Date.now()
    }
  }

  /**
   * Fallback price history when API is unavailable
   */
  private getFallbackPriceHistory(tokenId: string, interval: string): PriceHistoryPoint[] {
    const now = Math.floor(Date.now() / 1000)
    const intervalSeconds = interval === '1h' ? 3600 : 86400
    const points = interval === '1h' ? 24 : 30 // 24 hours or 30 days
    
    const history: PriceHistoryPoint[] = []
    const basePrice = tokenId.includes('yes') ? 0.45 : 0.55
    
    for (let i = points; i >= 0; i--) {
      const timestamp = now - (i * intervalSeconds)
      const trend = (points - i) / points * 0.1 // Slight upward trend
      const noise = (Math.random() - 0.5) * 0.05 // ±2.5% noise
      const price = Math.max(0.01, Math.min(0.99, basePrice + trend + noise))
      
      history.push({
        t: timestamp,
        p: price.toFixed(3)
      })
    }
    
    return history
  }
}

/**
 * Default Opinion API client instance
 */
export const opinionClient = new OpinionClient()