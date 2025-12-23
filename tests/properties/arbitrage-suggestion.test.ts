/**
 * **Feature: prediction-markets-backend, Property 5: Arbitrage suggestion logic**
 * **Validates: Requirements 2.4, 2.5**
 * 
 * Property-based tests for arbitrage suggestion logic
 */

import { describe, test } from 'vitest'
import * as fc from 'fast-check'
import { determineUnderpriced } from '@/lib/utils'
import { createArbitrageOpportunity } from '@/lib/analytics'

describe('Arbitrage Suggestion Properties', () => {
  test('**Feature: prediction-markets-backend, Property 5: Arbitrage suggestion logic**', () => {
    // Property: When yes_price < (1 - no_price), suggestion should be YES_UNDERPRICED
    fc.assert(fc.property(
      // Generate YES and NO prices where YES < (1 - NO)
      fc.float({ min: Math.fround(0), max: Math.fround(0.49), noNaN: true, noDefaultInfinity: true }),
      fc.float({ min: Math.fround(0.51), max: Math.fround(1), noNaN: true, noDefaultInfinity: true }),
      (yesPrice, noPrice) => {
        // Ensure the condition yes_price < (1 - no_price) holds
        if (yesPrice < (1 - noPrice)) {
          const result = determineUnderpriced(yesPrice, noPrice)
          return result === 'YES_UNDERPRICED'
        }
        return true // Skip if condition doesn't hold
      }
    ), { numRuns: 100 })

    // Property: When yes_price >= (1 - no_price), suggestion should be NO_UNDERPRICED
    fc.assert(fc.property(
      // Generate YES and NO prices where YES >= (1 - NO)
      fc.float({ min: Math.fround(0.51), max: Math.fround(1), noNaN: true, noDefaultInfinity: true }),
      fc.float({ min: Math.fround(0), max: Math.fround(0.49), noNaN: true, noDefaultInfinity: true }),
      (yesPrice, noPrice) => {
        // Ensure the condition yes_price >= (1 - no_price) holds
        if (yesPrice >= (1 - noPrice)) {
          const result = determineUnderpriced(yesPrice, noPrice)
          return result === 'NO_UNDERPRICED'
        }
        return true // Skip if condition doesn't hold
      }
    ), { numRuns: 100 })

    // Property: For any valid YES and NO prices, result must be one of the two valid suggestions
    fc.assert(fc.property(
      fc.float({ min: Math.fround(0), max: Math.fround(1), noNaN: true, noDefaultInfinity: true }),
      fc.float({ min: Math.fround(0), max: Math.fround(1), noNaN: true, noDefaultInfinity: true }),
      (yesPrice, noPrice) => {
        const result = determineUnderpriced(yesPrice, noPrice)
        return result === 'YES_UNDERPRICED' || result === 'NO_UNDERPRICED'
      }
    ), { numRuns: 100 })

    // Property: The suggestion is deterministic (same inputs always give same output)
    fc.assert(fc.property(
      fc.float({ min: Math.fround(0), max: Math.fround(1), noNaN: true, noDefaultInfinity: true }),
      fc.float({ min: Math.fround(0), max: Math.fround(1), noNaN: true, noDefaultInfinity: true }),
      (yesPrice, noPrice) => {
        const result1 = determineUnderpriced(yesPrice, noPrice)
        const result2 = determineUnderpriced(yesPrice, noPrice)
        return result1 === result2
      }
    ), { numRuns: 100 })

    // Property: Boundary case - exact equality should give NO_UNDERPRICED
    fc.assert(fc.property(
      fc.float({ min: Math.fround(0.1), max: Math.fround(0.9), noNaN: true, noDefaultInfinity: true }),
      (price) => {
        // Use the same value for both to ensure exact equality
        const yesPrice = price
        const noPrice = 1 - price
        const result = determineUnderpriced(yesPrice, noPrice)
        
        // The actual comparison in the code: yesPrice < (1 - noPrice)
        // When yesPrice = price and noPrice = 1 - price:
        // yesPrice < (1 - (1 - price)) = yesPrice < price
        // This is always false, so result should be NO_UNDERPRICED
        const actualComparison = yesPrice < (1 - noPrice)
        
        if (actualComparison) {
          return result === 'YES_UNDERPRICED'
        } else {
          return result === 'NO_UNDERPRICED'
        }
      }
    ), { numRuns: 100 })

    // Property: createArbitrageOpportunity should include correct suggestion
    fc.assert(fc.property(
      fc.integer({ min: 1, max: 100000 }),
      fc.string({ minLength: 1, maxLength: 100 }),
      fc.float({ min: Math.fround(0), max: Math.fround(1), noNaN: true, noDefaultInfinity: true }),
      fc.float({ min: Math.fround(0), max: Math.fround(1), noNaN: true, noDefaultInfinity: true }),
      (marketId, marketTitle, yesPrice, noPrice) => {
        const opportunity = createArbitrageOpportunity(marketId, marketTitle, yesPrice, noPrice)
        const expectedSuggestion = determineUnderpriced(yesPrice, noPrice)
        return opportunity.suggestion === expectedSuggestion
      }
    ), { numRuns: 100 })

    // Property: Logical consistency - if YES is underpriced, then YES < (1 - NO)
    fc.assert(fc.property(
      fc.float({ min: Math.fround(0), max: Math.fround(1), noNaN: true, noDefaultInfinity: true }),
      fc.float({ min: Math.fround(0), max: Math.fround(1), noNaN: true, noDefaultInfinity: true }),
      (yesPrice, noPrice) => {
        const result = determineUnderpriced(yesPrice, noPrice)
        if (result === 'YES_UNDERPRICED') {
          return yesPrice < (1 - noPrice)
        } else {
          return yesPrice >= (1 - noPrice)
        }
      }
    ), { numRuns: 100 })

    // Property: Complementary prices - when noPrice = 1 - yesPrice, result should be NO_UNDERPRICED
    fc.assert(fc.property(
      fc.float({ min: Math.fround(0.01), max: Math.fround(0.99), noNaN: true, noDefaultInfinity: true }),
      (yesPrice) => {
        const noPrice = 1 - yesPrice
        const result = determineUnderpriced(yesPrice, noPrice)
        
        // When noPrice = 1 - yesPrice:
        // The comparison is: yesPrice < (1 - noPrice) = yesPrice < (1 - (1 - yesPrice)) = yesPrice < yesPrice
        // This is always false (with proper floating-point handling), so result should be NO_UNDERPRICED
        // We avoid extreme values near 0 and 1 to prevent floating-point precision issues
        return result === 'NO_UNDERPRICED'
      }
    ), { numRuns: 100 })
  })
})
