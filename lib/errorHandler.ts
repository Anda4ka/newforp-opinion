import { NextRequest, NextResponse } from 'next/server'

/**
 * Error types for classification and handling
 */
export enum ErrorType {
  VALIDATION = 'VALIDATION',
  EXTERNAL_API = 'EXTERNAL_API',
  TIMEOUT = 'TIMEOUT',
  RATE_LIMIT = 'RATE_LIMIT',
  NOT_FOUND = 'NOT_FOUND',
  INTERNAL = 'INTERNAL'
}

/**
 * Structured error class for consistent error handling
 */
export class APIError extends Error {
  public readonly type: ErrorType
  public readonly statusCode: number
  public readonly details?: any

  constructor(
    message: string,
    type: ErrorType = ErrorType.INTERNAL,
    statusCode: number = 500,
    details?: any
  ) {
    super(message)
    this.name = 'APIError'
    this.type = type
    this.statusCode = statusCode
    this.details = details
  }
}

/**
 * Input validation utilities
 * Requirement 6.2: Add input validation and sanitization
 */
export class InputValidator {
  /**
   * Validate timeframe parameter for movers endpoint
   */
  static validateTimeframe(timeframe: string | null): string {
    if (timeframe === null) {
      return '24h' // Default value
    }
    
    const sanitized = timeframe.trim().toLowerCase()
    if (!['1h', '24h'].includes(sanitized)) {
      throw new APIError(
        'Invalid timeframe. Must be "1h" or "24h"',
        ErrorType.VALIDATION,
        400
      )
    }
    
    return sanitized
  }

  /**
   * Validate hours parameter for ending-soon endpoint
   */
  static validateHours(hoursParam: string | null): number {
    if (hoursParam === null) {
      return 24 // Default value
    }

    const sanitized = hoursParam.trim()
    const hours = parseInt(sanitized, 10)
    
    if (isNaN(hours) || hours <= 0 || hours > 8760) { // Max 1 year
      throw new APIError(
        'Invalid hours parameter. Must be a positive number between 1 and 8760',
        ErrorType.VALIDATION,
        400
      )
    }
    
    return hours
  }

  /**
   * Validate interval parameter for price history
   */
  static validateInterval(interval: string | null): string {
    if (interval === null) {
      return '1h' // Default value
    }
    
    const sanitized = interval.trim().toLowerCase()
    if (!['1h', '1d'].includes(sanitized)) {
      throw new APIError(
        'Invalid interval. Must be "1h" or "1d"',
        ErrorType.VALIDATION,
        400
      )
    }
    
    return sanitized
  }

  /**
   * Validate token ID parameters
   */
  static validateTokenId(tokenId: string | null, paramName: string): string {
    if (!tokenId || tokenId.trim().length === 0) {
      throw new APIError(
        `${paramName} parameter is required and cannot be empty`,
        ErrorType.VALIDATION,
        400
      )
    }
    
    const sanitized = tokenId.trim()
    
    // Basic sanitization - remove potentially harmful characters
    if (!/^[a-zA-Z0-9\-_]+$/.test(sanitized)) {
      throw new APIError(
        `Invalid ${paramName}. Must contain only alphanumeric characters, hyphens, and underscores`,
        ErrorType.VALIDATION,
        400
      )
    }
    
    return sanitized
  }
}

/**
 * Global error handler wrapper for API routes
 * Requirement 6.2, 6.4: Implement graceful degradation for external API failures
 */
export function withErrorHandler<T extends any[]>(
  handler: (request: NextRequest, ...args: T) => Promise<NextResponse>
) {
  return async (request: NextRequest, ...args: T): Promise<NextResponse> => {
    try {
      return await handler(request, ...args)
    } catch (error) {
      return handleError(error, request)
    }
  }
}

/**
 * Centralized error handling logic
 */
function handleError(error: unknown, request: NextRequest): NextResponse {
  // Log error for debugging (in production, use proper logging service)
  console.error('API Error:', {
    url: request.url,
    method: request.method,
    error: error instanceof Error ? error.message : 'Unknown error',
    stack: error instanceof Error ? error.stack : undefined,
    timestamp: new Date().toISOString()
  })

  // Handle known API errors
  if (error instanceof APIError) {
    return NextResponse.json(
      {
        error: error.message,
        type: error.type,
        ...(error.details && { details: error.details })
      },
      { status: error.statusCode }
    )
  }

  // Handle external API errors
  if (error instanceof Error) {
    if (error.message.includes('Opinion API')) {
      return NextResponse.json(
        {
          error: 'External service temporarily unavailable. Please try again later.',
          type: ErrorType.EXTERNAL_API
        },
        { status: 503 }
      )
    }

    if (error.message.includes('timeout')) {
      return NextResponse.json(
        {
          error: 'Request timeout. Please try again.',
          type: ErrorType.TIMEOUT
        },
        { status: 408 }
      )
    }

    if (error.message.includes('rate limit') || error.message.includes('429')) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded. Please try again later.',
          type: ErrorType.RATE_LIMIT
        },
        { status: 429 }
      )
    }
  }

  // Default internal server error
  return NextResponse.json(
    {
      error: 'Internal server error. Please try again later.',
      type: ErrorType.INTERNAL
    },
    { status: 500 }
  )
}

/**
 * Utility function to create standardized error responses
 */
export function createErrorResponse(
  message: string,
  type: ErrorType,
  statusCode: number,
  details?: any
): NextResponse {
  return NextResponse.json(
    {
      error: message,
      type,
      ...(details && { details })
    },
    { status: statusCode }
  )
}