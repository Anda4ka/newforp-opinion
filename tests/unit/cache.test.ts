import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { InMemoryCache } from '../../lib/cache'

describe('InMemoryCache', () => {
  let cache: InMemoryCache

  beforeEach(() => {
    cache = new InMemoryCache(5) // Small cache for testing
  })

  afterEach(() => {
    cache.stopCleanup()
  })

  it('should store and retrieve data', () => {
    const testData = { message: 'hello world' }
    cache.set('test-key', testData, 60)
    
    const retrieved = cache.get('test-key')
    expect(retrieved).toEqual(testData)
  })

  it('should return null for non-existent keys', () => {
    const result = cache.get('non-existent')
    expect(result).toBeNull()
  })

  it('should expire data after TTL', () => {
    const testData = { message: 'expires soon' }
    cache.set('expire-key', testData, 0.001) // 1ms TTL
    
    // Should be available immediately
    expect(cache.get('expire-key')).toEqual(testData)
    
    // Wait for expiration
    return new Promise(resolve => {
      setTimeout(() => {
        expect(cache.get('expire-key')).toBeNull()
        resolve(undefined)
      }, 10)
    })
  })

  it('should clear all data', () => {
    cache.set('key1', 'data1', 60)
    cache.set('key2', 'data2', 60)
    
    expect(cache.size()).toBe(2)
    
    cache.clear()
    
    expect(cache.size()).toBe(0)
    expect(cache.get('key1')).toBeNull()
    expect(cache.get('key2')).toBeNull()
  })

  it('should evict oldest entries when at capacity', () => {
    // Fill cache to capacity
    for (let i = 0; i < 5; i++) {
      cache.set(`key${i}`, `data${i}`, 60)
    }
    
    expect(cache.size()).toBe(5)
    
    // Add one more to trigger eviction
    cache.set('key5', 'data5', 60)
    
    // Should still be at capacity (evicted oldest)
    expect(cache.size()).toBeLessThanOrEqual(5)
    
    // The newest entry should still be there
    expect(cache.get('key5')).toBe('data5')
  })

  it('should handle different data types', () => {
    const stringData = 'test string'
    const numberData = 42
    const objectData = { nested: { value: true } }
    const arrayData = [1, 2, 3]
    
    cache.set('string', stringData, 60)
    cache.set('number', numberData, 60)
    cache.set('object', objectData, 60)
    cache.set('array', arrayData, 60)
    
    expect(cache.get('string')).toBe(stringData)
    expect(cache.get('number')).toBe(numberData)
    expect(cache.get('object')).toEqual(objectData)
    expect(cache.get('array')).toEqual(arrayData)
  })
})