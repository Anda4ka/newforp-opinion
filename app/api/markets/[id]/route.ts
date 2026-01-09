import { NextRequest, NextResponse } from 'next/server'
import { opinionClient } from '@/lib/opinionClient'
import { withErrorHandler } from '@/lib/errorHandler'
import { isMarketInvalid, markMarketInvalid } from '@/lib/invalidMarkets'

/**
 * GET /api/markets/[id]
 * Returns detailed market information
 */
async function marketDetailHandler(
    request: NextRequest,
    { params }: { params: { id: string } }
): Promise<NextResponse> {
    const marketId = parseInt(params.id)
    if (isNaN(marketId)) {
        return NextResponse.json({ error: 'Invalid market ID' }, { status: 400 })
    }
    if (isMarketInvalid(marketId)) {
        return NextResponse.json({ error: 'Market not found' }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    // Allow client to hint if it's categorical to save a request/guess
    const isCategorical = searchParams.get('type') === '1'

    // Fetch detail
    const market = await opinionClient.getMarketDetail(marketId, isCategorical)

    if (!market) {
        // If failed and we relied on a hint (or default), maybe try the other type?
        // But for now, let's assume the link from the list is correct or the client handles it.
        // If we want to be robust, we could try the other type here if the first returns null.
        // However, opinionClient.getMarketDetail returns null on failure.
        // If we want to support deep linking without type knowledge, we might need a double-check here.
        if (!isCategorical) {
            // Try categorical if binary failed (simple fallback)
            const categoricalMarket = await opinionClient.getMarketDetail(marketId, true)
            if (categoricalMarket) {
                console.log(`[API] Found categorical market ${marketId} after binary fail`)
                return NextResponse.json(categoricalMarket)
            }
        }
        markMarketInvalid(marketId)
        return NextResponse.json({ error: 'Market not found' }, { status: 404 })
    }

    return NextResponse.json(market)
}

export const GET = withErrorHandler(marketDetailHandler)
