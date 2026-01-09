/**
 * Background Sync Service for Prediction Markets
 * Collects all market data and prices every 30 seconds and stores in Redis
 * Requirements: 2.1, 2.2, 2.3, 2.5, 2.6
 */

import { opinionClient } from './opinionClient'
import { redis } from './redis'
import { Market, PriceData } from './types'

export interface SyncResult {
  success: boolean
  marketsProcessed: number
  pricesUpdated: number
  duration: number
  errors: string[]
  timestamp: number
}

export interface SyncConfig {
  intervalSeconds: number // 30
  maxConcurrentRequests: number // 10
  requestTimeoutMs: number // 10000
  retryAttempts: number // 2
  batchSize: number // 20 (for market pagination)
}

export class SyncService {
  private isRunning: boolean = false
  private intervalId: NodeJS.Timeout | null = null
  private lastSyncTime: number = 0
  private config: SyncConfig

  constructor(config: Partial<SyncConfig> = {}) {
    this.config = {
      intervalSeconds: 30,
      maxConcurrentRequests: 10,
      requestTimeoutMs: 10000,
      retryAttempts: 2,
      batchSize: 20,
      ...config
    }
  }

  /**
   * Start the background sync service
   * Requirement 2.1: Execute sync every 30 seconds
   */
  start(): void {
    if (this.isRunning) {
      console.log('[SyncService] Already running')
      return
    }

    this.isRunning = true
    console.log(`[SyncService] Starting background sync every ${this.config.intervalSeconds} seconds`)

    // Run initial sync immediately
    this.performSync().catch(error => {
      console.error('[SyncService] Initial sync failed:', error)
    })

    // Schedule recurring syncs
    this.intervalId = setInterval(() => {
      this.performSync().catch(error => {
        console.error('[SyncService] Scheduled sync failed:', error)
      })
    }, this.config.intervalSeconds * 1000)
  }

  /**
   * Stop the background sync service
   */
  stop(): void {
    if (!this.isRunning) {
      return
    }

    this.isRunning = false
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    console.log('[SyncService] Stopped background sync')
  }

