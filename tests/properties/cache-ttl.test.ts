/**
 * **Feature: prediction-markets-backend, Property 10: Cache TTL consistency**
 * **Validates: Requirements 5.1, 5.2**
 * 
 * Property-based tests for cache TTL behavior
 */

import { describe, test, beforeEach, afterEach, expect } from 'vitest'
import * as fc from 'fast-check'
import { InMemoryCache } from '@/lib/cache'

describe('Cache TTL Properties', () => {
  let cache: InMemoryCache

  beforeEach(() => {
    cache = new InMemoryCache(100)
  })

  afterEach(() => {
    cache.stopCleanup()
    cache.clear()
  })

  test('**Feature: prediction-markets-backend, Property 10: Cache TTL consistency**', () => {
    // Test that data can be stored and retrieved with correct TTL values
    fc.assert(fc.property(
      fc.string({ minLength: 1, maxLength: 50 }),
      fc.record({
        marketId: fc.integer({ min: 1, max: 10000 }),
        marketTitle: fc.string({ minLength: 1, maxLength: 100 }),
        marketPrice: fc.float({ min: Math.fround(0.01), max: Math.fround(0.99), noNaN: true }),
        priceChangePct: fc.float({ min: Math.fround(-1), max: Math.fround(1), noNaN: true }),
        volume24h: fc.string({ minLength: 1, maxLength: 20 }),
        yesPrice: fc.float({ min: Math.fround(0.01), max: Math.fround(0.99), noNaN: true }),
        noPrice: fc.float({ min: Math.fround(0.01), max: Math.fround(0.99), noNaN: true })
      }),
      (key, data) => {
        // Test movers/arbitrage TTL (30 seconds)
        const moversArbitrageTTL = 30
        cache.set(`movers_${key}`, data, moversArbitrageTTL)
        cache.set(`arbitrage_${key}`, data, moversArbitrageTTL)
        
        // Data should be available immediately
        const moversResult = cache.get(`movers_${key}`)
        const arbitrageResult = cache.get(`arbitrage_${key}`)
        
        return moversResult !== null && arbitrageResult !== null &&
               JSON.stringify(moversResult) === JSON.stringify(data) &&
               JSON.stringify(arbitrageResult) === JSON.stringify(data)
      }
    ), { numRuns: 100 })

    // Test ending-soon/charts TTL (60 seconds)
    fc.assert(fc.property(
      fc.string({ minLength: 1, maxLength: 50 }),
      fc.record({
        marketId: fc.integer({ min: 1, max: 10000 }),
        marketTitle: fc.string({ minLength: 1, maxLength: 100 }),
        cutoffAt: fc.integer({ min: Date.now(), max: Date.now() + 86400000 }),
        yesPrice: fc.float({ min: Math.fround(0.01), max: Math.fround(0.99), noNaN: true }),
        volume: fc.string({ minLength: 1, maxLength: 20 })
      }),
      (key, endingSoonData) => {
        const endingSoonChartsTTL = 60
        cache.set(`ending_soon_${key}`, endingSoonData, endingSoonChartsTTL)
        
        const result = cache.get(`ending_soon_${key}`)
        return result !== null && JSON.stringify(result) === JSON.stringify(endingSoonData)
      }
    ), { numRuns: 100 })
  })

  test('Cache TTL expiration behavior', async () => {
    const testData = { value: 'test-data' }
    const shortTTL = 0.1 // 100ms for quick testing
    
    cache.set('expire-test', testData, shortTTL)
    expect(cache.get('expire-test')).toEqual(testData)
    
    await new Promise(resolve => setTimeout(resolve, 150))
    expect(cache.get('expire-test')).toBeNull()
  })

  test('Cache TTL consistency for different data types', () => {
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
      (key, data) => {
        const ttlSeconds = 60
        cache.set(key, data, ttlSeconds)
        
        const immediateResult = cache.get(key)
        return JSON.stringify(immediateResult) === JSON.stringify(data)
      }
    ), { numRuns: 100 })
  })
})