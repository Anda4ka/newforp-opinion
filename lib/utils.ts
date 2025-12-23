/**
 * Core utility functions for price calculations and data processing
 */

/**
 * Convert NO token price to YES equivalent (1 - noPrice)
 */
export const noAsYes = (noPrice: number): number => 1 - noPrice

/**
 * Calculate market price as average of YES price and NO-as-YES price
 */
export const marketPrice = (yesPrice: number, noPrice: number): number => 
  (yesPrice + noAsYes(noPrice)) / 2

/**
 * Calculate price change percentage with zero division protection
 */
export const priceChangePct = (current: number, previous: number): number => 
  previous === 0 ? 0 : (current - previous) / previous

/**
 * Calculate arbitrage percentage
 */
export const arbitragePct = (yesPrice: number, noPrice: number): number => 
  (yesPrice + noPrice - 1) * 100

/**
 * Determine which token is underpriced in arbitrage opportunity
 */
export const determineUnderpriced = (yesPrice: number, noPrice: number): 'YES_UNDERPRICED' | 'NO_UNDERPRICED' => 
  yesPrice < (1 - noPrice) ? 'YES_UNDERPRICED' : 'NO_UNDERPRICED'

/**
 * Validate that a number is positive and not NaN
 */
export const isValidPrice = (price: number): boolean => 
  !isNaN(price) && isFinite(price) && price >= 0

/**
 * Safe division with zero protection
 */
export const safeDivide = (numerator: number, denominator: number, fallback: number = 0): number => 
  denominator === 0 ? fallback : numerator / denominator

/**
 * Parse string price to number with validation
 */
export const parsePrice = (priceStr: string): number => {
  const price = parseFloat(priceStr)
  return isValidPrice(price) ? price : 0
}

/**
 * Calculate time difference in hours
 */
export const hoursUntil = (timestamp: number): number => {
  const now = Date.now() / 1000 // Convert to seconds
  return (timestamp - now) / 3600 // Convert to hours
}