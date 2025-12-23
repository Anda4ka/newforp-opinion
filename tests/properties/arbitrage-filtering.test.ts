/**
 * **Feature: prediction-markets-backend, Property 4: Arbitrage filtering threshold**
 * **Validates: Requirements 2.3**
 * 
 * Property-based tests for arbitrage filtering
 */

import { describe, test, expect } from 'vitest'
import * as fc from 'fast-check'
import { filterSignificantArbitrage } from '@/lib/analytics'
import { ArbitrageOpportunity } from '@/lib/types'

describe('Arbitrage Filtering Properties', () => {
  test('**Feature: prediction-markets-backend, Property 4: Arbitrage filtering threshold**', () => {
    // Generator for ArbitrageOpportunity with controlled arbPct
    const arbitrageOpportunityArb = fc.record({
      marketId: fc.integer({ min: 1, max: 100000 }),
      marketTitle: fc.string({ minLength: 1, maxLength: 100 }),
      yesPrice: fc.float({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
      noPrice: fc.float({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
      arbPct: fc.float({ min: -50, max: 50, noNaN: true, noDefaultInfinity: true }),
      suggestion: fc.constantFrom('YES_UNDERPRICED' as const, 'NO_UNDERPRICED' as const)
    })

    // Property: All filtered opportunities should have arbPct >= 4%
    fc.assert(fc.property(
      fc.array(arbitrageOpportunityArb, { minLength: 0, maxLength: 50 }),
      (opportunities) => {
        const filtered = filterSignificantArbitrage(opportunities)
        
        // Every item in the filtered result should have arbPct >= 4
        return filtered.every(opp => opp.arbPct >= 4)
      }
    ), { numRuns: 100 })

    // Property: All opportunities with arbPct >= 4 should be included
    fc.assert(fc.property(
      fc.array(arbitrageOpportunityArb, { minLength: 0, maxLength: 50 }),
      (opportunities) => {
        const filtered = filterSignificantArbitrage(opportunities)
        const shouldBeIncluded = opportunities.filter(opp => opp.arbPct >= 4)
        
        // The filtered result should have the same length as opportunities with arbPct >= 4
        return filtered.length === shouldBeIncluded.length
      }
    ), { numRuns: 100 })

    // Property: No opportunities with arbPct < 4 should be included
    fc.assert(fc.property(
      fc.array(arbitrageOpportunityArb, { minLength: 0, maxLength: 50 }),
      (opportunities) => {
        const filtered = filterSignificantArbitrage(opportunities)
        
        // None of the filtered results should have arbPct < 4
        return !filtered.some(opp => opp.arbPct < 4)
      }
    ), { numRuns: 100 })

    // Property: Filtering is idempotent (filtering twice gives same result)
    fc.assert(fc.property(
      fc.array(arbitrageOpportunityArb, { minLength: 0, maxLength: 50 }),
      (opportunities) => {
        const filtered1 = filterSignificantArbitrage(opportunities)
        const filtered2 = filterSignificantArbitrage(filtered1)
        
        // Filtering already-filtered data should return the same result
        return filtered1.length === filtered2.length &&
               filtered1.every((opp, idx) => opp.marketId === filtered2[idx].marketId)
      }
    ), { numRuns: 100 })

    // Property: Order preservation - filtered items maintain relative order
    fc.assert(fc.property(
      fc.array(arbitrageOpportunityArb, { minLength: 0, maxLength: 50 }),
      (opportunities) => {
        const filtered = filterSignificantArbitrage(opportunities)
        const significantOps = opportunities.filter(opp => opp.arbPct >= 4)
        
        // The order of marketIds should be preserved
        return filtered.every((opp, idx) => 
          opp.marketId === significantOps[idx].marketId
        )
      }
    ), { numRuns: 100 })

    // Property: Empty input produces empty output
    fc.assert(fc.property(
      fc.constant([]),
      (opportunities) => {
        const filtered = filterSignificantArbitrage(opportunities)
        return filtered.length === 0
      }
    ), { numRuns: 100 })

    // Property: Boundary case - exactly 4% should be included
    fc.assert(fc.property(
      fc.integer({ min: 1, max: 100000 }),
      fc.string({ minLength: 1, maxLength: 100 }),
      (marketId, marketTitle) => {
        const opportunity: ArbitrageOpportunity = {
          marketId,
          marketTitle,
          yesPrice: 0.5,
          noPrice: 0.5,
          arbPct: 4.0, // Exactly at threshold
          suggestion: 'YES_UNDERPRICED'
        }
        
        const filtered = filterSignificantArbitrage([opportunity])
        
        // Exactly 4% should be included (>= 4)
        return filtered.length === 1 && filtered[0].arbPct === 4.0
      }
    ), { numRuns: 100 })

    // Property: Just below threshold should be excluded
    fc.assert(fc.property(
      fc.integer({ min: 1, max: 100000 }),
      fc.string({ minLength: 1, maxLength: 100 }),
      (marketId, marketTitle) => {
        const opportunity: ArbitrageOpportunity = {
          marketId,
          marketTitle,
          yesPrice: 0.5,
          noPrice: 0.5,
          arbPct: 3.999999, // Just below threshold
          suggestion: 'YES_UNDERPRICED'
        }
        
        const filtered = filterSignificantArbitrage([opportunity])
        
        // Just below 4% should be excluded
        return filtered.length === 0
      }
    ), { numRuns: 100 })
  })
})
