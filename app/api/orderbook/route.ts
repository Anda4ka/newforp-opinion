import { NextRequest, NextResponse } from 'next/server'
import { opinionClient } from '@/lib/opinionClient'
import { withErrorHandler, InputValidator } from '@/lib/errorHandler'

/**
 * GET /api/orderbook?tokenId=...
 * Returns orderbook for a token
 */
async function orderbookHandler(request: NextRequest): Promise<NextResponse> {
    const { searchParams } = new URL(request.url)
    const tokenIdParam = searchParams.get('tokenId')

    // M2 FIX: Add input validation
    const tokenId = InputValidator.validateTokenId(tokenIdParam, 'tokenId')

    const orderbook = await opinionClient.getOrderbook(tokenId)

    if (!orderbook) {
        // Return empty orderbook structure instead of 404 to allow UI to render empty state gracefully
        return NextResponse.json({
            market: '',
            tokenId,
            timestamp: Date.now(),
            bids: [],
            asks: []
        })
    }

    return NextResponse.json(orderbook)
}

export const GET = withErrorHandler(orderbookHandler)
