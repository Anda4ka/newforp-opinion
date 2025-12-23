import { CacheEntry, CacheSystem } from './types'

/**
 * Enhanced cache entry with access tracking for optimization
 */
interface EnhancedCacheEntry<T> extends CacheEntry<T> {
  accessCount: number
  lastAccessed: number
}

/**
 * Cache statistics for monitoring
 */
interface CacheStats {
  hits: number
  misses: number
  entries: number
  hitRate: number
}

/**
 * In-memory cache implementation with TTL support and optimization features
 * Provides automatic cleanup, memory management, and rate limiting optimization
 * Requirement 6.5: Optimize cache usage to minimize API requests
 */
class InMemoryCache implements CacheSystem {
  private cache = new Map<string, EnhancedCacheEntry<any>>()
  private maxSize: number
  private cleanupInterval: NodeJS.Timeout | null = null
  private stats = { hits: 0, misses: 0 }

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize
    this.startCleanupTimer()
  }

  /**
   * Get cached data if not expired
   * @param key Cache key
   * @returns Cached data or null if not found/expired
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key)
    
    if (!entry) {
      this.stats.misses++
      return null
    }

    // Check if entry has expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key)
      this.stats.misses++
      return null
    }

    // Update access statistics for LRU optimization
    entry.accessCount++
    entry.lastAccessed = Date.now()
    this.stats.hits++

    return entry.data as T
  }

  /**
   * Set data in cache with TTL
   * @param key Cache key
   * @param data Data to cache
   * @param ttlSeconds Time to live in seconds
   */
  set<T>(key: string, data: T, ttlSeconds: number): void {
    const expiresAt = Date.now() + (ttlSeconds * 1000)
    
    // If cache is at max size and key doesn't exist, make room
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictOldest()
    }

    this.cache.set(key, {
      data,
      expiresAt,
      accessCount: 1,
      lastAccessed: Date.now()
    })
  }

  /**
   * Check if key exists and is not expired (without updating access stats)
   */
  has(key: string): boolean {
    const entry = this.cache.get(key)
    if (!entry) return false
    
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key)
      return false
    }
    
    return true
  }

  /**
   * Get or set pattern for atomic cache operations
   * Helps prevent duplicate API calls during cache misses
   */
  async getOrSet<T>(
    key: string, 
    factory: () => Promise<T>, 
    ttlSeconds: number
  ): Promise<T> {
    // Try to get from cache first
    const cached = this.get<T>(key)
    if (cached !== null) {
      return cached
    }

    // Generate new data and cache it
    const data = await factory()
    this.set(key, data, ttlSeconds)
    return data
  }

  /**
   * Clear all cached data
   */
  clear(): void {
    this.cache.clear()
    this.stats = { hits: 0, misses: 0 }
  }

  /**
   * Get current cache size
   */
  size(): number {
    return this.cache.size
  }

  /**
   * Get cache statistics for monitoring
   */
  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      entries: this.cache.size,
      hitRate: total > 0 ? this.stats.hits / total : 0
    }
  }

  /**
   * Warm up cache with pre-computed values
   * Useful for frequently accessed data
   */
  warmUp<T>(entries: Array<{ key: string; data: T; ttlSeconds: number }>): void {
    entries.forEach(({ key, data, ttlSeconds }) => {
      this.set(key, data, ttlSeconds)
    })
  }

  /**
   * Remove expired entries from cache
   */
  private cleanupExpired(): void {
    const now = Date.now()
    const keysToDelete: string[] = []

    this.cache.forEach((entry, key) => {
      if (now > entry.expiresAt) {
        keysToDelete.push(key)
      }
    })

    keysToDelete.forEach(key => this.cache.delete(key))
  }

  /**
   * Evict least recently used entries when cache is full
   * Improved LRU algorithm using access statistics
   */
  private evictLeastRecentlyUsed(): void {
    let lruKey: string | null = null
    let lruTime = Date.now()

    // Find the least recently used entry
    this.cache.forEach((entry, key) => {
      if (entry.lastAccessed < lruTime) {
        lruTime = entry.lastAccessed
        lruKey = key
      }
    })

    if (lruKey) {
      this.cache.delete(lruKey)
    }
  }

  /**
   * Evict oldest entries when cache is full (fallback method)
   */
  private evictOldest(): void {
    // Remove 10% of entries when at capacity
    const entriesToRemove = Math.max(1, Math.floor(this.maxSize * 0.1))
    const entries: [string, EnhancedCacheEntry<any>][] = []
    
    // Convert iterator to array manually for compatibility
    this.cache.forEach((value, key) => {
      entries.push([key, value])
    })
    
    // Sort by expiration time (oldest first)
    entries.sort((a, b) => a[1].expiresAt - b[1].expiresAt)
    
    for (let i = 0; i < entriesToRemove && i < entries.length; i++) {
      this.cache.delete(entries[i][0])
    }
  }

  /**
   * Start automatic cleanup timer
   */
  private startCleanupTimer(): void {
    // Clean up expired entries every 60 seconds
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpired()
    }, 60000)

    // Ensure cleanup timer doesn't prevent process exit
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref()
    }
  }

  /**
   * Stop cleanup timer (for testing or shutdown)
   */
  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
  }
}

// Global cache instance
const cache = new InMemoryCache(
  process.env.CACHE_MAX_SIZE ? parseInt(process.env.CACHE_MAX_SIZE) : 1000
)

export default cache
export { InMemoryCache }
export type { CacheStats }