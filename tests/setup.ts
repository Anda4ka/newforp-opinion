/**
 * Test setup file for vitest
 * This file runs before all tests
 */

// Mock environment variables for testing
process.env.OPINION_API_KEY = 'test-api-key'
process.env.OPINION_BASE_URL = 'https://test-api.example.com'
process.env.CACHE_MAX_SIZE = '100'
process.env.API_TIMEOUT = '5000'