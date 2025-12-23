/**
 * Rate Limiting and Request Management System
 * Requirement 6.5: Implement rate limit mitigation mechanisms
 */

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
  ) {}

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
      this.onFailure()
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

  private onFailure(): void {
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
 * Request queue with delay for rate limit compliance
 */
class RequestQueue {
  private queue: Array<{
    fn: () => Promise<any>
    resolve: (value: any) => void
    reject: (error: any) => void
  }> = []
  private processing = false
  private lastRequestTime = 0

  constructor(
    private readonly minInterval: number = 100, // Minimum 100ms between requests
    private readonly maxConcurrent: number = 5   // Maximum 5 concurrent requests
  ) {}

  /**
   * Add a request to the queue
   */
  async enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ fn, resolve, reject })
      this.processQueue()
    })
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return
    }

    this.processing = true

    while (this.queue.length > 0) {
      const now = Date.now()
      const timeSinceLastRequest = now - this.lastRequestTime

      // Ensure minimum interval between requests
      if (timeSinceLastRequest < this.minInterval) {
        await this.delay(this.minInterval - timeSinceLastRequest)
      }

      const request = this.queue.shift()
      if (!request) break

      try {
        this.lastRequestTime = Date.now()
        const result = await request.fn()
        request.resolve(result)
      } catch (error) {
        request.reject(error)
      }
    }

    this.processing = false
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
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
    maxAttempts: number = 3,
    baseDelay: number = 1000
  ): Promise<T> {
    let lastError: Error

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn()
      } catch (error) {
        lastError = error as Error
        
        // Don't retry on 429 (rate limit) responses as per requirement
        if (error instanceof Error && error.message.includes('429')) {
          throw error
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
 * Rate limiter service that combines all mitigation strategies
 */
export class RateLimiterService {
  private circuitBreaker: CircuitBreaker
  private requestDeduplicator: RequestDeduplicator
  private requestQueue: RequestQueue

  constructor() {
    this.circuitBreaker = new CircuitBreaker()
    this.requestDeduplicator = new RequestDeduplicator()
    this.requestQueue = new RequestQueue()
  }

  /**
   * Execute a request with all rate limiting protections
   */
  async executeRequest<T>(
    key: string,
    fn: () => Promise<T>,
    options: {
      useQueue?: boolean
      useDeduplication?: boolean
      useCircuitBreaker?: boolean
    } = {}
  ): Promise<T> {
    const {
      useQueue = true,
      useDeduplication = true,
      useCircuitBreaker = true
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

    // Apply request queuing
    if (useQueue) {
      return this.requestQueue.enqueue(requestFn)
    }

    return requestFn()
  }

  /**
   * Get circuit breaker state for monitoring
   */
  getCircuitBreakerState(): string {
    return this.circuitBreaker.getState()
  }

  /**
   * Clear all pending requests and reset state
   */
  reset(): void {
    this.requestDeduplicator.clear()
    this.circuitBreaker = new CircuitBreaker()
    this.requestQueue = new RequestQueue()
  }
}

/**
 * Global rate limiter instance
 */
export const rateLimiter = new RateLimiterService()

/**
 * Export utilities for direct use
 */
export { ExponentialBackoff, CircuitState }