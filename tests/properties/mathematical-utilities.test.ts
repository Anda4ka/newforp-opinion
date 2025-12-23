/**
 * **Feature: prediction-markets-backend, Property 1: Price change calculation accuracy**
 * **Validates: Requirements 1.3, 6.3**
 * 
 * Property-based tests for mathematical utility functions
 */

import { describe, test } from 'vitest'
import * as fc from 'fast-check'
import { priceChangePct } from '@/lib/utils'

describe('Mathematical Utilities Properties', () => {
  test('**Feature: prediction-markets-backend, Property 1: Price change calculation accuracy**', () => {
    fc.assert(fc.property(
      // Generate current price (positive numbers, avoiding extreme values)
      fc.float({ min: Math.fround(0.001), max: Math.fround(10), noNaN: true, noDefaultInfinity: true }),
      // Generate previous price (positive numbers, avoiding extreme values)
      fc.float({ min: Math.fround(0.001), max: Math.fround(10), noNaN: true, noDefaultInfinity: true }),
      (current, previous) => {
        const result = priceChangePct(current, previous)
        const expected = (current - previous) / previous
        
        // The result should match the expected formula within floating point precision
        return Math.abs(result - expected) < 1e-10
      }
    ), { numRuns: 100 })

    // Test zero division protection specifically
    fc.assert(fc.property(
      fc.float({ min: Math.fround(0.001), max: Math.fround(10), noNaN: true, noDefaultInfinity: true }),
      (current) => {
        const result = priceChangePct(current, 0)
        // When previous price is 0, should return 0 (zero division protection)
        return result === 0
      }
    ), { numRuns: 100 })

    // Test edge case where current equals previous
    fc.assert(fc.property(
      fc.float({ min: Math.fround(0.001), max: Math.fround(10), noNaN: true, noDefaultInfinity: true }),
      (price) => {
        const result = priceChangePct(price, price)
        // When prices are equal, change should be 0
        return Math.abs(result) < 1e-10
      }
    ), { numRuns: 100 })
  })
})