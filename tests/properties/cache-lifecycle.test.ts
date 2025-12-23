/**
 * **Feature: prediction-markets-backend, Property 11: Cache lifecycle behavior**
 * **Validates: Requirements 5.3, 5.4**
 * 
 * Property-based tests for cache lifecycle behavior:
 * - If not expired then return cached data without external call
 * - If expired then fetch new data and update cache
 */

import { describe, test, beforeEach, afterEach, expect, vi } from 'vitest'
import * as fc from 'fast-check'
import { InMemoryCache } from '@/lib/cache'

describe('Cache Lifecycle Properties', () => {
  let cache: InMemoryCache
  let mockExternalFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    cache = new InMemoryCache(100)
    mockExternalFetch = vi.fn()
  })

  afterEach(() => {
    cache.stopCleanup()
    cache.clear()
    vi.clearAllMocks()
  })

  test('**Feature: prediction-markets-backend, Property 11: Cache lifecycle behavior**', () => {
    // Property: For any cache entry, if not expired then return cached data without external call
    fc.assert(fc.property(
      fc.string({ minLength: 1, maxLength: 50 }),
      fc.record({
        marketId: fc.integer({ min: 1, max: 10000 }),
        marketTitle: fc.string({ minLength: 1, maxLength: 100 }),
        marketPrice: fc.float({ min: Math.fround(0.01), max: Math.fround(0.99), noNaN: true }),
        volume24h: fc.string({ minLength: 1, maxLength: 20 })
      }),
      fc.integer({ min: 1, max: 3600 }), // TTL in seconds
      (key, originalData, ttlSeconds) => {
        // Clear cache and reset mock for each property test iteration
        cache.clear()
        mockExternalFetch.mockClear()

        // Simulate a function that uses cache with external fetch fallback
        const getCachedOrFetch = (cacheKey: string, fetchFn: () => any, ttl: number) => {
          const cached = cache.get(cacheKey)
          if (cached !== null) {
            // Cache hit - should not call external fetch
            return cached
          }
          
          // Cache miss - fetch new data and cache it
          const freshData = fetchFn()
          cache.set(cacheKey, freshData, ttl)
          return freshData
        }

        // Set up mock to return new data when called
        const newData = { ...originalData, marketId: originalData.marketId + 1000 }
        mockExternalFetch.mockReturnValue(newData)

        // First call - cache is empty, should fetch and cache
        const firstResult = getCachedOrFetch(key, mockExternalFetch, ttlSeconds)
        const firstCallCount = mockExternalFetch.mock.calls.length
        
        // Should have called external fetch exactly once
        if (firstCallCount !== 1) return false
        if (JSON.stringify(firstResult) !== JSON.stringify(newData)) return false

        // Second call immediately - cache should have valid data, no external call
        const secondResult = getCachedOrFetch(key, mockExternalFetch, ttlSeconds)
        const secondCallCount = mockExternalFetch.mock.calls.length
        
        // Should still have called external fetch only once (no additional calls)
        if (secondCallCount !== 1) return false
        if (JSON.stringify(secondResult) !== JSON.stringify(newData)) return false

        return true
      }
    ), { numRuns: 100 })
  })

  test('Cache lifecycle with expiration', async () => {
    // Test that expired cache entries trigger new fetches
    const testData = { value: 'test-data', timestamp: Date.now() }
    const key = 'expiration-test'
    
    let callCount = 0
    const mockFetch = () => {
      callCount++
      return { ...testData, value: `${testData.value}_call_${callCount}` }
    }

    const getCachedOrFetch = (cacheKey: string, fetchFn: () => any, ttl: number) => {
      const cached = cache.get(cacheKey)
      if (cached !== null) {
        return cached
      }
      
      const freshData = fetchFn()
      cache.set(cacheKey, freshData, ttl)
      return freshData
    }

    // First call - should fetch and cache
    const firstResult = getCachedOrFetch(key, mockFetch, 0.001) // Very short TTL (1ms)
    expect(callCount).toBe(1)
    expect(firstResult.value).toBe(`${testData.value}_call_1`)

    // Wait for expiration
    await new Promise(resolve => setTimeout(resolve, 10))
    
    // After expiration - should fetch new data
    const expiredResult = getCachedOrFetch(key, mockFetch, 60)
    expect(callCount).toBe(2) // Called again after expiration
    expect(expiredResult.value).toBe(`${testData.value}_call_2`) // New data
  })

  test('Cache lifecycle consistency across different data types', () => {
    fc.assert(fc.property(
      fc.string({ minLength: 1, maxLength: 50 }),
      fc.oneof(
        fc.string(),
        fc.integer(),
        fc.float({ noNaN: true }),
        fc.boolean(),
        fc.array(fc.string()),
        fc.record({ prop: fc.string() })
      ),
      fc.integer({ min: 1, max: 60 }),
      (key, data, ttlSeconds) => {
        // Clear cache before each test iteration to avoid interference
        cache.clear()
        
        let fetchCallCount = 0
        const mockFetch = () => {
          fetchCallCount++
          return data
        }

        const getCachedOrFetch = (cacheKey: string, fetchFn: () => any, ttl: number) => {
          const cached = cache.get(cacheKey)
          if (cached !== null) {
            return cached
          }
          
          const freshData = fetchFn()
          cache.set(cacheKey, freshData, ttl)
          return freshData
        }

        // First call - should fetch
        const firstResult = getCachedOrFetch(key, mockFetch, ttlSeconds)
        if (fetchCallCount !== 1) return false
        if (JSON.stringify(firstResult) !== JSON.stringify(data)) return false

        // Second call - should use cache
        const secondResult = getCachedOrFetch(key, mockFetch, ttlSeconds)
        if (fetchCallCount !== 1) return false // Still 1, no additional fetch
        if (JSON.stringify(secondResult) !== JSON.stringify(data)) return false

        return true
      }
    ), { numRuns: 100 })
  })

  test('Cache lifecycle with multiple keys', () => {
    fc.assert(fc.property(
      fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 2, maxLength: 10 }),
      fc.record({
        baseValue: fc.string({ minLength: 1, maxLength: 50 }),
        multiplier: fc.integer({ min: 1, max: 100 })
      }),
      (keys, baseData) => {
        // Clear cache for each property test iteration
        cache.clear()
        
        const uniqueKeys = [...new Set(keys)] // Remove duplicates
        if (uniqueKeys.length < 2) return true // Skip if not enough unique keys

        let totalFetchCalls = 0
        const mockFetch = (keySpecificData: any) => () => {
          totalFetchCalls++
          return keySpecificData
        }

        const getCachedOrFetch = (cacheKey: string, fetchFn: () => any, ttl: number) => {
          const cached = cache.get(cacheKey)
          if (cached !== null) {
            return cached
          }
          
          const freshData = fetchFn()
          cache.set(cacheKey, freshData, ttl)
          return freshData
        }

        // First round - all keys should fetch
        uniqueKeys.forEach((key, index) => {
          const keyData = { ...baseData, value: `${baseData.baseValue}_${index}` }
          getCachedOrFetch(key, mockFetch(keyData), 60)
        })
        
        if (totalFetchCalls !== uniqueKeys.length) return false

        // Reset counter
        const firstRoundCalls = totalFetchCalls

        // Second round - all keys should use cache
        uniqueKeys.forEach((key, index) => {
          const keyData = { ...baseData, value: `${baseData.baseValue}_${index}` }
          getCachedOrFetch(key, mockFetch(keyData), 60)
        })
        
        // Should have no additional calls
        return totalFetchCalls === firstRoundCalls
      }
    ), { numRuns: 50 })
  })
})