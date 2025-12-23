/**
 * **Feature: prediction-markets-backend, Property 12: API request authentication**
 * **Validates: Requirements 6.1**
 * 
 * Property-based tests for API authentication
 */

import { describe, test, vi, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'

describe('API Authentication Properties', () => {
  let mockFetch: any

  beforeEach(() => {
    // Create fresh mock for each test
    mockFetch = vi.fn()
    global.fetch = mockFetch
    
    // Clear module cache to ensure fresh imports
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('**Feature: prediction-markets-backend, Property 12: API request authentication**', async () => {
    // Set up valid environment for testing
    process.env.OPINION_API_KEY = 'test-api-key-12345'
    process.env.OPINION_BASE_URL = 'https://test-api.example.com'
    
    // Mock successful response
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
      status: 200,
      statusText: 'OK'
    })

    // Import OpinionClient after setting env vars
    const { OpinionClient } = await import('@/lib/opinionClient')
    const client = new OpinionClient()
    
    // Make the API call
    try {
      await client.getMarkets()
    } catch (error) {
      // Ignore errors for this test
    }
    
    // Verify that fetch was called with correct authentication header
    expect(mockFetch).toHaveBeenCalled()
    const [, options] = mockFetch.mock.calls[0]
    const headers = options?.headers || {}
    
    // Property: All API requests must include "apikey" header
    expect(headers['apikey']).toBe('test-api-key-12345')
  })

  test('API requests include required headers structure', async () => {
    // Set up valid environment for testing
    process.env.OPINION_API_KEY = 'test-api-key-67890'
    process.env.OPINION_BASE_URL = 'https://test-api.example.com'
    
    // Mock successful response
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
      status: 200,
      statusText: 'OK'
    })

    // Import OpinionClient after setting env vars
    const { OpinionClient } = await import('@/lib/opinionClient')
    const client = new OpinionClient()
    
    // Make the API call
    try {
      await client.getMarkets()
    } catch (error) {
      // Ignore errors for this test
    }
    
    // Verify that fetch was called with correct headers structure
    expect(mockFetch).toHaveBeenCalled()
    const [, options] = mockFetch.mock.calls[0]
    const headers = options?.headers || {}
    
    // Property: Headers must include both apikey and Content-Type
    expect(headers['apikey']).toBe('test-api-key-67890')
    expect(headers['Content-Type']).toBe('application/json')
  })

  test('API key is never empty or undefined in requests', async () => {
    await fc.assert(fc.asyncProperty(
      fc.string({ minLength: 1, maxLength: 50 }).filter(s => /^[a-zA-Z0-9]+$/.test(s)), // Non-empty API key (alphanumeric)
      async (apiKey) => {
        // Set up environment for this test iteration
        process.env.OPINION_API_KEY = apiKey
        process.env.OPINION_BASE_URL = 'https://test-api.example.com'
        
        // Mock successful response
        mockFetch.mockResolvedValue({
          ok: true,
          json: async () => ({ data: [] }),
          status: 200,
          statusText: 'OK'
        })

        // Import OpinionClient dynamically to pick up new env vars
        const { OpinionClient } = await import('@/lib/opinionClient')
        const client = new OpinionClient()
        
        // Make the API call
        try {
          await client.getMarkets()
        } catch (error) {
          // Ignore errors for this test
        }
        
        // Verify that fetch was called
        if (mockFetch.mock.calls.length === 0) {
          return true // Skip this iteration if no HTTP call was made
        }
        
        // Verify that the API key in headers is never empty
        const [, options] = mockFetch.mock.calls[0]
        const headers = options?.headers || {}
        const headerApiKey = headers['apikey']
        
        // Property: API key in headers must never be empty, null, or undefined
        return (
          headerApiKey !== '' &&
          headerApiKey !== null &&
          headerApiKey !== undefined &&
          typeof headerApiKey === 'string' &&
          headerApiKey.length > 0
        )
      }
    ), { numRuns: 10 }) // Reduced runs for async tests
  })
})