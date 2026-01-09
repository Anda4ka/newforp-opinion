'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { ArrowLeft, ArrowUpRight, Layers } from 'lucide-react'
import type { Market } from '@/lib/types'

const fetcher = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url)
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(errorData.error || `Request failed: ${res.status}`)
  }
  return res.json() as Promise<T>
}

interface ChildMarketPreview {
  id: number
  title: string
  yesTokenId: string
  yesPrice: number
  volume24h: string
}

interface MarketWithPrices {
  id: number
  title: string
  yesTokenId: string
  noTokenId: string
  yesPrice: number
  noPrice: number
  volume24h: string
  cutoffAt: number
  marketType: number
  childMarkets?: Market[]
  childMarketsPreview?: ChildMarketPreview[]
}

function formatUsdCompact(value: number) {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(value)
}

export default function CategoriesPage() {
  const [searchQuery, setSearchQuery] = useState('')

  const { data, error, isLoading } = useSWR<{
    markets: MarketWithPrices[]
    total: number
  }>(
    '/api/markets/list?page=1',
    fetcher,
    { refreshInterval: 30_000, revalidateOnFocus: false }
  )

  const categoricalMarkets = useMemo(() => {
    if (!data?.markets) return []
    return data.markets.filter(market => {
      const isCategorical = market.marketType === 1 || (market.childMarkets && market.childMarkets.length > 0)
      const matchesSearch = market.title.toLowerCase().includes(searchQuery.toLowerCase())
      return isCategorical && matchesSearch
    })
  }, [data, searchQuery])

  return (
    <main className="min-h-screen bg-slate-950 pb-20">
      <div className="mx-auto w-full max-w-[1920px] px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-8">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Layers className="h-6 w-6 text-slate-300" />
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-slate-100">Categories</h1>
                <p className="mt-1 text-sm text-slate-400">Multi-outcome markets with top scenarios</p>
              </div>
            </div>
            <a
              href="/"
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900/60 px-4 py-2 text-xs font-semibold text-slate-200 ring-1 ring-white/10 transition-all hover:bg-slate-900/80"
            >
              <ArrowLeft className="h-3 w-3" />
              Back to Markets
            </a>
          </div>

          <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search categories..."
                className="w-full rounded-xl bg-slate-900/60 ring-1 ring-white/10 py-2.5 pl-4 pr-4 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
            </div>
            <a
              href="/"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-500 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
            >
              View Binary Markets
              <ArrowUpRight className="h-3 w-3" />
            </a>
          </div>
        </header>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={`skeleton-${i}`}
                className="h-56 w-full animate-pulse rounded-2xl bg-slate-900/40 backdrop-blur-sm ring-1 ring-white/10"
              />
            ))}
          </div>
        ) : error ? (
          <div className="flex h-40 items-center justify-center rounded-2xl bg-slate-900/40 backdrop-blur-sm ring-1 ring-white/10 p-6 text-sm text-slate-400">
            Failed to load categories. Please try again later.
          </div>
        ) : categoricalMarkets.length === 0 ? (
          <div className="flex h-40 items-center justify-center rounded-2xl bg-slate-900/40 backdrop-blur-sm ring-1 ring-white/10 p-6 text-sm text-slate-400">
            No categorical markets available.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {categoricalMarkets.map((market) => (
              <a
                key={`categorical-${market.id}`}
                href={`/market/${market.id}?type=1`}
                className="group relative overflow-hidden rounded-2xl bg-slate-900/40 p-5 ring-1 ring-white/10 transition-all hover:bg-slate-900/50 hover:ring-white/20"
              >
                <div className="mb-4">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold text-blue-400 ring-1 ring-blue-500/20">CATEGORICAL</span>
                  </div>
                  <div className="line-clamp-2 text-sm font-semibold text-slate-100 transition-colors group-hover:text-white">
                    {market.title || `Market ${market.id}`}
                  </div>
                </div>

                <div className="space-y-2">
                  {(market.childMarketsPreview || []).slice(0, 3).map((child) => {
                    const chance = Math.max(0, Math.min(1, child.yesPrice)) * 100
                    return (
                      <div
                        key={`child-${market.id}-${child.id}`}
                        className="flex items-center justify-between rounded-xl bg-slate-900/60 px-3 py-2 text-xs text-slate-200 ring-1 ring-white/5"
                      >
                        <span className="truncate">{child.title}</span>
                        <span className="ml-3 shrink-0 font-semibold text-blue-200">{Math.round(chance)}%</span>
                      </div>
                    )
                  })}
                </div>

                <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
                  <span>${formatUsdCompact(Number(market.volume24h) || 0)} Vol.</span>
                  <span className="text-blue-400">View Details →</span>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
