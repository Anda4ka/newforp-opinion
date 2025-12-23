import { NextRequest, NextResponse } from 'next/server'
import cache from '@/lib/cache'
import { opinionClient } from '@/lib/opinionClient'

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
  const cached = cache.get<any[]>(cacheKey)
  if (cached) {
    return NextResponse.json(cached)
  }

  const positions = await opinionClient.getUserPositions(address)

  // TTL 15s per requirements
  cache.set(cacheKey, positions, 15)
  return NextResponse.json(positions)
}

