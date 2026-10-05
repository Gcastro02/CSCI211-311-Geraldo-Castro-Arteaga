import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Trash2, TrendingUp, RefreshCw, Bell, BellRing, X, AlertCircle, List } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import { cn } from '../lib/utils';
import { formatCurrency, formatDate } from '../lib/formatters';
import { getTrendColor } from '../lib/chartUtils';
import { WatchlistItem, StockAnalysis, UserSettings, PriceData, NewsItem } from '../types';
import ExpandableText from './ExpandableText';

const darkTooltip = {
  borderRadius: '6px', border: '1px solid #27272a',
  background: '#18181b', color: '#f4f4f5', fontSize: '9px',
};

interface Props {
  watchlist: WatchlistItem[];
  analyses: Record<string, StockAnalysis>;
  currentPrices: Record<string, number>;
  settings: UserSettings;
  isAutoAnalyzingWatchlist: boolean;
  isCheckingAlerts: boolean;
  expandedChart: Record<string, boolean>;
  expandedNews: Record<string, boolean>;
  selectedRange: Record<string, string>;
  priceHistory: Record<string, PriceData[]>;
  loadingChart: Record<string, boolean>;
  news: Record<string, NewsItem[]>;
  loadingNews: Record<string, boolean>;
  onAddWatchlist: (symbol: string) => void;
  onRemoveWatchlist: (symbol: string) => void;
  onCheckAlerts: () => void;
  onSaveAlert: (symbol: string, price: number, direction: 'ABOVE' | 'BELOW') => void;
  onRemoveAlert: (symbol: string) => void;
  onToggleChart: (symbol: string, range?: string) => void;
  onToggleNews: (symbol: string, isGeneral?: boolean) => void;
}

