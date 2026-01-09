/**
 * Type definitions for Opinion Whale Prediction Market Terminal
 * Consolidated from various files to prevent import errors
 */

// Configuration types
export interface Config {
    OPINION_API_KEY: string
    OPINION_BASE_URL: string
    CACHE_MAX_SIZE: number
    API_TIMEOUT: number
}

// Market types
export interface Market {
    id: number
    title: string
    yesTokenId: string
    noTokenId: string
    cutoffAt: number
    status: string
    volume24h: string
    marketType: number
    questionId?: string
    rules?: string
    yesLabel?: string
    noLabel?: string
    childMarkets?: Market[]
}

// Price data types
export interface PriceData {
    tokenId: string
    price: string
    timestamp: number
    side?: string
    size?: string
}

export interface PriceHistoryPoint {
    t: number // timestamp
    p: string // price
}

// Orderbook types
export interface OrderbookEntry {
    price: string
    size: string
}

export interface Orderbook {
    market: string
    tokenId: string
    timestamp: number
    bids: OrderbookEntry[]
    asks: OrderbookEntry[]
}

// User position types
export interface UserPosition {
    tokenId: string
    marketId: number
    marketTitle: string
    rootMarketTitle?: string
    outcome: 'YES' | 'NO'
    sharesOwned: string
    sharesFrozen?: string
    averageCost: string
    currentValueInQuoteToken: string
    unrealizedPnl: string
    unrealizedPnlPercent: string
}

// Market mover types (for analytics)
export interface MarketMover {
    marketId: number
    marketTitle: string
    marketPrice: number
    priceChangePct: number
    volume24h: string
    yesTokenId: string
    noTokenId: string
    yesPrice: number
    noPrice: number
}

// Cache types
export interface CacheEntry<T> {
    data: T
    expiresAt: number
}

export interface CacheSystem {
    get<T>(key: string): T | null
    set<T>(key: string, data: T, ttlSeconds: number): void
    has(key: string): boolean
    clear(): void
    size(): number
}

// Redis-specific types
export interface MarketData {
    id: string
    [key: string]: any
}

// Chart types
export interface PriceHistoryChart {
    timestamps: number[]
    yesPrices: number[]
    noAsYesPrices: number[]
}

// Analytics types
export interface TimeframePrices {
    current: number
    previous: number
}

export interface EndingSoonMarket {
    marketId: number
    marketTitle: string
    cutoffAt: number
    yesPrice: number
    volume: string
}

export interface ProcessedMarket {
    market: Market
    yesPrice: number
    noPrice: number
    marketPrice: number
    noAsYes: number
}