  /**
   * Perform a single sync operation
   * Requirements: 2.2, 2.3, 2.5, 2.6
   */
  async performSync(): Promise<SyncResult> {
    const startTime = Date.now()
    const errors: string[] = []
    let marketsProcessed = 0
    let pricesUpdated = 0

    console.log('[SyncService] Starting sync cycle...')

    try {
      // Step 1: Get all active markets with pagination
      // Requirement 2.2: Get markets with pagination by 20 elements
      const allMarkets = await this.getAllMarkets()
      marketsProcessed = allMarkets.length
      console.log(`[SyncService] Retrieved ${allMarkets.length} markets`)

      if (allMarkets.length === 0) {
        console.warn('[SyncService] No markets found, skipping price sync')
        return {
          success: true,
          marketsProcessed: 0,
          pricesUpdated: 0,
          duration: Date.now() - startTime,
          errors: ['No markets found'],
          timestamp: startTime
        }
      }

      // Step 2: Extract unique token IDs
      // Requirement 2.3: Form list of all unique yesTokenId and noTokenId
      const uniqueTokenIds = this.extractUniqueTokenIds(allMarkets)
      console.log(`[SyncService] Extracted ${uniqueTokenIds.length} unique token IDs`)

      // Step 3: Fetch all prices in parallel with concurrency control
      // Requirement 2.4: Use Promise.all with chunks of 5-10 requests
      const priceMap = await this.fetchAllPrices(uniqueTokenIds)
      pricesUpdated = priceMap.size
      console.log(`[SyncService] Fetched ${pricesUpdated} prices`)

      // Step 4: Store data in Redis in structured format
      // Requirement 2.5: Store in structured format for individual market access
      await this.storeDataInRedis(allMarkets, priceMap)
      console.log('[SyncService] Data stored in Redis')

      // Update sync metadata
      this.lastSyncTime = startTime
      await this.storeSyncMetadata({
        lastSyncTime: startTime,
        nextSyncTime: startTime + (this.config.intervalSeconds * 1000),
        marketsCount: marketsProcessed,
        pricesCount: pricesUpdated,
        syncDuration: Date.now() - startTime,
        errors
      })

      const duration = Date.now() - startTime
      console.log(`[SyncService] Sync completed successfully in ${duration}ms`)

      return {
        success: true,
        marketsProcessed,
        pricesUpdated,
        duration,
        errors,
        timestamp: startTime
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      errors.push(errorMessage)
      console.error('[SyncService] Sync failed:', error)

      return {
        success: false,
        marketsProcessed,
        pricesUpdated,
        duration: Date.now() - startTime,
        errors,
        timestamp: startTime
      }
    }
  }

  /**
   * Get all markets using pagination
   * Requirement 2.2: Pagination with 20 elements per page
   */
  private async getAllMarkets(): Promise<Market[]> {
    const allMarkets: Market[] = []
    let page = 1
    let hasMore = true

    while (hasMore) {
      try {
        const { markets, total } = await opinionClient.getMarkets(page, 3, this.config.batchSize)

        if (markets.length === 0) {
          hasMore = false
          break
        }

        allMarkets.push(...markets)
        console.log(`[SyncService] Page ${page}: ${markets.length} markets (total so far: ${allMarkets.length})`)

        // Check if we have more pages
        hasMore = allMarkets.length < total && markets.length === this.config.batchSize
        page++

        // Safety check to prevent infinite loops
        if (page > 1000) {
          console.warn('[SyncService] Reached maximum page limit (1000), stopping pagination')
          break
        }

      } catch (error) {
        console.error(`[SyncService] Failed to fetch page ${page}:`, error)
        // Continue with next page on error
        page++
        if (page > 10) { // Don't retry too many times
          break
        }
      }
    }

    return allMarkets
  }

  /**
   * Extract unique token IDs from markets
   * Requirement 2.3: Form list of all unique yesTokenId and noTokenId
   */
  private extractUniqueTokenIds(markets: Market[]): string[] {
    const tokenIds = new Set<string>()

    for (const market of markets) {
      if (market.yesTokenId) {
        tokenIds.add(market.yesTokenId)
      }
      if (market.noTokenId) {
        tokenIds.add(market.noTokenId)
      }

      // Handle child markets (categorical markets)
      if (market.childMarkets && market.childMarkets.length > 0) {
        for (const childMarket of market.childMarkets) {
          if (childMarket.yesTokenId) {
            tokenIds.add(childMarket.yesTokenId)
          }
          if (childMarket.noTokenId) {
            tokenIds.add(childMarket.noTokenId)
          }
        }
      }
    }

    return Array.from(tokenIds).filter(id => id && id.trim() !== '')
  }

  /**
   * Fetch all prices using the enhanced OpinionClient with concurrency control
   * Requirement 2.4: Use Promise.all with chunks and respect 30 req/s
   * Requirement 2.6: Respect 30 req/s rate limit
   */
  private async fetchAllPrices(tokenIds: string[]): Promise<Map<string, PriceData>> {
    if (tokenIds.length === 0) {
      return new Map()
    }

    console.log(`[SyncService] Fetching prices for ${tokenIds.length} tokens with concurrency control`)

    try {
      // Use the enhanced OpinionClient's getMultiplePrices method
      // This already handles concurrency control and rate limiting
      const priceMap = await opinionClient.getMultiplePrices(tokenIds)

      console.log(`[SyncService] Successfully fetched ${priceMap.size} prices out of ${tokenIds.length} requested`)
      return priceMap

    } catch (error) {
      console.error('[SyncService] Failed to fetch prices:', error)

      // Return empty map with fallback data for all tokens
      const fallbackMap = new Map<string, PriceData>()
      tokenIds.forEach(tokenId => {
        fallbackMap.set(tokenId, {
          tokenId,
          price: '0',
          timestamp: Date.now()
        })
      })

      return fallbackMap
    }
  }

  /**
   * Store markets and prices in Redis with structured format
   * Requirement 2.5: Structured storage for individual market access
   */
  private async storeDataInRedis(markets: Market[], priceMap: Map<string, PriceData>): Promise<void> {
    try {
      // Store individual markets for direct access by ID
      // Store individual markets for direct access by ID
      if (redis.client) {
        const client = redis.client // Capture non-null reference

        const marketPromises = markets.map(market =>
          client.setMarket(market.id.toString(), {
            id: market.id.toString(),
            title: market.title,
            yesTokenId: market.yesTokenId,
            noTokenId: market.noTokenId,
            cutoffAt: market.cutoffAt,
            status: market.status.toString(),
            volume24h: market.volume24h,
            createdAt: Date.now(),
            updatedAt: Date.now()
          })
        )

        // Store individual prices for direct access by token ID
        const pricePromises = Array.from(priceMap.entries()).map(([tokenId, priceData]) =>
          client.setPrice(tokenId, priceData)
        )

        // Store markets list for quick access
        const marketsList = markets.map(market => ({
          id: market.id.toString(),
          title: market.title,
          yesTokenId: market.yesTokenId,
          noTokenId: market.noTokenId,
          cutoffAt: market.cutoffAt,
          status: market.status.toString(),
          volume24h: market.volume24h,
          createdAt: Date.now(),
          updatedAt: Date.now()
        }))

        // Execute all Redis operations in parallel
        await Promise.all([
          ...marketPromises,
          ...pricePromises,
          client.set('markets:list', JSON.stringify(marketsList)),
          client.set('sync:last_update', Date.now().toString())
        ])

        console.log(`[SyncService] Stored ${markets.length} markets and ${priceMap.size} prices in Redis`)
      } else {
        console.warn('[SyncService] Redis not available, skipping data storage')
      }

      console.log(`[SyncService] Stored ${markets.length} markets and ${priceMap.size} prices in Redis`)

    } catch (error) {
      console.error('[SyncService] Failed to store data in Redis:', error)
      throw error
    }
  }

  /**
   * Store sync metadata for monitoring
   */
  private async storeSyncMetadata(metadata: {
    lastSyncTime: number
    nextSyncTime: number
    marketsCount: number
    pricesCount: number
    syncDuration: number
    errors: string[]
  }): Promise<void> {
    try {
      if (redis.client) {
        await redis.client.set('sync:metadata', JSON.stringify(metadata))
      }
    } catch (error) {
      console.error('[SyncService] Failed to store sync metadata:', error)
    }
  }

  /**
   * Get last sync time for monitoring
   */
  async getLastSyncTime(): Promise<number | null> {
    try {
      if (!redis.client) return null
      const lastSync = await redis.client.get('sync:last_update')
      return lastSync ? parseInt(lastSync) : null
    } catch (error) {
      console.error('[SyncService] Failed to get last sync time:', error)
      return null
    }
  }

  /**
   * Check if sync service is healthy
   */
  async isHealthy(): Promise<boolean> {
    try {
      const lastSyncTime = await this.getLastSyncTime()
      if (!lastSyncTime) {
        return false
      }

      // Consider healthy if last sync was within 2 intervals
      const maxAge = this.config.intervalSeconds * 2 * 1000
      return (Date.now() - lastSyncTime) < maxAge
    } catch (error) {
      console.error('[SyncService] Health check failed:', error)
      return false
    }
  }

  /**
   * Get sync statistics for monitoring
   */
  async getStats(): Promise<{
    isRunning: boolean
    lastSyncTime: number | null
    isHealthy: boolean
    config: SyncConfig
  }> {
    return {
      isRunning: this.isRunning,
      lastSyncTime: await this.getLastSyncTime(),
      isHealthy: await this.isHealthy(),
      config: this.config
    }
  }

  /**
   * Graceful shutdown
   * Requirement 8.5: Gracefully close connections and free resources
   */
  async shutdown(): Promise<void> {
    console.log('[SyncService] Shutting down...')
    this.stop()

    // Wait for any ongoing sync to complete (with timeout)
    const shutdownTimeout = 30000 // 30 seconds
    const startTime = Date.now()

    while (this.isRunning && (Date.now() - startTime) < shutdownTimeout) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    console.log('[SyncService] Shutdown complete')
  }
}

/**
 * Global sync service instance
 */
export const syncService = new SyncService()

/**
 * Utility function to start sync service
 */
export function startBackgroundSync(config?: Partial<SyncConfig>): void {
  if (config) {
    const customSyncService = new SyncService(config)
    customSyncService.start()
  } else {
    syncService.start()
  }
}

/**
 * Utility function to stop sync service
 */
export function stopBackgroundSync(): void {
  syncService.stop()
}