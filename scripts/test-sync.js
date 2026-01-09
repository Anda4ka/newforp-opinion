/**
 * Test script for sync service
 * Run with: node scripts/test-sync.js
 */

const { syncService } = require('../lib/sync.ts')

async function testSync() {
  console.log('Testing sync service...')
  
  try {
    // Test single sync
    console.log('Running single sync...')
    const result = await syncService.performSync()
    console.log('Sync result:', result)
    
    // Test stats
    console.log('Getting stats...')
    const stats = await syncService.getStats()
    console.log('Stats:', stats)
    
    // Test health check
    console.log('Checking health...')
    const isHealthy = await syncService.isHealthy()
    console.log('Is healthy:', isHealthy)
    
    console.log('Sync service test completed successfully!')
    
  } catch (error) {
    console.error('Sync service test failed:', error)
  }
}

// Run test if this script is executed directly
if (require.main === module) {
  testSync()
}

module.exports = { testSync }