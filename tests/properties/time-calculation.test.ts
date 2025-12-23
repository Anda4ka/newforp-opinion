/**
 * **Feature: prediction-markets-backend, Property 7: Time calculation consistency**
 * **Validates: Requirements 3.3**
 * 
 * Property-based tests for time calculation consistency
 */

import { describe, test } from 'vitest'
import * as fc from 'fast-check'
import { hoursUntil } from '@/lib/utils'

describe('Time Calculation Properties', () => {
  test('**Feature: prediction-markets-backend, Property 7: Time calculation consistency**', () => {
    // Property: For any cutoffAt timestamp, time until closure should equal cutoffAt - current_timestamp
    fc.assert(fc.property(
      fc.integer({ min: -86400, max: 86400 }), // Hours offset from now (-24h to +24h)
      (hoursOffset) => {
        // Calculate expected cutoff timestamp
        const nowSeconds = Date.now() / 1000
        const cutoffAtSeconds = nowSeconds + (hoursOffset * 3600)
        
        // Calculate time until cutoff using our function
        const calculatedHours = hoursUntil(cutoffAtSeconds)
        
        // The calculated hours should equal the original offset
        // Allow small floating point tolerance (1 second = ~0.0003 hours)
        const tolerance = 0.001
        return Math.abs(calculatedHours - hoursOffset) < tolerance
      }
    ), { numRuns: 100 })

    // Property: Time calculation should be consistent across multiple calls within short timeframe
    fc.assert(fc.property(
      fc.integer({ min: 1, max: 168 }), // 1 to 168 hours (1 week)
      (hoursFromNow) => {
        const nowSeconds = Date.now() / 1000
        const cutoffAtSeconds = nowSeconds + (hoursFromNow * 3600)
        
        // Call the function twice in quick succession
        const result1 = hoursUntil(cutoffAtSeconds)
        const result2 = hoursUntil(cutoffAtSeconds)
        
        // Results should be very close (within 1 second tolerance)
        const tolerance = 0.001
        return Math.abs(result1 - result2) < tolerance
      }
    ), { numRuns: 100 })

    // Property: Past timestamps should return negative hours
    fc.assert(fc.property(
      fc.integer({ min: 1, max: 168 }), // 1 to 168 hours ago
      (hoursAgo) => {
        const nowSeconds = Date.now() / 1000
        const pastTimestamp = nowSeconds - (hoursAgo * 3600)
        
        const result = hoursUntil(pastTimestamp)
        
        // Should return negative value approximately equal to -hoursAgo
        const tolerance = 0.001
        return Math.abs(result + hoursAgo) < tolerance
      }
    ), { numRuns: 100 })

    // Property: Future timestamps should return positive hours
    fc.assert(fc.property(
      fc.integer({ min: 1, max: 168 }), // 1 to 168 hours from now
      (hoursFromNow) => {
        const nowSeconds = Date.now() / 1000
        const futureTimestamp = nowSeconds + (hoursFromNow * 3600)
        
        const result = hoursUntil(futureTimestamp)
        
        // Should return positive value approximately equal to hoursFromNow
        const tolerance = 0.001
        return Math.abs(result - hoursFromNow) < tolerance
      }
    ), { numRuns: 100 })

    // Property: Zero offset should return approximately zero
    fc.assert(fc.property(
      fc.constant(0),
      () => {
        const nowSeconds = Date.now() / 1000
        const result = hoursUntil(nowSeconds)
        
        // Should be very close to zero (within 1 second tolerance)
        const tolerance = 0.001
        return Math.abs(result) < tolerance
      }
    ), { numRuns: 100 })

    // Property: Linear relationship - doubling time offset should double the result
    fc.assert(fc.property(
      fc.integer({ min: 1, max: 84 }), // 1 to 84 hours to avoid overflow when doubling
      (hoursOffset) => {
        const nowSeconds = Date.now() / 1000
        const timestamp1 = nowSeconds + (hoursOffset * 3600)
        const timestamp2 = nowSeconds + (hoursOffset * 2 * 3600)
        
        const result1 = hoursUntil(timestamp1)
        const result2 = hoursUntil(timestamp2)
        
        // result2 should be approximately twice result1
        const tolerance = 0.001
        return Math.abs(result2 - (result1 * 2)) < tolerance
      }
    ), { numRuns: 100 })

    // Property: Monotonic property - later timestamps should have larger hour values
    fc.assert(fc.property(
      fc.integer({ min: 1, max: 100 }),
      fc.integer({ min: 1, max: 100 }),
      (hours1, hours2) => {
        const nowSeconds = Date.now() / 1000
        const timestamp1 = nowSeconds + (Math.min(hours1, hours2) * 3600)
        const timestamp2 = nowSeconds + (Math.max(hours1, hours2) * 3600)
        
        const result1 = hoursUntil(timestamp1)
        const result2 = hoursUntil(timestamp2)
        
        // Later timestamp should have larger hour value
        return result2 >= result1
      }
    ), { numRuns: 100 })

    // Property: Precision test - fractional hours should be handled correctly
    fc.assert(fc.property(
      fc.float({ min: Math.fround(0.1), max: Math.fround(24), noNaN: true, noDefaultInfinity: true }),
      (fractionalHours) => {
        const nowSeconds = Date.now() / 1000
        const cutoffAtSeconds = nowSeconds + (fractionalHours * 3600)
        
        const result = hoursUntil(cutoffAtSeconds)
        
        // Should match the fractional input within tolerance
        const tolerance = 0.001
        return Math.abs(result - fractionalHours) < tolerance
      }
    ), { numRuns: 100 })
  })
})