export default function WatchlistTab({
  watchlist, analyses, currentPrices, settings,
  isAutoAnalyzingWatchlist, isCheckingAlerts,
  expandedChart, expandedNews, selectedRange, priceHistory, loadingChart,
  news, loadingNews,
  onAddWatchlist, onRemoveWatchlist, onCheckAlerts,
  onSaveAlert, onRemoveAlert, onToggleChart, onToggleNews,
}: Props) {
  const [newSymbol, setNewSymbol] = useState('');
  const [alertSetup, setAlertSetup] = useState<string | null>(null);
  const [alertForm, setAlertForm] = useState<{ price: string; direction: 'ABOVE' | 'BELOW' }>({ price: '', direction: 'ABOVE' });

  const fc = (n: number) => formatCurrency(n, settings.currency);
  const fd = (s?: string) => formatDate(s, settings.dateFormat);

  return (
    <motion.div
      key="watchlist"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-4"
    >
      <div className="flex justify-between items-center">
        <div>
          <p className="text-zinc-500 text-sm">Monitor potential investments</p>
          {isAutoAnalyzingWatchlist && (
            <p className="text-[11px] text-blue-400 font-medium mt-1 flex items-center gap-1.5">
              <RefreshCw className="w-3 h-3 animate-spin" />Analyzing watchlist...
            </p>
          )}
        </div>
        <button
          onClick={onCheckAlerts}
          disabled={isCheckingAlerts || !watchlist.some(w => w.targetPrice)}
          className="flex items-center gap-2 bg-zinc-800 border border-zinc-700 text-zinc-300 px-4 py-2 rounded-xl hover:bg-zinc-700 transition-colors disabled:opacity-40 text-sm font-bold"
        >
          <BellRing className={cn("w-4 h-4", isCheckingAlerts && "animate-pulse text-amber-400")} />
          Check Alerts
        </button>
      </div>

      {/* Add Symbol */}
      <div className="bg-zinc-900 rounded-2xl p-5 border border-zinc-800">
        <h3 className="font-bold text-zinc-100 mb-4">Track New Asset</h3>
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 w-4 h-4" />
            <input
              type="text"
              value={newSymbol}
              onChange={e => setNewSymbol(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { onAddWatchlist(newSymbol); setNewSymbol(''); } }}
              placeholder="Enter stock symbol (e.g. AAPL, TSLA)..."
              className="w-full pl-10 pr-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-zinc-100 placeholder:text-zinc-500 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>
          <button
            onClick={() => { onAddWatchlist(newSymbol); setNewSymbol(''); }}
            className="bg-zinc-100 text-zinc-900 font-bold px-6 rounded-xl hover:bg-white transition-all text-sm"
          >
            Watch
          </button>
        </div>
      </div>

      {/* Watchlist Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-start">
        {watchlist.map(item => (
          <motion.div key={item.symbol} className="bg-zinc-900 rounded-2xl p-5 border border-zinc-800 flex flex-col">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center text-zinc-300 font-bold text-xs border border-zinc-700">
                  {item.symbol.slice(0, 2)}
                </div>
                <div>
                  <h4 className="font-bold text-zinc-100">{item.symbol}</h4>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-[10px] text-zinc-600 uppercase font-bold">{new Date(item.addedAt).toLocaleDateString()}</p>
                    {currentPrices[item.symbol] && (
                      <span className="text-[10px] font-bold text-zinc-300 bg-zinc-800 px-1.5 py-0.5 rounded font-mono">{fc(currentPrices[item.symbol])}</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    if (alertSetup === item.symbol) { setAlertSetup(null); }
                    else { setAlertSetup(item.symbol); setAlertForm({ price: item.targetPrice?.toString() || '', direction: item.alertDirection || 'ABOVE' }); }
                  }}
                  className={cn("p-1.5 transition-colors rounded-lg", item.targetPrice ? "text-amber-400 bg-amber-900/30 hover:bg-amber-900/50" : "text-zinc-600 hover:text-amber-400 hover:bg-zinc-800")}
                >
                  {item.targetPrice ? <BellRing className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
                </button>
                <button onClick={() => onRemoveWatchlist(item.symbol)} className="p-1.5 text-zinc-600 hover:text-rose-400 transition-colors rounded-lg hover:bg-zinc-800">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Alert Setup */}
            {alertSetup === item.symbol ? (
              <div className="mb-4 p-3 bg-amber-950/30 rounded-xl border border-amber-800/40 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">Set Price Alert</span>
                  <button onClick={() => setAlertSetup(null)} className="text-amber-600 hover:text-amber-400"><X className="w-3.5 h-3.5" /></button>
                </div>
                <div className="flex gap-2">
                  <select value={alertForm.direction} onChange={e => setAlertForm(prev => ({ ...prev, direction: e.target.value as 'ABOVE' | 'BELOW' }))} className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm font-medium text-zinc-200 focus:outline-none focus:ring-1 focus:ring-amber-500">
                    <option value="ABOVE">Goes Above</option>
                    <option value="BELOW">Drops Below</option>
                  </select>
                  <input type="number" value={alertForm.price} onChange={e => setAlertForm(prev => ({ ...prev, price: e.target.value }))} placeholder="Target Price" className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-amber-500 min-w-0" />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { const p = parseFloat(alertForm.price); if (!isNaN(p) && p > 0) { onSaveAlert(item.symbol, p, alertForm.direction); setAlertSetup(null); } }} className="flex-1 bg-amber-500 text-white font-bold py-1.5 rounded-lg text-sm hover:bg-amber-600 transition-colors">Save</button>
                  {item.targetPrice && (
                    <button onClick={() => { onRemoveAlert(item.symbol); setAlertSetup(null); }} className="px-3 bg-zinc-800 text-rose-400 border border-zinc-700 font-bold py-1.5 rounded-lg text-sm hover:bg-zinc-700 transition-colors">Remove</button>
                  )}
                </div>
              </div>
            ) : item.targetPrice ? (
              <div className="mb-3 px-3 py-2 bg-amber-950/20 rounded-xl border border-amber-800/30 flex items-center gap-2">
                <BellRing className="w-3 h-3 text-amber-400" />
                <span className="text-xs font-medium text-amber-400/80">Alert when {item.alertDirection === 'ABOVE' ? '≥' : '≤'} {fc(item.targetPrice)}</span>
              </div>
            ) : null}

            <div className="mt-3 pt-4 border-t border-zinc-800">
              <div className="flex gap-3 mb-3">
                <button onClick={() => onToggleChart(item.symbol)} className={cn("text-[10px] font-bold flex items-center gap-1 transition-colors", expandedChart[item.symbol] ? "text-blue-400" : "text-zinc-600 hover:text-blue-400")}>
                  <TrendingUp className={cn("w-3 h-3", loadingChart[item.symbol] && "animate-spin")} />{expandedChart[item.symbol] ? 'Hide Chart' : 'Chart'}
                </button>
                <button onClick={() => onToggleNews(item.symbol, true)} className={cn("text-[10px] font-bold flex items-center gap-1 transition-colors", expandedNews[item.symbol] ? "text-blue-400" : "text-zinc-600 hover:text-blue-400")}>
                  <RefreshCw className={cn("w-3 h-3", loadingNews[item.symbol] && "animate-spin")} />{expandedNews[item.symbol] ? 'Hide News' : 'News'}
                </button>
              </div>

              <AnimatePresence>
                {expandedChart[item.symbol] && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden mb-3">
                    <div className="space-y-2 pt-2">
                      <div className="flex justify-between items-center">
                        <p className="text-[10px] font-bold text-zinc-600 uppercase">Price History</p>
                        <div className="flex gap-1">
                          {['1M', '1Y', 'MAX'].map(range => (
                            <button key={range} onClick={() => onToggleChart(item.symbol, range)} className={cn("px-1.5 py-0.5 rounded text-[8px] font-bold transition-all", selectedRange[item.symbol] === range ? "bg-blue-600 text-white" : "bg-zinc-800 text-zinc-500 border border-zinc-700")}>
                              {range}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="h-28 w-full bg-zinc-800/30 rounded-xl p-2 border border-zinc-800 relative">
                        {loadingChart[item.symbol] ? (
                          <div className="absolute inset-0 flex items-center justify-center"><RefreshCw className="w-4 h-4 text-blue-500 animate-spin" /></div>
                        ) : priceHistory[item.symbol]?.length ? (() => {
                          const rows = priceHistory[item.symbol];
                          const trendColor = getTrendColor(rows);
                          return (
                            <ResponsiveContainer width="100%" height="100%">
                              <AreaChart data={rows} margin={{ top: 3, right: 3, left: 3, bottom: 0 }}>
                                <defs>
                                  <linearGradient id={`wlGrad-${item.symbol}`} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={trendColor} stopOpacity={0.2} />
                                    <stop offset="95%" stopColor={trendColor} stopOpacity={0.0} />
                                  </linearGradient>
                                </defs>
                                <XAxis dataKey="date" hide />
                                <YAxis hide domain={['auto', 'auto']} />
                                <RechartsTooltip contentStyle={darkTooltip} formatter={(v) => [fc(typeof v === 'number' ? v : Number(v) || 0), 'Price']} />
                                <Area type="linear" dataKey="price" stroke={trendColor} strokeWidth={1.5} fill={`url(#wlGrad-${item.symbol})`} dot={false} animationDuration={600} />
                              </AreaChart>
                            </ResponsiveContainer>
                          );
                        })() : <div className="h-full flex items-center justify-center text-[9px] text-zinc-600 italic">No data.</div>}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {expandedNews[item.symbol] && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden mb-3">
                    <div className="space-y-2 pt-2">
                      {loadingNews[item.symbol] ? (
                        <div className="text-[10px] text-zinc-500 italic">Loading news...</div>
                      ) : news[item.symbol]?.map((n, nIdx) => (
                        <div key={nIdx} className="p-2 bg-zinc-800/50 rounded-lg hover:bg-zinc-800 transition-colors border border-zinc-700/50">
                          <a href={n.url} target="_blank" rel="noopener noreferrer" className="text-[10px] font-bold text-blue-400 hover:underline">{n.title}</a>
                          <ExpandableText text={n.snippet} maxChars={85} className="text-[9px] text-zinc-500 mt-1" />
                          <div className="flex justify-between text-[8px] text-zinc-600 mt-1"><span>{n.source}</span></div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* AI Analysis */}
              {analyses[item.symbol] ? (
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase">AI Verdict</span>
                    <span className={cn("text-xs font-bold px-2 py-0.5 rounded", analyses[item.symbol].recommendation === 'BUY' ? "bg-emerald-900/50 text-emerald-400" : analyses[item.symbol].recommendation === 'SELL' ? "bg-rose-900/50 text-rose-400" : "bg-amber-900/50 text-amber-400")}>
                      {analyses[item.symbol].recommendation}
                    </span>
                  </div>
                  <ExpandableText text={analyses[item.symbol].reasoning} maxChars={180} className="text-xs text-zinc-400 leading-relaxed" />
                  {analyses[item.symbol].projectedGrowth && (
                    <div className="bg-blue-950/30 p-3 rounded-xl border border-blue-900/30">
                      <p className="text-[10px] font-bold text-blue-400 uppercase mb-1">Projected Growth</p>
                      <p className="text-xs text-blue-300">{analyses[item.symbol].projectedGrowth}</p>
                    </div>
                  )}
                  {analyses[item.symbol].keyFactors?.length ? (
                    <div className="flex flex-wrap gap-1">
                      {analyses[item.symbol].keyFactors?.map((factor, i) => (
                        <span key={i} className="px-2 py-0.5 bg-zinc-800 text-zinc-400 text-[9px] font-bold rounded uppercase tracking-wider">{factor}</span>
                      ))}
                    </div>
                  ) : null}
                  {analyses[item.symbol].metrics && (
                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-zinc-800">
                      {analyses[item.symbol].metrics?.peRatio && <div><p className="text-[9px] font-bold text-zinc-600 uppercase">P/E</p><p className="text-xs font-medium text-zinc-300">{analyses[item.symbol].metrics?.peRatio}</p></div>}
                      {analyses[item.symbol].metrics?.marketCap && <div><p className="text-[9px] font-bold text-zinc-600 uppercase">Mkt Cap</p><p className="text-xs font-medium text-zinc-300">{analyses[item.symbol].metrics?.marketCap}</p></div>}
                      {analyses[item.symbol].metrics?.dividendYield && <div><p className="text-[9px] font-bold text-zinc-600 uppercase">Div</p><p className="text-xs font-medium text-zinc-300">{analyses[item.symbol].metrics?.dividendYield}</p></div>}
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-600 pt-1">
                    <AlertCircle className="w-3 h-3" />RISK: {analyses[item.symbol].riskLevel}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center py-4 text-zinc-600">
                  <RefreshCw className="w-5 h-5 mb-2 animate-spin opacity-30" />
                  <p className="text-[10px] uppercase font-bold tracking-widest">Analyzing...</p>
                </div>
              )}
            </div>
          </motion.div>
        ))}
        {watchlist.length === 0 && (
          <div className="col-span-full py-20 bg-zinc-900 rounded-2xl border-2 border-dashed border-zinc-800 flex flex-col items-center justify-center text-zinc-600">
            <List className="w-10 h-10 mb-3 opacity-20" />
            <p className="font-medium text-sm">Your watchlist is empty</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
