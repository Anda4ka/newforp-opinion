/**
 * **Feature: prediction-markets-refactoring, Property 7: Batch price response structure**
 * **Validates: Requirements 3.5**
 * 
 * Property-based tests for batch price response structure validation:
 * - For any getMultiplePrices call, the response should be a Map<tokenId, PriceData> for fast access
 */

import { describe, test, beforeEach, afterEach, expect, vi } from 'vitest'
import * as fc from 'fast-check'

// Mock fetch to provide consistent responses
const mockFetch = vi.fn()
global.fetch = mockFetch

// Mock rateLimiter module to avoid dependency issues
vi.mock('../../lib/rateLimiter', () => ({
  rateLimiter: {
    executeRequest: vi.fn((key, fn) => fn())
  },
  ExponentialBackoff: {
    executeWithBackoff: vi.fn((fn) => fn())
  }
}))

// Mock p-limit to avoid concurrency control interference
vi.mock('p-limit', () => ({
  default: vi.fn(() => vi.fn(async (fn: () => Promise<any>) => fn()))
}))

import { OpinionClient } from '../../lib/opinionClient'

// Define PriceData interface based on usage in codebase
interface PriceData {
  tokenId: string
  price: string
  timestamp: number
}

describe('Batch Price Response Structure Properties', () => {
  let opinionClient: OpinionClient

  beforeEach(() => {
    vi.clearAllMocks()
    
    // Set required environment variables for testing
    process.env.OPINION_API_KEY = 'test-api-key'
    process.env.OPINION_BASE_URL = 'https://test-api.example.com/openapi'
    
    opinionClient = new OpinionClient()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('**Feature: prediction-markets-refactoring, Property 7: Batch price response structure**', async () => {
    // Property: For any getMultiplePrices call, the response should be a Map<tokenId, PriceData> for fast access
    await fc.assert(fc.asyncProperty(
      // Generate arrays of unique token IDs to test batch processing
      fc.array(
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        { minLength: 0, maxLength: 20 }
      ).map(arr => [...new Set(arr)]), // Ensure unique token IDs
      async (tokenIds: string[]) => {
        // Mock fetch to return valid price responses for each token
        mockFetch.mockImplementation(async (url: string) => {
          // Extract token ID from URL and properly decode it
          const tokenIdMatch = url.match(/token_id=([^&]+)/)
          let tokenId = 'unknown'
          if (tokenIdMatch) {
            // First replace + with spaces, then decode URI component
            const encodedTokenId = tokenIdMatch[1].replace(/\+/g, ' ')
            tokenId = decodeURIComponent(encodedTokenId)
          }
          
          // Simulate API response time
          await new Promise(resolve => setTimeout(resolve, 5))
          
          return {
            ok: true,
            json: async () => ({
              code: 0,
              result: {
                tokenId: tokenId,
                price: fc.sample(fc.float({ min: 0, max: 1, noNaN: true }).map(n => n.toFixed(6)), 1)[0],
                timestamp: Date.now() + Math.floor(Math.random() * 1000)
              }
            })
          }
        })

        // Execute getMultiplePrices with the generated token IDs
        const result = await opinionClient.getMultiplePrices(tokenIds)
        
        // Requirement 3.5: Verify the response is a Map<tokenId, PriceData> for fast access
        
        // 1. Verify result is a Map instance
        expect(result).toBeInstanceOf(Map)
        
        // 2. Verify Map size matches input token count
        expect(result.size).toBe(tokenIds.length)
        
        // 3. Verify each token ID has corresponding price data with correct structure
        for (const tokenId of tokenIds) {
          const priceData = result.get(tokenId)
          
          // Verify price data exists
          expect(priceData).toBeDefined()
          expect(priceData).not.toBeNull()
          
          // Verify PriceData structure and types
          expect(priceData).toHaveProperty('tokenId')
          expect(priceData).toHaveProperty('price')
          expect(priceData).toHaveProperty('timestamp')
          
          // Verify field types match PriceData interface
          expect(typeof priceData!.tokenId).toBe('string')
          expect(typeof priceData!.price).toBe('string')
          expect(typeof priceData!.timestamp).toBe('number')
          
          // Verify tokenId matches the requested token
          expect(priceData!.tokenId).toBe(tokenId)
          
          // Verify price is a valid numeric string
          expect(priceData!.price).toMatch(/^\d+(\.\d+)?$/)
          
          // Verify timestamp is a valid timestamp
          expect(priceData!.timestamp).toBeGreaterThan(0)
          expect(priceData!.timestamp).toBeLessThanOrEqual(Date.now() + 10000) // Allow some tolerance
        }
        
        // 4. Verify Map provides fast access (O(1) lookup)
        // Test that we can access any token directly without iteration
        if (tokenIds.length > 0) {
          const randomTokenId = tokenIds[Math.floor(Math.random() * tokenIds.length)]
          const directAccess = result.get(randomTokenId)
          expect(directAccess).toBeDefined()
          expect(directAccess!.tokenId).toBe(randomTokenId)
        }
        
        // 5. Verify Map contains only the requested tokens (no extra entries)
        const mapKeys = Array.from(result.keys())
        expect(mapKeys.sort()).toEqual(tokenIds.sort())
        
        return true
      }
    ), { numRuns: 100 })
  })

  test('empty token array returns empty Map', async () => {
    // Property: For empty input, getMultiplePrices should return an empty Map
    fc.assert(fc.asyncProperty(
      fc.constant([]), // Empty array
      async (tokenIds: string[]) => {
        const result = await opinionClient.getMultiplePrices(tokenIds)
        
        expect(result).toBeInstanceOf(Map)
        expect(result.size).toBe(0)
        
        return true
      }
    ), { numRuns: 10 })
  })

  test('single token returns single-entry Map', async () => {
    // Property: For single token input, getMultiplePrices should return a Map with one entry
    await fc.assert(fc.asyncProperty(
      fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
      async (tokenId: string) => {
        // Mock fetch for single token
        mockFetch.mockImplementation(async (url: string) => {
          // Extract token ID from URL and properly decode it
          const tokenIdMatch = url.match(/token_id=([^&]+)/)
          let extractedTokenId = tokenId
          if (tokenIdMatch) {
            // First replace + with spaces, then decode URI component
            const encodedTokenId = tokenIdMatch[1].replace(/\+/g, ' ')
            extractedTokenId = decodeURIComponent(encodedTokenId)
          }
          
          return {
            ok: true,
            json: async () => ({
              code: 0,
              result: {
                tokenId: extractedTokenId,
                price: '0.5',
                timestamp: Date.now()
              }
            })
          }
        })

        const result = await opinionClient.getMultiplePrices([tokenId])
        
        expect(result).toBeInstanceOf(Map)
        expect(result.size).toBe(1)
        expect(result.has(tokenId)).toBe(true)
        
        const priceData = result.get(tokenId)
        expect(priceData).toBeDefined()
        expect(priceData!.tokenId).toBe(tokenId)
        
        return true
      }
    ), { numRuns: 50 })
  })

  test('duplicate token IDs are handled correctly', async () => {
    // Property: For duplicate token IDs, getMultiplePrices should return unique entries
    await fc.assert(fc.asyncProperty(
      fc.array(
        fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
        { minLength: 1, maxLength: 10 }
      ),
      async (baseTokenIds: string[]) => {
        // Create array with duplicates
        const tokenIdsWithDuplicates = [...baseTokenIds, ...baseTokenIds.slice(0, Math.min(3, baseTokenIds.length))]
        const uniqueTokenIds = [...new Set(tokenIdsWithDuplicates)]
        
        // Mock fetch
        mockFetch.mockImplementation(async (url: string) => {
          // Extract token ID from URL and properly decode it
          const tokenIdMatch = url.match(/token_id=([^&]+)/)
          let tokenId = 'unknown'
          if (tokenIdMatch) {
            // First replace + with spaces, then decode URI component
            const encodedTokenId = tokenIdMatch[1].replace(/\+/g, ' ')
            tokenId = decodeURIComponent(encodedTokenId)
          }
          
          return {
            ok: true,
            json: async () => ({
              code: 0,
              result: {
                tokenId: tokenId,
                price: '0.5',
                timestamp: Date.now()
              }
            })
          }
        })

        const result = await opinionClient.getMultiplePrices(tokenIdsWithDuplicates)
        
        // Should contain only unique entries
        expect(result).toBeInstanceOf(Map)
        expect(result.size).toBe(uniqueTokenIds.length)
        
        // All unique tokens should be present
        for (const tokenId of uniqueTokenIds) {
          expect(result.has(tokenId)).toBe(true)
        }
        
        return true
      }
    ), { numRuns: 30 })
  })

  test('API error handling preserves Map structure', async () => {
    // Property: Even with API errors, getMultiplePrices should return a Map with fallback data
    await fc.assert(fc.asyncProperty(
      fc.array(
        fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
        { minLength: 1, maxLength: 5 }
      ).map(arr => [...new Set(arr)]),
      async (tokenIds: string[]) => {
        // Mock fetch to simulate API errors
        mockFetch.mockImplementation(async () => {
          throw new Error('API Error')
        })

        const result = await opinionClient.getMultiplePrices(tokenIds)
        
        // Should still return a Map with fallback data
        expect(result).toBeInstanceOf(Map)
        expect(result.size).toBe(tokenIds.length)
        
        // Each entry should have fallback PriceData structure
        for (const tokenId of tokenIds) {
          const priceData = result.get(tokenId)
          expect(priceData).toBeDefined()
          expect(priceData!.tokenId).toBe(tokenId)
          expect(priceData!.price).toBe('0') // Fallback price
          expect(typeof priceData!.timestamp).toBe('number')
        }
        
        return true
      }
    ), { numRuns: 20 })
  })
})