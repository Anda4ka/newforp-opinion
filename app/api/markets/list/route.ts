import { NextRequest, NextResponse } from 'next/server'
import { opinionClient } from '@/lib/opinionClient'
import cache from '@/lib/cache'
import { parsePrice } from '@/lib/utils'
import { withErrorHandler, InputValidator } from '@/lib/errorHandler'
import { Market } from '@/lib/types'
import { isMarketInvalid } from '@/lib/invalidMarkets'

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
  marketType: number
  childMarkets?: Market[]
  childMarketsPreview?: ChildMarketPreview[]
}

interface ChildMarketPreview {
  id: number
  title: string
  yesTokenId: string
  yesPrice: number
  volume24h: string
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
  const limit = 100 // Request more markets per page

  // Check cache first (30s TTL for market list to balance freshness and rate limiting)
  const cacheKey = `markets-list:${page}:${sortBy}:${limit}`
  const cachedData = cache.get<{ markets: MarketWithPrices[], total: number }>(cacheKey)

  if (cachedData) {
    return NextResponse.json(cachedData)
  }

  // CRITICAL FIX (C1): Fetch only ONE page instead of 8 parallel pages
  // This prevents massive rate limit breach (was causing 320 req/s vs 30 limit)
  const marketsResponse = await opinionClient.getMarkets(page, sortBy, limit) as { markets?: Market[]; total?: number } | Market[] | null
  const nowSeconds = Math.floor(Date.now() / 1000)
  const rawMarkets = Array.isArray(marketsResponse) ? marketsResponse : marketsResponse?.markets ?? []
  const markets = rawMarkets.filter(market => {
    if (isMarketInvalid(market.id)) return false
    if (market.cutoffAt && market.cutoffAt <= nowSeconds) return false
    return true
  })
  const total = Array.isArray(marketsResponse) ? markets.length : marketsResponse?.total ?? 0

  if (!markets || markets.length === 0) {
    return NextResponse.json({ markets: [], total: 0 })
  }

  console.log(`[API] Fetched ${markets.length} markets from OpinionAPI (Total available: ${total})`)

  // CRITICAL FIX (M1): Use batch pricing API instead of individual requests
  // Collect all unique token IDs
  const allTokenIds: string[] = []
  const childMarketPreviewMap = new Map<number, Market[]>()
  markets.forEach(market => {
    if (market.yesTokenId) allTokenIds.push(market.yesTokenId)
    if (market.noTokenId) allTokenIds.push(market.noTokenId)

    if (market.childMarkets && market.childMarkets.length > 0) {
      const filteredChildren = market.childMarkets.filter(child => {
        if (child.cutoffAt && child.cutoffAt <= nowSeconds) return false
        return true
      })
      const sortedChildren = [...filteredChildren].sort((a, b) => {
        const volumeA = Number(a.volume24h ?? 0)
        const volumeB = Number(b.volume24h ?? 0)
        return volumeB - volumeA
      })
      const topChildren = sortedChildren.slice(0, 3)
      childMarketPreviewMap.set(market.id, topChildren)
      topChildren.forEach(child => {
        if (child.yesTokenId) allTokenIds.push(child.yesTokenId)
      })
    }
  })

  // Fetch ALL prices in batch (2 requests total instead of 2N)
  const priceMap = await opinionClient.getMultiplePrices(allTokenIds)

  // Build markets with prices
  const marketsWithPrices: MarketWithPrices[] = []
  const errors: string[] = []

  for (const market of markets) {
    try {
      const yesPriceData = priceMap.get(market.yesTokenId)
      const noPriceData = priceMap.get(market.noTokenId)

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
        marketType: market.marketType || 0,
        childMarkets: market.childMarkets,
        childMarketsPreview: (childMarketPreviewMap.get(market.id) || []).map(child => {
          const yesPriceData = priceMap.get(child.yesTokenId)
          return {
            id: child.id,
            title: child.title || `Market ${child.id}`,
            yesTokenId: child.yesTokenId,
            yesPrice: parsePrice(yesPriceData?.price || '0'),
            volume24h: child.volume24h || '0',
          }
        }),
      })

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      errors.push(`Market ${market.id}: ${errorMessage}`)
      console.error(`Error processing market ${market.id}:`, error)
      continue
    }
  }

  console.log(`[API] Returning ${marketsWithPrices.length} markets after price fetching (Errors: ${errors.length})`)


  // Log processing summary
  if (errors.length > 0) {
    console.warn(`Processed ${marketsWithPrices.length} markets successfully, ${errors.length} errors`)
  }

  const result = { markets: marketsWithPrices, total }

  // Cache the results for 30 seconds to balance freshness and rate limiting
  cache.set(cacheKey, result, 30)

  return NextResponse.json(result)
}

// Export the wrapped handler with global error handling
export const GET = withErrorHandler(marketsListHandler)
