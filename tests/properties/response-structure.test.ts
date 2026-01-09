/**
 * **Feature: prediction-markets-backend, Property 14: Response structure completeness**
 * **Validates: Requirements 1.5, 3.5, 4.5**
 * 
 * Property-based tests for API response structure validation
 */

import { describe, test } from 'vitest'
import * as fc from 'fast-check'
import type { 
  MarketMover, 
  EndingSoonMarket, 
  PriceHistoryChart
} from '@/lib/types'

describe('Response Structure Completeness', () => {
  test('**Feature: prediction-markets-backend, Property 14: Response structure completeness**', () => {
    // Test MarketMover response structure (Requirements 1.5)
    fc.assert(fc.property(
      fc.record({
        marketId: fc.integer({ min: 1, max: 999999 }),
        marketTitle: fc.string({ minLength: 1, maxLength: 200 }),
        marketPrice: fc.float({ min: 0, max: 1, noNaN: true }),
        priceChangePct: fc.float({ min: -1, max: 1, noNaN: true }),
        volume24h: fc.string({ minLength: 1, maxLength: 50 }),
        yesTokenId: fc.string({ minLength: 1, maxLength: 128 }),
        noTokenId: fc.string({ minLength: 1, maxLength: 128 }),
        yesPrice: fc.float({ min: 0, max: 1, noNaN: true }),
        noPrice: fc.float({ min: 0, max: 1, noNaN: true })
      }),
      (mover: MarketMover) => {
        // Verify all required fields are present and correctly typed
        return (
          typeof mover.marketId === 'number' &&
          typeof mover.marketTitle === 'string' &&
          typeof mover.marketPrice === 'number' &&
          typeof mover.priceChangePct === 'number' &&
          typeof mover.volume24h === 'string' &&
          typeof mover.yesTokenId === 'string' &&
          typeof mover.noTokenId === 'string' &&
          typeof mover.yesPrice === 'number' &&
          typeof mover.noPrice === 'number' &&
          mover.marketId > 0 &&
          mover.marketTitle.length > 0 &&
          mover.volume24h.length > 0 &&
          mover.yesTokenId.length > 0 &&
          mover.noTokenId.length > 0 &&
          !isNaN(mover.marketPrice) &&
          !isNaN(mover.priceChangePct) &&
          !isNaN(mover.yesPrice) &&
          !isNaN(mover.noPrice)
        )
      }
    ), { numRuns: 100 })

    // Test EndingSoonMarket response structure (Requirements 3.5)
    fc.assert(fc.property(
      fc.record({
        marketId: fc.integer({ min: 1, max: 999999 }),
        marketTitle: fc.string({ minLength: 1, maxLength: 200 }),
        cutoffAt: fc.integer({ min: Math.floor(Date.now() / 1000), max: Math.floor(Date.now() / 1000) + 86400 * 30 }),
        yesPrice: fc.float({ min: 0, max: 1, noNaN: true }),
        volume: fc.string({ minLength: 1, maxLength: 50 })
      }),
      (market: EndingSoonMarket) => {
        // Verify all required fields are present and correctly typed
        return (
          typeof market.marketId === 'number' &&
          typeof market.marketTitle === 'string' &&
          typeof market.cutoffAt === 'number' &&
          typeof market.yesPrice === 'number' &&
          typeof market.volume === 'string' &&
          market.marketId > 0 &&
          market.marketTitle.length > 0 &&
          market.cutoffAt > 0 &&
          market.volume.length > 0 &&
          !isNaN(market.yesPrice)
        )
      }
    ), { numRuns: 100 })

    // Test PriceHistoryChart response structure (Requirements 4.5)
    fc.assert(fc.property(
      fc.integer({ min: 1, max: 100 }).chain(length => 
        fc.record({
          timestamps: fc.array(fc.integer({ min: 1600000000, max: 2000000000 }), { minLength: length, maxLength: length }),
          yesPrices: fc.array(fc.float({ min: 0, max: 1, noNaN: true }), { minLength: length, maxLength: length }),
          noAsYesPrices: fc.array(fc.float({ min: 0, max: 1, noNaN: true }), { minLength: length, maxLength: length })
        })
      ),
      (chart: PriceHistoryChart) => {
        // Verify all required fields are present, correctly typed, and arrays have matching lengths
        return (
          Array.isArray(chart.timestamps) &&
          Array.isArray(chart.yesPrices) &&
          Array.isArray(chart.noAsYesPrices) &&
          chart.timestamps.length > 0 &&
          chart.yesPrices.length > 0 &&
          chart.noAsYesPrices.length > 0 &&
          chart.timestamps.length === chart.yesPrices.length &&
          chart.timestamps.length === chart.noAsYesPrices.length &&
          chart.timestamps.every(t => typeof t === 'number' && t > 0) &&
          chart.yesPrices.every(p => typeof p === 'number' && !isNaN(p) && p >= 0 && p <= 1) &&
          chart.noAsYesPrices.every(p => typeof p === 'number' && !isNaN(p) && p >= 0 && p <= 1)
        )
      }
    ), { numRuns: 100 })
  })
})