import { Config } from './types'

/**
 * Application configuration loaded from environment variables
 */
export const config: Config = {
  OPINION_API_KEY: process.env.OPINION_API_KEY || '',
  OPINION_BASE_URL: process.env.OPINION_BASE_URL || 'https://openapi.opinion.trade/openapi',
  // MINOR FIX: Handle NaN from parseInt
  CACHE_MAX_SIZE: parseInt(process.env.CACHE_MAX_SIZE || '1000') || 1000,
  API_TIMEOUT: parseInt(process.env.API_TIMEOUT || '10000') || 10000,
}

/**
 * Validate that required environment variables are present
 */
export const validateConfig = (): void => {
  if (!config.OPINION_API_KEY) {
    throw new Error('OPINION_API_KEY environment variable is required')
  }

  if (!config.OPINION_BASE_URL) {
    throw new Error('OPINION_BASE_URL environment variable is required')
  }
}

/**
 * Get configuration with validation
 */
export const getConfig = (): Config => {
  validateConfig()
  return config
}