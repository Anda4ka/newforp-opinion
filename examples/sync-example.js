/**
 * Example of how to use the sync service
 * This demonstrates the background sync functionality
 */

const { syncService } = require('../lib/sync')

async function runSyncExample() {
  console.log('=== Sync Service Example ===')
  
  try {
    // Get current stats
    console.log('\n1. Getting current stats...')
    const stats = await syncService.getStats()
    console.log('Stats:', JSON.stringify(stats, null, 2))
    
    // Perform a single sync
    console.log('\n2. Performing single sync...')
    const result = await syncService.performSync()
    console.log('Sync result:', JSON.stringify(result, null, 2))
    
    // Check health
    console.log('\n3. Checking health...')
    const isHealthy = await syncService.isHealthy()
    console.log('Is healthy:', isHealthy)
    
    // Get last sync time
    console.log('\n4. Getting last sync time...')
    const lastSync = await syncService.getLastSyncTime()
    console.log('Last sync time:', lastSync ? new Date(lastSync).toISOString() : 'Never')
    
    console.log('\n=== Example completed successfully! ===')
    
  } catch (error) {
    console.error('Example failed:', error)
  }
}

// Run example if this script is executed directly
if (require.main === module) {
  runSyncExample()
}

module.exports = { runSyncExample }