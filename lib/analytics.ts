/**
 * Business logic and analytics functions for market data processing
 */

import {
  Market,
  MarketMover,
  EndingSoonMarket,
  ProcessedMarket
} from './types'
import {
  marketPrice,
  priceChangePct,
  noAsYes,
  parsePrice,
  hoursUntil
} from './utils'

/**
 * Calculate price change for a market between two time points
 * Requirements: 1.3, 6.3
 */
export const calculatePriceChange = (
  currentPrice: number,
  previousPrice: number
): number => {
  return priceChangePct(currentPrice, previousPrice)
}

/**
 * Calculate market price from YES and NO token prices
 * Requirements: 1.3
 */
export const getMarketPrice = (yesPrice: number, noPrice: number): number => {
  return marketPrice(yesPrice, noPrice)
}



/**
 * Sort market movers by price change (primary) and volume (secondary)
 * Requirements: 1.1, 1.6
 */
export const sortByPriceChangeAndVolume = (
  markets: MarketMover[]
): MarketMover[] => {
  return [...markets].sort((a, b) => {
    // Primary sort: price change percentage (descending)
    if (a.priceChangePct !== b.priceChangePct) {
      return b.priceChangePct - a.priceChangePct
    }
    // Secondary sort: volume (descending)
    const volumeA = parseFloat(a.volume24h) || 0
    const volumeB = parseFloat(b.volume24h) || 0
    return volumeB - volumeA
  })
}

/**
 * Filter markets that are ending soon within specified hours
 * Requirements: 3.1, 3.2, 3.4
 */
export const filterEndingSoon = (
  markets: Market[],
  hours: number
): Market[] => {
  return markets.filter(market => {
    // Check if market is activated
    const isActivated = market.status === 'activated'
    if (!isActivated) return false

    // Check if market ends within specified hours
    const timeUntilCutoff = hoursUntil(market.cutoffAt)
    return timeUntilCutoff > 0 && timeUntilCutoff <= hours
  })
}

/**
 * Transform NO token price to YES equivalent
 * Requirements: 4.2
 */
export const transformNoPrice = (noPrice: number): number => {
  return noAsYes(noPrice)
}

/**
 * Create a processed market with calculated prices
 */
export const processMarket = (
  market: Market,
  yesPrice: number,
  noPrice: number
): ProcessedMarket => {
  return {
    market,
    yesPrice,
    noPrice,
    marketPrice: getMarketPrice(yesPrice, noPrice),
    noAsYes: transformNoPrice(noPrice)
  }
}



/**
 * Create a market mover entry
 * Requirements: 1.1, 1.3, 1.5
 */
export const createMarketMover = (
  marketId: number,
  marketTitle: string,
  marketPriceValue: number,
  priceChange: number,
  volume24h: string,
  yesTokenId: string,
  noTokenId: string,
  yesPrice: number,
  noPrice: number
): MarketMover => {
  return {
    marketId,
    marketTitle,
    marketPrice: marketPriceValue,
    priceChangePct: priceChange,
    volume24h,
    yesTokenId,
    noTokenId,
    yesPrice,
    noPrice
  }
}

/**
 * Create an ending soon market entry
 * Requirements: 3.5
 */
export const createEndingSoonMarket = (
  marketId: number,
  marketTitle: string,
  cutoffAt: number,
  yesPrice: number,
  volume: string
): EndingSoonMarket => {
  return {
    marketId,
    marketTitle,
    cutoffAt,
    yesPrice,
    volume
  }
}
