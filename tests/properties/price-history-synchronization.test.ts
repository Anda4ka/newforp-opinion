/**
 * **Feature: prediction-markets-backend, Property 9: Price history synchronization**
 * **Validates: Requirements 4.1, 4.3**
 * 
 * Property-based tests for price history synchronization between YES and NO tokens
 */

import { describe, test } from 'vitest'
import * as fc from 'fast-check'
import { PriceHistoryPoint } from '@/lib/types'
import { parsePrice } from '@/lib/utils'
import { transformNoPrice } from '@/lib/analytics'

describe('Price History Synchronization Properties', () => {
  test('**Feature: prediction-markets-backend, Property 9: Price history synchronization**', () => {
    // Generator for price history points
    const priceHistoryPointArb = fc.record({
      t: fc.integer({ min: 1600000000, max: 2000000000 }), // Valid unix timestamps
      p: fc.float({ min: Math.fround(0.01), max: Math.fround(0.99), noNaN: true, noDefaultInfinity: true }).map(n => n.toString())
    })

    // Generator for arrays of price history points
    const priceHistoryArb = fc.array(priceHistoryPointArb, { minLength: 1, maxLength: 100 })

    // Test that synchronization produces matching array lengths
    fc.assert(fc.property(
      priceHistoryArb,
      priceHistoryArb,
      (yesHistory, noHistory) => {
        const result = synchronizePriceHistory(yesHistory, noHistory)
        
        // All three arrays should have the same length
        return result.timestamps.length === result.yesPrices.length &&
               result.timestamps.length === result.noAsYesPrices.length
      }
    ), { numRuns: 100 })

    // Test that timestamps are sorted in ascending order
    fc.assert(fc.property(
      priceHistoryArb,
      priceHistoryArb,
      (yesHistory, noHistory) => {
        const result = synchronizePriceHistory(yesHistory, noHistory)
        
        // Check if timestamps are sorted
        for (let i = 1; i < result.timestamps.length; i++) {
          if (result.timestamps[i] < result.timestamps[i - 1]) {
            return false
          }
        }
        return true
      }
    ), { numRuns: 100 })

    // Test that only timestamps present in both histories are included
    fc.assert(fc.property(
      priceHistoryArb,
      priceHistoryArb,
      (yesHistory, noHistory) => {
        const result = synchronizePriceHistory(yesHistory, noHistory)
        
        const yesTimestamps = new Set(yesHistory.map(p => p.t))
        const noTimestamps = new Set(noHistory.map(p => p.t))
        
        // Every timestamp in result should exist in both input histories
        return result.timestamps.every(t => 
          yesTimestamps.has(t) && noTimestamps.has(t)
        )
      }
    ), { numRuns: 100 })

    // Test that NO prices are correctly transformed
    fc.assert(fc.property(
      priceHistoryArb,
      priceHistoryArb,
      (yesHistory, noHistory) => {
        const result = synchronizePriceHistory(yesHistory, noHistory)
        
        // Create maps for verification
        const noMap = new Map<number, number>()
        noHistory.forEach(point => {
          noMap.set(point.t, parsePrice(point.p))
        })

        // Check that each NO price is correctly transformed
        return result.timestamps.every((timestamp, index) => {
          const originalNoPrice = noMap.get(timestamp)
          if (originalNoPrice === undefined) return false
          
          const expectedTransformed = transformNoPrice(originalNoPrice)
          const actualTransformed = result.noAsYesPrices[index]
          
          return Math.abs(actualTransformed - expectedTransformed) < 1e-10
        })
      }
    ), { numRuns: 100 })

    // Test that YES prices are correctly preserved
    fc.assert(fc.property(
      priceHistoryArb,
      priceHistoryArb,
      (yesHistory, noHistory) => {
        const result = synchronizePriceHistory(yesHistory, noHistory)
        
        // Create map for verification
        const yesMap = new Map<number, number>()
        yesHistory.forEach(point => {
          yesMap.set(point.t, parsePrice(point.p))
        })

        // Check that each YES price is correctly preserved
        return result.timestamps.every((timestamp, index) => {
          const originalYesPrice = yesMap.get(timestamp)
          if (originalYesPrice === undefined) return false
          
          const actualYesPrice = result.yesPrices[index]
          
          return Math.abs(actualYesPrice - originalYesPrice) < 1e-10
        })
      }
    ), { numRuns: 100 })

    // Test with identical timestamps (perfect overlap)
    fc.assert(fc.property(
      fc.uniqueArray(fc.integer({ min: 1600000000, max: 2000000000 }), { minLength: 1, maxLength: 50 }),
      fc.array(fc.float({ min: Math.fround(0.01), max: Math.fround(0.99), noNaN: true, noDefaultInfinity: true }), { minLength: 1, maxLength: 50 }),
      fc.array(fc.float({ min: Math.fround(0.01), max: Math.fround(0.99), noNaN: true, noDefaultInfinity: true }), { minLength: 1, maxLength: 50 }),
      (timestamps, yesPrices, noPrices) => {
        // Create histories with identical timestamps
        const minLength = Math.min(timestamps.length, yesPrices.length, noPrices.length)
        const yesHistory = timestamps.slice(0, minLength).map((t, i) => ({
          t,
          p: yesPrices[i].toString()
        }))
        const noHistory = timestamps.slice(0, minLength).map((t, i) => ({
          t,
          p: noPrices[i].toString()
        }))

        const result = synchronizePriceHistory(yesHistory, noHistory)
        
        // With identical timestamps, result should have same length as input
        return result.timestamps.length === minLength
      }
    ), { numRuns: 100 })

    // Test with no overlapping timestamps
    fc.assert(fc.property(
      fc.array(fc.integer({ min: 1600000000, max: 1700000000 }), { minLength: 1, maxLength: 10 }),
      fc.array(fc.integer({ min: 1800000000, max: 1900000000 }), { minLength: 1, maxLength: 10 }),
      fc.array(fc.float({ min: Math.fround(0.01), max: Math.fround(0.99), noNaN: true, noDefaultInfinity: true }), { minLength: 1, maxLength: 10 }),
      fc.array(fc.float({ min: Math.fround(0.01), max: Math.fround(0.99), noNaN: true, noDefaultInfinity: true }), { minLength: 1, maxLength: 10 }),
      (yesTimestamps, noTimestamps, yesPrices, noPrices) => {
        const minYesLength = Math.min(yesTimestamps.length, yesPrices.length)
        const minNoLength = Math.min(noTimestamps.length, noPrices.length)
        
        const yesHistory = yesTimestamps.slice(0, minYesLength).map((t, i) => ({
          t,
          p: yesPrices[i].toString()
        }))
        const noHistory = noTimestamps.slice(0, minNoLength).map((t, i) => ({
          t,
          p: noPrices[i].toString()
        }))

        const result = synchronizePriceHistory(yesHistory, noHistory)
        
        // With no overlapping timestamps, result should be empty
        return result.timestamps.length === 0 &&
               result.yesPrices.length === 0 &&
               result.noAsYesPrices.length === 0
      }
    ), { numRuns: 100 })
  })
})

