'use client'

import { useCallback, useMemo, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import type { ClassValue } from 'clsx'
import clsx from 'clsx'
import { twMerge } from 'tailwind-merge'
import {
    Activity,
    ArrowLeft,
    Calendar,
    Info,
    LineChart as LineChartIcon,
    TrendingDown,
    TrendingUp,
    AlertCircle
} from 'lucide-react'
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Market, Orderbook } from '@/lib/types'

function cn(...classes: ClassValue[]) {
    return twMerge(clsx(classes))
}

const fetcher = async <T,>(url: string): Promise<T> => {
    const res = await fetch(url)
    if (!res.ok) {
        if (res.status === 404) throw new Error('Not Found')
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || `Request failed: ${res.status}`)
    }
    return res.json() as Promise<T>
}

// Reuse utility functions
function formatPct(value: number) {
    const pct = value * 100
    const sign = pct > 0 ? '+' : ''
    return `${sign}${pct.toFixed(2)}%`
}

function formatUsdCompact(value: number) {
    return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(value)
}

function formatDate(timestamp: number) {
    return new Date(timestamp * 1000).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    })
}

// Components
function EmptyState({ label }: { label: React.ReactNode }) {
    return (
        <div className="flex h-40 items-center justify-center rounded-2xl bg-slate-900/40 backdrop-blur-sm ring-1 ring-white/10 p-6 text-sm text-slate-400">
            {label}
        </div>
    )
}

