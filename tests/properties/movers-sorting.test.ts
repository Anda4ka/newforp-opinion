/**
 * **Feature: prediction-markets-backend, Property 2: Movers sorting correctness**
 * **Validates: Requirements 1.1, 1.6**
 * 
 * Property-based tests for market movers sorting logic
 */

import { describe, test } from 'vitest'
import * as fc from 'fast-check'
import { sortByPriceChangeAndVolume } from '@/lib/analytics'
import { MarketMover } from '@/lib/types'

describe('Movers Sorting Properties', () => {
  // Arbitrary generator for MarketMover
  const marketMoverArbitrary = fc.record({
    marketId: fc.integer({ min: 1, max: 100000 }),
    marketTitle: fc.string({ minLength: 1, maxLength: 100 }),
    marketPrice: fc.float({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
    priceChangePct: fc.float({ min: -1, max: 1, noNaN: true, noDefaultInfinity: true }),
    volume24h: fc.float({ min: 0, max: 1000000, noNaN: true, noDefaultInfinity: true }).map(v => v.toString()),
    yesTokenId: fc.string({ minLength: 1, maxLength: 128 }),
    noTokenId: fc.string({ minLength: 1, maxLength: 128 }),
    yesPrice: fc.float({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
    noPrice: fc.float({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true })
  }) as fc.Arbitrary<MarketMover>

  test('**Feature: prediction-markets-backend, Property 2: Movers sorting correctness**', () => {
    // Property 1: Sorting should be stable (sorting twice gives same result)
    fc.assert(fc.property(
      fc.array(marketMoverArbitrary, { minLength: 0, maxLength: 50 }),
      (markets) => {
        const sorted1 = sortByPriceChangeAndVolume(markets)
        const sorted2 = sortByPriceChangeAndVolume(sorted1)
        
        // Sorting an already sorted array should give the same result
        return JSON.stringify(sorted1) === JSON.stringify(sorted2)
      }
    ), { numRuns: 100 })

    // Property 2: Primary sort by priceChangePct descending
    fc.assert(fc.property(
      fc.array(marketMoverArbitrary, { minLength: 2, maxLength: 50 }),
      (markets) => {
        const sorted = sortByPriceChangeAndVolume(markets)
        
        // Check that each element has priceChangePct >= next element's priceChangePct
        for (let i = 0; i < sorted.length - 1; i++) {
          if (sorted[i].priceChangePct < sorted[i + 1].priceChangePct) {
            return false
          }
        }
        return true
      }
    ), { numRuns: 100 })

    // Property 3: Secondary sort by volume24h descending when priceChangePct is equal
    fc.assert(fc.property(
      fc.float({ min: -1, max: 1, noNaN: true, noDefaultInfinity: true }),
      fc.array(fc.float({ min: 0, max: 1000000, noNaN: true, noDefaultInfinity: true }), { minLength: 2, maxLength: 20 }),
      (priceChange, volumes) => {
        // Create markets with same priceChangePct but different volumes
        const markets: MarketMover[] = volumes.map((vol, idx) => ({
          marketId: idx,
          marketTitle: `Market ${idx}`,
          marketPrice: 0.5,
          priceChangePct: priceChange,
          volume24h: vol.toString(),
          yesTokenId: `yes-token-${idx}`,
          noTokenId: `no-token-${idx}`,
          yesPrice: 0.5,
          noPrice: 0.5
        }))
        
        const sorted = sortByPriceChangeAndVolume(markets)
        
        // Check that volumes are in descending order
        for (let i = 0; i < sorted.length - 1; i++) {
          const volumeA = parseFloat(sorted[i].volume24h) || 0
          const volumeB = parseFloat(sorted[i + 1].volume24h) || 0
          if (volumeA < volumeB) {
            return false
          }
        }
        return true
      }
    ), { numRuns: 100 })

    // Property 4: Sorting should not modify the original array
    fc.assert(fc.property(
      fc.array(marketMoverArbitrary, { minLength: 0, maxLength: 50 }),
      (markets) => {
        const original = JSON.stringify(markets)
        sortByPriceChangeAndVolume(markets)
        const afterSort = JSON.stringify(markets)
        
        // Original array should remain unchanged
        return original === afterSort
      }
    ), { numRuns: 100 })

    // Property 5: Sorting should preserve all elements (no additions or removals)
    fc.assert(fc.property(
      fc.array(marketMoverArbitrary, { minLength: 0, maxLength: 50 }),
      (markets) => {
        const sorted = sortByPriceChangeAndVolume(markets)
        
        // Length should be preserved
        if (sorted.length !== markets.length) {
          return false
        }
        
        // All original elements should be present in sorted array
        for (const market of markets) {
          const found = sorted.some(m => 
            m.marketId === market.marketId &&
            m.marketTitle === market.marketTitle &&
            m.priceChangePct === market.priceChangePct &&
            m.volume24h === market.volume24h
          )
          if (!found) {
            return false
          }
        }
        
        return true
      }
    ), { numRuns: 100 })

    // Property 6: Empty array should return empty array
    fc.assert(fc.property(
      fc.constant([]),
      (markets) => {
        const sorted = sortByPriceChangeAndVolume(markets)
        return sorted.length === 0
      }
    ), { numRuns: 100 })

    // Property 7: Single element array should return identical array
    fc.assert(fc.property(
      marketMoverArbitrary,
      (market) => {
        const sorted = sortByPriceChangeAndVolume([market])
        return sorted.length === 1 && 
               sorted[0].marketId === market.marketId &&
               sorted[0].priceChangePct === market.priceChangePct
      }
    ), { numRuns: 100 })

    // Property 8: Combined sorting rule - verify complete ordering
    fc.assert(fc.property(
      fc.array(marketMoverArbitrary, { minLength: 2, maxLength: 50 }),
      (markets) => {
        const sorted = sortByPriceChangeAndVolume(markets)
        
        // Check complete ordering: primary by priceChangePct, secondary by volume
        for (let i = 0; i < sorted.length - 1; i++) {
          const current = sorted[i]
          const next = sorted[i + 1]
          
          // If priceChangePct differs, current should be >= next
          if (current.priceChangePct !== next.priceChangePct) {
            if (current.priceChangePct < next.priceChangePct) {
              return false
            }
          } else {
            // If priceChangePct is equal, volume should be descending
            const volumeCurrent = parseFloat(current.volume24h) || 0
            const volumeNext = parseFloat(next.volume24h) || 0
            if (volumeCurrent < volumeNext) {
              return false
            }
          }
        }
        return true
      }
    ), { numRuns: 100 })
  })
})
