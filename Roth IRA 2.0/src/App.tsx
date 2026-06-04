/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  TrendingUp, Wallet, List, Sparkles,
  PieChart as PieChartIcon, Settings,
  Info, X, CheckCircle2, RefreshCw,
} from 'lucide-react';
import { cn } from './lib/utils';
import { formatCurrency } from './lib/formatters';
import {
  PortfolioData, StockHolding, WatchlistItem,
  StockAnalysis, MarketSuggestion, NewsItem,
  UserSettings, PriceData, ContributionRecord,
} from './types';
import {
  analyzePortfolio, getMarketSuggestions, analyzeWatchlistStock,
  getStockNews, getStockPriceHistory, getCurrentPrice,
} from './services/openaiService';

import DashboardTab   from './components/DashboardTab';
import HoldingsTab    from './components/HoldingsTab';
import WatchlistTab   from './components/WatchlistTab';
import DetailedTab    from './components/DetailedTab';
import SuggestionsTab from './components/SuggestionsTab';
import SettingsTab    from './components/SettingsTab';
import MarketIndices  from './components/MarketIndices';

type TabId = 'dashboard' | 'holdings' | 'watchlist' | 'detailed' | 'suggestions' | 'settings';

const defaultSettings: UserSettings = {
  currency: 'USD',
  dateFormat: 'MM/DD/YYYY',
  investmentHorizon: 'LONG_TERM',
  preferredNewsSources: [],
  themeMode: 'DARK',
  age50OrOlder: false,
};

const normalizeSettings = (raw: unknown): UserSettings => {
  if (!raw || typeof raw !== 'object') return defaultSettings;
  const c = raw as Partial<UserSettings>;
  return {
    ...defaultSettings, ...c,
    preferredNewsSources: Array.isArray(c.preferredNewsSources) ? c.preferredNewsSources : [],
    themeMode: c.themeMode === 'DARK' ? 'DARK' : 'LIGHT',
    age50OrOlder: c.age50OrOlder === true,
  };
};

