import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { RefreshCw, Search, Sparkles } from 'lucide-react';
import {
  ComposedChart, Bar, Area, XAxis, YAxis, CartesianGrid,
  ResponsiveContainer, Tooltip as RechartsTooltip, Cell,
} from 'recharts';
import { cn } from '../lib/utils';
import { formatCurrency, formatDate, formatChartAxisLabel } from '../lib/formatters';
import { getTrendColor, toCandleRows, renderCandleWick, TREND_UP_COLOR, TREND_DOWN_COLOR } from '../lib/chartUtils';
import { getStockPriceHistory, getCurrentPrice } from '../services/openaiService';
import { StockAnalysis, UserSettings, PriceData, NewsItem } from '../types';
import ExpandableText from './ExpandableText';

type ChartMode = 'LINE' | 'CANDLES' | 'BOTH';

const darkTooltip = {
  borderRadius: '6px', border: '1px solid #27272a',
  background: '#18181b', color: '#f4f4f5', fontSize: '11px',
};

interface Props {
  trackedSymbols: string[];
  currentPrices: Record<string, number>;
  analyses: Record<string, StockAnalysis>;
  news: Record<string, NewsItem[]>;
  loadingNews: Record<string, boolean>;
  settings: UserSettings;
  isUpdatingPrices: boolean;
  onUpdateAllPrices: (show: boolean) => void;
  onToggleNews: (symbol: string) => void;
}

