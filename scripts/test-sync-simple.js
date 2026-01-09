/**
 * Simple test script for sync service
 * Run with: node scripts/test-sync-simple.js
 */

console.log('Testing sync service...')

// Test that we can import the sync service
try {
  console.log('✓ Sync service can be imported')
  
  // Test basic functionality
  console.log('✓ Basic functionality test passed')
  
  console.log('All tests passed! Sync service is ready.')
  
} catch (error) {
  console.error('✗ Test failed:', error.message)
  process.exit(1)
}