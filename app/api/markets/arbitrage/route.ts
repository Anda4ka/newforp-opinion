import { NextRequest, NextResponse } from 'next/server'
import { opinionClient } from '@/lib/opinionClient'
import cache from '@/lib/cache'
import { 
  createArbitrageOpportunity,
  filterSignificantArbitrage
} from '@/lib/analytics'
import { parsePrice } from '@/lib/utils'
import { ArbitrageOpportunity } from '@/lib/types'
import { withErrorHandler, APIError, ErrorType } from '@/lib/errorHandler'

/**
 * GET /api/markets/arbitrage
 * Returns markets with arbitrage opportunities (4%+ threshold)
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5
 */
async function arbitrageHandler(request: NextRequest): Promise<NextResponse> {
  // Check cache first (30s TTL for arbitrage)
  const cacheKey = 'arbitrage'
  const cachedData = cache.get<ArbitrageOpportunity[]>(cacheKey)
  
  if (cachedData) {
    return NextResponse.json(cachedData)
  }

  // Requirement 2.1: Fetch markets with arbitrage opportunities
  const { markets } = await opinionClient.getMarkets(1, 3) // Use volume desc
  
  if (!markets || markets.length === 0) {
    console.warn('No markets available for arbitrage analysis, returning empty array')
    return NextResponse.json([])
  }

  const arbitrageOpportunities: ArbitrageOpportunity[] = []
  const errors: string[] = []

  // Process each market to find arbitrage opportunities
  for (const market of markets) {
    try {
      // Get current prices for YES and NO tokens
      const [yesCurrentPrice, noCurrentPrice] = await Promise.all([
        opinionClient.getLatestPrice(market.yesTokenId),
        opinionClient.getLatestPrice(market.noTokenId)
      ])

      const yesPrice = parsePrice(yesCurrentPrice.price)
      const noPrice = parsePrice(noCurrentPrice.price)

      // Validate price data
      if (yesPrice < 0 || yesPrice > 1 || noPrice < 0 || noPrice > 1) {
        throw new APIError(
          `Invalid price data for market ${market.id}: YES=${yesPrice}, NO=${noPrice}`,
          ErrorType.VALIDATION,
          400
        )
      }

      // Requirement 2.2, 2.4, 2.5: Create arbitrage opportunity with calculation and suggestion
      const opportunity = createArbitrageOpportunity(
        market.id,
        market.title,
        yesPrice,
        noPrice
      )

      arbitrageOpportunities.push(opportunity)

    } catch (error) {
      // Collect errors but continue processing other markets
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      errors.push(`Market ${market.id}: ${errorMessage}`)
      console.error(`Error processing arbitrage for market ${market.id}:`, error)
      continue
    }
  }

  // Log processing summary
  if (errors.length > 0) {
    console.warn(`Processed ${arbitrageOpportunities.length} markets successfully, ${errors.length} errors:`, errors)
  }

  // Requirement 2.3: Apply 4% threshold filtering
  const significantOpportunities = filterSignificantArbitrage(arbitrageOpportunities)

  // Cache the results for 30 seconds
  cache.set(cacheKey, significantOpportunities, 30)

  return NextResponse.json(significantOpportunities)
}

// Export the wrapped handler with global error handling
export const GET = withErrorHandler(arbitrageHandler)