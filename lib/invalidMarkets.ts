const invalidMarketIds = new Set<number>()

export const markMarketInvalid = (marketId: number): void => {
  if (!Number.isNaN(marketId)) {
    invalidMarketIds.add(marketId)
  }
}

export const isMarketInvalid = (marketId: number): boolean => invalidMarketIds.has(marketId)
