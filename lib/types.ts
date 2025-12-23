// Core data interfaces
export interface Market {
  id: number           // mapped from Opinion API marketId
  title: string        // mapped from Opinion API marketTitle  
  yesTokenId: string
  noTokenId: string
  cutoffAt: number
  status: string | number  // handles both statusEnum and numeric status
  volume24h: string
}

export interface PriceData {
  tokenId: string
  price: string
  timestamp: number
}

export interface PriceHistoryPoint {
  t: number  // unix seconds
  p: string  // price as string
}

// API Response Types
export interface MarketMover {
  marketId: number
  marketTitle: string
  marketPrice: number
  priceChangePct: number
  volume24h: string
  yesPrice: number
  noPrice: number
}

export interface ArbitrageOpportunity {
  marketId: number
  marketTitle: string
  yesPrice: number
  noPrice: number
  arbPct: number
  suggestion: 'YES_UNDERPRICED' | 'NO_UNDERPRICED'
}

export interface EndingSoonMarket {
  marketId: number
  marketTitle: string
  cutoffAt: number
  yesPrice: number
  volume: string
}

export interface PriceHistoryChart {
  timestamps: number[]
  yesPrices: number[]
  noAsYesPrices: number[]
}

// Internal Processing Types
export interface ProcessedMarket {
  market: Market
  yesPrice: number
  noPrice: number
  marketPrice: number
  noAsYes: number
}

export interface TimeframePrices {
  current: ProcessedMarket
  previous: ProcessedMarket | null
}

// Cache System Types
export interface CacheEntry<T> {
  data: T
  expiresAt: number
}

export interface CacheSystem {
  get<T>(key: string): T | null
  set<T>(key: string, data: T, ttlSeconds: number): void
  clear(): void
}

// Configuration Types
export interface Config {
  OPINION_API_KEY: string
  OPINION_BASE_URL: string
  CACHE_MAX_SIZE?: number
  API_TIMEOUT?: number
}