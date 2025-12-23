/**
 * **Feature: prediction-markets-backend, Property 6: Ending soon time filtering**
 * **Validates: Requirements 3.1, 3.2, 3.4**
 * 
 * Property-based tests for ending soon market filtering logic
 */

import { describe, test } from 'vitest'
import * as fc from 'fast-check'
import { filterEndingSoon } from '@/lib/analytics'
import { Market } from '@/lib/types'

describe('Time Filtering Properties', () => {
  // Helper to create a market with specific cutoff time
  const createMarketWithCutoff = (
    id: number,
    cutoffAt: number,
    status: string | number
  ): Market => ({
    id,
    title: `Market ${id}`,
    yesTokenId: `yes-${id}`,
    noTokenId: `no-${id}`,
    cutoffAt,
    status,
    volume24h: '1000'
  })

  // Arbitrary generator for Market with controlled cutoff times
  const marketArbitrary = (hoursFromNow: number) => fc.record({
    id: fc.integer({ min: 1, max: 100000 }),
    title: fc.string({ minLength: 1, maxLength: 100 }),
    yesTokenId: fc.string({ minLength: 1, maxLength: 50 }),
    noTokenId: fc.string({ minLength: 1, maxLength: 50 }),
    cutoffAt: fc.constant(Math.floor(Date.now() / 1000) + hoursFromNow * 3600),
    status: fc.oneof(
      fc.constant('activated'),
      fc.constant(1),
      fc.constant('pending'),
      fc.constant(0)
    ),
    volume24h: fc.float({ min: 0, max: 1000000, noNaN: true, noDefaultInfinity: true }).map(v => v.toString())
  }) as fc.Arbitrary<Market>

  test('**Feature: prediction-markets-backend, Property 6: Ending soon time filtering**', () => {
    // Property 1: Only activated markets should be included
    fc.assert(fc.property(
      fc.array(marketArbitrary(5), { minLength: 0, maxLength: 50 }),
      fc.integer({ min: 1, max: 24 }),
      (markets, hours) => {
        const filtered = filterEndingSoon(markets, hours)
        
        // All filtered markets must be activated
        return filtered.every(market => 
          market.status === 'activated' || market.status === 1
        )
      }
    ), { numRuns: 100 })

    // Property 2: Markets ending within specified hours should be included (if activated)
    fc.assert(fc.property(
      fc.integer({ min: 1, max: 24 }),
      fc.integer({ min: 1, max: 100 }),
      (hours, marketId) => {
        const now = Date.now() / 1000
        // Create market ending within the specified hours
        const cutoffAt = Math.floor(now + (hours - 0.5) * 3600) // 0.5 hours before limit
        const market = createMarketWithCutoff(marketId, cutoffAt, 'activated')
        
        const filtered = filterEndingSoon([market], hours)
        
        // Market should be included
        return filtered.length === 1 && filtered[0].id === marketId
      }
    ), { numRuns: 100 })

    // Property 3: Markets ending after specified hours should be excluded
    fc.assert(fc.property(
      fc.integer({ min: 1, max: 24 }),
      fc.integer({ min: 1, max: 100 }),
      (hours, marketId) => {
        const now = Date.now() / 1000
        // Create market ending after the specified hours
        const cutoffAt = Math.floor(now + (hours + 1) * 3600) // 1 hour after limit
        const market = createMarketWithCutoff(marketId, cutoffAt, 'activated')
        
        const filtered = filterEndingSoon([market], hours)
        
        // Market should be excluded
        return filtered.length === 0
      }
    ), { numRuns: 100 })

    // Property 4: Markets that have already ended should be excluded
    fc.assert(fc.property(
      fc.integer({ min: 1, max: 24 }),
      fc.integer({ min: 1, max: 100 }),
      (hours, marketId) => {
        const now = Date.now() / 1000
        // Create market that ended in the past
        const cutoffAt = Math.floor(now - 3600) // 1 hour ago
        const market = createMarketWithCutoff(marketId, cutoffAt, 'activated')
        
        const filtered = filterEndingSoon([market], hours)
        
        // Market should be excluded (already ended)
        return filtered.length === 0
      }
    ), { numRuns: 100 })

    // Property 5: Non-activated markets should be excluded even if within time range
    fc.assert(fc.property(
      fc.integer({ min: 1, max: 24 }),
      fc.integer({ min: 1, max: 100 }),
      fc.oneof(fc.constant('pending'), fc.constant(0), fc.constant('closed'), fc.constant(2)),
      (hours, marketId, status) => {
        const now = Date.now() / 1000
        // Create market ending within hours but not activated
        const cutoffAt = Math.floor(now + (hours - 0.5) * 3600)
        const market = createMarketWithCutoff(marketId, cutoffAt, status)
        
        const filtered = filterEndingSoon([market], hours)
        
        // Market should be excluded (not activated)
        return filtered.length === 0
      }
    ), { numRuns: 100 })

    // Property 6: Filtering should not modify the original array
    fc.assert(fc.property(
      fc.array(marketArbitrary(5), { minLength: 0, maxLength: 50 }),
      fc.integer({ min: 1, max: 24 }),
      (markets, hours) => {
        const original = JSON.stringify(markets)
        filterEndingSoon(markets, hours)
        const afterFilter = JSON.stringify(markets)
        
        // Original array should remain unchanged
        return original === afterFilter
      }
    ), { numRuns: 100 })

    // Property 7: Empty array should return empty array
    fc.assert(fc.property(
      fc.integer({ min: 1, max: 24 }),
      (hours) => {
        const filtered = filterEndingSoon([], hours)
        return filtered.length === 0
      }
    ), { numRuns: 100 })

    // Property 8: All filtered markets must have cutoffAt within specified hours
    fc.assert(fc.property(
      fc.array(marketArbitrary(5), { minLength: 0, maxLength: 50 }),
      fc.integer({ min: 1, max: 24 }),
      (markets, hours) => {
        const filtered = filterEndingSoon(markets, hours)
        const now = Date.now() / 1000
        
        // All filtered markets must have cutoffAt within the specified hours
        return filtered.every(market => {
          const hoursUntilCutoff = (market.cutoffAt - now) / 3600
          return hoursUntilCutoff > 0 && hoursUntilCutoff <= hours
        })
      }
    ), { numRuns: 100 })

    // Property 9: Filtering is idempotent (filtering twice gives same result)
    fc.assert(fc.property(
      fc.array(marketArbitrary(5), { minLength: 0, maxLength: 50 }),
      fc.integer({ min: 1, max: 24 }),
      (markets, hours) => {
        const filtered1 = filterEndingSoon(markets, hours)
        const filtered2 = filterEndingSoon(filtered1, hours)
        
        // Filtering an already filtered array should give the same result
        return JSON.stringify(filtered1) === JSON.stringify(filtered2)
      }
    ), { numRuns: 100 })

    // Property 10: Subset property - filtered results are subset of input
    fc.assert(fc.property(
      fc.array(marketArbitrary(5), { minLength: 0, maxLength: 50 }),
      fc.integer({ min: 1, max: 24 }),
      (markets, hours) => {
        const filtered = filterEndingSoon(markets, hours)
        
        // All filtered markets must exist in original array
        return filtered.every(filteredMarket =>
          markets.some(market => market.id === filteredMarket.id)
        )
      }
    ), { numRuns: 100 })

    // Property 11: Combined filtering rule - verify complete logic
    fc.assert(fc.property(
      fc.array(marketArbitrary(5), { minLength: 0, maxLength: 50 }),
      fc.integer({ min: 1, max: 24 }),
      (markets, hours) => {
        const filtered = filterEndingSoon(markets, hours)
        const now = Date.now() / 1000
        
        // Verify each filtered market meets all criteria
        for (const market of filtered) {
          const isActivated = market.status === 'activated' || market.status === 1
          const hoursUntilCutoff = (market.cutoffAt - now) / 3600
          const withinTimeRange = hoursUntilCutoff > 0 && hoursUntilCutoff <= hours
          
          if (!isActivated || !withinTimeRange) {
            return false
          }
        }
        
        return true
      }
    ), { numRuns: 100 })

    // Property 12: Increasing hours parameter should include more or equal markets
    fc.assert(fc.property(
      fc.array(marketArbitrary(10), { minLength: 0, maxLength: 50 }),
      fc.integer({ min: 1, max: 12 }),
      (markets, hours) => {
        const filtered1 = filterEndingSoon(markets, hours)
        const filtered2 = filterEndingSoon(markets, hours * 2)
        
        // More hours should include at least as many markets
        return filtered2.length >= filtered1.length
      }
    ), { numRuns: 100 })
  })
})
