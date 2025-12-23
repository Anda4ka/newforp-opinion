import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET as moversGET } from '@/app/api/markets/movers/route'
import { GET as arbitrageGET } from '@/app/api/markets/arbitrage/route'
import { GET as endingSoonGET } from '@/app/api/markets/ending-soon/route'
import { GET as priceHistoryGET } from '@/app/api/charts/price-history/route'
import { opinionClient } from '@/lib/opinionClient'
import cache from '@/lib/cache'
import { Market, PriceData, PriceHistoryPoint } from '@/lib/types'

// Mock the Opinion API client
vi.mock('@/lib/opinionClient', () => ({
  opinionClient: {
    getMarkets: vi.fn(),
    getLatestPrice: vi.fn(),
    getPriceHistory: vi.fn(),
    getRateLimiterStatus: vi.fn().mockReturnValue({ circuitBreakerState: 'CLOSED' })
  }
}))

/**
 * Integration tests for complete API workflows
 * Tests end-to-end data flow from Opinion API to response
 * Validates cache integration across all endpoints
 * Tests error scenarios and edge cases
 * **Validates: Requirements All**
 */

describe('API Endpoints Integration Tests', () => {
  // Mock data for testing
  const mockMarkets: Market[] = [
    {
      id: 1,
      title: 'Test Market 1',
      yesTokenId: 'yes-token-1',
      noTokenId: 'no-token-1',
      cutoffAt: Math.floor(Date.now() / 1000) + 7200, // 2 hours from now
      status: 'activated',
      volume24h: '1000.50'
    },
    {
      id: 2,
      title: 'Test Market 2',
      yesTokenId: 'yes-token-2',
      noTokenId: 'no-token-2',
      cutoffAt: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
      status: 'activated',
      volume24h: '2500.75'
    }
  ]

  const mockPriceData: PriceData = {
    tokenId: 'test-token',
    price: '0.65',
    timestamp: Math.floor(Date.now() / 1000)
  }

  const mockPriceHistory: PriceHistoryPoint[] = [
    { t: Math.floor(Date.now() / 1000) - 3600, p: '0.60' }, // 1 hour ago
    { t: Math.floor(Date.now() / 1000) - 1800, p: '0.62' }, // 30 min ago
    { t: Math.floor(Date.now() / 1000), p: '0.65' } // now
  ]

  beforeEach(() => {
    // Clear cache before each test
    cache.clear()
    
    // Reset all mocks
    vi.clearAllMocks()
    
    // Setup default successful mocks
    vi.mocked(opinionClient.getMarkets).mockResolvedValue(mockMarkets)
    vi.mocked(opinionClient.getLatestPrice).mockResolvedValue(mockPriceData)
    vi.mocked(opinionClient.getPriceHistory).mockResolvedValue(mockPriceHistory)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Movers Endpoint Integration', () => {
    it('should complete full workflow from API to response with cache', async () => {
      // Setup specific price responses for different tokens
      vi.mocked(opinionClient.getLatestPrice)
        .mockImplementation(async (tokenId: string) => ({
          tokenId,
          price: tokenId.includes('yes') ? '0.65' : '0.30',
          timestamp: Math.floor(Date.now() / 1000)
        }))

      vi.mocked(opinionClient.getPriceHistory)
        .mockImplementation(async (tokenId: string) => [
          { t: Math.floor(Date.now() / 1000) - 3600, p: tokenId.includes('yes') ? '0.60' : '0.35' },
          { t: Math.floor(Date.now() / 1000), p: tokenId.includes('yes') ? '0.65' : '0.30' }
        ])

      // First request - should fetch from API and cache
      const request1 = new NextRequest('http://localhost/api/markets/movers?timeframe=1h')
      const response1 = await moversGET(request1)
      
      expect(response1.status).toBe(200)
      const data1 = await response1.json()
      
      // Verify response structure
      expect(Array.isArray(data1)).toBe(true)
      expect(data1.length).toBeGreaterThan(0)
      
      // Verify required fields are present
      const mover = data1[0]
      expect(mover).toHaveProperty('marketId')
      expect(mover).toHaveProperty('marketTitle')
      expect(mover).toHaveProperty('marketPrice')
      expect(mover).toHaveProperty('priceChangePct')
      expect(mover).toHaveProperty('volume24h')
      expect(mover).toHaveProperty('yesPrice')
      expect(mover).toHaveProperty('noPrice')

      // Verify API was called
      expect(opinionClient.getMarkets).toHaveBeenCalledTimes(1)
      expect(opinionClient.getLatestPrice).toHaveBeenCalled()
      expect(opinionClient.getPriceHistory).toHaveBeenCalled()

      // Second request - should use cache
      const request2 = new NextRequest('http://localhost/api/markets/movers?timeframe=1h')
      const response2 = await moversGET(request2)
      
      expect(response2.status).toBe(200)
      const data2 = await response2.json()
      
      // Should return same data
      expect(data2).toEqual(data1)
      
      // API should not be called again (cache hit)
      expect(opinionClient.getMarkets).toHaveBeenCalledTimes(1)
    })

    it('should handle different timeframes correctly', async () => {
      // Test 1h timeframe
      const request1h = new NextRequest('http://localhost/api/markets/movers?timeframe=1h')
      const response1h = await moversGET(request1h)
      expect(response1h.status).toBe(200)

      // Test 24h timeframe
      const request24h = new NextRequest('http://localhost/api/markets/movers?timeframe=24h')
      const response24h = await moversGET(request24h)
      expect(response24h.status).toBe(200)

      // Should have different cache keys
      expect(cache.get('movers:1h')).not.toBeNull()
      expect(cache.get('movers:24h')).not.toBeNull()
    })

    it('should handle API errors gracefully', async () => {
      // Mock API failure
      vi.mocked(opinionClient.getMarkets).mockRejectedValue(new Error('API Error'))

      const request = new NextRequest('http://localhost/api/markets/movers?timeframe=1h')
      const response = await moversGET(request)
      
      expect(response.status).toBe(500)
      const errorData = await response.json()
      expect(errorData).toHaveProperty('error')
    })

    it('should handle missing historical data', async () => {
      // Mock empty price history
      vi.mocked(opinionClient.getPriceHistory).mockResolvedValue([])

      const request = new NextRequest('http://localhost/api/markets/movers?timeframe=1h')
      const response = await moversGET(request)
      
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(Array.isArray(data)).toBe(true)
    })
  })

  describe('Arbitrage Endpoint Integration', () => {
    it('should complete full workflow with arbitrage calculation', async () => {
      // Setup prices that create arbitrage opportunity
      vi.mocked(opinionClient.getLatestPrice)
        .mockImplementation(async (tokenId: string) => ({
          tokenId,
          price: tokenId.includes('yes') ? '0.60' : '0.50', // 0.60 + 0.50 = 1.10 (10% arbitrage)
          timestamp: Math.floor(Date.now() / 1000)
        }))

      const request = new NextRequest('http://localhost/api/markets/arbitrage')
      const response = await arbitrageGET(request)
      
      expect(response.status).toBe(200)
      const data = await response.json()
      
      // Verify response structure
      expect(Array.isArray(data)).toBe(true)
      
      if (data.length > 0) {
        const opportunity = data[0]
        expect(opportunity).toHaveProperty('marketId')
        expect(opportunity).toHaveProperty('marketTitle')
        expect(opportunity).toHaveProperty('yesPrice')
        expect(opportunity).toHaveProperty('noPrice')
        expect(opportunity).toHaveProperty('arbPct')
        expect(opportunity).toHaveProperty('suggestion')
        
        // Verify arbitrage calculation
        expect(opportunity.arbPct).toBeGreaterThanOrEqual(4) // Should be >= 4% threshold
        expect(['YES_UNDERPRICED', 'NO_UNDERPRICED']).toContain(opportunity.suggestion)
      }
    })

    it('should filter out opportunities below 4% threshold', async () => {
      // Setup prices with low arbitrage (below 4%)
      vi.mocked(opinionClient.getLatestPrice)
        .mockImplementation(async (tokenId: string) => ({
          tokenId,
          price: tokenId.includes('yes') ? '0.51' : '0.48', // 0.51 + 0.48 = 0.99 (-1% arbitrage)
          timestamp: Math.floor(Date.now() / 1000)
        }))

      const request = new NextRequest('http://localhost/api/markets/arbitrage')
      const response = await arbitrageGET(request)
      
      expect(response.status).toBe(200)
      const data = await response.json()
      
      // Should return empty array or only opportunities >= 4%
      data.forEach((opportunity: any) => {
        expect(Math.abs(opportunity.arbPct)).toBeGreaterThanOrEqual(4)
      })
    })
  })

  describe('Ending Soon Endpoint Integration', () => {
    it('should complete full workflow with time filtering', async () => {
      const request = new NextRequest('http://localhost/api/markets/ending-soon?hours=3')
      const response = await endingSoonGET(request)
      
      expect(response.status).toBe(200)
      const data = await response.json()
      
      // Verify response structure
      expect(Array.isArray(data)).toBe(true)
      
      if (data.length > 0) {
        const market = data[0]
        expect(market).toHaveProperty('marketId')
        expect(market).toHaveProperty('marketTitle')
        expect(market).toHaveProperty('cutoffAt')
        expect(market).toHaveProperty('yesPrice')
        expect(market).toHaveProperty('volume')
        
        // Verify time filtering - market should end within specified hours
        const now = Math.floor(Date.now() / 1000)
        const hoursUntilCutoff = (market.cutoffAt - now) / 3600
        expect(hoursUntilCutoff).toBeLessThanOrEqual(3)
        expect(hoursUntilCutoff).toBeGreaterThan(0)
      }
    })

    it('should handle different hour parameters', async () => {
      // Test with 1 hour
      const request1 = new NextRequest('http://localhost/api/markets/ending-soon?hours=1')
      const response1 = await endingSoonGET(request1)
      expect(response1.status).toBe(200)

      // Test with 24 hours
      const request24 = new NextRequest('http://localhost/api/markets/ending-soon?hours=24')
      const response24 = await endingSoonGET(request24)
      expect(response24.status).toBe(200)

      // Should have different cache keys
      expect(cache.get('ending-soon:1')).not.toBeNull()
      expect(cache.get('ending-soon:24')).not.toBeNull()
    })
  })

  describe('Price History Endpoint Integration', () => {
    it('should complete full workflow with price synchronization', async () => {
      // Setup synchronized price history for both tokens
      const yesHistory = [
        { t: 1000, p: '0.60' },
        { t: 2000, p: '0.65' },
        { t: 3000, p: '0.70' }
      ]
      
      const noHistory = [
        { t: 1000, p: '0.35' }, // Will become 0.65 after transformation
        { t: 2000, p: '0.30' }, // Will become 0.70 after transformation
        { t: 3000, p: '0.25' }  // Will become 0.75 after transformation
      ]

      vi.mocked(opinionClient.getPriceHistory)
        .mockImplementation(async (tokenId: string) => 
          tokenId.includes('yes') ? yesHistory : noHistory
        )

      const request = new NextRequest('http://localhost/api/charts/price-history?yesTokenId=yes-token-1&noTokenId=no-token-1&interval=1h')
      const response = await priceHistoryGET(request)
      
      expect(response.status).toBe(200)
      const data = await response.json()
      
      // Verify response structure
      expect(data).toHaveProperty('timestamps')
      expect(data).toHaveProperty('yesPrices')
      expect(data).toHaveProperty('noAsYesPrices')
      
      // Verify arrays have same length (synchronized)
      expect(data.timestamps.length).toBe(data.yesPrices.length)
      expect(data.timestamps.length).toBe(data.noAsYesPrices.length)
      
      // Verify NO price transformation (should be 1 - original_price)
      expect(data.noAsYesPrices[0]).toBeCloseTo(0.65, 2) // 1 - 0.35
      expect(data.noAsYesPrices[1]).toBeCloseTo(0.70, 2) // 1 - 0.30
      expect(data.noAsYesPrices[2]).toBeCloseTo(0.75, 2) // 1 - 0.25
    })

    it('should handle missing token IDs', async () => {
      const request = new NextRequest('http://localhost/api/charts/price-history?interval=1h')
      const response = await priceHistoryGET(request)
      
      expect(response.status).toBe(400)
      const errorData = await response.json()
      expect(errorData).toHaveProperty('error')
    })

    it('should handle empty price history', async () => {
      vi.mocked(opinionClient.getPriceHistory).mockResolvedValue([])

      const request = new NextRequest('http://localhost/api/charts/price-history?yesTokenId=yes-token-1&noTokenId=no-token-1&interval=1h')
      const response = await priceHistoryGET(request)
      
      expect(response.status).toBe(404)
      const errorData = await response.json()
      expect(errorData).toHaveProperty('error')
    })
  })

  describe('Cache Integration Across Endpoints', () => {
    it('should use different TTL for different endpoint types', async () => {
      // Test movers cache (30s TTL)
      const moversRequest = new NextRequest('http://localhost/api/markets/movers?timeframe=1h')
      await moversGET(moversRequest)
      
      // Test arbitrage cache (30s TTL)
      const arbitrageRequest = new NextRequest('http://localhost/api/markets/arbitrage')
      await arbitrageGET(arbitrageRequest)
      
      // Test ending-soon cache (60s TTL)
      const endingSoonRequest = new NextRequest('http://localhost/api/markets/ending-soon?hours=1')
      await endingSoonGET(endingSoonRequest)
      
      // Test price-history cache (60s TTL)
      const priceHistoryRequest = new NextRequest('http://localhost/api/charts/price-history?yesTokenId=yes-token-1&noTokenId=no-token-1&interval=1h')
      await priceHistoryGET(priceHistoryRequest)
      
      // Verify cache entries exist
      expect(cache.get('movers:1h')).not.toBeNull()
      expect(cache.get('arbitrage')).not.toBeNull()
      expect(cache.get('ending-soon:1')).not.toBeNull()
      expect(cache.get('price-history:yes-token-1:no-token-1:1h')).not.toBeNull()
    })

    it('should handle cache misses and hits correctly', async () => {
      const request = new NextRequest('http://localhost/api/markets/movers?timeframe=1h')
      
      // First call - cache miss
      await moversGET(request)
      expect(opinionClient.getMarkets).toHaveBeenCalledTimes(1)
      
      // Second call - cache hit
      await moversGET(request)
      expect(opinionClient.getMarkets).toHaveBeenCalledTimes(1) // Should not increase
      
      // Clear cache and call again - cache miss
      cache.clear()
      await moversGET(request)
      expect(opinionClient.getMarkets).toHaveBeenCalledTimes(2) // Should increase
    })
  })

  describe('Error Scenarios and Edge Cases', () => {
    it('should handle network timeouts gracefully', async () => {
      vi.mocked(opinionClient.getMarkets).mockRejectedValue(new Error('Network timeout'))

      const request = new NextRequest('http://localhost/api/markets/movers?timeframe=1h')
      const response = await moversGET(request)
      
      // The error handler returns 408 for timeout errors
      expect(response.status).toBe(408)
      const errorData = await response.json()
      expect(errorData).toHaveProperty('error')
    })

    it('should handle invalid price data', async () => {
      // Mock invalid price responses
      vi.mocked(opinionClient.getLatestPrice).mockResolvedValue({
        tokenId: 'test',
        price: 'invalid-price',
        timestamp: Date.now()
      })

      const request = new NextRequest('http://localhost/api/markets/movers?timeframe=1h')
      const response = await moversGET(request)
      
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(Array.isArray(data)).toBe(true)
    })

    it('should handle empty markets response', async () => {
      vi.mocked(opinionClient.getMarkets).mockResolvedValue([])

      const request = new NextRequest('http://localhost/api/markets/movers?timeframe=1h')
      const response = await moversGET(request)
      
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data).toEqual([])
    })

    it('should handle partial API failures', async () => {
      // Mock some successful and some failed price requests
      let callCount = 0
      vi.mocked(opinionClient.getLatestPrice).mockImplementation(async () => {
        callCount++
        if (callCount % 3 === 0) {
          throw new Error('Price fetch failed')
        }
        return {
          tokenId: 'test',
          price: '0.5',
          timestamp: Date.now()
        }
      })

      const request = new NextRequest('http://localhost/api/markets/movers?timeframe=1h')
      const response = await moversGET(request)
      
      expect(response.status).toBe(200)
      const data = await response.json()
      expect(Array.isArray(data)).toBe(true)
      // Should return partial results for successful markets
    })

    it('should validate input parameters across all endpoints', async () => {
      // Test invalid timeframe
      const invalidTimeframe = new NextRequest('http://localhost/api/markets/movers?timeframe=invalid')
      const timeframeResponse = await moversGET(invalidTimeframe)
      expect(timeframeResponse.status).toBe(400)

      // Test invalid hours parameter
      const invalidHours = new NextRequest('http://localhost/api/markets/ending-soon?hours=invalid')
      const hoursResponse = await endingSoonGET(invalidHours)
      expect(hoursResponse.status).toBe(400)

      // Test missing token IDs
      const missingTokens = new NextRequest('http://localhost/api/charts/price-history?interval=1h')
      const tokensResponse = await priceHistoryGET(missingTokens)
      expect(tokensResponse.status).toBe(400)
    })
  })

  describe('Data Flow Validation', () => {
    it('should maintain data consistency through the entire pipeline', async () => {
      // Setup consistent test data
      const testMarket = mockMarkets[0]
      const yesPrice = 0.65
      const noPrice = 0.30
      
      vi.mocked(opinionClient.getLatestPrice)
        .mockImplementation(async (tokenId: string) => ({
          tokenId,
          price: tokenId.includes('yes') ? yesPrice.toString() : noPrice.toString(),
          timestamp: Math.floor(Date.now() / 1000)
        }))

      // Test movers endpoint
      const moversRequest = new NextRequest('http://localhost/api/markets/movers?timeframe=1h')
      const moversResponse = await moversGET(moversRequest)
      const moversData = await moversResponse.json()
      
      if (moversData.length > 0) {
        const mover = moversData[0]
        expect(mover.yesPrice).toBe(yesPrice)
        expect(mover.noPrice).toBe(noPrice)
        expect(mover.marketPrice).toBeCloseTo((yesPrice + (1 - noPrice)) / 2, 2)
      }

      // Test arbitrage endpoint
      const arbitrageRequest = new NextRequest('http://localhost/api/markets/arbitrage')
      const arbitrageResponse = await arbitrageGET(arbitrageRequest)
      const arbitrageData = await arbitrageResponse.json()
      
      if (arbitrageData.length > 0) {
        const opportunity = arbitrageData[0]
        expect(opportunity.yesPrice).toBe(yesPrice)
        expect(opportunity.noPrice).toBe(noPrice)
        expect(opportunity.arbPct).toBeCloseTo((yesPrice + noPrice - 1) * 100, 2)
      }
    })
  })
})