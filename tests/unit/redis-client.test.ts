import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createRedisClient, REDIS_KEYS } from '../../lib/redis'
import { MarketData, PriceData } from '../../lib/types'

// Mock Redis for testing
const mockRedis = {
  get: vi.fn(),
  set: vi.fn(),
  setex: vi.fn(),
  hset: vi.fn(),
  hgetall: vi.fn(),
  keys: vi.fn(),
  pipeline: vi.fn(() => ({
    hgetall: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
    hset: vi.fn(),
    exec: vi.fn()
  })),
  ping: vi.fn()
}

// Mock the @upstash/redis module
vi.mock('@upstash/redis', () => ({
  Redis: vi.fn(() => mockRedis)
}))

describe('Redis Client', () => {
  let redisClient: ReturnType<typeof createRedisClient>

  beforeEach(() => {
    vi.clearAllMocks()
    // Set required environment variables for testing
    process.env.UPSTASH_REDIS_REST_URL = 'https://test-redis.upstash.io'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token'
    
    redisClient = createRedisClient()
  })

  describe('Basic Operations', () => {
    it('should get a value from Redis', async () => {
      const testValue = 'test-value'
      mockRedis.get.mockResolvedValue(testValue)

      const result = await redisClient.get('test-key')

      expect(mockRedis.get).toHaveBeenCalledWith('test-key')
      expect(result).toBe(testValue)
    })

    it('should set a value in Redis', async () => {
      mockRedis.set.mockResolvedValue('OK')

      await redisClient.set('test-key', 'test-value')

      expect(mockRedis.set).toHaveBeenCalledWith('test-key', 'test-value')
    })

    it('should set a value with TTL in Redis', async () => {
      mockRedis.setex.mockResolvedValue('OK')

      await redisClient.set('test-key', 'test-value', 3600)

      expect(mockRedis.setex).toHaveBeenCalledWith('test-key', 3600, 'test-value')
    })

    it('should ping Redis successfully', async () => {
      mockRedis.ping.mockResolvedValue('PONG')

      const result = await redisClient.ping()

      expect(mockRedis.ping).toHaveBeenCalled()
      expect(result).toBe('PONG')
    })
  })

  describe('Market Operations', () => {
    const testMarket: MarketData = {
      id: 'test-market-1',
      title: 'Test Market',
      yesTokenId: 'yes-token-1',
      noTokenId: 'no-token-1',
      cutoffAt: Date.now() + 86400000,
      status: 'active',
      volume24h: '1000.00',
      createdAt: Date.now(),
      updatedAt: Date.now()
    }

    it('should set a market in Redis', async () => {
      mockRedis.hset.mockResolvedValue(1)

      await redisClient.setMarket(testMarket.id, testMarket)

      expect(mockRedis.hset).toHaveBeenCalledWith(
        REDIS_KEYS.MARKET(testMarket.id),
        testMarket
      )
    })

    it('should get a market from Redis', async () => {
      mockRedis.hgetall.mockResolvedValue(testMarket)

      const result = await redisClient.getMarket(testMarket.id)

      expect(mockRedis.hgetall).toHaveBeenCalledWith(REDIS_KEYS.MARKET(testMarket.id))
      expect(result).toEqual(testMarket)
    })

    it('should return null for non-existent market', async () => {
      mockRedis.hgetall.mockResolvedValue({})

      const result = await redisClient.getMarket('non-existent')

      expect(result).toBeNull()
    })
  })

  describe('Price Operations', () => {
    const testPrice: PriceData = {
      tokenId: 'test-token-1',
      price: '0.65',
      timestamp: Date.now()
    }

    it('should set a price in Redis', async () => {
      mockRedis.set.mockResolvedValue('OK')

      await redisClient.setPrice(testPrice.tokenId, testPrice)

      expect(mockRedis.set).toHaveBeenCalledWith(
        REDIS_KEYS.PRICE(testPrice.tokenId),
        JSON.stringify(testPrice)
      )
    })

    it('should get a price from Redis', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify(testPrice))

      const result = await redisClient.getPrice(testPrice.tokenId)

      expect(mockRedis.get).toHaveBeenCalledWith(REDIS_KEYS.PRICE(testPrice.tokenId))
      expect(result).toEqual(testPrice)
    })

    it('should return null for non-existent price', async () => {
      mockRedis.get.mockResolvedValue(null)

      const result = await redisClient.getPrice('non-existent')

      expect(result).toBeNull()
    })
  })

  describe('Connection Handling', () => {
    it('should initialize Redis connection successfully with valid configuration', () => {
      // Set valid environment variables
      process.env.UPSTASH_REDIS_REST_URL = 'https://test-redis.upstash.io'
      process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token'

      expect(() => createRedisClient()).not.toThrow()
    })

    it('should throw error when Redis URL configuration is missing', () => {
      delete process.env.UPSTASH_REDIS_REST_URL
      process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token'

      expect(() => createRedisClient()).toThrow(
        'Redis configuration missing: UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required'
      )
    })

    it('should throw error when Redis token configuration is missing', () => {
      process.env.UPSTASH_REDIS_REST_URL = 'https://test-redis.upstash.io'
      delete process.env.UPSTASH_REDIS_REST_TOKEN

      expect(() => createRedisClient()).toThrow(
        'Redis configuration missing: UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required'
      )
    })

    it('should throw error when both Redis configuration values are missing', () => {
      delete process.env.UPSTASH_REDIS_REST_URL
      delete process.env.UPSTASH_REDIS_REST_TOKEN

      expect(() => createRedisClient()).toThrow(
        'Redis configuration missing: UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required'
      )
    })

    it('should handle Redis connection errors gracefully during ping', async () => {
      const error = new Error('Connection failed')
      mockRedis.ping.mockRejectedValue(error)

      await expect(redisClient.ping()).rejects.toThrow('Connection failed')
    })

    it('should handle Redis unavailable errors gracefully during get operations', async () => {
      const error = new Error('Redis unavailable')
      mockRedis.get.mockRejectedValue(error)

      await expect(redisClient.get('test-key')).rejects.toThrow('Redis unavailable')
    })

    it('should handle Redis unavailable errors gracefully during set operations', async () => {
      const error = new Error('Redis unavailable')
      mockRedis.set.mockRejectedValue(error)

      await expect(redisClient.set('test-key', 'test-value')).rejects.toThrow('Redis unavailable')
    })

    it('should handle Redis unavailable errors gracefully during market operations', async () => {
      const error = new Error('Redis unavailable')
      mockRedis.hset.mockRejectedValue(error)

      const testMarket = {
        id: 'test-market',
        title: 'Test Market',
        yesTokenId: 'yes-token',
        noTokenId: 'no-token',
        cutoffAt: Date.now(),
        status: 'active',
        volume24h: '1000.00',
        createdAt: Date.now(),
        updatedAt: Date.now()
      }

      await expect(redisClient.setMarket('test-market', testMarket)).rejects.toThrow('Redis unavailable')
    })

    it('should handle Redis unavailable errors gracefully during price operations', async () => {
      const error = new Error('Redis unavailable')
      mockRedis.set.mockRejectedValue(error)

      const testPrice = {
        tokenId: 'test-token',
        price: '0.65',
        timestamp: Date.now()
      }

      await expect(redisClient.setPrice('test-token', testPrice)).rejects.toThrow('Redis unavailable')
    })

    it('should handle network timeout errors gracefully', async () => {
      const timeoutError = new Error('Request timeout')
      mockRedis.ping.mockRejectedValue(timeoutError)

      await expect(redisClient.ping()).rejects.toThrow('Request timeout')
    })

    it('should handle authentication errors gracefully', async () => {
      const authError = new Error('Authentication failed')
      mockRedis.ping.mockRejectedValue(authError)

      await expect(redisClient.ping()).rejects.toThrow('Authentication failed')
    })
  })
})