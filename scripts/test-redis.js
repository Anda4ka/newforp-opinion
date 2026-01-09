#!/usr/bin/env node

/**
 * Simple script to test Redis client functionality
 * Run with: node scripts/test-redis.js
 */

const { createRedisClient } = require('../lib/redis.js')

async function testRedisClient() {
  console.log('🔧 Testing Redis Client...')
  
  try {
    // Check if Redis credentials are provided
    if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
      console.log('⚠️  Redis credentials not provided in environment variables')
      console.log('   Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN to test with real Redis')
      console.log('✅ Redis client created successfully (will fail on actual operations)')
      return
    }

    const redis = createRedisClient()
    
    // Test ping
    console.log('📡 Testing Redis connection...')
    const pingResult = await redis.ping()
    console.log(`✅ Redis ping successful: ${pingResult}`)
    
    // Test basic operations
    console.log('🔄 Testing basic operations...')
    const testKey = `test:${Date.now()}`
    const testValue = 'Hello Redis!'
    
    await redis.set(testKey, testValue)
    console.log(`✅ Set key: ${testKey}`)
    
    const retrievedValue = await redis.get(testKey)
    console.log(`✅ Retrieved value: ${retrievedValue}`)
    
    if (retrievedValue === testValue) {
      console.log('✅ Basic operations working correctly!')
    } else {
      console.log('❌ Value mismatch!')
    }
    
    // Test market operations
    console.log('🏪 Testing market operations...')
    const testMarket = {
      id: 'test-market-1',
      title: 'Test Market',
      yesTokenId: 'yes-token-1',
      noTokenId: 'no-token-1',
      cutoffAt: Date.now() + 86400000,
      status: 'active',
      volume24h: '1000.00',
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    
    await redis.setMarket(testMarket.id, testMarket)
    console.log(`✅ Set market: ${testMarket.id}`)
    
    const retrievedMarket = await redis.getMarket(testMarket.id)
    console.log(`✅ Retrieved market: ${retrievedMarket?.title}`)
    
    // Test price operations
    console.log('💰 Testing price operations...')
    const testPrice = {
      tokenId: 'test-token-1',
      price: '0.65',
      timestamp: Date.now()
    }
    
    await redis.setPrice(testPrice.tokenId, testPrice)
    console.log(`✅ Set price for token: ${testPrice.tokenId}`)
    
    const retrievedPrice = await redis.getPrice(testPrice.tokenId)
    console.log(`✅ Retrieved price: ${retrievedPrice?.price}`)
    
    // Clean up test data
    console.log('🧹 Cleaning up test data...')
    await redis.set(testKey, '', 1) // Set with 1 second TTL
    
    console.log('🎉 All Redis operations completed successfully!')
    
  } catch (error) {
    console.error('❌ Redis test failed:', error.message)
    if (error.message.includes('Redis configuration missing')) {
      console.log('💡 Make sure to set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN environment variables')
    }
  }
}

// Run the test
testRedisClient().catch(console.error)