import { describe, it, expect, beforeAll } from 'vitest'
import { createRedisClient } from '../../lib/redis'

describe('Redis Connection Integration', () => {
  let redisClient: ReturnType<typeof createRedisClient>

  beforeAll(() => {
    // Skip tests if Redis credentials are not provided
    if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
      console.log('Skipping Redis integration tests - credentials not provided')
      return
    }
    
    redisClient = createRedisClient()
  })

  it('should connect to Redis and ping successfully', async () => {
    // Skip if no credentials
    if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
      return
    }

    const result = await redisClient.ping()
    expect(result).toBe('PONG')
  })

  it('should perform basic get/set operations', async () => {
    // Skip if no credentials
    if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
      return
    }

    const testKey = `test:${Date.now()}`
    const testValue = 'test-value'

    // Set a value
    await redisClient.set(testKey, testValue)

    // Get the value back
    const result = await redisClient.get(testKey)
    expect(result).toBe(testValue)

    // Clean up - set with short TTL
    await redisClient.set(testKey, testValue, 1)
  })
})