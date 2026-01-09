import { NextRequest, NextResponse } from 'next/server'
import { opinionClient } from '@/lib/opinionClient'
import { withErrorHandler, InputValidator } from '@/lib/errorHandler'

/**
 * GET /api/history?tokenId=...&interval=1h
 * Returns price history for a token
 */
async function historyHandler(request: NextRequest): Promise<NextResponse> {
    const { searchParams } = new URL(request.url)
    const tokenIdParam = searchParams.get('tokenId')
    const intervalParam = searchParams.get('interval')

    // M2 FIX: Add input validation
    const tokenId = InputValidator.validateTokenId(tokenIdParam, 'tokenId')
    const interval = InputValidator.validateInterval(intervalParam)

    const history = await opinionClient.getPriceHistory(tokenId, interval)

    return NextResponse.json({ history })
}

export const GET = withErrorHandler(historyHandler)