export default function App() {
  // ── Portfolio & watchlist ─────────────────────────────────────────
  const [portfolio, setPortfolio] = useState<PortfolioData>(() => {
    try { const s = localStorage.getItem('roth_ira_portfolio'); return s ? JSON.parse(s) : { cashBalance: 0, holdings: [] }; }
    catch { return { cashBalance: 0, holdings: [] }; }
  });

  const [watchlist, setWatchlist] = useState<WatchlistItem[]>(() => {
    try { const s = localStorage.getItem('roth_ira_watchlist'); return s ? JSON.parse(s) : []; }
    catch { return []; }
  });

  const [settings, setSettings] = useState<UserSettings>(() => {
    const s = localStorage.getItem('roth_ira_settings');
    if (!s) return defaultSettings;
    try { return normalizeSettings(JSON.parse(s)); } catch { return defaultSettings; }
  });

  const [contribution, setContribution] = useState<ContributionRecord>(() => {
    try {
      const s = localStorage.getItem('roth_ira_contribution');
      const p = s ? JSON.parse(s) : null;
      const y = new Date().getFullYear();
      return p && p.year === y ? p : { year: y, contributed: 0 };
    } catch { return { year: new Date().getFullYear(), contributed: 0 }; }
  });

  // ── AI & price state ─────────────────────────────────────────────
  const [analyses, setAnalyses]     = useState<Record<string, StockAnalysis>>({});
  const [suggestions, setSuggestions] = useState<MarketSuggestion[]>([]);
  const [news, setNews]             = useState<Record<string, NewsItem[]>>({});
  const [priceHistory, setPriceHistory] = useState<Record<string, PriceData[]>>({});
  const [currentPrices, setCurrentPrices] = useState<Record<string, number>>({});

  // ── UI loading state ─────────────────────────────────────────────
  const [isAnalyzing, setIsAnalyzing]   = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [isAutoAnalyzingWatchlist, setIsAutoAnalyzingWatchlist] = useState(false);
  const [isCheckingAlerts, setIsCheckingAlerts] = useState(false);
  const [isUpdatingPrices, setIsUpdatingPrices] = useState(false);
  const [loadingNews, setLoadingNews]   = useState<Record<string, boolean>>({});
  const [loadingChart, setLoadingChart] = useState<Record<string, boolean>>({});
  const [loadingGeneralNews, setLoadingGeneralNews] = useState(false);
  const [generalNews, setGeneralNews]   = useState<NewsItem[]>([]);

  // ── Chart / expand state ─────────────────────────────────────────
  const [expandedNews, setExpandedNews]   = useState<Record<string, boolean>>({});
  const [expandedChart, setExpandedChart] = useState<Record<string, boolean>>({});
  const [selectedRange, setSelectedRange] = useState<Record<string, string>>({});

  // ── Misc ─────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [notifications, setNotifications] = useState<{ id: string; message: string; type: 'success' | 'info' }[]>([]);
  const [cashInput, setCashInput] = useState(portfolio.cashBalance.toString());
  const [contributionInput, setContributionInput] = useState('');

  // ── Persistence effects ──────────────────────────────────────────
  useEffect(() => { localStorage.setItem('roth_ira_portfolio', JSON.stringify(portfolio)); }, [portfolio]);
  useEffect(() => { localStorage.setItem('roth_ira_watchlist', JSON.stringify(watchlist)); }, [watchlist]);
  useEffect(() => { localStorage.setItem('roth_ira_settings', JSON.stringify(settings)); }, [settings]);
  useEffect(() => { localStorage.setItem('roth_ira_contribution', JSON.stringify(contribution)); }, [contribution]);
  useEffect(() => { document.documentElement.classList.add('dark'); }, []);

  // ── Auto price refresh ───────────────────────────────────────────
  const priceRefreshKey = [...portfolio.holdings.map(h => h.symbol), ...watchlist.map(w => w.symbol)].sort().join('|');
  useEffect(() => {
    updateAllPrices(false);
    const id = setInterval(() => updateAllPrices(false), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [priceRefreshKey]);

  // ── Auto watchlist analysis ──────────────────────────────────────
  useEffect(() => {
    const missing = watchlist.map(i => i.symbol.trim().toUpperCase()).filter(s => s && !analyses[s]);
    if (missing.length === 0) { setIsAutoAnalyzingWatchlist(false); return; }
    let cancelled = false;
    setIsAutoAnalyzingWatchlist(true);
    Promise.all(missing.map(async symbol => {
      try { return { symbol, analysis: await analyzeWatchlistStock(symbol, settings) }; }
      catch { return null; }
    })).then(results => {
      if (cancelled) return;
      setAnalyses(prev => {
        const next = { ...prev };
        results.forEach(r => { if (r?.analysis) next[r.symbol] = r.analysis; });
        return next;
      });
    }).catch(console.error).finally(() => { if (!cancelled) setIsAutoAnalyzingWatchlist(false); });
    return () => { cancelled = true; };
  }, [watchlist, analyses, settings]);

  // ── Auto alert polling (every 5 min when active alerts exist) ────
  useEffect(() => {
    const hasAlerts = watchlist.some(i => i.targetPrice);
    if (!hasAlerts) return;
    const id = setInterval(() => checkWatchlistAlerts(true), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [watchlist]);

  // ── General news ─────────────────────────────────────────────────
  useEffect(() => { fetchGeneralNews(); }, [settings.preferredNewsSources]);

  // ── Helpers ──────────────────────────────────────────────────────
  const addNotification = (message: string, type: 'success' | 'info' = 'info') => {
    const id = Math.random().toString(36).slice(2, 9);
    setNotifications(prev => [...prev, { id, message, type }]);
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 5000);
  };

  const getErrorMessage = (error: unknown, fallback: string) => {
    if (error instanceof Error && error.message) return error.message;
    if (typeof error === 'string' && error.trim()) return error;
    return fallback;
  };

  const fc = (n: number) => formatCurrency(n, settings.currency);

  // ── Handlers ─────────────────────────────────────────────────────
  const updateAllPrices = async (showNotification = true) => {
    const symbols = new Set([...portfolio.holdings.map(h => h.symbol), ...watchlist.map(w => w.symbol)]);
    if (symbols.size === 0) return;
    setIsUpdatingPrices(true);
    let count = 0;
    try {
      const next: Record<string, number> = {};
      await Promise.all(Array.from(symbols).map(async sym => {
        try { const p = await getCurrentPrice(sym); if (p > 0) { next[sym] = p; count++; } } catch {}
      }));
      setCurrentPrices(prev => ({ ...prev, ...next }));
      if (showNotification) addNotification(count > 0 ? `Updated prices for ${count} assets.` : 'Could not update prices.', count > 0 ? 'success' : 'info');
    } catch {
      if (showNotification) addNotification('Failed to update prices.', 'info');
    } finally { setIsUpdatingPrices(false); }
  };

  const toggleChart = async (symbol: string, range = '1Y') => {
    const isExpanded = expandedChart[symbol];
    const isSameRange = selectedRange[symbol] === range;
    if (isExpanded && isSameRange) { setExpandedChart(prev => ({ ...prev, [symbol]: false })); return; }
    setExpandedChart(prev => ({ ...prev, [symbol]: true }));
    setSelectedRange(prev => ({ ...prev, [symbol]: range }));
    setLoadingChart(prev => ({ ...prev, [symbol]: true }));
    try { const h = await getStockPriceHistory(symbol, range); setPriceHistory(prev => ({ ...prev, [symbol]: h })); }
    catch (e) { console.error(e); }
    finally { setLoadingChart(prev => ({ ...prev, [symbol]: false })); }
  };

  const toggleNews = async (symbol: string, isGeneral = false) => {
    const isExpanded = expandedNews[symbol];
    setExpandedNews(prev => ({ ...prev, [symbol]: !isExpanded }));
    if (!isExpanded && !news[symbol]) {
      setLoadingNews(prev => ({ ...prev, [symbol]: true }));
      try { const d = await getStockNews(symbol, settings, isGeneral); setNews(prev => ({ ...prev, [symbol]: d })); }
      catch (e) { addNotification(getErrorMessage(e, `Failed to fetch news for ${symbol}.`), 'info'); }
      finally { setLoadingNews(prev => ({ ...prev, [symbol]: false })); }
    }
  };

  const fetchGeneralNews = async () => {
    setLoadingGeneralNews(true);
    try { const d = await getStockNews('', settings, true); setGeneralNews(d); }
    catch (e) { addNotification(getErrorMessage(e, 'Failed to fetch general news.'), 'info'); }
    finally { setLoadingGeneralNews(false); }
  };

  const handleAddHolding = (holding: StockHolding) => {
    const symbol = holding.symbol.trim().toUpperCase();
    if (!symbol || holding.shares <= 0) return;
    if (portfolio.holdings.some(h => h.symbol === symbol)) {
      addNotification(`${symbol} is already in your portfolio. Remove it first to update.`, 'info'); return;
    }
    const cost = holding.shares * holding.averagePrice;
    setPortfolio(prev => {
      const newCash = prev.cashBalance - cost;
      if (newCash < 0) addNotification(`Heads up: purchase cost (${fc(cost)}) exceeds available cash. Balance set to $0.`, 'info');
      return { ...prev, cashBalance: Math.max(newCash, 0), holdings: [...prev.holdings, { ...holding, symbol }] };
    });
  };

  const handleRemoveHolding = (index: number) => {
    setPortfolio(prev => {
      const h = prev.holdings[index];
      const saleValue = h.shares * (currentPrices[h.symbol] || h.averagePrice);
      return { ...prev, cashBalance: prev.cashBalance + saleValue, holdings: prev.holdings.filter((_, i) => i !== index) };
    });
  };

  const handleAddWatchlist = async (symbol: string) => {
    const s = symbol.trim().toUpperCase();
    if (!s || watchlist.some(i => i.symbol === s)) return;
    setWatchlist(prev => [...prev, { symbol: s, addedAt: new Date().toISOString() }]);
    try { const a = await analyzeWatchlistStock(s, settings); setAnalyses(prev => ({ ...prev, [s]: a })); }
    catch (e) { addNotification(getErrorMessage(e, `Failed to analyze ${s}.`), 'info'); }
  };

  const handleRemoveWatchlist = (symbol: string) => {
    setWatchlist(prev => prev.filter(i => i.symbol !== symbol));
    setAnalyses(prev => { const n = { ...prev }; delete n[symbol]; return n; });
  };

  const handleSaveAlert = (symbol: string, price: number, direction: 'ABOVE' | 'BELOW') => {
    setWatchlist(prev => prev.map(i => i.symbol === symbol ? { ...i, targetPrice: price, alertDirection: direction } : i));
    addNotification(`Alert set for ${symbol} at ${fc(price)}`, 'success');
  };

  const handleRemoveAlert = (symbol: string) => {
    setWatchlist(prev => prev.map(i => {
      if (i.symbol !== symbol) return i;
      const { targetPrice, alertDirection, ...rest } = i;
      return rest;
    }));
    addNotification(`Alert removed for ${symbol}`, 'info');
  };

  const checkWatchlistAlerts = async (silent = false) => {
    setIsCheckingAlerts(true);
    const itemsWithAlerts = watchlist.filter(i => i.targetPrice);
    let triggered = 0;
    for (const item of itemsWithAlerts) {
      try {
        const price = await getCurrentPrice(item.symbol);
        if (price > 0) {
          if (item.alertDirection === 'ABOVE' && price >= item.targetPrice!) { addNotification(`${item.symbol} reached ${fc(price)}, above target ${fc(item.targetPrice!)}!`, 'success'); triggered++; }
          else if (item.alertDirection === 'BELOW' && price <= item.targetPrice!) { addNotification(`${item.symbol} dropped to ${fc(price)}, below target ${fc(item.targetPrice!)}!`, 'success'); triggered++; }
        }
      } catch {}
    }
    if (!silent) {
      if (triggered === 0 && itemsWithAlerts.length > 0) addNotification(`Checked ${itemsWithAlerts.length} alerts. No targets reached.`, 'info');
      else if (itemsWithAlerts.length === 0) addNotification('No active alerts to check.', 'info');
    }
    setIsCheckingAlerts(false);
  };

  const runPortfolioAnalysis = async () => {
    if (portfolio.holdings.length === 0) return;
    setIsAnalyzing(true);
    try {
      const results = await analyzePortfolio(portfolio.holdings, settings);
      setAnalyses(prev => { const m: Record<string, StockAnalysis> = {}; results.forEach(r => { m[r.symbol] = r; }); return { ...prev, ...m }; });
    } catch (e) { addNotification(getErrorMessage(e, 'Portfolio analysis failed.'), 'info'); }
    finally { setIsAnalyzing(false); }
  };

  const fetchSuggestions = async () => {
    setIsSuggesting(true);
    try { setSuggestions(await getMarketSuggestions(settings)); }
    catch (e) { addNotification(getErrorMessage(e, 'Failed to get market suggestions.'), 'info'); }
    finally { setIsSuggesting(false); }
  };

  // ── Derived values ───────────────────────────────────────────────
  const totalValue = portfolio.cashBalance + portfolio.holdings.reduce((acc, h) => acc + h.shares * (currentPrices[h.symbol] || h.averagePrice), 0);
  const chartData = [
    { name: 'Cash', value: portfolio.cashBalance },
    ...portfolio.holdings.map(h => ({ name: h.symbol, value: h.shares * (currentPrices[h.symbol] || h.averagePrice) })),
  ].filter(d => d.value > 0);
  const trackedSymbols = Array.from(new Set([
    ...portfolio.holdings.map(h => h.symbol.trim().toUpperCase()),
    ...watchlist.map(w => w.symbol.trim().toUpperCase()),
  ].filter(Boolean)));

  // ── Nav tabs ─────────────────────────────────────────────────────
  const tabs = [
    { id: 'dashboard',   icon: PieChartIcon, label: 'Dashboard' },
    { id: 'holdings',    icon: Wallet,        label: 'Holdings' },
    { id: 'watchlist',   icon: List,          label: 'Watchlist' },
    { id: 'detailed',    icon: TrendingUp,    label: 'Detailed' },
    { id: 'suggestions', icon: Sparkles,      label: 'AI Suggestions' },
    { id: 'settings',    icon: Settings,      label: 'Settings' },
  ] as const;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans">
      {/* Notifications */}
      <div className="fixed z-[100] flex flex-col gap-2 pointer-events-none" style={{ top: '112px', right: '16px' }}>
        <AnimatePresence>
          {notifications.map(note => (
            <motion.div
              key={note.id}
              initial={{ opacity: 0, x: 50, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 50, scale: 0.9 }}
              className={cn("pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl border max-w-sm",
                note.type === 'success'
                  ? "bg-zinc-900 border-emerald-800 text-emerald-300"
                  : "bg-zinc-900 border-zinc-700 text-zinc-200")}
            >
              {note.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <Info className="w-4 h-4 text-blue-400 shrink-0" />}
              <p className="text-sm font-medium leading-tight">{note.message}</p>
              <button onClick={() => setNotifications(prev => prev.filter(n => n.id !== note.id))} className="ml-auto text-zinc-600 hover:text-zinc-300 shrink-0"><X className="w-3.5 h-3.5" /></button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Fixed header */}
      <div className="fixed top-0 left-0 right-0 z-50">
        <nav className="bg-zinc-900 border-b border-zinc-800 h-14 flex items-center px-6 gap-4">
          <div className="flex items-center gap-2 shrink-0 mr-2">
            <div className="p-1.5 bg-blue-600 rounded-lg"><TrendingUp className="text-white w-4 h-4" /></div>
            <h1 className="font-bold text-white text-base tracking-tight hidden sm:block">RothIRA AI</h1>
          </div>
          <div className="flex items-center gap-0.5 flex-1 overflow-x-auto no-scrollbar">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all shrink-0",
                  activeTab === tab.id
                    ? "bg-zinc-800 text-white"
                    : "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/50"
                )}
              >
                <tab.icon className="w-4 h-4" />
                <span className="hidden md:inline">{tab.label}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right hidden sm:block">
              <p className="text-[10px] uppercase tracking-wider text-zinc-600 font-bold">Portfolio</p>
              <p className="text-sm font-bold text-zinc-100 font-mono">{fc(totalValue)}</p>
            </div>
            <button
              onClick={() => updateAllPrices(true)}
              disabled={isUpdatingPrices || (portfolio.holdings.length === 0 && watchlist.length === 0)}
              className="p-2 bg-zinc-800 text-zinc-500 hover:text-blue-400 rounded-lg transition-colors disabled:opacity-40"
              title="Update Prices"
            >
              <RefreshCw className={cn("w-4 h-4", isUpdatingPrices && "animate-spin")} />
            </button>
          </div>
        </nav>
        <MarketIndices />
      </div>

      {/* Main content */}
      <main className="pt-[104px] p-4 md:p-8 max-w-7xl mx-auto">
        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && (
            <DashboardTab
              portfolio={portfolio} currentPrices={currentPrices} analyses={analyses}
              settings={settings} isAnalyzing={isAnalyzing}
              totalValue={totalValue} chartData={chartData}
              generalNews={generalNews} loadingGeneralNews={loadingGeneralNews}
              contribution={contribution} contributionInput={contributionInput}
              setContributionInput={setContributionInput} setContribution={setContribution}
              setPortfolio={setPortfolio} cashInput={cashInput} setCashInput={setCashInput}
              onRunPortfolioAnalysis={runPortfolioAnalysis} onFetchGeneralNews={fetchGeneralNews}
              addNotification={addNotification}
            />
          )}
          {activeTab === 'holdings' && (
            <HoldingsTab
              portfolio={portfolio} currentPrices={currentPrices} analyses={analyses}
              settings={settings} isAnalyzing={isAnalyzing}
              expandedChart={expandedChart} expandedNews={expandedNews}
              selectedRange={selectedRange} priceHistory={priceHistory}
              loadingChart={loadingChart} news={news} loadingNews={loadingNews}
              onAddHolding={handleAddHolding} onRemoveHolding={handleRemoveHolding}
              onRunPortfolioAnalysis={runPortfolioAnalysis}
              onToggleChart={toggleChart} onToggleNews={toggleNews}
            />
          )}
          {activeTab === 'watchlist' && (
            <WatchlistTab
              watchlist={watchlist} analyses={analyses} currentPrices={currentPrices}
              settings={settings} isAutoAnalyzingWatchlist={isAutoAnalyzingWatchlist}
              isCheckingAlerts={isCheckingAlerts}
              expandedChart={expandedChart} expandedNews={expandedNews}
              selectedRange={selectedRange} priceHistory={priceHistory}
              loadingChart={loadingChart} news={news} loadingNews={loadingNews}
              onAddWatchlist={handleAddWatchlist} onRemoveWatchlist={handleRemoveWatchlist}
              onCheckAlerts={checkWatchlistAlerts} onSaveAlert={handleSaveAlert}
              onRemoveAlert={handleRemoveAlert} onToggleChart={toggleChart} onToggleNews={toggleNews}
            />
          )}
          {activeTab === 'detailed' && (
            <DetailedTab
              trackedSymbols={trackedSymbols} currentPrices={currentPrices}
              analyses={analyses} news={news} loadingNews={loadingNews}
              settings={settings} isUpdatingPrices={isUpdatingPrices}
              onUpdateAllPrices={updateAllPrices} onToggleNews={toggleNews}
            />
          )}
          {activeTab === 'suggestions' && (
            <SuggestionsTab
              suggestions={suggestions} isSuggesting={isSuggesting}
              onFetchSuggestions={fetchSuggestions}
              onAddToWatchlist={sym => { handleAddWatchlist(sym); setActiveTab('watchlist'); }}
            />
          )}
          {activeTab === 'settings' && (
            <SettingsTab settings={settings} setSettings={setSettings} />
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
