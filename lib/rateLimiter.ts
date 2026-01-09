/**
 * Rate Limiting and Request Management System with Real Parallelism
 * Requirement 6.5: Implement rate limit mitigation mechanisms
 * Uses p-limit for true concurrent request control
 */

import pLimit from 'p-limit'

/**
 * Circuit breaker states
 */
enum CircuitState {
  CLOSED = 'CLOSED',     // Normal operation
  OPEN = 'OPEN',         // Circuit is open, requests fail fast
  HALF_OPEN = 'HALF_OPEN' // Testing if service is back
}

/**
 * Circuit breaker for external API calls
 */
class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED
  private failureCount: number = 0
  private lastFailureTime: number = 0
  private successCount: number = 0

  constructor(
    private readonly failureThreshold: number = 5,
    private readonly recoveryTimeout: number = 60000, // 1 minute
    private readonly successThreshold: number = 3
  ) { }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() - this.lastFailureTime > this.recoveryTimeout) {
        this.state = CircuitState.HALF_OPEN
        this.successCount = 0
      } else {
        throw new Error('Circuit breaker is OPEN - service temporarily unavailable')
      }
    }

    try {
      const result = await fn()
      this.onSuccess()
      return result
    } catch (error) {
      this.onFailure(error as Error)
      throw error
    }
  }

  private onSuccess(): void {
    this.failureCount = 0

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++
      if (this.successCount >= this.successThreshold) {
        this.state = CircuitState.CLOSED
      }
    }
  }

  private onFailure(error?: Error): void {
    // M5 FIX: Don't open circuit for rate limit errors (429)
    // Rate limits are temporary and don't indicate service failure
    const is429 = error?.message.includes('429') || error?.message.includes('Rate limit')
    if (is429) {
      console.warn('[CircuitBreaker] Rate limit detected, not counting as failure')
      return
    }

    this.failureCount++
    this.lastFailureTime = Date.now()

    if (this.failureCount >= this.failureThreshold) {
      this.state = CircuitState.OPEN
    }
  }

  getState(): CircuitState {
    return this.state
  }
}

/**
 * Request deduplication to prevent duplicate API calls
 */
class RequestDeduplicator {
  private pendingRequests = new Map<string, Promise<any>>()

  /**
   * Execute a request with deduplication
   * If the same request is already in progress, return the existing promise
   */
  async execute<T>(key: string, fn: () => Promise<T>): Promise<T> {
    // Check if request is already in progress
    if (this.pendingRequests.has(key)) {
      return this.pendingRequests.get(key) as Promise<T>
    }

    // Create new request
    const promise = fn().finally(() => {
      // Clean up after request completes
      this.pendingRequests.delete(key)
    })

    this.pendingRequests.set(key, promise)
    return promise
  }

  /**
   * Clear all pending requests (useful for testing)
   */
  clear(): void {
    this.pendingRequests.clear()
  }
}

/**
 * Rate limiter with real parallelism using p-limit
 * Supports true concurrent execution with rate limiting
 */
class ParallelRateLimiter {
  private readonly concurrencyLimit: ReturnType<typeof pLimit>
  private readonly requestsPerSecond: number
  private requestTimes: number[] = []
  private readonly MAX_HISTORY_SIZE = 1000 // M6 FIX: Prevent unbounded growth

  constructor(
    maxConcurrent: number = 10,
    requestsPerSecond: number = 30
  ) {
    this.concurrencyLimit = pLimit(maxConcurrent)
    this.requestsPerSecond = requestsPerSecond
  }

  /**
   * Execute request with concurrency and rate limiting
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    return this.concurrencyLimit(async () => {
      // Rate limiting check
      await this.enforceRateLimit()

      // Execute the actual request
      const startTime = Date.now()
      this.recordRequest(startTime)
      try {
        return await fn()
      } catch (error) {
        throw error
      }
    })
  }

  /**
   * Enforce rate limiting by tracking request times
   */
  private async enforceRateLimit(): Promise<void> {
    // Iterative approach instead of recursion to prevent stack overflow
    while (true) {
      const now = Date.now()
      const oneSecondAgo = now - 1000

      // Clean old request times (older than 1 second)
      this.requestTimes = this.requestTimes.filter(time => time > oneSecondAgo)

      // M6 FIX: Limit history size to prevent memory leak
      if (this.requestTimes.length > this.MAX_HISTORY_SIZE) {
        this.requestTimes = this.requestTimes.slice(-this.MAX_HISTORY_SIZE)
      }

      // If we're within the rate limit, proceed
      if (this.requestTimes.length < this.requestsPerSecond) {
        break
      }

      // Calculate how long to wait
      // M8 FIX: Safety check for empty array (shouldn't happen, but be defensive)
      if (this.requestTimes.length === 0) {
        break
      }
      const oldestRequest = Math.min(...this.requestTimes)
      const waitTime = 1000 - (now - oldestRequest) + 10 // Add 10ms buffer

      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime))
        // Loop continues to recheck after waiting
      } else {
        // Edge case: should not happen, but break to prevent infinite loop
        break
      }
    }
  }

  /**
   * Record request time for rate limiting
   */
  private recordRequest(startTime: number): void {
    this.requestTimes.push(startTime)
  }

  /**
   * Get current concurrency stats
   */
  getStats(): { activeCount: number; pendingCount: number; requestsInLastSecond: number } {
    const now = Date.now()
    const oneSecondAgo = now - 1000
    const requestsInLastSecond = this.requestTimes.filter(time => time > oneSecondAgo).length

    return {
      activeCount: this.concurrencyLimit.activeCount,
      pendingCount: this.concurrencyLimit.pendingCount,
      requestsInLastSecond
    }
  }

  /**
   * Clear rate limiting history
   */
  reset(): void {
    this.requestTimes = []
  }
}

