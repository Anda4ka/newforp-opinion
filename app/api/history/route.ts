import { NextRequest, NextResponse } from 'next/server'
import { opinionClient } from '@/lib/opinionClient'
import { withErrorHandler } from '@/lib/errorHandler'

/**
 * GET /api/history?tokenId=...&interval=1h
 * Returns price history for a token
 */
async function historyHandler(request: NextRequest): Promise<NextResponse> {
    const { searchParams } = new URL(request.url)
    const tokenId = searchParams.get('tokenId')
    const interval = searchParams.get('interval') || '1h'

    if (!tokenId) {
        return NextResponse.json({ error: 'Missing tokenId' }, { status: 400 })
    }

    const history = await opinionClient.getPriceHistory(tokenId, interval)

    return NextResponse.json({ history })
}

export const GET = withErrorHandler(historyHandler)
