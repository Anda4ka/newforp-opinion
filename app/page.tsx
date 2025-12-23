'use client'

import { useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import useSWR from 'swr'
import type { ClassValue } from 'clsx'
import clsx from 'clsx'
import { twMerge } from 'tailwind-merge'
import {
  Activity,
  ArrowUpRight,
  LineChart as LineChartIcon,
  TrendingUp,
  Wallet,
  X,
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

function SkeletonCard() {
  return (
    <div className="h-32 w-full animate-pulse rounded-2xl bg-slate-900/40 backdrop-blur-sm ring-1 ring-white/10" />
  )
}

function EmptyState({ label }: { label: ReactNode }) {
  return (
    <div className="col-span-full flex h-32 items-center justify-center rounded-2xl bg-slate-900/40 backdrop-blur-sm ring-1 ring-white/10 p-6 text-sm text-slate-400">
      {label}
    </div>
  )
}

function ChartModal({
  mover,
  onClose,
}: {
  mover: MarketMover
  onClose: () => void
}) {
  const data = useMemo(() => buildPlaceholderSeries(mover.yesTokenId), [mover.yesTokenId])

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
            <div className="mt-1 truncate text-sm text-slate-400">{mover.marketTitle}</div>
            <div className="mt-1 text-xs text-slate-500">
              Token: <span className="font-mono text-slate-400">{mover.yesTokenId.slice(0, 20)}…</span>
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
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Home() {
  const [walletInput, setWalletInput] = useState('')
  const [watchedAddress, setWatchedAddress] = useState<string>('')
  const [selectedMover, setSelectedMover] = useState<MarketMover | null>(null)

  const onWatch = useCallback(() => {
    setWatchedAddress(walletInput.trim())
  }, [walletInput])

  const movers = useSWR<MarketMover[]>(
    '/api/markets/movers?timeframe=24h',
    fetcher,
    { refreshInterval: 30_000, revalidateOnFocus: false }
  )

  const positions = useSWR<UserPosition[]>(
    watchedAddress ? `/api/user/positions?address=${encodeURIComponent(watchedAddress)}` : null,
    fetcher,
    { refreshInterval: 30_000, revalidateOnFocus: false }
  )

  return (
    <main className="min-h-screen bg-slate-950">
      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <header className="mb-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <Activity className="h-6 w-6 text-slate-300" />
                <div>
                  <h1 className="text-2xl font-semibold tracking-tight text-slate-100">
                    Prediction Markets Dashboard
                  </h1>
                  <p className="mt-1 text-sm text-slate-400">
                    Track market movers and monitor wallet positions
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

        {/* Top Movers Section */}
        <section className="mb-8">
          <div className="mb-4 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-slate-300" />
            <h2 className="text-lg font-semibold text-slate-100">Top Movers</h2>
            <span className="text-sm text-slate-400">Biggest 24h market-price changes</span>
          </div>

          {movers.isLoading ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : movers.error ? (
            <EmptyState label="Failed to load movers. Please try again later." />
          ) : (movers.data?.length || 0) === 0 ? (
            <EmptyState label="No mover data available." />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-2">
              {(movers.data || []).map((m) => {
                const positive = m.priceChangePct >= 0
                return (
                  <button
                    key={m.marketId}
                    onClick={() => setSelectedMover(m)}
                    className="group relative overflow-hidden rounded-2xl bg-slate-900/40 backdrop-blur-sm ring-1 ring-white/10 p-5 text-left transition-all hover:ring-white/20 hover:bg-slate-900/50"
                  >
                    {/* Market Title - Top */}
                    <div className="mb-4">
                      <div className="line-clamp-2 text-sm font-semibold text-slate-100 group-hover:text-white transition-colors">
                        {m.marketTitle}
                      </div>
                    </div>

                    {/* Prices and Change - Bottom as Tags */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-lg bg-slate-800/60 px-2.5 py-1 text-xs font-medium text-slate-300 ring-1 ring-white/5">
                        YES {m.yesPrice.toFixed(3)}
                      </span>
                      <span className="rounded-lg bg-slate-800/60 px-2.5 py-1 text-xs font-medium text-slate-300 ring-1 ring-white/5">
                        NO {m.noPrice.toFixed(3)}
                      </span>
                      <span
                        className={cn(
                          'rounded-lg px-2.5 py-1 text-xs font-bold ring-1',
                          positive
                            ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/20'
                            : 'bg-rose-500/10 text-rose-300 ring-rose-500/20'
                        )}
                      >
                        {formatPct(m.priceChangePct)}
                      </span>
                      <span className="ml-auto rounded-lg bg-slate-800/60 px-2.5 py-1 text-xs font-medium text-slate-400 ring-1 ring-white/5">
                        ${formatUsdCompact(Number(m.volume24h) || 0)}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </section>

        {/* User Positions Section */}
        {watchedAddress && (
          <section>
            <div className="mb-4 flex items-center gap-2">
              <Wallet className="h-5 w-5 text-slate-300" />
              <h2 className="text-lg font-semibold text-slate-100">User Positions</h2>
              <span className="text-sm text-slate-400 font-mono">
                {watchedAddress.slice(0, 8)}…{watchedAddress.slice(-6)}
              </span>
            </div>

            {positions.isLoading ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <SkeletonCard key={i} />
                ))}
              </div>
            ) : positions.error ? (
              <EmptyState label="Failed to load positions. Check console for details." />
            ) : (positions.data?.length || 0) === 0 ? (
              <EmptyState label="No positions found for this wallet address." />
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-2">
                {(positions.data || []).map((p: UserPosition, idx) => {
                  const pnl = parseFloat(p.unrealizedPnl || '0')
                  const pnlPercent = parseFloat(p.unrealizedPnlPercent || '0')
                  const sharesOwned = parseFloat(p.sharesOwned || '0')
                  const currentValue = parseFloat(p.currentValueInQuoteToken || '0')
                  const avgPrice = parseFloat(p.avgEntryPrice || '0')
                  const isPositive = pnl >= 0
                  const outcomeColor = p.outcome === 'YES' ? 'text-emerald-300' : 'text-rose-300'

                  return (
                    <div
                      key={p.tokenId || `${p.marketId}:${idx}`}
                      className="group relative overflow-hidden rounded-2xl bg-slate-900/40 backdrop-blur-sm ring-1 ring-white/10 p-5 transition-all hover:ring-white/20 hover:bg-slate-900/50"
                    >
                      {/* Market Title - Top */}
                      <div className="mb-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="line-clamp-2 text-sm font-semibold text-slate-100">
                              {p.marketTitle || `Market ${p.marketId}`}
                            </div>
                            {p.rootMarketTitle && (
                              <div className="mt-1 line-clamp-1 text-xs text-slate-500">
                                {p.rootMarketTitle}
                              </div>
                            )}
                          </div>
                          <span className={`shrink-0 text-xs font-bold ${outcomeColor}`}>
                            {p.outcome}
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
                            🔒 {parseFloat(p.sharesFrozen).toLocaleString('en-US', { maximumFractionDigits: 0 })} frozen
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

      {selectedMover ? <ChartModal mover={selectedMover} onClose={() => setSelectedMover(null)} /> : null}
    </main>
  )
}
