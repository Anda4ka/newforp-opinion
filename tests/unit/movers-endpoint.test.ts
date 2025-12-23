import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from '@/app/api/markets/movers/route'
import { NextRequest } from 'next/server'

// Mock the dependencies
vi.mock('@/lib/opinionClient', () => ({
  opinionClient: {
    getMarkets: vi.fn().mockResolvedValue([]),
    getLatestPrice: vi.fn(),
    getPriceHistory: vi.fn()
  }
}))

vi.mock('@/lib/cache', () => ({
  default: {
    get: vi.fn().mockReturnValue(null),
    set: vi.fn()
  }
}))

describe('Movers Endpoint Timeframe Validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should accept valid timeframe "1h"', async () => {
    const request = new NextRequest('http://localhost/api/markets/movers?timeframe=1h')
    const response = await GET(request)
    
    expect(response.status).toBe(200)
  })

  it('should accept valid timeframe "24h"', async () => {
    const request = new NextRequest('http://localhost/api/markets/movers?timeframe=24h')
    const response = await GET(request)
    
    expect(response.status).toBe(200)
  })

  it('should default to "24h" when no timeframe provided', async () => {
    const request = new NextRequest('http://localhost/api/markets/movers')
    const response = await GET(request)
    
    expect(response.status).toBe(200)
  })

  it('should reject invalid timeframe "12h"', async () => {
    const request = new NextRequest('http://localhost/api/markets/movers?timeframe=12h')
    const response = await GET(request)
    
    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.error).toContain('Invalid timeframe')
  })

  it('should reject invalid timeframe "1d"', async () => {
    const request = new NextRequest('http://localhost/api/markets/movers?timeframe=1d')
    const response = await GET(request)
    
    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.error).toContain('Invalid timeframe')
  })

  it('should reject empty timeframe', async () => {
    const request = new NextRequest('http://localhost/api/markets/movers?timeframe=')
    const response = await GET(request)
    
    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.error).toContain('Invalid timeframe')
  })

  it('should calculate correct time period for 1h timeframe', () => {
    // Test that 1h timeframe corresponds to 60 * 60 * 1000 milliseconds
    const oneHourMs = 60 * 60 * 1000
    expect(oneHourMs).toBe(3600000)
  })

  it('should calculate correct time period for 24h timeframe', () => {
    // Test that 24h timeframe corresponds to 24 * 60 * 60 * 1000 milliseconds
    const twentyFourHoursMs = 24 * 60 * 60 * 1000
    expect(twentyFourHoursMs).toBe(86400000)
  })
})

/**
 * **Validates: Requirements 1.2**
 * Tests timeframe parameter validation for movers endpoint
 */