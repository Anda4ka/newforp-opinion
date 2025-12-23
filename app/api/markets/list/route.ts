import { NextRequest, NextResponse } from 'next/server'
import { opinionClient } from '@/lib/opinionClient'
import cache from '@/lib/cache'
import { parsePrice } from '@/lib/utils'
import { withErrorHandler, InputValidator } from '@/lib/errorHandler'

interface MarketWithPrices {
  id: number
  title: string
  yesTokenId: string
  noTokenId: string
  yesPrice: number
  noPrice: number
  volume24h: string
  priceChangePct?: number
  cutoffAt: number
}

/**
 * GET /api/markets/list
 * Returns paginated list of markets with current prices
 * Uses cache to stay within 30 req/s limit
 */
async function marketsListHandler(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url)
  const pageParam = searchParams.get('page')
  
  // Validate page parameter
  const page = InputValidator.validatePage(pageParam)
  const sortBy = 3 // Volume Descending (default per requirements)

  // Check cache first (15s TTL for market list)
  const cacheKey = `markets-list:${page}:${sortBy}`
  const cachedData = cache.get<{ markets: MarketWithPrices[], total: number }>(cacheKey)
  
  if (cachedData) {
    return NextResponse.json(cachedData)
  }

  // Fetch markets with pagination
  const { markets, total } = await opinionClient.getMarkets(page, sortBy)
  
  if (!markets || markets.length === 0) {
    return NextResponse.json({ markets: [], total: 0 })
  }

  // Fetch prices for all markets in parallel (with rate limiting handled by client)
  const marketsWithPrices: MarketWithPrices[] = []
  const errors: string[] = []

  // Process markets to get prices
  for (const market of markets) {
    try {
      // Get current prices
      const [yesPriceData, noPriceData] = await Promise.all([
        opinionClient.getLatestPrice(market.yesTokenId),
        opinionClient.getLatestPrice(market.noTokenId)
      ])

      const yesPrice = parsePrice(yesPriceData?.price || '0')
      const noPrice = parsePrice(noPriceData?.price || '0')

      // Validate prices
      if (yesPrice < 0 || yesPrice > 1 || noPrice < 0 || noPrice > 1) {
        errors.push(`Market ${market.id}: Invalid prices`)
        continue
      }

      marketsWithPrices.push({
        id: market.id,
        title: market.title || `Market ${market.id}`,
        yesTokenId: market.yesTokenId,
        noTokenId: market.noTokenId,
        yesPrice,
        noPrice,
        volume24h: market.volume24h || '0',
        cutoffAt: market.cutoffAt || 0,
      })

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      errors.push(`Market ${market.id}: ${errorMessage}`)
      console.error(`Error processing market ${market.id}:`, error)
      continue
    }
  }

  // Log processing summary
  if (errors.length > 0) {
    console.warn(`Processed ${marketsWithPrices.length} markets successfully, ${errors.length} errors`)
  }

  const result = { markets: marketsWithPrices, total }

  // Cache the results for 15 seconds
  cache.set(cacheKey, result, 15)

  return NextResponse.json(result)
}

// Export the wrapped handler with global error handling
export const GET = withErrorHandler(marketsListHandler)
