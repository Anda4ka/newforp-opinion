/**
 * **Feature: prediction-markets-backend, Property 8: NO price transformation**
 * **Validates: Requirements 4.2**
 * 
 * Property-based tests for NO token price transformation
 */

import { describe, test } from 'vitest'
import * as fc from 'fast-check'
import { noAsYes } from '@/lib/utils'
import { transformNoPrice } from '@/lib/analytics'

describe('NO Price Transformation Properties', () => {
  test('**Feature: prediction-markets-backend, Property 8: NO price transformation**', () => {
    // Test that noAsYes correctly transforms NO price to (1 - price)
    fc.assert(fc.property(
      // Generate NO price (valid probability range 0-1)
      fc.float({ min: Math.fround(0), max: Math.fround(1), noNaN: true, noDefaultInfinity: true }),
      (noPrice) => {
        const result = noAsYes(noPrice)
        const expected = 1 - noPrice
        
        // The result should match the expected formula within floating point precision
        return Math.abs(result - expected) < 1e-10
      }
    ), { numRuns: 100 })

    // Test that transformNoPrice wrapper matches the formula
    fc.assert(fc.property(
      fc.float({ min: Math.fround(0), max: Math.fround(1), noNaN: true, noDefaultInfinity: true }),
      (noPrice) => {
        const result = transformNoPrice(noPrice)
        const expected = 1 - noPrice
        
        return Math.abs(result - expected) < 1e-10
      }
    ), { numRuns: 100 })

    // Test that transformation is symmetric: transforming twice returns original
    fc.assert(fc.property(
      fc.float({ min: Math.fround(0), max: Math.fround(1), noNaN: true, noDefaultInfinity: true }),
      (noPrice) => {
        const transformed = noAsYes(noPrice)
        const backTransformed = noAsYes(transformed)
        
        // Double transformation should return original value
        return Math.abs(backTransformed - noPrice) < 1e-10
      }
    ), { numRuns: 100 })

    // Test edge case: NO price of 0 transforms to 1
    fc.assert(fc.property(
      fc.constant(0),
      (noPrice) => {
        const result = noAsYes(noPrice)
        return Math.abs(result - 1) < 1e-10
      }
    ), { numRuns: 100 })

    // Test edge case: NO price of 1 transforms to 0
    fc.assert(fc.property(
      fc.constant(1),
      (noPrice) => {
        const result = noAsYes(noPrice)
        return Math.abs(result - 0) < 1e-10
      }
    ), { numRuns: 100 })

    // Test edge case: NO price of 0.5 transforms to 0.5
    fc.assert(fc.property(
      fc.constant(0.5),
      (noPrice) => {
        const result = noAsYes(noPrice)
        return Math.abs(result - 0.5) < 1e-10
      }
    ), { numRuns: 100 })

    // Test that result is always in valid probability range [0, 1]
    fc.assert(fc.property(
      fc.float({ min: Math.fround(0), max: Math.fround(1), noNaN: true, noDefaultInfinity: true }),
      (noPrice) => {
        const result = noAsYes(noPrice)
        return result >= 0 && result <= 1
      }
    ), { numRuns: 100 })

    // Test that transformation is monotonically decreasing
    // (higher NO price -> lower transformed price)
    fc.assert(fc.property(
      fc.float({ min: Math.fround(0), max: Math.fround(1), noNaN: true, noDefaultInfinity: true }),
      fc.float({ min: Math.fround(0), max: Math.fround(1), noNaN: true, noDefaultInfinity: true }),
      (noPrice1, noPrice2) => {
        if (noPrice1 < noPrice2) {
          const result1 = noAsYes(noPrice1)
          const result2 = noAsYes(noPrice2)
          // If noPrice1 < noPrice2, then transformed1 > transformed2
          return result1 > result2 || Math.abs(result1 - result2) < 1e-10
        }
        return true // Skip if not ordered
      }
    ), { numRuns: 100 })
  })
})