function OrderbookTable({ orderbook, side }: { orderbook?: Orderbook, side: 'bids' | 'asks' }) {
    if (!orderbook) return <EmptyState label="Loading orderbook..." />

    const levels = side === 'bids' ? orderbook.bids : orderbook.asks
    // Sort both descending by price to achieve "center" layout
    // Asks: High -> Low (Lowest/Best Ask at bottom)
    // Bids: High -> Low (Highest/Best Bid at top)
    const sortedLevels = [...levels].sort((a, b) => parseFloat(b.price) - parseFloat(a.price))

    if (sortedLevels.length === 0) return <EmptyState label="No orders" />

    return (
        <div className="w-full overflow-hidden rounded-xl bg-slate-950/50 ring-1 ring-white/10">
            <div className="grid grid-cols-2 gap-4 border-b border-white/5 bg-slate-900/50 px-4 py-2 text-xs font-semibold text-slate-400">
                <div>Price</div>
                <div className="text-right">Size</div>
            </div>
            <div className="max-h-[300px] overflow-y-auto">
                {sortedLevels.map((level, i) => (
                    <div key={i} className="grid grid-cols-2 gap-4 px-4 py-2 text-sm hover:bg-white/5">
                        <div className={cn("font-mono", side === 'bids' ? "text-emerald-400" : "text-rose-400")}>
                            {parseFloat(level.price).toFixed(3)}
                        </div>
                        <div className="text-right font-mono text-slate-300">
                            ${parseFloat(level.size).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

interface PricePoint {
    t: number
    p: string
}

function PriceChart({ market, selectedTokenId }: { market: Market, selectedTokenId: string }) {
    // Determine the relevant pair (Yes/No tokens)
    const pair = useMemo(() => {
        if (market.marketType === 1 && market.childMarkets) {
            // Find child market containing the selected token
            const child = market.childMarkets.find(c => c.yesTokenId === selectedTokenId || c.noTokenId === selectedTokenId)
            if (child) return { yes: child.yesTokenId, no: child.noTokenId, title: child.title }
        }
        // Fallback to main market (Binary) or default
        return { yes: market.yesTokenId, no: market.noTokenId, title: market.title }
    }, [market, selectedTokenId])

    // Fetch history for both tokens
    const { data: yesHistory } = useSWR<{ history: PricePoint[] }>(
        pair.yes ? `/api/history?tokenId=${pair.yes}&interval=1h` : null,
        fetcher
    )

    const { data: noHistory } = useSWR<{ history: PricePoint[] }>(
        pair.no ? `/api/history?tokenId=${pair.no}&interval=1h` : null,
        fetcher
    )

    // Merge data for chart
    const chartData = useMemo(() => {
        if (!yesHistory?.history && !noHistory?.history) return []

        // Create a map of timestamps to merged points
        const timeline = new Map<number, { time: number, yes?: number, no?: number }>()

        yesHistory?.history.forEach(p => {
            if (!timeline.has(p.t)) timeline.set(p.t, { time: p.t })
            timeline.get(p.t)!.yes = parseFloat(p.p)
        })

        noHistory?.history.forEach(p => {
            if (!timeline.has(p.t)) timeline.set(p.t, { time: p.t })
            timeline.get(p.t)!.no = parseFloat(p.p)
        })

        return Array.from(timeline.values()).sort((a, b) => a.time - b.time)
    }, [yesHistory, noHistory])

    if (!chartData || chartData.length === 0) {
        return (
            <div className="h-[300px] w-full flex items-center justify-center text-slate-500 text-sm">
                Loading Chart...
            </div>
        )
    }

    return (
        <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 16, right: 16, bottom: 8, left: 0 }}>
                    <XAxis
                        dataKey="time"
                        hide={false}
                        tick={{ fill: '#94a3b8', fontSize: 10 }}
                        tickFormatter={(t) => new Date(t * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    />
                    <YAxis domain={[0, 1]} tick={{ fill: '#94a3b8', fontSize: 12 }} width={32} />
                    <Tooltip
                        contentStyle={{
                            background: 'rgba(15,23,42,0.95)',
                            border: '1px solid rgba(255,255,255,0.10)',
                            borderRadius: 12,
                            color: '#e2e8f0',
                        }}
                        labelStyle={{ color: '#94a3b8' }}
                        labelFormatter={(t) => new Date(t * 1000).toLocaleString()}
                        formatter={(value: number | undefined) => [value ? value.toFixed(3) : '0', 'Price']}
                    />
                    <Line
                        type="monotone"
                        dataKey="yes"
                        name="YES"
                        stroke="#10b981" // Emerald
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                    />
                    <Line
                        type="monotone"
                        dataKey="no"
                        name="NO"
                        stroke="#f43f5e" // Rose
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    )
}

export default function MarketDetailPage({ params, searchParams }: { params: { id: string }, searchParams: { type?: string } }) {
    const { id } = params
    const { type } = searchParams

    const { data: market, error, isLoading } = useSWR<Market>(
        `/api/markets/${id}?type=${type || '0'}`,
        fetcher,
        { refreshInterval: 30000 }
    )

    const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null)

    // Set default selected token when market loads
    if (market && !selectedTokenId) {
        if (market.marketType === 1 && market.childMarkets && market.childMarkets.length > 0) {
            // Categorical: Select first child market's YES token by default
            setSelectedTokenId(market.childMarkets[0].yesTokenId)
        } else {
            // Binary: Select YES token
            setSelectedTokenId(market.yesTokenId)
        }
    }

    const { data: orderbook } = useSWR<Orderbook>(
        selectedTokenId ? `/api/orderbook?tokenId=${selectedTokenId}` : null,
        fetcher,
        { refreshInterval: 5000 }
    )

    if (isLoading) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
            </div>
        )
    }

    // Graceful Error State
    if (error || !market) {
        return (
            <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
                <div className="h-16 w-16 rounded-full bg-rose-500/10 flex items-center justify-center mb-4 ring-1 ring-rose-500/20">
                    <Activity className="h-8 w-8 text-rose-400" />
                </div>
                <h1 className="text-xl font-semibold text-slate-100 mb-2">Market Unavailable</h1>
                <p className="text-slate-400 text-center max-w-md mb-6">
                    We couldn't load this market. It might have been deleted, resolved, or is temporarily inaccessible from the API.
                </p>
                <Link
                    href="/"
                    className="inline-flex items-center gap-2 rounded-xl bg-slate-800 px-6 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 transition"
                >
                    &larr; Back to Explorer
                </Link>
            </div>
        )
    }

    const isCategorical = market.marketType === 1



    return (
        <main className="min-h-screen bg-slate-950 pb-20">
            <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">

                {/* Navigation */}
                <nav className="mb-8">
                    <a href="/" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 transition-colors">
                        <ArrowLeft className="h-4 w-4" />
                        Back to Markets
                    </a>
                </nav>

                {/* Header */}
                <header className="mb-8 grid gap-6 lg:grid-cols-[2fr,1fr]">
                    <div>
                        <div className="mb-2 flex items-center gap-2">
                            <span className={cn(
                                "rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1",
                                market.status === 'Activated'
                                    ? "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20"
                                    : "bg-slate-800 text-slate-400 ring-white/10"
                            )}>
                                {String(market.status)}
                            </span>
                            <span className="rounded-full bg-blue-500/10 px-2.5 py-0.5 text-xs font-semibold text-blue-400 ring-1 ring-blue-500/20">
                                {isCategorical ? 'Categorical' : 'Binary'}
                            </span>
                        </div>
                        <h1 className="text-3xl font-bold tracking-tight text-slate-100">{market.title}</h1>

                        {/* Rules / Description */}
                        {market.rules && (
                            <div className="mt-4 rounded-xl bg-slate-900/40 p-4 ring-1 ring-white/10">
                                <div className="flex items-start gap-3">
                                    <Info className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
                                    <p className="text-sm text-slate-300 leading-relaxed max-h-32 overflow-y-auto custom-scrollbar">
                                        {market.rules}
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-4 lg:grid-cols-1">
                        <div className="rounded-xl bg-slate-900/40 p-4 ring-1 ring-white/10">
                            <div className="text-sm text-slate-500 flex items-center gap-1.5">
                                <Activity className="h-4 w-4" /> 24h Volume
                            </div>
                            <div className="mt-1 text-2xl font-mono text-slate-200">
                                ${formatUsdCompact(parseFloat(market.volume24h))}
                            </div>
                        </div>
                        <div className="rounded-xl bg-slate-900/40 p-4 ring-1 ring-white/10">
                            <div className="text-sm text-slate-500 flex items-center gap-1.5">
                                <Calendar className="h-4 w-4" /> End Date
                            </div>
                            <div className="mt-1 text-lg text-slate-200">
                                {market.cutoffAt ? formatDate(market.cutoffAt) : 'N/A'}
                            </div>
                        </div>
                    </div>
                </header>

                {/* Main Content */}
                <div className="grid gap-8 lg:grid-cols-[1fr,400px]">

                    {/* Left Column: Outcomes List */}
                    <div className="space-y-6">
                        <h2 className="text-xl font-semibold text-slate-100">Outcomes</h2>

                        <div className="grid gap-3">
                            {market.childMarkets ? (
                                // Categorical Markets List
                                market.childMarkets.map((child) => (
                                    <button
                                        key={child.id}
                                        onClick={() => setSelectedTokenId(child.yesTokenId)}
                                        className={cn(
                                            "group relative flex items-center justify-between rounded-xl bg-slate-900/40 p-4 ring-1 transition-all",
                                            selectedTokenId === child.yesTokenId
                                                ? "bg-blue-500/10 ring-blue-500/50"
                                                : "ring-white/10 hover:bg-slate-900/60 hover:ring-white/20"
                                        )}
                                    >
                                        <span className="font-medium text-slate-200">{child.title || child.yesLabel}</span>
                                        {/* We don't have prices in the detail object for children immediately unless we fetch them all.
                                    For now just showing selection UI. Ideally we'd fetch prices.
                                */}
                                        <div className="text-xs text-slate-500 group-hover:text-blue-400">View Details &rarr;</div>
                                    </button>
                                ))
                            ) : (
                                // Binary Markets (Yes/No)
                                <>
                                    <button
                                        onClick={() => setSelectedTokenId(market.yesTokenId)}
                                        className={cn(
                                            "group p-4 flex items-center justify-between rounded-xl ring-1 transition-all",
                                            selectedTokenId === market.yesTokenId
                                                ? "bg-emerald-500/10 ring-emerald-500/50"
                                                : "bg-slate-900/40 ring-white/10 hover:bg-slate-900/60"
                                        )}
                                    >
                                        <span className="text-lg font-bold text-emerald-400">YES</span>
                                        <span className="text-sm text-slate-400">{market.yesTokenId.slice(0, 8)}...</span>
                                    </button>
                                    <button
                                        onClick={() => setSelectedTokenId(market.noTokenId)}
                                        className={cn(
                                            "group p-4 flex items-center justify-between rounded-xl ring-1 transition-all",
                                            selectedTokenId === market.noTokenId
                                                ? "bg-rose-500/10 ring-rose-500/50"
                                                : "bg-slate-900/40 ring-white/10 hover:bg-slate-900/60"
                                        )}
                                    >
                                        <span className="text-lg font-bold text-rose-400">NO</span>
                                        <span className="text-sm text-slate-400">{market.noTokenId.slice(0, 8)}...</span>
                                    </button>
                                </>
                            )}
                        </div>

                        {/* Selected Token Chart */}
                        {selectedTokenId && (
                            <div className="mt-8 rounded-2xl bg-slate-900/40 p-6 ring-1 ring-white/10 backdrop-blur-sm">
                                <div className="mb-6 flex items-center gap-2">
                                    <LineChartIcon className="h-5 w-5 text-blue-400" />
                                    <h3 className="text-lg font-semibold text-slate-100">Price History</h3>
                                </div>
                                <PriceChart market={market} selectedTokenId={selectedTokenId} />
                            </div>
                        )}
                    </div>

                    {/* Right Column: Orderbook */}
                    <div className="space-y-6">
                        <div className="flex items-center justify-between">
                            <h2 className="text-xl font-semibold text-slate-100">Orderbook</h2>
                            <span className="text-xs font-mono text-slate-500">
                                {selectedTokenId ? `${selectedTokenId.slice(0, 6)}...` : 'Select Outcome'}
                            </span>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <div className="mb-2 text-xs font-medium text-rose-400 uppercase tracking-wider">Asks (Sells)</div>
                                <OrderbookTable orderbook={orderbook} side="asks" />
                            </div>
                            <div>
                                <div className="mb-2 text-xs font-medium text-emerald-400 uppercase tracking-wider">Bids (Buys)</div>
                                <OrderbookTable orderbook={orderbook} side="bids" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    )
}
