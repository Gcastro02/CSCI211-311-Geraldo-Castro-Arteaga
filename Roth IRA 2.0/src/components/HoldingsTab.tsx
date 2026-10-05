import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Trash2, TrendingUp, RefreshCw, Info, Sparkles, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import { cn } from '../lib/utils';
import { formatCurrency, formatDate } from '../lib/formatters';
import { getTrendColor } from '../lib/chartUtils';
import { PortfolioData, StockHolding, StockAnalysis, UserSettings, PriceData, NewsItem } from '../types';
import ExpandableText from './ExpandableText';

const darkTooltip = {
  borderRadius: '6px', border: '1px solid #27272a',
  background: '#18181b', color: '#f4f4f5', fontSize: '10px',
};

interface Props {
  portfolio: PortfolioData;
  currentPrices: Record<string, number>;
  analyses: Record<string, StockAnalysis>;
  settings: UserSettings;
  isAnalyzing: boolean;
  expandedChart: Record<string, boolean>;
  expandedNews: Record<string, boolean>;
  selectedRange: Record<string, string>;
  priceHistory: Record<string, PriceData[]>;
  loadingChart: Record<string, boolean>;
  news: Record<string, NewsItem[]>;
  loadingNews: Record<string, boolean>;
  onAddHolding: (holding: StockHolding) => void;
  onRemoveHolding: (index: number) => void;
  onRunPortfolioAnalysis: () => void;
  onToggleChart: (symbol: string, range?: string) => void;
  onToggleNews: (symbol: string) => void;
}

