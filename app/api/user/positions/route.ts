import { NextRequest, NextResponse } from 'next/server'
import cache from '@/lib/cache'
import { opinionClient } from '@/lib/opinionClient'
import type { UserPosition } from '@/lib/types'

/**
 * GET /api/user/positions?address=0x...
 * Cached wrapper around Opinion positions endpoint to avoid frontend-driven rate limiting.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url)
  const address = (searchParams.get('address') || '').trim()

  if (!address) {
    return NextResponse.json([])
  }

  const cacheKey = `user-positions:${address}`
  const cached = cache.get<UserPosition[]>(cacheKey)
  if (cached) {
    return NextResponse.json(cached)
  }

  try {
    const positions = await opinionClient.getUserPositions(address)
    
    // TTL 15s per requirements
    cache.set(cacheKey, positions, 15)
    return NextResponse.json(positions)
  } catch (error) {
    // Log error for debugging but return empty array to keep UI functional
    console.error(`[API] Failed to fetch positions for ${address}:`, error)
    
    // Cache empty result briefly to avoid hammering failing endpoint
    cache.set(cacheKey, [], 15)
    return NextResponse.json([])
  }
}

