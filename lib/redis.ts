import { Redis } from '@upstash/redis'
import { MarketData, PriceData } from './types'

// Redis key patterns
export const REDIS_KEYS = {
  MARKET: (id: string) => `market:${id}`,
  PRICE: (tokenId: string) => `price:${tokenId}`,
  MARKETS_LIST: 'markets:list',
  LAST_SYNC: 'sync:last_update'
} as const

// Redis client configuration
interface RedisConfig {
  url: string
  token: string
  timeout?: number
}

export interface RedisClient {
  // Market data operations
  setMarket(marketId: string, marketData: MarketData): Promise<void>
  getMarket(marketId: string): Promise<MarketData | null>
  getAllMarkets(): Promise<MarketData[]>

  // Price data operations  
  setPrice(tokenId: string, priceData: PriceData): Promise<void>
  getPrice(tokenId: string): Promise<PriceData | null>
  getPrices(tokenIds: string[]): Promise<Map<string, PriceData>>

  // Batch operations
  setMarketSnapshot(markets: MarketData[], prices: Map<string, PriceData>): Promise<void>

  // Basic operations
  get(key: string): Promise<string | null>
  set(key: string, value: string, ttl?: number): Promise<void>

  // Health check
  ping(): Promise<string>
}

class UpstashRedisClient implements RedisClient {
  private redis: Redis
  private timeout: number

  constructor(config: RedisConfig) {
    this.redis = new Redis({
      url: config.url,
      token: config.token
    })
    this.timeout = config.timeout || 5000
  }

  // Basic operations
  async get(key: string): Promise<string | null> {
    try {
      const result = await this.redis.get(key)
      return result as string | null
    } catch (error) {
      console.error(`Redis GET error for key ${key}:`, error)
      throw error
    }
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    try {
      if (ttl) {
        await this.redis.setex(key, ttl, value)
      } else {
        await this.redis.set(key, value)
      }
    } catch (error) {
      console.error(`Redis SET error for key ${key}:`, error)
      throw error
    }
  }

  async ping(): Promise<string> {
    try {
      const result = await this.redis.ping()
      return result as string
    } catch (error) {
      console.error('Redis PING error:', error)
      throw error
    }
  }

  // Market data operations
  async setMarket(marketId: string, marketData: MarketData): Promise<void> {
    try {
      const key = REDIS_KEYS.MARKET(marketId)
      await this.redis.hset(key, marketData)
    } catch (error) {
      console.error(`Redis setMarket error for market ${marketId}:`, error)
      throw error
    }
  }

  async getMarket(marketId: string): Promise<MarketData | null> {
    try {
      const key = REDIS_KEYS.MARKET(marketId)
      const result = await this.redis.hgetall(key)

      if (!result || Object.keys(result).length === 0) {
        return null
      }

      return result as MarketData
    } catch (error) {
      console.error(`Redis getMarket error for market ${marketId}:`, error)
      throw error
    }
  }

  async getAllMarkets(): Promise<MarketData[]> {
    try {
      // Get all market keys
      const keys = await this.redis.keys('market:*')

      if (keys.length === 0) {
        return []
      }

      // Use pipeline for batch operations
      const pipeline = this.redis.pipeline()
      keys.forEach(key => {
        pipeline.hgetall(key)
      })

      const results = await pipeline.exec()

      // Filter out null results and convert to MarketData
      return results
        .filter(result => result && typeof result === 'object' && Object.keys(result).length > 0)
        .map(result => result as MarketData)
    } catch (error) {
      console.error('Redis getAllMarkets error:', error)
      throw error
    }
  }

  // Price data operations
  async setPrice(tokenId: string, priceData: PriceData): Promise<void> {
    try {
      const key = REDIS_KEYS.PRICE(tokenId)
      await this.redis.set(key, JSON.stringify(priceData))
    } catch (error) {
      console.error(`Redis setPrice error for token ${tokenId}:`, error)
      throw error
    }
  }

  async getPrice(tokenId: string): Promise<PriceData | null> {
    try {
      const key = REDIS_KEYS.PRICE(tokenId)
      const result = await this.redis.get(key)

      if (!result) {
        return null
      }

      return JSON.parse(result as string) as PriceData
    } catch (error) {
      console.error(`Redis getPrice error for token ${tokenId}:`, error)
      throw error
    }
  }

  async getPrices(tokenIds: string[]): Promise<Map<string, PriceData>> {
    try {
      const priceMap = new Map<string, PriceData>()

      if (tokenIds.length === 0) {
        return priceMap
      }

      // Use pipeline for batch operations
      const pipeline = this.redis.pipeline()
      tokenIds.forEach(tokenId => {
        pipeline.get(REDIS_KEYS.PRICE(tokenId))
      })

      const results = await pipeline.exec()

      // Process results
      results.forEach((result, index) => {
        if (result && typeof result === 'string') {
          try {
            const priceData = JSON.parse(result) as PriceData
            priceMap.set(tokenIds[index], priceData)
          } catch (parseError) {
            console.error(`Failed to parse price data for token ${tokenIds[index]}:`, parseError)
          }
        }
      })

      return priceMap
    } catch (error) {
      console.error('Redis getPrices error:', error)
      throw error
    }
  }

  // Batch operations
  async setMarketSnapshot(markets: MarketData[], prices: Map<string, PriceData>): Promise<void> {
    try {
      const pipeline = this.redis.pipeline()

      // Set all markets
      markets.forEach(market => {
        const key = REDIS_KEYS.MARKET(market.id)
        pipeline.hset(key, market)
      })

      // Set all prices
      prices.forEach((priceData, tokenId) => {
        const key = REDIS_KEYS.PRICE(tokenId)
        pipeline.set(key, JSON.stringify(priceData))
      })

      // Update last sync time
      pipeline.set(REDIS_KEYS.LAST_SYNC, Date.now().toString())

      await pipeline.exec()
    } catch (error) {
      console.error('Redis setMarketSnapshot error:', error)
      throw error
    }
  }
}

// Create and export Redis client instance
let redisClient: RedisClient | null = null

export function createRedisClient(): RedisClient {
  const config: RedisConfig = {
    url: process.env.UPSTASH_REDIS_REST_URL || '',
    token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
    timeout: parseInt(process.env.REDIS_TIMEOUT_MS || '5000')
  }

  if (!config.url || !config.token) {
    throw new Error('Redis configuration missing: UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required')
  }

  return new UpstashRedisClient(config)
}

export function getRedisClient(): RedisClient | null {
  try {
    if (!redisClient) {
      const url = process.env.UPSTASH_REDIS_REST_URL
      const token = process.env.UPSTASH_REDIS_REST_TOKEN

      // Redis is optional - if not configured, return null
      if (!url || !token || url === 'your_redis_url_here' || token === 'your_redis_token_here') {
        console.info('[Redis] Not configured - using in-memory cache only')
        return null
      }

      redisClient = createRedisClient()
    }
    return redisClient
  } catch (error) {
    console.warn('[Redis] Failed to initialize, falling back to in-memory cache:', error)
    return null
  }
}

// Export default instance getter (lazy initialization, returns null if unavailable)
export const redis = {
  get client(): RedisClient | null {
    return getRedisClient()
  }
}