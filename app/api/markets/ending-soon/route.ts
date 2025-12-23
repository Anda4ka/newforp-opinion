import { NextRequest, NextResponse } from 'next/server'
import { opinionClient } from '@/lib/opinionClient'
import cache from '@/lib/cache'
import { 
  filterEndingSoon,
  createEndingSoonMarket
} from '@/lib/analytics'
import { parsePrice } from '@/lib/utils'
import { EndingSoonMarket } from '@/lib/types'
import { withErrorHandler, InputValidator, APIError, ErrorType } from '@/lib/errorHandler'

/**
 * GET /api/markets/ending-soon
 * Returns markets ending within specified hours
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
 */
async function endingSoonHandler(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url)
  const hoursParam = searchParams.get('hours')
  
  // Validate hours parameter with input sanitization
  const hours = InputValidator.validateHours(hoursParam)

  // Check cache first (60s TTL for ending-soon)
  const cacheKey = `ending-soon:${hours}`
  const cachedData = cache.get<EndingSoonMarket[]>(cacheKey)
  
  if (cachedData) {
    return NextResponse.json(cachedData)
  }

  // Requirement 3.1: Fetch markets and filter by time and status
  const { markets } = await opinionClient.getMarkets(1, 2) // Use ending soon sort
  
  if (!markets || markets.length === 0) {
    console.warn('No markets available for ending-soon analysis, returning empty array')
    return NextResponse.json([])
  }

  // Requirement 3.2, 3.4: Filter by activated status and time remaining
  const endingSoonMarkets = filterEndingSoon(markets, hours)

  const endingSoonResults: EndingSoonMarket[] = []
  const errors: string[] = []

  // Process filtered markets to get price data
  for (const market of endingSoonMarkets) {
    try {
      // Get current YES price for the market
      const yesCurrentPrice = await opinionClient.getLatestPrice(market.yesTokenId)
      const yesPrice = parsePrice(yesCurrentPrice.price)

      // Validate price data
      if (yesPrice < 0 || yesPrice > 1) {
        throw new APIError(
          `Invalid YES price for market ${market.id}: ${yesPrice}`,
          ErrorType.VALIDATION,
          400
        )
      }

      // Requirement 3.5: Create ending soon market with required fields
      const endingSoonMarket = createEndingSoonMarket(
        market.id,
        market.title,
        market.cutoffAt,
        yesPrice,
        market.volume24h
      )

      endingSoonResults.push(endingSoonMarket)

    } catch (error) {
      // Collect errors but continue processing other markets
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      errors.push(`Market ${market.id}: ${errorMessage}`)
      console.error(`Error processing ending soon market ${market.id}:`, error)
      continue
    }
  }

  // Log processing summary
  if (errors.length > 0) {
    console.warn(`Processed ${endingSoonResults.length} markets successfully, ${errors.length} errors:`, errors)
  }

  // Cache the results for 60 seconds
  cache.set(cacheKey, endingSoonResults, 60)

  return NextResponse.json(endingSoonResults)
}

// Export the wrapped handler with global error handling
export const GET = withErrorHandler(endingSoonHandler)