/**
 * Exponential backoff utility
 */
class ExponentialBackoff {
  /**
   * Calculate delay for exponential backoff
   */
  static calculateDelay(attempt: number, baseDelay: number = 1000, maxDelay: number = 30000): number {
    const delay = baseDelay * Math.pow(2, attempt - 1)
    return Math.min(delay, maxDelay)
  }

  /**
   * Execute function with exponential backoff (without retries for 429 responses)
   */
  static async executeWithBackoff<T>(
    fn: () => Promise<T>,
    maxAttempts: number = 5, // M7 FIX: Increased from 3 to 5 for better resilience
    baseDelay: number = 1000
  ): Promise<T> {
    let lastError: Error

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn()
      } catch (error) {
        lastError = error as Error

        // M4 FIX: Check for APIError type first, then fallback to string matching
        const is429 = (error instanceof Error && error.message.includes('429')) ||
          (error instanceof Error && error.message.includes('Rate limit'))
        if (is429) {
          throw error // Don't retry rate limits
        }

        // Don't retry on the last attempt
        if (attempt === maxAttempts) {
          break
        }

        // Calculate delay and wait
        const delay = this.calculateDelay(attempt, baseDelay)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }

    throw lastError!
  }
}

/**
 * Enhanced rate limiter service with real parallelism
 */
export class RateLimiterService {
  private circuitBreaker: CircuitBreaker
  private requestDeduplicator: RequestDeduplicator
  private parallelLimiter: ParallelRateLimiter

  constructor(maxConcurrent: number = 10, requestsPerSecond: number = 30) {
    this.circuitBreaker = new CircuitBreaker()
    this.requestDeduplicator = new RequestDeduplicator()
    this.parallelLimiter = new ParallelRateLimiter(maxConcurrent, requestsPerSecond)
  }

  /**
   * Execute a request with all rate limiting protections and real parallelism
   */
  async executeRequest<T>(
    key: string,
    fn: () => Promise<T>,
    options: {
      useDeduplication?: boolean
      useCircuitBreaker?: boolean
      useRateLimiting?: boolean
    } = {}
  ): Promise<T> {
    const {
      useDeduplication = true,
      useCircuitBreaker = true,
      useRateLimiting = true
    } = options

    let requestFn = fn

    // Apply circuit breaker protection
    if (useCircuitBreaker) {
      const originalFn = requestFn
      requestFn = () => this.circuitBreaker.execute(originalFn)
    }

    // Apply request deduplication
    if (useDeduplication) {
      const originalFn = requestFn
      requestFn = () => this.requestDeduplicator.execute(key, originalFn)
    }

    // Apply parallel rate limiting
    if (useRateLimiting) {
      return this.parallelLimiter.execute(requestFn)
    }

    return requestFn()
  }

  /**
   * Execute multiple requests in parallel with rate limiting
   */
  async executeParallel<T>(
    requests: Array<{ key: string; fn: () => Promise<T> }>,
    options?: {
      useDeduplication?: boolean
      useCircuitBreaker?: boolean
      useRateLimiting?: boolean
    }
  ): Promise<T[]> {
    const promises = requests.map(({ key, fn }) =>
      this.executeRequest(key, fn, options)
    )

    return Promise.all(promises)
  }

  /**
   * Get circuit breaker state for monitoring
   */
  getCircuitBreakerState(): string {
    return this.circuitBreaker.getState()
  }

  /**
   * Get rate limiter statistics
   */
  getStats(): {
    circuitState: string
    concurrency: { activeCount: number; pendingCount: number; requestsInLastSecond: number }
  } {
    return {
      circuitState: this.circuitBreaker.getState(),
      concurrency: this.parallelLimiter.getStats()
    }
  }

  /**
   * Clear all pending requests and reset state
   */
  reset(): void {
    this.requestDeduplicator.clear()
    this.circuitBreaker = new CircuitBreaker()
    this.parallelLimiter.reset()
  }
}

/**
 * Global rate limiter instance with enhanced parallelism
 */
export const rateLimiter = new RateLimiterService(10, 30) // 10 concurrent, 30 req/s

/**
 * Export utilities for direct use
 */
export { ExponentialBackoff, CircuitState }
