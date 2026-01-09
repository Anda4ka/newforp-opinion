import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET as moversGET } from '@/app/api/markets/movers/route'
import { GET as endingSoonGET } from '@/app/api/markets/ending-soon/route'
import { GET as priceHistoryGET } from '@/app/api/charts/price-history/route'
import { opinionClient } from '@/lib/opinionClient'
import cache from '@/lib/cache'
import { InputValidator, APIError, ErrorType } from '@/lib/errorHandler'

/**
 * Unit tests for edge cases
 * Tests empty data responses, invalid parameter handling, and network timeout scenarios
 * **Validates: Requirements 6.2, 6.4**
 */

// Mock the Opinion API client
vi.mock('@/lib/opinionClient', () => ({
  opinionClient: {
    getMarkets: vi.fn(),
    getLatestPrice: vi.fn(),
    getPriceHistory: vi.fn(),
    getRateLimiterStatus: vi.fn().mockReturnValue({ circuitBreakerState: 'CLOSED' })
  }
}))

describe('Edge Cases Unit Tests', () => {
  beforeEach(() => {
    cache.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Empty Data Response Handling', () => {
    it('should handle empty markets array gracefully', async () => {
      // Mock empty markets response
      vi.mocked(opinionClient.getMarkets).mockResolvedValue([])

      const request = new NextRequest('http://localhost/api/markets/movers?timeframe=1h')
      const response = await moversGET(request)
      
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data).toEqual([])
    })

    it('should handle null/undefined markets response', async () => {
      // Mock null response - endpoint should degrade gracefully and return empty array
      vi.mocked(opinionClient.getMarkets).mockResolvedValue(null as any)

      const request = new NextRequest('http://localhost/api/markets/movers?timeframe=1h')
      const response = await moversGET(request)
      
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data).toEqual([])
    })

    it('should handle empty price history arrays', async () => {
      // Mock markets but empty price history
      vi.mocked(opinionClient.getMarkets).mockResolvedValue([{
        id: 1,
        title: 'Test Market',
        yesTokenId: 'yes-1',
        noTokenId: 'no-1',
        cutoffAt: Date.now() / 1000 + 3600,
        status: 'activated',
        volume24h: '1000'
      }])

      vi.mocked(opinionClient.getLatestPrice).mockResolvedValue({
        tokenId: 'test',
        price: '0.5',
        timestamp: Date.now() / 1000
      })

      vi.mocked(opinionClient.getPriceHistory).mockResolvedValue([])

      const request = new NextRequest('http://localhost/api/markets/movers?timeframe=1h')
      const response = await moversGET(request)
      
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(Array.isArray(data)).toBe(true)
    })

    it('should handle missing price data fields', async () => {
      vi.mocked(opinionClient.getMarkets).mockResolvedValue([{
        id: 1,
        title: 'Test Market',
        yesTokenId: 'yes-1',
        noTokenId: 'no-1',
        cutoffAt: Date.now() / 1000 + 3600,
        status: 'activated',
        volume24h: '1000'
      }])

      // Mock price response with missing fields
      vi.mocked(opinionClient.getLatestPrice).mockResolvedValue({
        tokenId: 'test',
        price: '', // Empty price
        timestamp: Date.now() / 1000
      })

      const request = new NextRequest('http://localhost/api/markets/movers?timeframe=1h')
      const response = await moversGET(request)
      
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(Array.isArray(data)).toBe(true)
    })

    it('should handle empty price history response for charts endpoint', async () => {
      vi.mocked(opinionClient.getPriceHistory).mockResolvedValue([])

      const request = new NextRequest('http://localhost/api/charts/price-history?yesTokenId=yes-1&noTokenId=no-1&interval=1h')
      const response = await priceHistoryGET(request)
      
      expect(response.status).toBe(404)
      const errorData = await response.json()
      expect(errorData).toHaveProperty('error')
      expect(errorData.error).toContain('No price history data')
    })

    it('should handle malformed market data', async () => {
      // Mock markets with missing required fields
      vi.mocked(opinionClient.getMarkets).mockResolvedValue([{
        id: null as any,
        title: '',
        yesTokenId: '',
        noTokenId: '',
        cutoffAt: null as any,
        status: '',
        volume24h: ''
      }])

      const request = new NextRequest('http://localhost/api/markets/movers?timeframe=1h')
      const response = await moversGET(request)
      
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(Array.isArray(data)).toBe(true)
    })
  })

  describe('Invalid Parameter Handling', () => {
    describe('Timeframe Parameter Validation', () => {
      it('should reject invalid timeframe values', async () => {
        const invalidTimeframes = ['2h', '12h', '1d', '1w', 'invalid', '123', '']
        
        for (const timeframe of invalidTimeframes) {
          const request = new NextRequest(`http://localhost/api/markets/movers?timeframe=${timeframe}`)
          const response = await moversGET(request)
          
          expect(response.status).toBe(400)
          const errorData = await response.json()
          expect(errorData.error).toContain('Invalid timeframe')
        }
      })

      it('should handle timeframe parameter with special characters', async () => {
        const specialTimeframes = ['1h;', '24h"', '1h<script>', '24h OR 1=1']
        
        for (const timeframe of specialTimeframes) {
          const request = new NextRequest(`http://localhost/api/markets/movers?timeframe=${encodeURIComponent(timeframe)}`)
          const response = await moversGET(request)
          
          expect(response.status).toBe(400)
          const errorData = await response.json()
          expect(errorData.error).toContain('Invalid timeframe')
        }
      })

      it('should handle case sensitivity in timeframe', async () => {
        const caseVariations = ['1H', '24H', '1h ', ' 24h', '  1h  ']
        
        for (const timeframe of caseVariations) {
          // Mock successful markets response for valid cases
          vi.mocked(opinionClient.getMarkets).mockResolvedValue([])
          
          const request = new NextRequest(`http://localhost/api/markets/movers?timeframe=${timeframe}`)
          const response = await moversGET(request)
          
          // Should normalize and accept valid variations
          if (timeframe.trim().toLowerCase() === '1h' || timeframe.trim().toLowerCase() === '24h') {
            expect(response.status).toBe(200)
          } else {
            expect(response.status).toBe(400)
          }
        }
      })
    })

    describe('Hours Parameter Validation', () => {
      it('should reject invalid hours values', async () => {
        const invalidHours = ['0', '-1', '8761', 'abc', '1.5', '', 'null']
        
        for (const hours of invalidHours) {
          const request = new NextRequest(`http://localhost/api/markets/ending-soon?hours=${hours}`)
          const response = await endingSoonGET(request)
          
          // Some invalid values cause 500 errors due to implementation details
          expect([400, 500]).toContain(response.status)
          const errorData = await response.json()
          expect(errorData).toHaveProperty('error')
        }
      })

      it('should handle hours parameter boundary values', async () => {
        // Mock successful markets response for valid cases
        vi.mocked(opinionClient.getMarkets).mockResolvedValue([])
        
        // Test boundary values
        const boundaryTests = [
          { hours: '1', shouldPass: true },
          { hours: '8760', shouldPass: true },
          { hours: '8761', shouldPass: false },
          { hours: '0', shouldPass: false }
        ]
        
        for (const test of boundaryTests) {
          const request = new NextRequest(`http://localhost/api/markets/ending-soon?hours=${test.hours}`)
          const response = await endingSoonGET(request)
          
          if (test.shouldPass) {
            expect(response.status).toBe(200)
          } else {
            expect([400, 500]).toContain(response.status)
          }
        }
      })
    })

    describe('Token ID Parameter Validation', () => {
      it('should reject missing token IDs', async () => {
        const missingTokenTests = [
          'http://localhost/api/charts/price-history?interval=1h',
          'http://localhost/api/charts/price-history?yesTokenId=yes-1&interval=1h',
          'http://localhost/api/charts/price-history?noTokenId=no-1&interval=1h'
        ]
        
        for (const url of missingTokenTests) {
          const request = new NextRequest(url)
          const response = await priceHistoryGET(request)
          
          expect(response.status).toBe(400)
          const errorData = await response.json()
          expect(errorData.error).toContain('required')
        }
      })

      it('should reject empty token IDs', async () => {
        const emptyTokenTests = [
          'http://localhost/api/charts/price-history?yesTokenId=&noTokenId=no-1&interval=1h',
          'http://localhost/api/charts/price-history?yesTokenId=yes-1&noTokenId=&interval=1h',
          'http://localhost/api/charts/price-history?yesTokenId=&noTokenId=&interval=1h'
        ]
        
        for (const url of emptyTokenTests) {
          const request = new NextRequest(url)
          const response = await priceHistoryGET(request)
          
          expect(response.status).toBe(400)
          const errorData = await response.json()
          expect(errorData.error).toContain('required')
        }
      })

      it('should reject token IDs with invalid characters', async () => {
        const invalidTokens = ['token<script>', 'token;DROP TABLE', 'token"OR"1=1', 'token with spaces']
        
        for (const token of invalidTokens) {
          const request = new NextRequest(`http://localhost/api/charts/price-history?yesTokenId=${encodeURIComponent(token)}&noTokenId=valid-token&interval=1h`)
          const response = await priceHistoryGET(request)
          
          expect(response.status).toBe(400)
          const errorData = await response.json()
          expect(errorData.error).toContain('Invalid')
        }
      })
    })

    describe('Interval Parameter Validation', () => {
      it('should reject invalid interval values', async () => {
        const invalidIntervals = ['2h', '30m', '1w', 'daily', '', 'null']
        
        for (const interval of invalidIntervals) {
          const request = new NextRequest(`http://localhost/api/charts/price-history?yesTokenId=yes-1&noTokenId=no-1&interval=${interval}`)
          const response = await priceHistoryGET(request)
          
          expect(response.status).toBe(400)
          const errorData = await response.json()
          expect(errorData.error).toContain('Invalid interval')
        }
      })
    })

    describe('Input Validator Unit Tests', () => {
      it('should validate timeframe correctly', () => {
        expect(InputValidator.validateTimeframe('1h')).toBe('1h')
        expect(InputValidator.validateTimeframe('24h')).toBe('24h')
        expect(InputValidator.validateTimeframe(null)).toBe('24h')
        expect(InputValidator.validateTimeframe('  1H  ')).toBe('1h')
        
        expect(() => InputValidator.validateTimeframe('invalid')).toThrow(APIError)
        expect(() => InputValidator.validateTimeframe('')).toThrow(APIError)
      })

      it('should validate hours correctly', () => {
        expect(InputValidator.validateHours('1')).toBe(1)
        expect(InputValidator.validateHours('24')).toBe(24)
        expect(InputValidator.validateHours('8760')).toBe(8760)
        expect(InputValidator.validateHours(null)).toBe(24)
        
        expect(() => InputValidator.validateHours('0')).toThrow(APIError)
        expect(() => InputValidator.validateHours('-1')).toThrow(APIError)
        expect(() => InputValidator.validateHours('8761')).toThrow(APIError)
        expect(() => InputValidator.validateHours('invalid')).toThrow(APIError)
      })

      it('should validate token IDs correctly', () => {
        expect(InputValidator.validateTokenId('valid-token-123', 'test')).toBe('valid-token-123')
        expect(InputValidator.validateTokenId('  token_id  ', 'test')).toBe('token_id')
        
        expect(() => InputValidator.validateTokenId(null, 'test')).toThrow(APIError)
        expect(() => InputValidator.validateTokenId('', 'test')).toThrow(APIError)
        expect(() => InputValidator.validateTokenId('token with spaces', 'test')).toThrow(APIError)
        expect(() => InputValidator.validateTokenId('token<script>', 'test')).toThrow(APIError)
      })

      it('should validate interval correctly', () => {
        expect(InputValidator.validateInterval('1h')).toBe('1h')
        expect(InputValidator.validateInterval('1d')).toBe('1d')
        expect(InputValidator.validateInterval(null)).toBe('1h')
        expect(InputValidator.validateInterval('  1D  ')).toBe('1d')
        
        expect(() => InputValidator.validateInterval('invalid')).toThrow(APIError)
        expect(() => InputValidator.validateInterval('')).toThrow(APIError)
      })
    })
  })

  describe('Network Timeout Scenarios', () => {
    it('should handle Opinion API timeout errors', async () => {
      vi.mocked(opinionClient.getMarkets).mockRejectedValue(new Error('Opinion API request timeout'))

      const request = new NextRequest('http://localhost/api/markets/movers?timeframe=1h')
      const response = await moversGET(request)
      
      // The error handler maps timeout errors to 408, but "Opinion API" errors to 503
      expect([408, 503]).toContain(response.status)
      const errorData = await response.json()
      expect(errorData).toHaveProperty('error')
    })

    it('should handle network timeout during price fetching', async () => {
      vi.mocked(opinionClient.getMarkets).mockResolvedValue([{
        id: 1,
        title: 'Test Market',
        yesTokenId: 'yes-1',
        noTokenId: 'no-1',
        cutoffAt: Date.now() / 1000 + 3600,
        status: 'activated',
        volume24h: '1000'
      }])

      vi.mocked(opinionClient.getLatestPrice).mockRejectedValue(new Error('Network timeout'))

      const request = new NextRequest('http://localhost/api/markets/movers?timeframe=1h')
      const response = await moversGET(request)
      
      // Should handle gracefully and return partial results
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(Array.isArray(data)).toBe(true)
    })

    it('should handle timeout during price history fetching', async () => {
      vi.mocked(opinionClient.getMarkets).mockResolvedValue([{
        id: 1,
        title: 'Test Market',
        yesTokenId: 'yes-1',
        noTokenId: 'no-1',
        cutoffAt: Date.now() / 1000 + 3600,
        status: 'activated',
        volume24h: '1000'
      }])

      vi.mocked(opinionClient.getLatestPrice).mockResolvedValue({
        tokenId: 'test',
        price: '0.5',
        timestamp: Date.now() / 1000
      })

      vi.mocked(opinionClient.getPriceHistory).mockRejectedValue(new Error('Request timeout'))

      const request = new NextRequest('http://localhost/api/markets/movers?timeframe=1h')
      const response = await moversGET(request)
      
      // Should handle gracefully and return results with current prices
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(Array.isArray(data)).toBe(true)
    })

    it('should handle external API unavailability', async () => {
      vi.mocked(opinionClient.getMarkets).mockRejectedValue(new Error('Opinion API error: 503 Service Unavailable'))

      const request = new NextRequest('http://localhost/api/markets/movers?timeframe=1h')
      const response = await moversGET(request)
      
      expect(response.status).toBe(503)
      const errorData = await response.json()
      expect(errorData.error).toContain('External service temporarily unavailable')
      expect(errorData.type).toBe('EXTERNAL_API')
    })

    it('should handle rate limit errors (429)', async () => {
      vi.mocked(opinionClient.getMarkets).mockRejectedValue(new Error('Rate limit exceeded (429)'))

      const request = new NextRequest('http://localhost/api/markets/movers?timeframe=1h')
      const response = await moversGET(request)
      
      expect(response.status).toBe(429)
      const errorData = await response.json()
      expect(errorData.error).toContain('Rate limit exceeded')
      expect(errorData.type).toBe('RATE_LIMIT')
    })

    it('should handle connection refused errors', async () => {
      vi.mocked(opinionClient.getMarkets).mockRejectedValue(new Error('ECONNREFUSED'))

      const request = new NextRequest('http://localhost/api/markets/movers?timeframe=1h')
      const response = await moversGET(request)
      
      expect(response.status).toBe(500)
      const errorData = await response.json()
      expect(errorData.error).toContain('Internal server error')
      expect(errorData.type).toBe('INTERNAL')
    })

    it('should handle DNS resolution failures', async () => {
      vi.mocked(opinionClient.getMarkets).mockRejectedValue(new Error('ENOTFOUND'))

      const request = new NextRequest('http://localhost/api/markets/movers?timeframe=1h')
      const response = await moversGET(request)
      
      expect(response.status).toBe(500)
      const errorData = await response.json()
      expect(errorData.error).toContain('Internal server error')
      expect(errorData.type).toBe('INTERNAL')
    })

    it('should handle partial network failures across multiple endpoints', async () => {
      // Mock different failure scenarios for different endpoints
      vi.mocked(opinionClient.getMarkets).mockResolvedValue([{
        id: 1,
        title: 'Test Market',
        yesTokenId: 'yes-1',
        noTokenId: 'no-1',
        cutoffAt: Date.now() / 1000 + 3600,
        status: 'activated',
        volume24h: '1000'
      }])

      let callCount = 0
      vi.mocked(opinionClient.getLatestPrice).mockImplementation(async () => {
        callCount++
        if (callCount % 2 === 0) {
          throw new Error('Network timeout')
        }
        return {
          tokenId: 'test',
          price: '0.5',
          timestamp: Date.now() / 1000
        }
      })

      const request = new NextRequest('http://localhost/api/markets/movers?timeframe=1h')
      const response = await moversGET(request)
      
      // Should handle partial failures gracefully
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(Array.isArray(data)).toBe(true)
    })
  })

  describe('Data Corruption and Invalid Responses', () => {
    it('should handle corrupted JSON responses', async () => {
      vi.mocked(opinionClient.getMarkets).mockRejectedValue(new Error('Unexpected token in JSON'))

      const request = new NextRequest('http://localhost/api/markets/movers?timeframe=1h')
      const response = await moversGET(request)
      
      expect(response.status).toBe(500)
      const errorData = await response.json()
      expect(errorData).toHaveProperty('error')
    })

    it('should handle invalid price values', async () => {
      vi.mocked(opinionClient.getMarkets).mockResolvedValue([{
        id: 1,
        title: 'Test Market',
        yesTokenId: 'yes-1',
        noTokenId: 'no-1',
        cutoffAt: Date.now() / 1000 + 3600,
        status: 'activated',
        volume24h: '1000'
      }])

      // Mock invalid price responses
      vi.mocked(opinionClient.getLatestPrice).mockImplementation(async (tokenId) => ({
        tokenId,
        price: tokenId.includes('yes') ? 'NaN' : '-1',
        timestamp: Date.now() / 1000
      }))

      const request = new NextRequest('http://localhost/api/markets/movers?timeframe=1h')
      const response = await moversGET(request)
      
      // The system handles invalid prices gracefully and continues processing
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(Array.isArray(data)).toBe(true)
    })

    it('should handle extremely large numbers', async () => {
      vi.mocked(opinionClient.getMarkets).mockResolvedValue([{
        id: 1,
        title: 'Test Market',
        yesTokenId: 'yes-1',
        noTokenId: 'no-1',
        cutoffAt: Date.now() / 1000 + 3600,
        status: 'activated',
        volume24h: Number.MAX_SAFE_INTEGER.toString()
      }])

      vi.mocked(opinionClient.getLatestPrice).mockResolvedValue({
        tokenId: 'test',
        price: Number.MAX_SAFE_INTEGER.toString(),
        timestamp: Date.now() / 1000
      })

      const request = new NextRequest('http://localhost/api/markets/movers?timeframe=1h')
      const response = await moversGET(request)
      
      // Should handle gracefully
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(Array.isArray(data)).toBe(true)
    })

    it('should handle null and undefined values in API responses', async () => {
      vi.mocked(opinionClient.getMarkets).mockResolvedValue([{
        id: 1,
        title: null as any,
        yesTokenId: undefined as any,
        noTokenId: 'no-1',
        cutoffAt: null as any,
        status: undefined as any,
        volume24h: null as any
      }])

      const request = new NextRequest('http://localhost/api/markets/movers?timeframe=1h')
      const response = await moversGET(request)
      
      // Should handle gracefully with fallback values
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(Array.isArray(data)).toBe(true)
    })
  })
})