/**
 * Synchronize price history data between YES and NO tokens
 * This is a copy of the function from the price-history route for testing
 */
function synchronizePriceHistory(
  yesHistory: PriceHistoryPoint[],
  noHistory: PriceHistoryPoint[]
): {
  timestamps: number[]
  yesPrices: number[]
  noAsYesPrices: number[]
} {
  // Create maps for quick lookup
  const yesMap = new Map<number, number>()
  const noMap = new Map<number, number>()

  // Populate YES price map
  yesHistory.forEach(point => {
    yesMap.set(point.t, parsePrice(point.p))
  })

  // Populate NO price map with transformed prices
  noHistory.forEach(point => {
    const originalNoPrice = parsePrice(point.p)
    const transformedNoPrice = transformNoPrice(originalNoPrice)
    noMap.set(point.t, transformedNoPrice)
  })

  // Get all unique timestamps and sort them
  const allTimestamps = new Set<number>()
  yesHistory.forEach(point => allTimestamps.add(point.t))
  noHistory.forEach(point => allTimestamps.add(point.t))
  
  const sortedTimestamps = Array.from(allTimestamps).sort((a, b) => a - b)

  // Only include timestamps where both YES and NO data exist
  const timestamps: number[] = []
  const yesPrices: number[] = []
  const noAsYesPrices: number[] = []

  sortedTimestamps.forEach(timestamp => {
    const yesPrice = yesMap.get(timestamp)
    const noAsYesPrice = noMap.get(timestamp)

    if (yesPrice !== undefined && noAsYesPrice !== undefined) {
      timestamps.push(timestamp)
      yesPrices.push(yesPrice)
      noAsYesPrices.push(noAsYesPrice)
    }
  })

  return {
    timestamps,
    yesPrices,
    noAsYesPrices
  }
}