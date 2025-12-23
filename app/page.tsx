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

function SectionHeader({
  icon,
  title,
  subtitle,
}: {
  icon: ReactNode
  title: string
  subtitle?: string
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900/70 ring-1 ring-white/10">
          {icon}
        </span>
        <div>
          <div className="text-sm font-semibold text-slate-100">{title}</div>
          {subtitle ? <div className="text-xs text-slate-400">{subtitle}</div> : null}
        </div>
      </div>
    </div>
  )
}

function SkeletonList({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-16 w-full animate-pulse rounded-xl bg-slate-900/50 ring-1 ring-white/5"
        />
      ))}
    </div>
  )
}

function EmptyState({ label }: { label: ReactNode }) {
  return (
    <div className="rounded-xl bg-slate-900/40 p-6 text-sm text-slate-400 ring-1 ring-white/10">
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

      <div className="relative w-full max-w-4xl overflow-hidden rounded-2xl bg-slate-950 ring-1 ring-white/10">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <LineChartIcon className="h-4 w-4 text-slate-300" />
              <div className="text-sm font-semibold text-slate-100">Price History (placeholder)</div>
            </div>
            <div className="mt-1 truncate text-xs text-slate-400">{mover.marketTitle}</div>
            <div className="mt-1 text-[11px] text-slate-500">
              Context token: <span className="font-mono text-slate-400">{mover.yesTokenId}</span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900/70 text-slate-200 ring-1 ring-white/10 hover:bg-slate-900"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5">
          <div className="h-[320px] rounded-xl bg-slate-900/40 ring-1 ring-white/10">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 16, right: 16, bottom: 8, left: 0 }}>
                <XAxis dataKey="idx" hide />
                <YAxis domain={[0, 1]} tick={{ fill: '#94a3b8', fontSize: 12 }} width={32} />
                <Tooltip
                  contentStyle={{
                    background: 'rgba(2,6,23,0.95)',
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
          <div className="mt-3 text-xs text-slate-500">
            Hooked up to `yesTokenId` so you can later replace this with real data from
            `GET /api/charts/price-history`.
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
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-slate-300" />
            <h1 className="text-xl font-semibold tracking-tight text-slate-100">
              Prediction Markets Dashboard
            </h1>
          </div>
          <p className="mt-1 text-sm text-slate-400">
            Track market movers and monitor wallet positions.
          </p>
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
              className="w-full rounded-xl bg-slate-900/60 py-2.5 pl-10 pr-3 text-sm text-slate-100 ring-1 ring-white/10 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/60"
            />
          </div>
          <button
            onClick={onWatch}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/60"
          >
            <ArrowUpRight className="h-4 w-4" />
            Watch
          </button>
        </div>
      </header>

      <section className="mt-8 rounded-2xl bg-slate-950 ring-1 ring-white/10">
        <div className="border-b border-white/10 px-5 py-4">
          <SectionHeader
            icon={<TrendingUp className="h-4 w-4 text-slate-300" />}
            title="Top Movers"
            subtitle="Biggest 24h market-price changes"
          />
        </div>

        <div className="p-4">
          {movers.isLoading ? <SkeletonList /> : null}
          {movers.error ? <EmptyState label="Failed to load movers." /> : null}
          {!movers.isLoading && !movers.error && (movers.data?.length || 0) === 0 ? (
            <EmptyState label="No mover data available." />
          ) : null}

          <div className="space-y-2">
            {(movers.data || []).slice(0, 10).map((m) => {
              const positive = m.priceChangePct >= 0
              return (
                <button
                  key={m.marketId}
                  onClick={() => setSelectedMover(m)}
                  className="w-full rounded-xl bg-slate-900/40 p-4 text-left ring-1 ring-white/10 transition hover:bg-slate-900/60"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-100">{m.marketTitle}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                        <span className="rounded-md bg-slate-900 px-2 py-1 ring-1 ring-white/10">
                          YES {m.yesPrice.toFixed(3)}
                        </span>
                        <span className="rounded-md bg-slate-900 px-2 py-1 ring-1 ring-white/10">
                          NO {m.noPrice.toFixed(3)}
                        </span>
                        <span className="rounded-md bg-slate-900 px-2 py-1 font-mono text-[11px] text-slate-500 ring-1 ring-white/10">
                          {m.yesTokenId.slice(0, 10)}…
                        </span>
                      </div>
                    </div>

                    <div
                      className={cn(
                        'shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold ring-1',
                        positive
                          ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/20'
                          : 'bg-rose-500/10 text-rose-300 ring-rose-500/20'
                      )}
                    >
                      {formatPct(m.priceChangePct)}
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-slate-500">
                    24h volume: <span className="text-slate-300">${formatUsdCompact(Number(m.volume24h) || 0)}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </section>

      {watchedAddress ? (
        <section className="mt-6 rounded-2xl bg-slate-950 ring-1 ring-white/10">
          <div className="flex flex-col gap-2 border-b border-white/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <SectionHeader
              icon={<Wallet className="h-4 w-4 text-slate-300" />}
              title="User Positions"
              subtitle={`Watching: ${watchedAddress}`}
            />
          </div>
          <div className="p-4">
            {positions.isLoading ? <SkeletonList rows={3} /> : null}
            {positions.error ? (
              <EmptyState label="Failed to load positions. Check console for details. The positions endpoint may not be available in Opinion API." />
            ) : null}
            {!positions.isLoading && !positions.error && (positions.data?.length || 0) === 0 ? (
              <EmptyState label="No positions found for this wallet address." />
            ) : null}

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {(positions.data || []).slice(0, 12).map((p: UserPosition, idx) => {
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
                    className="rounded-xl bg-slate-900/40 p-4 ring-1 ring-white/10 hover:bg-slate-900/60 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-slate-100">
                          {p.marketTitle || `Market ${p.marketId}`}
                        </div>
                        {p.rootMarketTitle ? (
                          <div className="mt-1 text-xs text-slate-500 truncate">
                            {p.rootMarketTitle}
                          </div>
                        ) : null}
                      </div>
                      <span className={`shrink-0 text-xs font-semibold ${outcomeColor}`}>
                        {p.outcome}
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <div className="text-slate-500">Shares</div>
                        <div className="text-slate-200 font-mono">
                          {sharesOwned.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-500">Current Value</div>
                        <div className="text-slate-200 font-mono">
                          ${currentValue.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-500">Avg Entry</div>
                        <div className="text-slate-200 font-mono">
                          {avgPrice.toFixed(4)}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-500">P&L</div>
                        <div className={`font-semibold font-mono ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {isPositive ? '+' : ''}${pnl.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between">
                      <div className="text-xs">
                        <span className="text-slate-500">P&L: </span>
                        <span className={`font-semibold ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {isPositive ? '+' : ''}{(pnlPercent * 100).toFixed(2)}%
                        </span>
                      </div>
                      {p.sharesFrozen && parseFloat(p.sharesFrozen) > 0 ? (
                        <span className="text-xs text-amber-400">
                          🔒 {parseFloat(p.sharesFrozen).toLocaleString('en-US', { maximumFractionDigits: 0 })} frozen
                        </span>
                      ) : null}
                    </div>

                    {p.marketCutoffAt ? (
                      <div className="mt-2 text-xs text-slate-500">
                        Cutoff: {new Date(p.marketCutoffAt * 1000).toLocaleDateString()}
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </div>
        </section>
      ) : null}

      {selectedMover ? <ChartModal mover={selectedMover} onClose={() => setSelectedMover(null)} /> : null}
    </main>
  )
}