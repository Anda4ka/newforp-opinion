/**
 * **Feature: prediction-markets-backend, Property 3: Arbitrage calculation accuracy**
 * **Validates: Requirements 2.2**
 * 
 * Property-based tests for arbitrage calculation
 */

import { describe, test } from 'vitest'
import * as fc from 'fast-check'
import { arbitragePct } from '@/lib/utils'
import { calculateArbitragePercentage } from '@/lib/analytics'

describe('Arbitrage Calculation Properties', () => {
  test('**Feature: prediction-markets-backend, Property 3: Arbitrage calculation accuracy**', () => {
    fc.assert(fc.property(
      // Generate YES price (valid probability range 0-1)
      fc.float({ min: Math.fround(0), max: Math.fround(1), noNaN: true, noDefaultInfinity: true }),
      // Generate NO price (valid probability range 0-1)
      fc.float({ min: Math.fround(0), max: Math.fround(1), noNaN: true, noDefaultInfinity: true }),
      (yesPrice, noPrice) => {
        const result = arbitragePct(yesPrice, noPrice)
        const expected = (yesPrice + noPrice - 1) * 100
        
        // The result should match the expected formula within floating point precision
        return Math.abs(result - expected) < 1e-10
      }
    ), { numRuns: 100 })

    // Test that calculateArbitragePercentage wrapper matches the formula
    fc.assert(fc.property(
      fc.float({ min: Math.fround(0), max: Math.fround(1), noNaN: true, noDefaultInfinity: true }),
      fc.float({ min: Math.fround(0), max: Math.fround(1), noNaN: true, noDefaultInfinity: true }),
      (yesPrice, noPrice) => {
        const result = calculateArbitragePercentage(yesPrice, noPrice)
        const expected = (yesPrice + noPrice - 1) * 100
        
        return Math.abs(result - expected) < 1e-10
      }
    ), { numRuns: 100 })

    // Test specific edge cases
    fc.assert(fc.property(
      fc.float({ min: Math.fround(0), max: Math.fround(1), noNaN: true, noDefaultInfinity: true }),
      (price) => {
        // When YES + NO = 1 (perfect market), arbitrage should be 0
        const result = arbitragePct(price, 1 - price)
        return Math.abs(result) < 1e-10
      }
    ), { numRuns: 100 })

    // Test that arbitrage is positive when YES + NO > 1
    fc.assert(fc.property(
      fc.float({ min: Math.fround(0.6), max: Math.fround(1), noNaN: true, noDefaultInfinity: true }),
      fc.float({ min: Math.fround(0.6), max: Math.fround(1), noNaN: true, noDefaultInfinity: true }),
      (yesPrice, noPrice) => {
        const sum = yesPrice + noPrice
        if (sum > 1) {
          const result = arbitragePct(yesPrice, noPrice)
          return result > 0
        }
        return true // Skip if sum <= 1
      }
    ), { numRuns: 100 })

    // Test that arbitrage is negative when YES + NO < 1
    fc.assert(fc.property(
      fc.float({ min: Math.fround(0), max: Math.fround(0.4), noNaN: true, noDefaultInfinity: true }),
      fc.float({ min: Math.fround(0), max: Math.fround(0.4), noNaN: true, noDefaultInfinity: true }),
      (yesPrice, noPrice) => {
        const sum = yesPrice + noPrice
        if (sum < 1) {
          const result = arbitragePct(yesPrice, noPrice)
          return result < 0
        }
        return true // Skip if sum >= 1
      }
    ), { numRuns: 100 })
  })
})