export default function HoldingsTab({
  portfolio, currentPrices, analyses, settings, isAnalyzing,
  expandedChart, expandedNews, selectedRange, priceHistory, loadingChart,
  news, loadingNews,
  onAddHolding, onRemoveHolding, onRunPortfolioAnalysis, onToggleChart, onToggleNews,
}: Props) {
  const [newHolding, setNewHolding] = useState<StockHolding>({ symbol: '', shares: 0, averagePrice: 0 });
  const fc = (n: number) => formatCurrency(n, settings.currency);
  const fd = (s?: string) => formatDate(s, settings.dateFormat);

  return (
    <motion.div
      key="holdings"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-4"
    >
      {/* Add Holding Form */}
      <div className="bg-zinc-900 rounded-2xl p-5 border border-zinc-800">
        <h3 className="font-bold text-zinc-100 mb-4">Add New Holding</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-zinc-500 uppercase">Symbol</label>
            <input
              type="text"
              value={newHolding.symbol}
              onChange={e => setNewHolding(prev => ({ ...prev, symbol: e.target.value }))}
              placeholder="e.g. VOO"
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-zinc-100 placeholder:text-zinc-500 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-zinc-500 uppercase">Shares</label>
            <input
              type="number"
              value={newHolding.shares || ''}
              onChange={e => setNewHolding(prev => ({ ...prev, shares: parseFloat(e.target.value) || 0 }))}
              placeholder="0.00"
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-zinc-100 placeholder:text-zinc-500 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-zinc-500 uppercase">Avg Price</label>
            <input
              type="number"
              value={newHolding.averagePrice || ''}
              onChange={e => setNewHolding(prev => ({ ...prev, averagePrice: parseFloat(e.target.value) || 0 }))}
              placeholder="$0.00"
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-zinc-100 placeholder:text-zinc-500 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={() => { onAddHolding(newHolding); setNewHolding({ symbol: '', shares: 0, averagePrice: 0 }); }}
              className="w-full bg-blue-600 text-white font-bold py-2 rounded-xl hover:bg-blue-700 transition-all flex items-center justify-center gap-2 text-sm"
            >
              <Plus className="w-4 h-4" />
              Add
            </button>
          </div>
        </div>
      </div>

      {/* Holdings Table */}
      <div className="bg-zinc-900 rounded-2xl border border-zinc-800">
        <div className="px-6 py-4 border-b border-zinc-800 flex justify-between items-center">
          <h3 className="font-bold text-zinc-100">Current Holdings</h3>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-zinc-500">
              <Info className="w-3.5 h-3.5" />
              Live prices when available
            </div>
            <button
              onClick={onRunPortfolioAnalysis}
              disabled={isAnalyzing || portfolio.holdings.length === 0}
              className="flex items-center gap-1.5 text-xs font-bold text-blue-400 hover:bg-zinc-800 px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-40"
            >
              <Sparkles className={cn("w-3.5 h-3.5", isAnalyzing && "animate-spin")} />
              Analyze All
            </button>
          </div>
        </div>
        <div className="overflow-x-auto md:overflow-visible pb-12 -mb-12 relative z-0">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-zinc-800/50">
                {['Asset', 'Shares', 'Avg Price', 'Current', 'Value', 'Gain / Loss', 'AI Advice', 'Actions'].map(h => (
                  <th key={h} className="px-5 py-3 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {portfolio.holdings.map((holding, idx) => {
                const livePrice = currentPrices[holding.symbol];
                const gain = livePrice ? (livePrice - holding.averagePrice) * holding.shares : null;
                const gainPct = livePrice && holding.averagePrice > 0 ? ((livePrice - holding.averagePrice) / holding.averagePrice) * 100 : null;
                return (
                  <tr key={`${holding.symbol}-${idx}`} className="hover:bg-zinc-800/30 transition-colors group">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-300 font-bold text-xs border border-zinc-700">
                          {holding.symbol.slice(0, 2)}
                        </div>
                        <span className="font-bold text-zinc-100">{holding.symbol}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-zinc-400 font-mono">{holding.shares}</td>
                    <td className="px-5 py-3.5 text-sm text-zinc-400 font-mono">{fc(holding.averagePrice)}</td>
                    <td className="px-5 py-3.5 text-sm font-medium text-zinc-200 font-mono">{livePrice ? fc(livePrice) : <span className="text-zinc-600">—</span>}</td>
                    <td className="px-5 py-3.5 font-bold text-zinc-100 font-mono">{fc(holding.shares * (livePrice || holding.averagePrice))}</td>
                    <td className="px-5 py-3.5">
                      {gain !== null && gainPct !== null ? (
                        <div className={cn("flex items-center gap-1", gain >= 0 ? "text-emerald-400" : "text-rose-400")}>
                          {gain >= 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                          <span className="font-bold text-sm font-mono">{fc(Math.abs(gain))}</span>
                          <span className="text-xs text-zinc-500">({gainPct.toFixed(2)}%)</span>
                        </div>
                      ) : <span className="text-zinc-600 text-sm">—</span>}
                    </td>
                    <td className="px-5 py-3.5">
                      {analyses[holding.symbol] ? (
                        <div className="group/tip relative cursor-help">
                          <span className={cn(
                            "text-[10px] font-bold px-2 py-0.5 rounded",
                            analyses[holding.symbol].recommendation === 'BUY' && "bg-emerald-900/50 text-emerald-400",
                            analyses[holding.symbol].recommendation === 'HOLD' && "bg-amber-900/50 text-amber-400",
                            analyses[holding.symbol].recommendation === 'SELL' && "bg-rose-900/50 text-rose-400",
                          )}>
                            {analyses[holding.symbol].recommendation}
                          </span>
                          <div className="absolute bottom-full right-0 mb-2 w-72 p-4 bg-zinc-900 text-zinc-200 text-xs rounded-xl opacity-0 group-hover/tip:opacity-100 transition-all pointer-events-none z-[9999] shadow-2xl border border-zinc-700">
                            <div className="flex items-center gap-2 mb-2 pb-2 border-b border-zinc-700">
                              <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                              <p className="font-bold text-[10px] uppercase tracking-wider text-zinc-400">AI Strategy Reasoning</p>
                            </div>
                            <p className="leading-relaxed text-zinc-400 italic mb-3">"{analyses[holding.symbol].reasoning}"</p>
                            {analyses[holding.symbol].projectedGrowth && (
                              <div className="mb-3">
                                <p className="font-bold text-[10px] uppercase tracking-wider text-blue-400 mb-1">Projected Growth</p>
                                <p className="text-zinc-400">{analyses[holding.symbol].projectedGrowth}</p>
                              </div>
                            )}
                            {analyses[holding.symbol].keyFactors?.length ? (
                              <div className="mb-3">
                                <p className="font-bold text-[10px] uppercase tracking-wider text-blue-400 mb-1">Key Factors</p>
                                <ul className="list-disc list-inside text-zinc-500 text-[10px] space-y-0.5">
                                  {analyses[holding.symbol].keyFactors?.map((factor, i) => <li key={i}>{factor}</li>)}
                                </ul>
                              </div>
                            ) : null}
                            {analyses[holding.symbol].metrics && (
                              <div className="grid grid-cols-2 gap-2 text-[10px] pt-2 border-t border-zinc-700">
                                {analyses[holding.symbol].metrics?.peRatio && <div><span className="text-zinc-600">P/E:</span> {analyses[holding.symbol].metrics?.peRatio}</div>}
                                {analyses[holding.symbol].metrics?.marketCap && <div><span className="text-zinc-600">Mkt Cap:</span> {analyses[holding.symbol].metrics?.marketCap}</div>}
                                {analyses[holding.symbol].metrics?.dividendYield && <div><span className="text-zinc-600">Div:</span> {analyses[holding.symbol].metrics?.dividendYield}</div>}
                              </div>
                            )}
                          </div>
                        </div>
                      ) : <span className="text-[10px] text-zinc-600 italic">No analysis</span>}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1">
                        <button onClick={() => onToggleChart(holding.symbol)} className={cn("p-1.5 rounded-lg transition-colors", expandedChart[holding.symbol] ? "bg-blue-600/20 text-blue-400" : "text-zinc-600 hover:text-blue-400 hover:bg-zinc-800")} title="Chart">
                          <TrendingUp className={cn("w-4 h-4", loadingChart[holding.symbol] && "animate-spin")} />
                        </button>
                        <button onClick={() => onToggleNews(holding.symbol)} className={cn("p-1.5 rounded-lg transition-colors", expandedNews[holding.symbol] ? "bg-blue-600/20 text-blue-400" : "text-zinc-600 hover:text-blue-400 hover:bg-zinc-800")} title="News">
                          <RefreshCw className={cn("w-4 h-4", loadingNews[holding.symbol] && "animate-spin")} />
                        </button>
                        <button onClick={() => onRemoveHolding(idx)} className="p-1.5 text-zinc-600 hover:text-rose-400 hover:bg-zinc-800 rounded-lg transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {/* Expanded rows */}
              {portfolio.holdings.map((holding, idx) => (expandedChart[holding.symbol] || expandedNews[holding.symbol]) && (
                <tr key={`details-${holding.symbol}-${idx}`} className="bg-zinc-800/20">
                  <td colSpan={8} className="px-5 py-4">
                    <div className="space-y-5">
                      {expandedChart[holding.symbol] && (
                        <div className="space-y-3">
                          <div className="flex justify-between items-center">
                            <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                              <TrendingUp className="w-3 h-3" />Price History: {holding.symbol}
                            </h4>
                            <div className="flex gap-1">
                              {['1D', '5D', '1M', '6M', '1Y', '5Y', 'MAX'].map(range => (
                                <button key={range} onClick={() => onToggleChart(holding.symbol, range)} className={cn("px-2 py-0.5 rounded text-[9px] font-bold transition-all", selectedRange[holding.symbol] === range ? "bg-blue-600 text-white" : "bg-zinc-800 text-zinc-500 hover:text-zinc-300 border border-zinc-700")}>
                                  {range}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="h-40 w-full bg-zinc-900 rounded-xl p-3 border border-zinc-800 relative">
                            {loadingChart[holding.symbol] ? (
                              <div className="absolute inset-0 flex items-center justify-center"><RefreshCw className="w-5 h-5 text-blue-500 animate-spin" /></div>
                            ) : priceHistory[holding.symbol]?.length ? (() => {
                              const rows = priceHistory[holding.symbol];
                              const trendColor = getTrendColor(rows);
                              return (
                                <ResponsiveContainer width="100%" height="100%">
                                  <AreaChart data={rows} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
                                    <defs>
                                      <linearGradient id={`hlGrad-${holding.symbol}`} x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor={trendColor} stopOpacity={0.2} />
                                        <stop offset="95%" stopColor={trendColor} stopOpacity={0.0} />
                                      </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#27272a" />
                                    <XAxis dataKey="date" hide />
                                    <YAxis hide domain={['auto', 'auto']} />
                                    <RechartsTooltip contentStyle={darkTooltip} formatter={(v) => [fc(typeof v === 'number' ? v : Number(v) || 0), 'Price']} />
                                    <Area type="linear" dataKey="price" stroke={trendColor} strokeWidth={1.5} fill={`url(#hlGrad-${holding.symbol})`} dot={false} animationDuration={600} />
                                  </AreaChart>
                                </ResponsiveContainer>
                              );
                            })() : <div className="h-full flex items-center justify-center text-zinc-600 text-xs italic">No historical data available.</div>}
                          </div>
                        </div>
                      )}
                      {expandedNews[holding.symbol] && (
                        <div className="space-y-3">
                          <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                            <RefreshCw className="w-3 h-3" />Latest News: {holding.symbol}
                          </h4>
                          {loadingNews[holding.symbol] ? (
                            <div className="flex items-center gap-2 text-xs text-zinc-500 italic">
                              <RefreshCw className="w-3 h-3 animate-spin" />Fetching headlines...
                            </div>
                          ) : news[holding.symbol]?.length ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {news[holding.symbol].map((item, nIdx) => (
                                <div key={nIdx} className="p-3 bg-zinc-800/60 rounded-xl border border-zinc-700/50">
                                  <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-blue-400 hover:underline">{item.title}</a>
                                  <ExpandableText text={item.snippet} maxChars={130} className="text-[10px] text-zinc-500 mt-1" />
                                  <div className="flex justify-between items-center text-[9px] text-zinc-600 mt-1.5">
                                    <span>{item.source}</span>
                                    {item.date && <span>{fd(item.date)}</span>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : <p className="text-xs text-zinc-600 italic">No recent news found.</p>}
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {portfolio.holdings.length === 0 && (
                <tr><td colSpan={8} className="px-6 py-12 text-center text-zinc-600 italic text-sm">Your portfolio is empty. Add your first holding above.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
}
