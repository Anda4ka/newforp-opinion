import { NextRequest, NextResponse } from 'next/server'
import { opinionClient } from '@/lib/opinionClient'
import cache from '@/lib/cache'
import { transformNoPrice } from '@/lib/analytics'
import { parsePrice } from '@/lib/utils'
import { PriceHistoryChart, PriceHistoryPoint } from '@/lib/types'
import { withErrorHandler, InputValidator, APIError, ErrorType } from '@/lib/errorHandler'

/**
 * GET /api/charts/price-history
 * Returns synchronized price history for YES and NO tokens
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */
async function priceHistoryHandler(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url)
  const yesTokenId = searchParams.get('yesTokenId')
  const noTokenId = searchParams.get('noTokenId')
  const intervalParam = searchParams.get('interval')
  
  // Validate required parameters with input sanitization
  const validatedYesTokenId = InputValidator.validateTokenId(yesTokenId, 'yesTokenId')
  const validatedNoTokenId = InputValidator.validateTokenId(noTokenId, 'noTokenId')
  const interval = InputValidator.validateInterval(intervalParam)

  // Check cache first (60s TTL for charts)
  const cacheKey = `price-history:${validatedYesTokenId}:${validatedNoTokenId}:${interval}`
  const cachedData = cache.get<PriceHistoryChart>(cacheKey)
  
  if (cachedData) {
    return NextResponse.json(cachedData)
  }

  // Requirement 4.1: Fetch price history for both tokens with specified interval
  const [yesHistory, noHistory] = await Promise.all([
    opinionClient.getPriceHistory(validatedYesTokenId, interval),
    opinionClient.getPriceHistory(validatedNoTokenId, interval)
  ])

  // Validate that we have data for both tokens
  if (yesHistory.length === 0 && noHistory.length === 0) {
    throw new APIError(
      'No price history data available for the specified tokens',
      ErrorType.NOT_FOUND,
      404
    )
  }

  // Requirement 4.3: Synchronize timestamps between YES and NO data
  const synchronizedData = synchronizePriceHistory(yesHistory, noHistory)

  // Validate synchronized data
  if (synchronizedData.timestamps.length === 0) {
    throw new APIError(
      'No synchronized price data available for the specified time period',
      ErrorType.NOT_FOUND,
      404
    )
  }

  // Requirement 4.5: Create response with required structure
  const priceHistoryChart: PriceHistoryChart = {
    timestamps: synchronizedData.timestamps,
    yesPrices: synchronizedData.yesPrices,
    noAsYesPrices: synchronizedData.noAsYesPrices
  }

  // Cache the results for 60 seconds
  cache.set(cacheKey, priceHistoryChart, 60)

  return NextResponse.json(priceHistoryChart)
}

/**
 * Synchronize price history data between YES and NO tokens
 * Ensures matching timestamps and transforms NO prices
 * Requirements: 4.1, 4.2, 4.3
 */
function synchronizePriceHistory(
  yesHistory: PriceHistoryPoint[],
  noHistory: PriceHistoryPoint[]
): {
  timestamps: number[]
  yesPrices: number[]
  noAsYesPrices: number[]
} {
  // Create maps for quick lookup
  const yesMap = new Map<number, number>()
  const noMap = new Map<number, number>()

  // Populate YES price map with validation
  yesHistory.forEach(point => {
    const price = parsePrice(point.p)
    if (price >= 0 && price <= 1) { // Validate price range
      yesMap.set(point.t, price)
    }
  })

  // Populate NO price map with transformed prices and validation
  // Requirement 4.2: Transform NO prices to (1 - price) format
  noHistory.forEach(point => {
    const originalNoPrice = parsePrice(point.p)
    if (originalNoPrice >= 0 && originalNoPrice <= 1) { // Validate price range
      const transformedNoPrice = transformNoPrice(originalNoPrice)
      noMap.set(point.t, transformedNoPrice)
    }
  })

  // Get all unique timestamps and sort them
  const allTimestamps = new Set<number>()
  yesHistory.forEach(point => allTimestamps.add(point.t))
  noHistory.forEach(point => allTimestamps.add(point.t))
  
  const sortedTimestamps = Array.from(allTimestamps).sort((a, b) => a - b)

  // Requirement 4.3: Ensure corresponding time points for YES and NO data
  const timestamps: number[] = []
  const yesPrices: number[] = []
  const noAsYesPrices: number[] = []

  // Only include timestamps where both YES and NO data exist
  sortedTimestamps.forEach(timestamp => {
    const yesPrice = yesMap.get(timestamp)
    const noAsYesPrice = noMap.get(timestamp)

    if (yesPrice !== undefined && noAsYesPrice !== undefined) {
      timestamps.push(timestamp)
      yesPrices.push(yesPrice)
      noAsYesPrices.push(noAsYesPrice)
    }
  })

  return {
    timestamps,
    yesPrices,
    noAsYesPrices
  }
}

// Export the wrapped handler with global error handling
export const GET = withErrorHandler(priceHistoryHandler)