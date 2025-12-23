'use client'

import { useCallback, useMemo, useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import useSWR from 'swr'
import type { ClassValue } from 'clsx'
import clsx from 'clsx'
import { twMerge } from 'tailwind-merge'
import {
  Activity,
  ArrowUpRight,
  LineChart as LineChartIcon,
  Wallet,
  X,
  TrendingUp,
  TrendingDown,
} from 'lucide-react'
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import type { MarketMover, UserPosition } from '@/lib/types'

function cn(...classes: ClassValue[]) {
  return twMerge(clsx(classes))
}

const fetcher = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`)
  }
  return res.json() as Promise<T>
}

function formatPct(value: number) {
  const pct = value * 100
  const sign = pct > 0 ? '+' : ''
  return `${sign}${pct.toFixed(2)}%`
}

function formatUsdCompact(value: number) {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(value)
}

function hashString(input: string) {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function buildPlaceholderSeries(tokenId: string) {
  const seed = hashString(tokenId || 'token')
  let x = seed

  const rand = () => {
    // xorshift32
    x ^= x << 13
    x ^= x >>> 17
    x ^= x << 5
    return (x >>> 0) / 4294967296
  }

  const points = 36
  let price = 0.45 + (seed % 30) / 100
  const data = []
  for (let i = 0; i < points; i++) {
    price = Math.max(0.02, Math.min(0.98, price + (rand() - 0.5) * 0.06))
    data.push({ idx: i, price: Number(price.toFixed(3)) })
  }
  return data
}

interface MarketWithPrices {
  id: number
  title: string
  yesTokenId: string
  noTokenId: string
  yesPrice: number
  noPrice: number
  volume24h: string
  priceChangePct?: number
  cutoffAt: number
}

function SkeletonCard() {
  return (
    <div className="h-40 w-full animate-pulse rounded-2xl bg-slate-900/40 backdrop-blur-sm ring-1 ring-white/10" />
  )
}

function EmptyState({ label }: { label: ReactNode }) {
  return (
    <div className="col-span-full flex h-40 items-center justify-center rounded-2xl bg-slate-900/40 backdrop-blur-sm ring-1 ring-white/10 p-6 text-sm text-slate-400">
      {label}
    </div>
  )
}

function ChartModal({
  market,
  onClose,
}: {
  market: MarketWithPrices
  onClose: () => void
}) {
  // Use useMemo to prevent hydration mismatch - generate data on client side only
  const data = useMemo(() => {
    if (typeof window === 'undefined') return []
    return buildPlaceholderSeries(market.yesTokenId)
  }, [market.yesTokenId])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Price history chart"
    >
      <button
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close modal"
      />

      <div className="relative w-full max-w-4xl overflow-hidden rounded-2xl bg-slate-900/95 backdrop-blur-xl ring-1 ring-white/10 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <LineChartIcon className="h-5 w-5 text-slate-300" />
              <div className="text-base font-semibold text-slate-100">Price History</div>
            </div>
            <div className="mt-1 truncate text-sm text-slate-400">{market.title}</div>
            <div className="mt-1 text-xs text-slate-500">
              Token: <span className="font-mono text-slate-400">{market.yesTokenId.slice(0, 20)}…</span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-slate-800/50 text-slate-200 ring-1 ring-white/10 hover:bg-slate-800 transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6">
          <div className="h-[360px] rounded-xl bg-slate-900/40 backdrop-blur-sm ring-1 ring-white/10 p-4">
            {data.length > 0 && (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 16, right: 16, bottom: 8, left: 0 }}>
                  <XAxis dataKey="idx" hide />
                  <YAxis domain={[0, 1]} tick={{ fill: '#94a3b8', fontSize: 12 }} width={32} />
                  <Tooltip
                    contentStyle={{
                      background: 'rgba(15,23,42,0.95)',
                      border: '1px solid rgba(255,255,255,0.10)',
                      borderRadius: 12,
                      color: '#e2e8f0',
                    }}
                    labelStyle={{ color: '#94a3b8' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="price"
                    stroke="#60a5fa"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Home() {
  const [walletInput, setWalletInput] = useState('')
  const [watchedAddress, setWatchedAddress] = useState<string>('')
  const [selectedMarket, setSelectedMarket] = useState<MarketWithPrices | null>(null)
  const [page, setPage] = useState(1)
  const [allMarkets, setAllMarkets] = useState<MarketWithPrices[]>([])
  const [hasMore, setHasMore] = useState(true)

  const onWatch = useCallback(() => {
    setWatchedAddress(walletInput.trim())
  }, [walletInput])

  // Fetch markets with pagination
  const { data: marketsData, error: marketsError, isLoading: marketsLoading } = useSWR<{
    markets: MarketWithPrices[]
    total: number
  }>(
    `/api/markets/list?page=${page}`,
    fetcher,
    { refreshInterval: 30_000, revalidateOnFocus: false }
  )

  // Update allMarkets when new data arrives
  useEffect(() => {
    if (marketsData?.markets) {
      if (page === 1) {
        // Reset on first page
        setAllMarkets(marketsData.markets)
        // Check if there are more pages
        setHasMore(marketsData.markets.length === 20 && marketsData.markets.length < marketsData.total)
      } else {
        // Append new markets
        setAllMarkets(prev => {
          const updated = [...prev, ...marketsData.markets]
          // Check if there are more pages
          setHasMore(marketsData.markets.length === 20 && updated.length < marketsData.total)
          return updated
        })
      }
    }
  }, [marketsData, page])

  const loadMore = useCallback(() => {
    if (!marketsLoading && hasMore) {
      setPage(prev => prev + 1)
    }
  }, [marketsLoading, hasMore])

  const positions = useSWR<UserPosition[]>(
    watchedAddress ? `/api/user/positions?address=${encodeURIComponent(watchedAddress)}` : null,
    fetcher,
    { refreshInterval: 30_000, revalidateOnFocus: false }
  )

  return (
    <main className="min-h-screen bg-slate-950">
      <div className="mx-auto w-full max-w-[1920px] px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <header className="mb-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <Activity className="h-6 w-6 text-slate-300" />
                <div>
                  <h1 className="text-2xl font-semibold tracking-tight text-slate-100">
                    Market Explorer
                  </h1>
                  <p className="mt-1 text-sm text-slate-400">
                    Browse all active prediction markets
                  </p>
                </div>
              </div>
            </div>

            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              <div className="relative w-full sm:w-[360px]">
                <Wallet className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={walletInput}
                  onChange={(e) => setWalletInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onWatch()
                  }}
                  placeholder="Watch wallet (0x...)"
                  className="w-full rounded-xl bg-slate-900/40 backdrop-blur-sm py-2.5 pl-10 pr-3 text-sm text-slate-100 ring-1 ring-white/10 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                />
              </div>
              <button
                onClick={onWatch}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
              >
                <ArrowUpRight className="h-4 w-4" />
                Watch
              </button>
            </div>
          </div>
        </header>

        {/* Markets Grid - Full Width */}
        <section className="mb-8">
          {marketsLoading && page === 1 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <SkeletonCard key={`skeleton-${i}`} />
              ))}
            </div>
          ) : marketsError ? (
            <EmptyState label="Failed to load markets. Please try again later." />
          ) : allMarkets.length === 0 ? (
            <EmptyState label="No markets available." />
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {allMarkets.map((market) => {
                  // Calculate price change if possible (simplified - could be enhanced with historical data)
                  const hasTrending = market.priceChangePct !== undefined
                  const isPositive = market.priceChangePct !== undefined && market.priceChangePct >= 0
                  
                  return (
                    <button
                      key={`market-${market.id}`}
                      onClick={() => setSelectedMarket(market)}
                      className="group relative overflow-hidden rounded-2xl bg-slate-900/40 backdrop-blur-sm ring-1 ring-white/10 p-5 text-left transition-all hover:ring-white/20 hover:bg-slate-900/50"
                    >
                      {/* Market Title - Top */}
                      <div className="mb-4">
                        <div className="line-clamp-2 text-sm font-semibold text-slate-100 group-hover:text-white transition-colors">
                          {market.title || `Market ${market.id}`}
                        </div>
                      </div>

                      {/* Prices and Info - Bottom as Tags */}
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-lg bg-slate-800/60 px-2.5 py-1 text-xs font-medium text-slate-300 ring-1 ring-white/5">
                          YES {market.yesPrice.toFixed(3)}
                        </span>
                        <span className="rounded-lg bg-slate-800/60 px-2.5 py-1 text-xs font-medium text-slate-300 ring-1 ring-white/5">
                          NO {market.noPrice.toFixed(3)}
                        </span>
                        {hasTrending && (
                          <span
                            className={cn(
                              'rounded-lg px-2.5 py-1 text-xs font-bold ring-1 flex items-center gap-1',
                              isPositive
                                ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/20'
                                : 'bg-rose-500/10 text-rose-300 ring-rose-500/20'
                            )}
                          >
                            {isPositive ? (
                              <TrendingUp className="h-3 w-3" />
                            ) : (
                              <TrendingDown className="h-3 w-3" />
                            )}
                            {formatPct(market.priceChangePct!)}
                          </span>
                        )}
                        <span className="ml-auto rounded-lg bg-slate-800/60 px-2.5 py-1 text-xs font-medium text-slate-400 ring-1 ring-white/5">
                          ${formatUsdCompact(Number(market.volume24h) || 0)}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>

              {/* Load More Button */}
              {hasMore && (
                <div className="mt-8 flex justify-center">
                  <button
                    onClick={loadMore}
                    disabled={marketsLoading}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-800/60 backdrop-blur-sm px-6 py-3 text-sm font-semibold text-slate-200 ring-1 ring-white/10 hover:bg-slate-800/80 hover:ring-white/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    {marketsLoading ? (
                      <>
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
                        Loading...
                      </>
                    ) : (
                      <>
                        Load More
                        <ArrowUpRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                </div>
              )}
            </>
          )}
        </section>

        {/* User Positions Section - Only if wallet is watched */}
        {watchedAddress && (
          <section className="mt-12">
            <div className="mb-4 flex items-center gap-2">
              <Wallet className="h-5 w-5 text-slate-300" />
              <h2 className="text-lg font-semibold text-slate-100">User Positions</h2>
              <span className="text-sm text-slate-400 font-mono">
                {watchedAddress.slice(0, 8)}…{watchedAddress.slice(-6)}
              </span>
            </div>

            {positions.isLoading ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <SkeletonCard key={`position-skeleton-${i}`} />
                ))}
              </div>
            ) : positions.error ? (
              <EmptyState label="Failed to load positions. Check console for details." />
            ) : (positions.data?.length || 0) === 0 ? (
              <EmptyState label="No positions found for this wallet address." />
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {(positions.data || []).map((p: UserPosition, idx) => {
                  const pnl = parseFloat(p.unrealizedPnl || '0')
                  const pnlPercent = parseFloat(p.unrealizedPnlPercent || '0')
                  const sharesOwned = parseFloat(p.sharesOwned || '0')
                  const currentValue = parseFloat(p.currentValueInQuoteToken || '0')
                  const isPositive = pnl >= 0
                  const outcomeColor = p.outcome === 'YES' ? 'text-emerald-300' : 'text-rose-300'

                  return (
                    <div
                      key={`position-${p.tokenId || p.marketId || idx}`}
                      className="group relative overflow-hidden rounded-2xl bg-slate-900/40 backdrop-blur-sm ring-1 ring-white/10 p-5 transition-all hover:ring-white/20 hover:bg-slate-900/50"
                    >
                      {/* Market Title - Top */}
                      <div className="mb-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="line-clamp-2 text-sm font-semibold text-slate-100">
                              {p.marketTitle || `Market ${p.marketId || idx}`}
                            </div>
                            {p.rootMarketTitle && (
                              <div className="mt-1 line-clamp-1 text-xs text-slate-500">
                                {p.rootMarketTitle}
                              </div>
                            )}
                          </div>
                          <span className={`shrink-0 text-xs font-bold ${outcomeColor}`}>
                            {p.outcome || 'N/A'}
                          </span>
                        </div>
                      </div>

                      {/* Info Tags - Bottom */}
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-lg bg-slate-800/60 px-2.5 py-1 text-xs font-medium text-slate-300 ring-1 ring-white/5">
                          Shares: {sharesOwned.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                        </span>
                        <span className="rounded-lg bg-slate-800/60 px-2.5 py-1 text-xs font-medium text-slate-300 ring-1 ring-white/5">
                          ${currentValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                        </span>
                        <span
                          className={cn(
                            'rounded-lg px-2.5 py-1 text-xs font-bold ring-1',
                            isPositive
                              ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/20'
                              : 'bg-rose-500/10 text-rose-300 ring-rose-500/20'
                          )}
                        >
                          {isPositive ? '+' : ''}${pnl.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                        </span>
                        <span
                          className={cn(
                            'rounded-lg px-2.5 py-1 text-xs font-bold ring-1',
                            isPositive
                              ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/20'
                              : 'bg-rose-500/10 text-rose-300 ring-rose-500/20'
                          )}
                        >
                          {isPositive ? '+' : ''}{(pnlPercent * 100).toFixed(2)}%
                        </span>
                        {p.sharesFrozen && parseFloat(p.sharesFrozen) > 0 && (
                          <span className="rounded-lg bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-300 ring-1 ring-amber-500/20">
                            🔒 {parseFloat(p.sharesFrozen).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        )}
      </div>

      {selectedMarket ? <ChartModal market={selectedMarket} onClose={() => setSelectedMarket(null)} /> : null}
    </main>
  )
}