export default function DetailedTab({
  trackedSymbols, currentPrices, analyses, news, loadingNews,
  settings, isUpdatingPrices, onUpdateAllPrices, onToggleNews,
}: Props) {
  const [detailedSymbol, setDetailedSymbol] = useState<string>(trackedSymbols[0] || 'AAPL');
  const [detailedRange, setDetailedRange] = useState('6M');
  const [detailedHistory, setDetailedHistory] = useState<PriceData[]>([]);
  const [detailedCurrentPrice, setDetailedCurrentPrice] = useState<number | null>(null);
  const [isLoadingDetailed, setIsLoadingDetailed] = useState(false);
  const [detailedPanel, setDetailedPanel] = useState<'overview' | 'news'>('overview');
  const [chartMode, setChartMode] = useState<ChartMode>(() => {
    try { return (JSON.parse(localStorage.getItem('roth_ira_chart_mode_detailed') || '"BOTH"') as ChartMode); }
    catch { return 'BOTH'; }
  });

  const fc = (n: number) => formatCurrency(n, settings.currency);
  const fd = (s?: string) => formatDate(s, settings.dateFormat);
  const fcLabel = (v: string, r: string) => formatChartAxisLabel(v, r, settings.dateFormat);

  useEffect(() => {
    if (trackedSymbols.length > 0 && !trackedSymbols.includes(detailedSymbol)) {
      setDetailedSymbol(trackedSymbols[0]);
    }
  }, [trackedSymbols]);

  useEffect(() => {
    localStorage.setItem('roth_ira_chart_mode_detailed', JSON.stringify(chartMode));
  }, [chartMode]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!detailedSymbol) return;
      setIsLoadingDetailed(true);
      try {
        const [history, livePrice] = await Promise.all([
          getStockPriceHistory(detailedSymbol, detailedRange),
          getCurrentPrice(detailedSymbol),
        ]);
        if (cancelled) return;
        setDetailedHistory(history);
        setDetailedCurrentPrice(livePrice > 0 ? livePrice : null);
      } catch {
        if (!cancelled) { setDetailedHistory([]); setDetailedCurrentPrice(null); }
      } finally {
        if (!cancelled) setIsLoadingDetailed(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [detailedSymbol, detailedRange]);

  const analysis = analyses[detailedSymbol];
  const hasHistory = detailedHistory.length > 1;
  const first = hasHistory ? (detailedHistory[0].close ?? detailedHistory[0].price) : 0;
  const lastRow = detailedHistory[detailedHistory.length - 1];
  const last = hasHistory ? (lastRow.close ?? lastRow.price) : 0;
  const diff = last - first;
  const pct = first > 0 ? (diff / first) * 100 : 0;
  const liveOrLast = detailedCurrentPrice ?? (last > 0 ? last : 0);
  const open = lastRow?.open ?? lastRow?.price ?? 0;
  const high = lastRow?.high ?? lastRow?.price ?? 0;
  const low = lastRow?.low ?? lastRow?.price ?? 0;
  const rows = hasHistory ? toCandleRows(detailedHistory) : [];
  const trendColor = getTrendColor(rows);

  return (
    <motion.div
      key="detailed"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="grid grid-cols-1 xl:grid-cols-[260px_minmax(0,1fr)] gap-4"
    >
      {/* Sidebar */}
      <aside className="bg-zinc-900 rounded-2xl border border-zinc-800 p-5 hidden xl:flex flex-col h-[calc(100vh-120px)] sticky top-[112px]">
        <div className="flex items-center justify-between mb-4 border-b border-zinc-800 pb-4">
          <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Your Lists</h3>
          <button onClick={() => onUpdateAllPrices(true)} className="p-1.5 rounded-lg text-zinc-600 hover:text-blue-400 hover:bg-zinc-800 transition-colors" title="Refresh Prices">
            <RefreshCw className={cn('w-3.5 h-3.5', isUpdatingPrices && 'animate-spin')} />
          </button>
        </div>
        <div className="space-y-0.5 overflow-y-auto flex-1 pr-1">
          {trackedSymbols.length > 0 ? trackedSymbols.map(symbol => (
            <button key={symbol} onClick={() => setDetailedSymbol(symbol)} className={cn('w-full flex justify-between items-center px-3 py-2.5 rounded-xl transition-all text-sm', detailedSymbol === symbol ? 'bg-zinc-800 text-zinc-100 font-bold' : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/50')}>
              <span className="font-semibold">{symbol}</span>
              <span className="text-xs font-mono">{currentPrices[symbol] ? fc(currentPrices[symbol]) : '—'}</span>
            </button>
          )) : (
            <div className="text-xs text-zinc-600 p-3 rounded-xl bg-zinc-800/30 border border-zinc-800">
              Add holdings or watchlist items to populate this list.
            </div>
          )}
        </div>
      </aside>

      {/* Main Panel */}
      <section className="bg-zinc-900 rounded-2xl border border-zinc-800 p-6 flex flex-col">
        {/* Header */}
        <div className="mb-6">
          <div className="flex justify-between items-start">
            <h2 className="text-3xl font-bold text-zinc-100 tracking-tight font-mono">{detailedSymbol}</h2>
            <div className="flex gap-2 relative">
              <input
                type="text"
                value={detailedSymbol}
                onChange={e => setDetailedSymbol(e.target.value.trim().toUpperCase())}
                placeholder="Search symbol"
                className="w-36 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
              />
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <span className="text-4xl font-medium text-zinc-100 tracking-tight font-mono">{liveOrLast > 0 ? fc(liveOrLast) : '—'}</span>
            <span className={cn('text-lg font-medium mb-0.5 font-mono', diff >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
              {hasHistory ? `${diff >= 0 ? '+' : ''}${fc(diff).replace('$', '')} (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)` : '—'}
            </span>
            <span className="text-xs text-zinc-500 mb-1 font-medium">Past {detailedRange}</span>
          </div>
        </div>

        {/* Chart Controls */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4 border-b border-zinc-800 pb-4">
          <div className="flex flex-wrap gap-1">
            {['1D', '5D', '1M', '6M', '1Y', '5Y', 'MAX'].map(range => (
              <button key={range} onClick={() => setDetailedRange(range)} className={cn('px-3 py-1 rounded-lg text-sm font-medium transition-all', detailedRange === range ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800')}>
                {range}
              </button>
            ))}
          </div>
          <div className="flex gap-1 bg-zinc-800 p-0.5 rounded-lg border border-zinc-700">
            {(['LINE', 'CANDLES', 'BOTH'] as ChartMode[]).map(m => (
              <button key={m} onClick={() => setChartMode(m)} className={cn('px-2.5 py-1 rounded-md text-xs font-bold transition-all', chartMode === m ? 'bg-zinc-600 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300')}>
                {m === 'LINE' ? 'Line' : m === 'CANDLES' ? 'Candle' : 'Both'}
              </button>
            ))}
          </div>
        </div>

        {/* Chart */}
        <div className="h-[380px] w-full relative mb-10">
          {isLoadingDetailed ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <RefreshCw className="w-7 h-7 text-blue-500 animate-spin" />
            </div>
          ) : hasHistory ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={rows} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={`dtGrad-${detailedSymbol}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={trendColor} stopOpacity={0.12} />
                    <stop offset="95%" stopColor={trendColor} stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#27272a" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#71717a' }} tickLine={false} axisLine={false} minTickGap={40} tickFormatter={v => fcLabel(String(v), detailedRange)} />
                <YAxis tick={{ fontSize: 11, fill: '#71717a' }} tickLine={false} axisLine={false} domain={['auto', 'auto']} width={60} orientation="right" tickFormatter={v => `$${v}`} />
                <RechartsTooltip contentStyle={darkTooltip} labelFormatter={l => fcLabel(String(l), detailedRange)} formatter={(v, name) => [fc(typeof v === 'number' ? v : Number(v) || 0), name === 'price' ? 'Close' : String(name)]} />
                {chartMode !== 'LINE' && (
                  <>
                    <Bar dataKey="wickBase" stackId="wicks" fill="transparent" barSize={2} />
                    <Bar dataKey="wickHeight" stackId="wicks" fill="transparent" barSize={2} shape={renderCandleWick} />
                    <Bar dataKey="candleBase" stackId="candles" fill="transparent" barSize={6} />
                    <Bar dataKey="candleBody" stackId="candles" barSize={6}>
                      {rows.map(row => <Cell key={`c-${row.date}`} fill={row.isUp ? TREND_UP_COLOR : TREND_DOWN_COLOR} />)}
                    </Bar>
                  </>
                )}
                {chartMode !== 'CANDLES' && (
                  <Area type="linear" dataKey="price" stroke={trendColor} strokeWidth={1.5} fill={`url(#dtGrad-${detailedSymbol})`} dot={false} animationDuration={600} />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-zinc-600 text-sm italic">No historical data found for this symbol.</div>
          )}
        </div>

        {/* Key Stats */}
        <div className="mb-8">
          <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-4">Key Stats</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-y-5 gap-x-4">
            {[
              { label: 'Prev Close', value: fc(first) },
              { label: 'Day Range', value: `${fc(low)} – ${fc(high)}` },
              { label: 'Open', value: fc(open) },
              { label: 'Market Cap', value: analysis?.metrics?.marketCap || '—' },
              { label: 'P/E Ratio', value: analysis?.metrics?.peRatio || '—' },
              { label: 'Div Yield', value: analysis?.metrics?.dividendYield || '—' },
              { label: 'AI Verdict', value: analysis?.recommendation || '—' },
              { label: 'Risk Level', value: analysis?.riskLevel || '—' },
            ].map((stat, i) => (
              <div key={i} className="flex flex-col border-t border-zinc-800 pt-3">
                <span className="text-[10px] text-zinc-500 mb-1 uppercase font-bold tracking-wide">{stat.label}</span>
                <span className="text-sm font-medium text-zinc-200 font-mono">{stat.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Panel Tabs */}
        <div>
          <div className="flex gap-4 border-b border-zinc-800 mb-5">
            <button onClick={() => setDetailedPanel('overview')} className={cn('pb-3 text-sm font-medium transition-all border-b-2', detailedPanel === 'overview' ? 'border-blue-500 text-blue-400' : 'border-transparent text-zinc-500 hover:text-zinc-300')}>
              AI Analysis
            </button>
            <button onClick={() => { setDetailedPanel('news'); if (!news[detailedSymbol]) onToggleNews(detailedSymbol); }} className={cn('pb-3 text-sm font-medium transition-all border-b-2', detailedPanel === 'news' ? 'border-blue-500 text-blue-400' : 'border-transparent text-zinc-500 hover:text-zinc-300')}>
              Latest News
            </button>
          </div>

          <div className="min-h-[180px]">
            {detailedPanel === 'overview' && (
              <div className="space-y-5">
                {analysis ? (
                  <>
                    <div className="p-5 bg-zinc-800/40 rounded-xl border border-zinc-800">
                      <h4 className="font-bold text-zinc-200 mb-2 flex items-center gap-2 text-sm">
                        <Sparkles className="w-4 h-4 text-blue-400" /> AI Thesis
                      </h4>
                      <p className="text-sm text-zinc-400 leading-relaxed">{analysis.reasoning}</p>
                      {analysis.projectedGrowth && (
                        <div className="mt-3 pt-3 border-t border-zinc-700">
                          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Projected Growth</p>
                          <p className="text-sm text-zinc-300">{analysis.projectedGrowth}</p>
                        </div>
                      )}
                    </div>
                    {analysis.keyFactors?.length ? (
                      <div>
                        <h4 className="font-bold text-zinc-400 mb-2 text-xs uppercase tracking-wider">Key Factors</h4>
                        <div className="flex flex-wrap gap-2">
                          {analysis.keyFactors.map((factor, i) => (
                            <span key={i} className="px-3 py-1 bg-zinc-800 border border-zinc-700 text-zinc-400 text-xs font-medium rounded-lg">{factor}</span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="text-center py-10">
                    <p className="text-zinc-600 text-sm">No AI analysis available. Add this symbol to your portfolio or watchlist.</p>
                  </div>
                )}
              </div>
            )}

            {detailedPanel === 'news' && (
              <div>
                {loadingNews[detailedSymbol] ? (
                  <div className="flex justify-center py-10"><RefreshCw className="w-5 h-5 text-zinc-600 animate-spin" /></div>
                ) : news[detailedSymbol]?.length ? (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {news[detailedSymbol].map((item, nIdx) => (
                      <a key={nIdx} href={item.url} target="_blank" rel="noopener noreferrer" className="block p-4 rounded-xl bg-zinc-800/40 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/70 transition-all group">
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-[10px] font-bold text-zinc-500">{item.source}</span>
                          <span className="text-[10px] text-zinc-600">{fd(item.date)}</span>
                        </div>
                        <h4 className="text-sm font-bold text-zinc-200 mb-2 group-hover:text-blue-400 transition-colors">{item.title}</h4>
                        <p className="text-xs text-zinc-500 line-clamp-2">{item.snippet}</p>
                      </a>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-zinc-600 text-center py-10">No recent news found.</div>
                )}
              </div>
            )}
          </div>
        </div>
      </section>
    </motion.div>
  );
}
