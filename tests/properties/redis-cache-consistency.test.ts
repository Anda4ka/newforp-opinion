/**
 * **Feature: prediction-markets-refactoring, Property 1: Redis cache consistency**
 * **Validates: Requirements 1.2, 1.3**
 * 
 * Property-based tests for Redis cache consistency:
 * - For any data written to cache, reading it back should return the same data
 * - All cache operations should use Redis instead of in-memory storage
 */

import { describe, test, beforeEach, afterEach, expect, vi } from 'vitest'
import * as fc from 'fast-check'
import { createRedisClient, REDIS_KEYS } from '../../lib/redis'
import type { MarketData, PriceData } from '../../lib/types'

// Mock Redis for property testing
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

describe('Redis Cache Consistency Properties', () => {
  let redisClient: ReturnType<typeof createRedisClient>

  beforeEach(() => {
    vi.clearAllMocks()
    // Set required environment variables for testing
    process.env.UPSTASH_REDIS_REST_URL = 'https://test-redis.upstash.io'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token'
    
    redisClient = createRedisClient()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('**Feature: prediction-markets-refactoring, Property 1: Redis cache consistency**', async () => {
    // Property: For any data written to cache, reading it back should return the same data
    await fc.assert(fc.asyncProperty(
      // Generate arbitrary market data
      fc.record({
        id: fc.string({ minLength: 1, maxLength: 50 }),
        title: fc.string({ minLength: 1, maxLength: 200 }),
        yesTokenId: fc.string({ minLength: 1, maxLength: 128 }),
        noTokenId: fc.string({ minLength: 1, maxLength: 128 }),
        cutoffAt: fc.integer({ min: Date.now(), max: Date.now() + 86400000 * 30 }),
        status: fc.constantFrom('active', 'closed', 'resolved'),
        volume24h: fc.string({ minLength: 1, maxLength: 20 }),
        createdAt: fc.integer({ min: 1600000000000, max: Date.now() }),
        updatedAt: fc.integer({ min: 1600000000000, max: Date.now() })
      }),
      async (marketData: MarketData) => {
        // Clear all mocks for each iteration
        vi.clearAllMocks()
        
        // Mock successful Redis operations
        mockRedis.hset.mockResolvedValue(1)
        mockRedis.hgetall.mockResolvedValue(marketData)

        // Test market data round-trip consistency
        await redisClient.setMarket(marketData.id, marketData)
        const retrievedMarket = await redisClient.getMarket(marketData.id)

        // Verify Redis operations were called with correct parameters
        const expectedKey = REDIS_KEYS.MARKET(marketData.id)
        const hsetCalls = mockRedis.hset.mock.calls
        const hgetallCalls = mockRedis.hgetall.mock.calls

        // Verify setMarket used Redis hset with correct key and data
        expect(hsetCalls.length).toBe(1)
        expect(hsetCalls[0][0]).toBe(expectedKey)
        expect(hsetCalls[0][1]).toEqual(marketData)

        // Verify getMarket used Redis hgetall with correct key
        expect(hgetallCalls.length).toBe(1)
        expect(hgetallCalls[0][0]).toBe(expectedKey)

        // Verify data consistency - retrieved data should match original
        expect(retrievedMarket).not.toBeNull()
        expect(retrievedMarket).toEqual(marketData)

        return true
      }
    ), { numRuns: 100 })

    // Property: Price data round-trip consistency
    await fc.assert(fc.asyncProperty(
      // Generate arbitrary price data
      fc.record({
        tokenId: fc.string({ minLength: 1, maxLength: 128 }),
        price: fc.string().filter(s => {
          const num = parseFloat(s)
          return !isNaN(num) && num >= 0 && num <= 1
        }),
        timestamp: fc.integer({ min: 1600000000000, max: Date.now() })
      }),
      async (priceData: PriceData) => {
        // Clear all mocks for each iteration
        vi.clearAllMocks()
        
        // Mock successful Redis operations
        const serializedPrice = JSON.stringify(priceData)
        mockRedis.set.mockResolvedValue('OK')
        mockRedis.get.mockResolvedValue(serializedPrice)

        // Test price data round-trip consistency
        await redisClient.setPrice(priceData.tokenId, priceData)
        const retrievedPrice = await redisClient.getPrice(priceData.tokenId)

        // Verify Redis operations were called with correct parameters
        const expectedKey = REDIS_KEYS.PRICE(priceData.tokenId)
        const setCalls = mockRedis.set.mock.calls
        const getCalls = mockRedis.get.mock.calls

        // Verify setPrice used Redis set with correct key and serialized data
        expect(setCalls.length).toBe(1)
        expect(setCalls[0][0]).toBe(expectedKey)
        expect(setCalls[0][1]).toBe(serializedPrice)

        // Verify getPrice used Redis get with correct key
        expect(getCalls.length).toBe(1)
        expect(getCalls[0][0]).toBe(expectedKey)

        // Verify data consistency - retrieved data should match original
        expect(retrievedPrice).not.toBeNull()
        expect(retrievedPrice).toEqual(priceData)

        return true
      }
    ), { numRuns: 100 })

    // Property: Basic key-value operations consistency
    await fc.assert(fc.asyncProperty(
      fc.string({ minLength: 1, maxLength: 50 }),
      fc.string({ minLength: 0, maxLength: 1000 }),
      fc.option(fc.integer({ min: 1, max: 3600 }), { nil: undefined }),
      async (key: string, value: string, ttl?: number) => {
        // Clear all mocks for each iteration
        vi.clearAllMocks()
        
        // Mock successful Redis operations
        if (ttl) {
          mockRedis.setex.mockResolvedValue('OK')
        } else {
          mockRedis.set.mockResolvedValue('OK')
        }
        mockRedis.get.mockResolvedValue(value)

        // Test basic key-value round-trip consistency
        await redisClient.set(key, value, ttl)
        const retrievedValue = await redisClient.get(key)

        // Verify correct Redis operation was used
        if (ttl) {
          const setexCalls = mockRedis.setex.mock.calls
          expect(setexCalls.length).toBe(1)
          expect(setexCalls[0][0]).toBe(key)
          expect(setexCalls[0][1]).toBe(ttl)
          expect(setexCalls[0][2]).toBe(value)
        } else {
          const setCalls = mockRedis.set.mock.calls
          expect(setCalls.length).toBe(1)
          expect(setCalls[0][0]).toBe(key)
          expect(setCalls[0][1]).toBe(value)
        }

        // Verify get operation
        const getCalls = mockRedis.get.mock.calls
        expect(getCalls.length).toBe(1)
        expect(getCalls[0][0]).toBe(key)

        // Verify data consistency
        expect(retrievedValue).toBe(value)

        return true
      }
    ), { numRuns: 100 })

    // Property: Batch price operations consistency
    await fc.assert(fc.asyncProperty(
      fc.array(
        fc.record({
          tokenId: fc.string({ minLength: 1, maxLength: 128 }),
          price: fc.string().filter(s => {
            const num = parseFloat(s)
            return !isNaN(num) && num >= 0 && num <= 1
          }),
          timestamp: fc.integer({ min: 1600000000000, max: Date.now() })
        }),
        { minLength: 1, maxLength: 10 }
      ),
      async (priceDataArray: PriceData[]) => {
        // Clear all mocks for each iteration
        vi.clearAllMocks()
        
        // Create unique token IDs to avoid conflicts
        const uniquePrices = priceDataArray.reduce((acc, price, index) => {
          const uniqueTokenId = `${price.tokenId}_${index}`
          acc.push({ ...price, tokenId: uniqueTokenId })
          return acc
        }, [] as PriceData[])

        // Mock pipeline operations
        const mockPipeline = {
          get: vi.fn(),
          exec: vi.fn()
        }
        mockRedis.pipeline.mockReturnValue(mockPipeline)
        
        // Mock pipeline exec to return serialized price data
        const expectedResults = uniquePrices.map(price => JSON.stringify(price))
        mockPipeline.exec.mockResolvedValue(expectedResults)

        // Test batch price retrieval
        const tokenIds = uniquePrices.map(p => p.tokenId)
        const retrievedPrices = await redisClient.getPrices(tokenIds)

        // Verify pipeline was used
        expect(mockRedis.pipeline.mock.calls.length).toBe(1)
        expect(mockPipeline.exec.mock.calls.length).toBe(1)

        // Verify pipeline.get was called for each token
        expect(mockPipeline.get.mock.calls.length).toBe(uniquePrices.length)
        
        // Verify each token ID was queried with correct Redis key
        for (let i = 0; i < uniquePrices.length; i++) {
          const expectedKey = REDIS_KEYS.PRICE(uniquePrices[i].tokenId)
          expect(mockPipeline.get.mock.calls[i][0]).toBe(expectedKey)
        }

        // Verify retrieved data consistency
        expect(retrievedPrices.size).toBe(uniquePrices.length)
        
        for (const originalPrice of uniquePrices) {
          const retrieved = retrievedPrices.get(originalPrice.tokenId)
          expect(retrieved).not.toBeUndefined()
          expect(retrieved).toEqual(originalPrice)
        }

        return true
      }
    ), { numRuns: 50 })
  })

  test('Redis operations use correct key patterns', () => {
    // Property: All Redis operations should use the defined key patterns
    fc.assert(fc.property(
      fc.string({ minLength: 1, maxLength: 50 }),
      fc.string({ minLength: 1, maxLength: 128 }),
      (marketId: string, tokenId: string) => {
        // Test key pattern consistency
        const marketKey = REDIS_KEYS.MARKET(marketId)
        const priceKey = REDIS_KEYS.PRICE(tokenId)
        
        // Verify key patterns follow expected format
        const marketKeyValid = marketKey === `market:${marketId}`
        const priceKeyValid = priceKey === `price:${tokenId}`
        
        // Verify keys are unique for different inputs
        const keysUnique = marketKey !== priceKey || marketId === `market:${tokenId}`
        
        return marketKeyValid && priceKeyValid && keysUnique
      }
    ), { numRuns: 100 })
  })

  test('Redis client enforces configuration requirements', () => {
    // Property: Redis client should require proper configuration
    fc.assert(fc.property(
      fc.option(fc.string(), { nil: undefined }),
      fc.option(fc.string(), { nil: undefined }),
      (url?: string, token?: string) => {
        // Clear environment variables
        delete process.env.UPSTASH_REDIS_REST_URL
        delete process.env.UPSTASH_REDIS_REST_TOKEN
        
        // Set test values if provided
        if (url) process.env.UPSTASH_REDIS_REST_URL = url
        if (token) process.env.UPSTASH_REDIS_REST_TOKEN = token
        
        try {
          createRedisClient()
          // Should only succeed if both URL and token are provided
          return !!(url && token)
        } catch (error) {
          // Should fail if either URL or token is missing
          return !(url && token)
        }
      }
    ), { numRuns: 50 })
  })
})