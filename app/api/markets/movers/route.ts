import { NextRequest, NextResponse } from 'next/server'
import { opinionClient } from '@/lib/opinionClient'
import cache from '@/lib/cache'
import { 
  calculatePriceChange, 
  getMarketPrice, 
  createMarketMover, 
  sortByPriceChangeAndVolume,
  processMarket
} from '@/lib/analytics'
import { parsePrice } from '@/lib/utils'
import { MarketMover, TimeframePrices } from '@/lib/types'
import { withErrorHandler, InputValidator, APIError, ErrorType } from '@/lib/errorHandler'

/**
 * GET /api/markets/movers
 * Returns markets with the biggest price changes over specified timeframe
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6
 */
async function moversHandler(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url)
  const timeframeParam = searchParams.get('timeframe')
  
  // Requirement 1.2: Validate timeframe parameter with input sanitization
  const timeframe = InputValidator.validateTimeframe(timeframeParam)

  // Check cache first (30s TTL for movers)
  const cacheKey = `movers:${timeframe}`
  const cachedData = cache.get<MarketMover[]>(cacheKey)
  
  if (cachedData) {
    return NextResponse.json(cachedData)
  }

  // Fetch fresh data with error handling
  const { markets } = await opinionClient.getMarkets(1, 5) // Use volume24h desc for movers
  
  if (!markets || markets.length === 0) {
    console.warn('No markets available, returning empty array')
    return NextResponse.json([])
  }

  // Calculate time period for historical data
  const now = Date.now()
  const timeframePeriod = timeframe === '1h' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000
  const historicalTime = now - timeframePeriod

  const movers: MarketMover[] = []
  const errors: string[] = []

  // Process each market to calculate price changes
  for (const market of markets) {
    try {
      // Get current prices with timeout handling
      const [yesCurrentPrice, noCurrentPrice] = await Promise.all([
        opinionClient.getLatestPrice(market.yesTokenId),
        opinionClient.getLatestPrice(market.noTokenId)
      ])

      const currentYesPrice = parsePrice(yesCurrentPrice?.price || '0')
      const currentNoPrice = parsePrice(noCurrentPrice?.price || '0')
      
      // Validate price data
      if (currentYesPrice < 0 || currentNoPrice < 0) {
        throw new APIError(
          `Invalid price data for market ${market.id}`,
          ErrorType.VALIDATION,
          400
        )
      }
      
      const currentMarketPrice = getMarketPrice(currentYesPrice, currentNoPrice)

      // Get historical prices with error handling
      const [yesHistory, noHistory] = await Promise.all([
        opinionClient.getPriceHistory(market.yesTokenId, timeframe === '1h' ? '1h' : '1d'),
        opinionClient.getPriceHistory(market.noTokenId, timeframe === '1h' ? '1h' : '1d')
      ])

      // Find historical price closest to target time
      // Requirement 1.4: Use nearest available data point if exact time not found
      let historicalYesPrice = currentYesPrice
      let historicalNoPrice = currentNoPrice

      if (yesHistory && yesHistory.length > 0) {
        const targetHistoricalPoint = yesHistory.find(point => 
          point.t * 1000 <= historicalTime
        ) || yesHistory[yesHistory.length - 1] // Use oldest available if none found
        
        historicalYesPrice = parsePrice(targetHistoricalPoint.p)
      }

      if (noHistory && noHistory.length > 0) {
        const targetHistoricalPoint = noHistory.find(point => 
          point.t * 1000 <= historicalTime
        ) || noHistory[noHistory.length - 1] // Use oldest available if none found
        
        historicalNoPrice = parsePrice(targetHistoricalPoint.p)
      }

      const historicalMarketPrice = getMarketPrice(historicalYesPrice, historicalNoPrice)

      // Requirement 1.3: Calculate price change using specified formula
      const priceChange = calculatePriceChange(currentMarketPrice, historicalMarketPrice)

      // Requirement 1.5: Create mover with all required fields
      const mover = createMarketMover(
        market.id,
        market.title,
        currentMarketPrice,
        priceChange,
        market.volume24h,
        market.yesTokenId,
        market.noTokenId,
        currentYesPrice,
        currentNoPrice
      )

      movers.push(mover)

    } catch (error) {
      // Collect errors but continue processing other markets
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      errors.push(`Market ${market.id}: ${errorMessage}`)
      console.error(`Error processing market ${market.id}:`, error)
      continue
    }
  }

  // Log processing summary
  if (errors.length > 0) {
    console.warn(`Processed ${movers.length} markets successfully, ${errors.length} errors:`, errors)
  }

  // Requirement 1.1, 1.6: Sort by price change (primary) and volume (secondary)
  const sortedMovers = sortByPriceChangeAndVolume(movers)

  // Cache the results for 30 seconds
  cache.set(cacheKey, sortedMovers, 30)

  return NextResponse.json(sortedMovers)
}

// Export the wrapped handler with global error handling
export const GET = withErrorHandler(moversHandler)