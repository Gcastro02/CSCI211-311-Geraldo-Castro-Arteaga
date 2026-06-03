/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  TrendingUp, 
  Plus, 
  Trash2, 
  PieChart as PieChartIcon, 
  List, 
  Sparkles, 
  AlertCircle, 
  ChevronRight,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Search,
  Info,
  Settings,
  Moon,
  Sun,
  Globe,
  Calendar,
  Clock,
  Newspaper,
  Bell,
  BellRing,
  X,
  CheckCircle2
} from 'lucide-react';
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  Tooltip as RechartsTooltip,
  ComposedChart,
  Bar,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid
} from 'recharts';
import { cn } from './lib/utils';
import { 
  PortfolioData, 
  StockHolding, 
  WatchlistItem, 
  StockAnalysis, 
  MarketSuggestion,
  NewsItem,
  UserSettings,
  PriceData
} from './types';
import { 
  analyzePortfolio, 
  getMarketSuggestions, 
  analyzeWatchlistStock,
  getStockNews,
  getStockPriceHistory,
  getCurrentPrice
} from './services/openaiService';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
const TREND_UP_COLOR = '#16a34a';
const TREND_DOWN_COLOR = '#dc2626';
type ChartMode = 'LINE' | 'CANDLES' | 'BOTH';

const defaultSettings: UserSettings = {
  currency: 'USD',
  dateFormat: 'MM/DD/YYYY',
  investmentHorizon: 'LONG_TERM',
  preferredNewsSources: [],
  themeMode: 'LIGHT',
};

const normalizeSettings = (raw: unknown): UserSettings => {
  if (!raw || typeof raw !== 'object') return defaultSettings;

  const candidate = raw as Partial<UserSettings>;
  return {
    ...defaultSettings,
    ...candidate,
    preferredNewsSources: Array.isArray(candidate.preferredNewsSources)
      ? candidate.preferredNewsSources
      : [],
    themeMode: candidate.themeMode === 'DARK' ? 'DARK' : 'LIGHT',
  };
};

const renderCandleWick = (props: any) => {
  const { x, y, width, height, payload } = props;
  const color = payload?.isUp ? TREND_UP_COLOR : TREND_DOWN_COLOR;

  return (
    <line
      x1={x + width / 2}
      x2={x + width / 2}
      y1={y}
      y2={y + height}
      stroke={color}
      strokeWidth={1}
      strokeLinecap="round"
    />
  );
};

function ExpandableText({
  text,
  maxChars = 140,
  className = '',
}: {
  text?: string;
  maxChars?: number;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!text) return null;

  const needsTruncate = text.length > maxChars;
  const displayText = !needsTruncate || expanded
    ? text
    : `${text.slice(0, maxChars).trimEnd()}...`;

  return (
    <div>
      <motion.div
        layout
        transition={{ duration: 0.22, ease: 'easeInOut' }}
        className="overflow-hidden"
      >
        <p className={className}>{displayText}</p>
      </motion.div>
      {needsTruncate && (
        <button
          type="button"
          onClick={() => setExpanded(prev => !prev)}
          className="mt-1 text-[10px] font-bold uppercase tracking-wide text-blue-600 hover:text-blue-700"
        >
          {expanded ? 'Show Less' : 'Read More'}
        </button>
      )}
    </div>
  );
}

export default function App() {
  const [portfolio, setPortfolio] = useState<PortfolioData>(() => {
    try {
      const saved = localStorage.getItem('roth_ira_portfolio');
      return saved ? JSON.parse(saved) : { cashBalance: 0, holdings: [] };
    } catch {
      return { cashBalance: 0, holdings: [] };
    }
  });

  const [watchlist, setWatchlist] = useState<WatchlistItem[]>(() => {
    try {
      const saved = localStorage.getItem('roth_ira_watchlist');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [analyses, setAnalyses] = useState<Record<string, StockAnalysis>>({});
  const [suggestions, setSuggestions] = useState<MarketSuggestion[]>([]);
  const [news, setNews] = useState<Record<string, NewsItem[]>>({});
  const [priceHistory, setPriceHistory] = useState<Record<string, PriceData[]>>({});
  const [expandedNews, setExpandedNews] = useState<Record<string, boolean>>({});
  const [expandedChart, setExpandedChart] = useState<Record<string, boolean>>({});
  const [selectedRange, setSelectedRange] = useState<Record<string, string>>({});
  const [chartMode, setChartMode] = useState<Record<string, ChartMode>>(() => {
    const saved = localStorage.getItem('roth_ira_chart_mode');
    return saved ? JSON.parse(saved) : {};
  });
  const [settings, setSettings] = useState<UserSettings>(() => {
    const saved = localStorage.getItem('roth_ira_settings');
    if (!saved) return defaultSettings;
    try {
      return normalizeSettings(JSON.parse(saved));
    } catch {
      return defaultSettings;
    }
  });
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [loadingNews, setLoadingNews] = useState<Record<string, boolean>>({});
  const [loadingChart, setLoadingChart] = useState<Record<string, boolean>>({});
  const [generalNews, setGeneralNews] = useState<NewsItem[]>([]);
  const [loadingGeneralNews, setLoadingGeneralNews] = useState(false);
  const [isAutoAnalyzingWatchlist, setIsAutoAnalyzingWatchlist] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'holdings' | 'watchlist' | 'detailed' | 'suggestions' | 'settings'>('dashboard');

  // Alert states
  const [notifications, setNotifications] = useState<{id: string, message: string, type: 'success'|'info'}[]>([]);
  const [alertSetup, setAlertSetup] = useState<string | null>(null);
  const [alertForm, setAlertForm] = useState<{price: string, direction: 'ABOVE'|'BELOW'}>({price: '', direction: 'ABOVE'});
  const [isCheckingAlerts, setIsCheckingAlerts] = useState(false);
  const [currentPrices, setCurrentPrices] = useState<Record<string, number>>({});
  const [isUpdatingPrices, setIsUpdatingPrices] = useState(false);

  // Form states
  const [newHolding, setNewHolding] = useState<StockHolding>({ symbol: '', shares: 0, averagePrice: 0 });
  const [newWatchlistSymbol, setNewWatchlistSymbol] = useState('');
  const [cashInput, setCashInput] = useState(portfolio.cashBalance.toString());
  const [detailedRange, setDetailedRange] = useState('6M');
  const [detailedHistory, setDetailedHistory] = useState<PriceData[]>([]);
  const [detailedCurrentPrice, setDetailedCurrentPrice] = useState<number | null>(null);
  const [isLoadingDetailed, setIsLoadingDetailed] = useState(false);
  const [detailedPanel, setDetailedPanel] = useState<'overview' | 'news' | 'financials'>('overview');
  const [marketSnapshot, setMarketSnapshot] = useState<Record<string, { value: number; change: number; changePercent: number }>>({});

  const trackedSymbols = Array.from(
    new Set([
      ...portfolio.holdings.map(h => h.symbol.trim().toUpperCase()),
      ...watchlist.map(w => w.symbol.trim().toUpperCase()),
    ].filter(Boolean)),
  );

  const [detailedSymbol, setDetailedSymbol] = useState<string>(() => {
    return portfolio.holdings[0]?.symbol?.trim().toUpperCase()
      || watchlist[0]?.symbol?.trim().toUpperCase()
      || 'AAPL';
  });
  const priceRefreshKey = [
    ...portfolio.holdings.map(h => h.symbol.trim().toUpperCase()),
    ...watchlist.map(w => w.symbol.trim().toUpperCase())
  ].sort().join('|');

  useEffect(() => {
    localStorage.setItem('roth_ira_portfolio', JSON.stringify(portfolio));
  }, [portfolio]);

  useEffect(() => {
    localStorage.setItem('roth_ira_watchlist', JSON.stringify(watchlist));
  }, [watchlist]);

  useEffect(() => {
    localStorage.setItem('roth_ira_settings', JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', settings.themeMode === 'DARK');
  }, [settings.themeMode]);

  useEffect(() => {
    localStorage.setItem('roth_ira_chart_mode', JSON.stringify(chartMode));
  }, [chartMode]);

  useEffect(() => {
    if (trackedSymbols.length === 0) return;
    if (!trackedSymbols.includes(detailedSymbol)) {
      setDetailedSymbol(trackedSymbols[0]);
    }
  }, [trackedSymbols, detailedSymbol]);

  useEffect(() => {
    let cancelled = false;

    const loadDetailedView = async () => {
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
      } catch (error) {
        if (!cancelled) {
          console.error(`Failed to load detailed view data for ${detailedSymbol}`, error);
          setDetailedHistory([]);
          setDetailedCurrentPrice(null);
        }
      } finally {
        if (!cancelled) setIsLoadingDetailed(false);
      }
    };

    loadDetailedView();

    return () => {
      cancelled = true;
    };
  }, [detailedSymbol, detailedRange]);

  useEffect(() => {
    let cancelled = false;

    const loadMarketSnapshot = async () => {
      const snapshotSymbols = [
        { key: 'S&P 500', symbol: 'SPY' },
        { key: 'Nasdaq', symbol: 'QQQ' },
        { key: 'Dow', symbol: 'DIA' },
      ];

      try {
        const results = await Promise.all(snapshotSymbols.map(async ({ key, symbol }) => {
          const history = await getStockPriceHistory(symbol, '5D');
          const latest = history[history.length - 1]?.close ?? history[history.length - 1]?.price ?? 0;
          const previous = history.length > 1 ? (history[history.length - 2].close ?? history[history.length - 2].price) : latest;
          const change = latest - previous;
          const changePercent = previous > 0 ? (change / previous) * 100 : 0;
          return [key, { value: latest, change, changePercent }] as const;
        }));

        if (!cancelled) {
          setMarketSnapshot(Object.fromEntries(results));
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to load market snapshot', error);
        }
      }
    };

    loadMarketSnapshot();

    return () => {
      cancelled = true;
    };
  }, []);

  const fetchGeneralNews = async () => {
    setLoadingGeneralNews(true);
    try {
      const data = await getStockNews('', settings, true);
      setGeneralNews(data);
    } catch (error) {
      console.error("Failed to fetch general news", error);
      addNotification(getErrorMessage(error, 'Failed to fetch general news.'), 'info');
    } finally {
      setLoadingGeneralNews(false);
    }
  };

  useEffect(() => {
    fetchGeneralNews();
  }, [settings.preferredNewsSources]);

  useEffect(() => {
    const missingSymbols = watchlist
      .map(item => item.symbol.trim().toUpperCase())
      .filter(symbol => symbol && !analyses[symbol]);

    if (missingSymbols.length === 0) {
      setIsAutoAnalyzingWatchlist(false);
      return;
    }

    let cancelled = false;
    setIsAutoAnalyzingWatchlist(true);

    const analyzeMissingWatchlist = async () => {
      try {
        const results = await Promise.all(
          missingSymbols.map(async (symbol) => {
            try {
              const analysis = await analyzeWatchlistStock(symbol, settings);
              return { symbol, analysis };
            } catch (error) {
              console.error(`Failed to analyze watchlist stock ${symbol}`, error);
              return null;
            }
          })
        );

        if (cancelled) return;

        setAnalyses(prev => {
          const next = { ...prev };
          results.forEach(result => {
            if (result?.analysis) {
              next[result.symbol] = result.analysis;
            }
          });
          return next;
        });
      } catch (error) {
        console.error('Failed to auto-analyze watchlist on startup', error);
      } finally {
        if (!cancelled) {
          setIsAutoAnalyzingWatchlist(false);
        }
      }
    };

    analyzeMissingWatchlist();

    return () => {
      cancelled = true;
    };
  }, [watchlist, analyses, settings]);

  const addNotification = (message: string, type: 'success'|'info' = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setNotifications(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  };

  const getErrorMessage = (error: unknown, fallback: string) => {
    if (error instanceof Error && error.message) return error.message;
    if (typeof error === 'string' && error.trim()) return error;
    return fallback;
  };


  const checkWatchlistAlerts = async () => {
    setIsCheckingAlerts(true);
    const itemsWithAlerts = watchlist.filter(item => item.targetPrice);
    let alertsTriggered = 0;
    
    for (const item of itemsWithAlerts) {
      try {
        const currentPrice = await getCurrentPrice(item.symbol);
        if (currentPrice > 0) {
          if (item.alertDirection === 'ABOVE' && currentPrice >= item.targetPrice!) {
            addNotification(`${item.symbol} has reached ${formatCurrency(currentPrice)}, above your target of ${formatCurrency(item.targetPrice!)}!`, 'success');
            alertsTriggered++;
          } else if (item.alertDirection === 'BELOW' && currentPrice <= item.targetPrice!) {
            addNotification(`${item.symbol} has dropped to ${formatCurrency(currentPrice)}, below your target of ${formatCurrency(item.targetPrice!)}!`, 'success');
            alertsTriggered++;
          }
        }
      } catch (error) {
        console.error(`Failed to check alert for ${item.symbol}`, error);
      }
    }
    
    if (alertsTriggered === 0 && itemsWithAlerts.length > 0) {
      addNotification(`Checked ${itemsWithAlerts.length} alerts. No targets reached yet.`, 'info');
    } else if (itemsWithAlerts.length === 0) {
      addNotification('No active alerts to check.', 'info');
    }
    setIsCheckingAlerts(false);
  };

  const updateAllPrices = async (showNotification = true) => {
    const symbolsToFetch = new Set([
      ...portfolio.holdings.map(h => h.symbol),
      ...watchlist.map(w => w.symbol)
    ]);
    
    if (symbolsToFetch.size === 0) return;
    
    setIsUpdatingPrices(true);
    let updatedCount = 0;
    try {
      const newPrices: Record<string, number> = {};
      const promises = Array.from(symbolsToFetch).map(async (symbol) => {
        try {
          const price = await getCurrentPrice(symbol);
          if (price > 0) {
            newPrices[symbol] = price;
            updatedCount++;
          }
        } catch (err) {
          console.error(`Failed to fetch current price for ${symbol}`, err);
        }
      });
      
      await Promise.all(promises);
      setCurrentPrices(prev => ({ ...prev, ...newPrices }));
      
      if (showNotification) {
        if (updatedCount > 0) {
          addNotification(`Successfully updated prices for ${updatedCount} assets.`, 'success');
        } else {
          addNotification('Could not update any prices at this time.', 'info');
        }
      }
    } catch (error) {
      console.error("Failed to update prices", error);
      if (showNotification) {
        addNotification('Failed to update prices.', 'info');
      }
    } finally {
      setIsUpdatingPrices(false);
    }
  };

  // Auto-fetch prices periodically and on mount
  useEffect(() => {
    updateAllPrices(false);
    const interval = setInterval(() => {
      updateAllPrices(false);
    }, 5 * 60 * 1000); // Every 5 minutes
    return () => clearInterval(interval);
  }, [priceRefreshKey]);

  const handleSaveAlert = (symbol: string) => {
    const price = parseFloat(alertForm.price);
    if (isNaN(price) || price <= 0) return;
    
    setWatchlist(prev => prev.map(item => 
      item.symbol === symbol 
        ? { ...item, targetPrice: price, alertDirection: alertForm.direction }
        : item
    ));
    setAlertSetup(null);
    addNotification(`Alert set for ${symbol} at ${formatCurrency(price)}`, 'success');
  };

  const handleRemoveAlert = (symbol: string) => {
    setWatchlist(prev => prev.map(item => {
      if (item.symbol === symbol) {
        const { targetPrice, alertDirection, ...rest } = item;
        return rest;
      }
      return item;
    }));
    addNotification(`Alert removed for ${symbol}`, 'info');
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: settings.currency,
    }).format(amount);
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return 'N/A';
    if (settings.dateFormat === 'MM/DD/YYYY') return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
    if (settings.dateFormat === 'DD/MM/YYYY') return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
    return date.toISOString().split('T')[0];
  };

  const formatChartAxisLabel = (value: string, range: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;

    if (range === '1D') {
      return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }

    return formatDate(value);
  };

  const getTrendColor = (rows: PriceData[]): string => {
    if (rows.length < 2) return TREND_UP_COLOR;
    const first = rows[0].close ?? rows[0].price;
    const last = rows[rows.length - 1].close ?? rows[rows.length - 1].price;
    return last >= first ? TREND_UP_COLOR : TREND_DOWN_COLOR;
  };

  const toCandleRows = (rows: PriceData[]) => {
    return rows.map((point, index) => {
      const previousClose = index > 0
        ? rows[index - 1].close ?? rows[index - 1].price
        : point.price;

      const open = point.open ?? previousClose;
      const close = point.close ?? point.price;
      const high = point.high ?? Math.max(open, close);
      const low = point.low ?? Math.min(open, close);

      return {
        ...point,
        open,
        close,
        high,
        low,
        wickBase: low,
        wickHeight: Math.max(high - low, 0.01),
        candleBase: Math.min(open, close),
        candleBody: Math.max(Math.abs(close - open), 0.01),
        isUp: close >= open,
      };
    });
  };

  const toggleChart = async (symbol: string, range: string = '1Y') => {
    const isExpanded = expandedChart[symbol];
    const isSameRange = selectedRange[symbol] === range;
    
    if (isExpanded && isSameRange) {
      setExpandedChart(prev => ({ ...prev, [symbol]: false }));
      return;
    }

    setExpandedChart(prev => ({ ...prev, [symbol]: true }));
    setSelectedRange(prev => ({ ...prev, [symbol]: range }));

    setLoadingChart(prev => ({ ...prev, [symbol]: true }));
    try {
      const history = await getStockPriceHistory(symbol, range);
      setPriceHistory(prev => ({ ...prev, [symbol]: history }));
    } catch (error) {
      console.error(`Failed to fetch price history for ${symbol}`, error);
    } finally {
      setLoadingChart(prev => ({ ...prev, [symbol]: false }));
    }
  };

  const toggleNews = async (symbol: string, isGeneral: boolean = false) => {
    const isExpanded = expandedNews[symbol];
    setExpandedNews(prev => ({ ...prev, [symbol]: !isExpanded }));

    if (!isExpanded && !news[symbol]) {
      setLoadingNews(prev => ({ ...prev, [symbol]: true }));
      try {
        const stockNews = await getStockNews(symbol, settings, isGeneral);
        setNews(prev => ({ ...prev, [symbol]: stockNews }));
      } catch (error) {
        console.error(`Failed to fetch news for ${symbol}`, error);
        addNotification(getErrorMessage(error, `Failed to fetch news for ${symbol}.`), 'info');
      } finally {
        setLoadingNews(prev => ({ ...prev, [symbol]: false }));
      }
    }
  };

  const handleAddHolding = () => {
    const normalizedSymbol = newHolding.symbol.trim().toUpperCase();
    if (!normalizedSymbol || newHolding.shares <= 0) return;
    if (portfolio.holdings.some(h => h.symbol === normalizedSymbol)) {
      addNotification(`${normalizedSymbol} is already in your portfolio. Remove it first to update.`, 'info');
      return;
    }
    setPortfolio(prev => ({
      ...prev,
      holdings: [...prev.holdings, { ...newHolding, symbol: normalizedSymbol }]
    }));
    setNewHolding({ symbol: '', shares: 0, averagePrice: 0 });
  };

  const handleRemoveHolding = (index: number) => {
    setPortfolio(prev => ({
      ...prev,
      holdings: prev.holdings.filter((_, i) => i !== index)
    }));
  };

  const handleAddWatchlist = async () => {
    if (!newWatchlistSymbol.trim()) return;
    const symbol = newWatchlistSymbol.trim().toUpperCase();
    if (watchlist.some(item => item.symbol === symbol)) return;
    
    setWatchlist(prev => [...prev, { symbol, addedAt: new Date().toISOString() }]);
    setNewWatchlistSymbol('');
    
    // Auto-analyze new watchlist item
    try {
      const analysis = await analyzeWatchlistStock(symbol, settings);
      setAnalyses(prev => ({ ...prev, [symbol]: analysis }));
    } catch (error) {
      console.error("Failed to analyze watchlist stock", error);
      addNotification(getErrorMessage(error, `Failed to analyze ${symbol}.`), 'info');
    }
  };

  const handleRemoveWatchlist = (symbol: string) => {
    setWatchlist(prev => prev.filter(item => item.symbol !== symbol));
    setAnalyses(prev => {
      const next = { ...prev };
      delete next[symbol];
      return next;
    });
  };

  const runPortfolioAnalysis = async () => {
    if (portfolio.holdings.length === 0) return;
    setIsAnalyzing(true);
    try {
      const results = await analyzePortfolio(portfolio.holdings, settings);
      const analysisMap: Record<string, StockAnalysis> = {};
      results.forEach(res => {
        analysisMap[res.symbol] = res;
      });
      setAnalyses(prev => ({ ...prev, ...analysisMap }));
    } catch (error) {
      console.error("Analysis failed", error);
      addNotification(getErrorMessage(error, 'Portfolio analysis failed.'), 'info');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const fetchSuggestions = async () => {
    setIsSuggesting(true);
    try {
      const data = await getMarketSuggestions(settings);
      setSuggestions(data);
    } catch (error) {
      console.error("Failed to get suggestions", error);
      addNotification(getErrorMessage(error, 'Failed to get market suggestions.'), 'info');
    } finally {
      setIsSuggesting(false);
    }
  };

  const totalValue = portfolio.cashBalance + portfolio.holdings.reduce((acc, h) => {
    const price = currentPrices[h.symbol] || h.averagePrice;
    return acc + (h.shares * price);
  }, 0);

  const chartData = [
    { name: 'Cash', value: portfolio.cashBalance },
    ...portfolio.holdings.map(h => {
      const price = currentPrices[h.symbol] || h.averagePrice;
      return { name: h.symbol, value: h.shares * price };
    })
  ].filter(d => d.value > 0);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans transition-colors duration-200">
      {/* Notifications Container */}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        <AnimatePresence>
          {notifications.map(note => (
            <motion.div
              key={note.id}
              initial={{ opacity: 0, x: 50, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 50, scale: 0.9 }}
              className={cn(
                "pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-2xl shadow-lg border backdrop-blur-md max-w-sm",
                note.type === 'success' ? "bg-emerald-50/95 border-emerald-200 text-emerald-800" : "bg-white/95 border-slate-200 text-slate-800"
              )}
            >
              {note.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" /> : <Info className="w-5 h-5 text-blue-500 shrink-0" />}
              <p className="text-sm font-medium leading-tight">{note.message}</p>
              <button onClick={() => setNotifications(prev => prev.filter(n => n.id !== note.id))} className="ml-auto text-slate-400 hover:text-slate-600 shrink-0">
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Sidebar / Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-4 py-2 flex justify-around items-center z-50 md:top-0 md:bottom-auto md:flex-col md:w-64 md:h-screen md:border-r md:border-t-0 md:justify-start md:py-8 md:gap-4">
        <div className="hidden md:flex items-center gap-2 mb-8 px-4 w-full">
          <div className="p-2 bg-blue-600 rounded-lg">
            <TrendingUp className="text-white w-6 h-6" />
          </div>
          <h1 className="font-bold text-xl tracking-tight">RothIRA AI</h1>
        </div>
        
        {[
          { id: 'dashboard', icon: PieChartIcon, label: 'Dashboard' },
          { id: 'holdings', icon: Wallet, label: 'Holdings' },
          { id: 'watchlist', icon: List, label: 'Watchlist' },
          { id: 'detailed', icon: TrendingUp, label: 'Detailed' },
          { id: 'suggestions', icon: Sparkles, label: 'AI Suggestions' },
          { id: 'settings', icon: Settings, label: 'Settings' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={cn(
              "flex flex-col md:flex-row items-center gap-1 md:gap-3 px-4 py-2 rounded-xl transition-all w-full",
              activeTab === tab.id 
                ? "text-blue-600 md:bg-blue-50" 
                : "text-slate-500 hover:text-slate-900 md:hover:bg-slate-100"
            )}
          >
            <tab.icon className="w-6 h-6" />
            <span className="text-[10px] md:text-sm font-medium">{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* Main Content */}
      <main className="pb-24 md:pb-8 md:pl-72 p-4 md:p-8 max-w-7xl mx-auto">
        <header className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-2xl font-bold capitalize">{activeTab}</h2>
            <p className="text-slate-500 text-sm">Manage your long-term wealth strategy</p>
          </div>
          <div className="hidden md:flex items-center gap-4 bg-white p-3 rounded-2xl shadow-sm border border-slate-100">
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Total Portfolio Value</p>
              <p className="text-xl font-bold text-slate-900">{formatCurrency(totalValue)}</p>
            </div>
            <button
              onClick={() => updateAllPrices(true)}
              disabled={isUpdatingPrices || (portfolio.holdings.length === 0 && watchlist.length === 0)}
              className="p-2 bg-slate-50 text-slate-400 hover:text-blue-600 rounded-xl transition-colors disabled:opacity-50"
              title="Update Prices"
            >
              <RefreshCw className={cn("w-5 h-5", isUpdatingPrices && "animate-spin")} />
            </button>
          </div>
        </header>

        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="grid grid-cols-1 lg:grid-cols-3 gap-6"
            >
              {/* Portfolio Summary Card */}
              <div className="lg:col-span-2 bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                <div className="flex justify-between items-start mb-6">
                  <h3 className="font-bold text-lg">Asset Allocation</h3>
                  <button 
                    onClick={runPortfolioAnalysis}
                    disabled={isAnalyzing || portfolio.holdings.length === 0}
                    className="flex items-center gap-2 text-sm font-medium text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={cn("w-4 h-4", isAnalyzing && "animate-spin")} />
                    Analyze Portfolio
                  </button>
                </div>
                
                <div className="h-64 w-full">
                  {chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%" id="dashboard-pie-chart">
                      <PieChart margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                        <Pie
                          data={chartData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                          animationDuration={1000}
                        >
                          {chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <RechartsTooltip 
                          contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400">
                      <AlertCircle className="w-12 h-12 mb-2 opacity-20" />
                      <p>No data to display. Add holdings to see allocation.</p>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-6">
                  {chartData.map((item, idx) => (
                    <div key={item.name} className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                      <span className="text-sm font-medium text-slate-600">{item.name}</span>
                      <span className="text-xs text-slate-400 ml-auto">{((item.value / totalValue) * 100).toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quick Stats */}
              <div className="space-y-6">
                <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-3xl p-6 text-white shadow-lg shadow-blue-200">
                  <div className="flex justify-between items-start mb-4">
                    <Wallet className="w-8 h-8 opacity-80" />
                    <span className="text-xs font-bold bg-white/20 px-2 py-1 rounded-full">{settings.currency}</span>
                  </div>
                  <p className="text-blue-100 text-sm mb-1">Available Cash</p>
                  <h4 className="text-3xl font-bold">{formatCurrency(portfolio.cashBalance)}</h4>
                  <div className="mt-6 flex gap-2">
                    <input 
                      type="number" 
                      value={cashInput}
                      onChange={(e) => setCashInput(e.target.value)}
                      className="bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-sm w-full focus:outline-none focus:ring-2 focus:ring-white/30"
                      placeholder="Update cash..."
                    />
                    <button 
                      onClick={() => setPortfolio(prev => ({ ...prev, cashBalance: parseFloat(cashInput) || 0 }))}
                      className="bg-white text-blue-600 px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-blue-50 transition-colors"
                    >
                      Set
                    </button>
                  </div>
                </div>

                <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                  <h3 className="font-bold mb-4 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-500" />
                    Portfolio Health
                  </h3>
                  <div className="space-y-4">
                    {portfolio.holdings.length === 0 ? (
                      <p className="text-sm text-slate-500 italic">Add holdings to get AI insights.</p>
                    ) : (
                      portfolio.holdings.slice(0, 3).map(h => (
                        <div key={h.symbol} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                          <div>
                            <p className="font-bold text-sm">{h.symbol}</p>
                            <p className="text-[10px] text-slate-400 uppercase">Recommendation</p>
                          </div>
                          {analyses[h.symbol] ? (
                            <span className={cn(
                              "text-xs font-bold px-2 py-1 rounded-lg",
                              analyses[h.symbol].recommendation === 'BUY' && "bg-emerald-100 text-emerald-700",
                              analyses[h.symbol].recommendation === 'HOLD' && "bg-amber-100 text-amber-700",
                              analyses[h.symbol].recommendation === 'SELL' && "bg-rose-100 text-rose-700",
                            )}>
                              {analyses[h.symbol].recommendation}
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400 italic">Pending analysis</span>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* General Market News Widget */}
              <div className="lg:col-span-3 bg-white rounded-3xl p-6 shadow-sm border border-slate-100 mt-6 md:mt-0">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="font-bold text-lg flex items-center gap-2">
                    <Newspaper className="w-5 h-5 text-blue-600" />
                    Market News Feed
                  </h3>
                  <button 
                    onClick={fetchGeneralNews}
                    disabled={loadingGeneralNews}
                    className="p-2 text-slate-400 hover:text-blue-600 transition-colors rounded-lg hover:bg-blue-50"
                    title="Refresh News"
                  >
                    <RefreshCw className={cn("w-5 h-5", loadingGeneralNews && "animate-spin")} />
                  </button>
                </div>
                
                <div className="space-y-4">
                  {loadingGeneralNews ? (
                    <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                      <RefreshCw className="w-8 h-8 animate-spin mb-4 text-blue-200" />
                      <p className="text-sm">Fetching latest market headlines...</p>
                    </div>
                  ) : generalNews.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                      {generalNews.map((item, idx) => (
                        <div
                          key={idx}
                          className="flex flex-col p-4 bg-slate-50 rounded-2xl hover:bg-blue-50 transition-colors border border-slate-100 hover:border-blue-100 group"
                        >
                          <div className="flex justify-between items-start mb-3">
                            <span className="text-[10px] font-bold px-2 py-1 bg-white rounded-md text-slate-500 border border-slate-200">
                              {item.source}
                            </span>
                            <span className="text-[10px] text-slate-400">{formatDate(item.date)}</span>
                          </div>
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-bold text-sm mb-2 group-hover:text-blue-700 transition-colors"
                          >
                            {item.title}
                          </a>
                          <ExpandableText text={item.snippet} maxChars={150} className="text-xs text-slate-500 mt-auto" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-slate-400 text-sm italic bg-slate-50 rounded-2xl border border-slate-100">
                      No recent news available.
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'holdings' && (
            <motion.div
              key="holdings"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              {/* Add Holding Form */}
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                <h3 className="font-bold text-lg mb-6">Add New Holding</h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-400 uppercase">Symbol</label>
                    <input 
                      type="text" 
                      value={newHolding.symbol}
                      onChange={e => setNewHolding(prev => ({ ...prev, symbol: e.target.value }))}
                      placeholder="e.g. VOO"
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-400 uppercase">Shares</label>
                    <input 
                      type="number" 
                      value={newHolding.shares || ''}
                      onChange={e => setNewHolding(prev => ({ ...prev, shares: parseFloat(e.target.value) || 0 }))}
                      placeholder="0.00"
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-400 uppercase">Avg Price</label>
                    <input 
                      type="number" 
                      value={newHolding.averagePrice || ''}
                      onChange={e => setNewHolding(prev => ({ ...prev, averagePrice: parseFloat(e.target.value) || 0 }))}
                      placeholder="$0.00"
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all"
                    />
                  </div>
                  <div className="flex items-end">
                    <button 
                      onClick={handleAddHolding}
                      className="w-full bg-blue-600 text-white font-bold py-2 rounded-xl hover:bg-blue-700 transition-all flex items-center justify-center gap-2"
                    >
                      <Plus className="w-5 h-5" />
                      Add to Portfolio
                    </button>
                  </div>
                </div>
              </div>

              {/* Holdings List */}
              <div className="bg-white rounded-3xl overflow-visible shadow-sm border border-slate-100">
                <div className="p-6 border-b border-slate-50 flex justify-between items-center">
                  <h3 className="font-bold text-lg">Current Holdings</h3>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <Info className="w-4 h-4" />
                    Live prices when available; fallback to average cost
                  </div>
                </div>
                <div className="overflow-x-auto md:overflow-visible pb-12 -mb-12 relative z-0">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50/50">
                        <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Asset</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Shares</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Avg Price</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Current Price</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Total Value</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Gain / Loss</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">AI Advice</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {portfolio.holdings.map((holding, idx) => (
                        <tr key={`${holding.symbol}-${idx}`} className="hover:bg-slate-50/30 transition-colors group">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 font-bold text-xs">
                                {holding.symbol.slice(0, 2)}
                              </div>
                              <span className="font-bold text-slate-900">{holding.symbol}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600">{holding.shares}</td>
                          <td className="px-6 py-4 text-sm text-slate-600">{formatCurrency(holding.averagePrice)}</td>
                          <td className="px-6 py-4 text-sm font-medium text-slate-900">
                            {currentPrices[holding.symbol] ? formatCurrency(currentPrices[holding.symbol]) : '-'}
                          </td>
                          <td className="px-6 py-4 font-bold text-slate-900">
                            {formatCurrency(holding.shares * (currentPrices[holding.symbol] || holding.averagePrice))}
                          </td>
                          <td className="px-6 py-4">
                            {currentPrices[holding.symbol] ? (() => {
                              const gain = (currentPrices[holding.symbol] - holding.averagePrice) * holding.shares;
                              const pct = holding.averagePrice > 0 ? ((currentPrices[holding.symbol] - holding.averagePrice) / holding.averagePrice) * 100 : 0;
                              const isUp = gain >= 0;
                              return (
                                <div className={cn("flex items-center gap-1", isUp ? "text-emerald-600" : "text-rose-600")}>
                                  {isUp ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                                  <span className="font-bold text-sm">{formatCurrency(Math.abs(gain))}</span>
                                  <span className="text-xs">({pct.toFixed(2)}%)</span>
                                </div>
                              );
                            })() : <span className="text-slate-400 text-sm">—</span>}
                          </td>
                          <td className="px-6 py-4">
                            {analyses[holding.symbol] ? (
                              <div className="group relative cursor-help z-[200] hover:z-[200]">
                                <span className={cn(
                                  "text-[10px] font-bold px-2 py-1 rounded-lg",
                                  analyses[holding.symbol].recommendation === 'BUY' && "bg-emerald-100 text-emerald-700",
                                  analyses[holding.symbol].recommendation === 'HOLD' && "bg-amber-100 text-amber-700",
                                  analyses[holding.symbol].recommendation === 'SELL' && "bg-rose-100 text-rose-700",
                                )}>
                                  {analyses[holding.symbol].recommendation}
                                </span>
                                <div className="absolute bottom-full right-0 mb-2 w-72 p-4 bg-slate-900 text-white text-xs rounded-2xl opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none z-[9999] shadow-2xl border border-slate-700/50 backdrop-blur-sm">
                                  <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-700/50">
                                    <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                                    <p className="font-bold text-[10px] uppercase tracking-wider">AI Strategy Reasoning</p>
                                  </div>
                                  <p className="leading-relaxed text-slate-300 italic mb-3">
                                    "{analyses[holding.symbol].reasoning}"
                                  </p>
                                  {analyses[holding.symbol].projectedGrowth && (
                                    <div className="mb-3">
                                      <p className="font-bold text-[10px] uppercase tracking-wider text-blue-400 mb-1">Projected Growth</p>
                                      <p className="text-slate-300">{analyses[holding.symbol].projectedGrowth}</p>
                                    </div>
                                  )}
                                  {analyses[holding.symbol].keyFactors?.length ? (
                                    <div className="mb-3">
                                      <p className="font-bold text-[10px] uppercase tracking-wider text-blue-400 mb-1">Key Factors</p>
                                      <ul className="list-disc list-inside text-slate-300 text-[10px] space-y-1">
                                        {analyses[holding.symbol].keyFactors?.map((factor, i) => (
                                          <li key={i}>{factor}</li>
                                        ))}
                                      </ul>
                                    </div>
                                  ) : null}
                                  {analyses[holding.symbol].metrics && (
                                    <div className="grid grid-cols-2 gap-2 text-[10px] pt-2 border-t border-slate-700/50">
                                      {analyses[holding.symbol].metrics?.peRatio && <div><span className="text-slate-500">P/E:</span> {analyses[holding.symbol].metrics?.peRatio}</div>}
                                      {analyses[holding.symbol].metrics?.marketCap && <div><span className="text-slate-500">Mkt Cap:</span> {analyses[holding.symbol].metrics?.marketCap}</div>}
                                      {analyses[holding.symbol].metrics?.dividendYield && <div><span className="text-slate-500">Div Yield:</span> {analyses[holding.symbol].metrics?.dividendYield}</div>}
                                    </div>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <span className="text-[10px] text-slate-400 italic">No analysis</span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <button 
                                onClick={() => toggleChart(holding.symbol)}
                                className={cn(
                                  "p-2 rounded-lg transition-colors",
                                  expandedChart[holding.symbol] ? "bg-blue-50 text-blue-600" : "text-slate-300 hover:text-blue-600"
                                )}
                                title="View Price Chart"
                              >
                                <TrendingUp className={cn("w-5 h-5", loadingChart[holding.symbol] && "animate-spin")} />
                              </button>
                              <button 
                                onClick={() => toggleNews(holding.symbol)}
                                className={cn(
                                  "p-2 rounded-lg transition-colors",
                                  expandedNews[holding.symbol] ? "bg-blue-50 text-blue-600" : "text-slate-300 hover:text-blue-600"
                                )}
                                title="View News"
                              >
                                <RefreshCw className={cn("w-5 h-5", loadingNews[holding.symbol] && "animate-spin")} />
                              </button>
                              <button 
                                onClick={() => handleRemoveHolding(idx)}
                                className="p-2 text-slate-300 hover:text-rose-500 transition-colors"
                              >
                                <Trash2 className="w-5 h-5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {portfolio.holdings.map((holding, idx) => (expandedChart[holding.symbol] || expandedNews[holding.symbol]) && (
                        <tr key={`details-${holding.symbol}-${idx}`} className="bg-slate-50/50">
                          <td colSpan={7} className="px-6 py-4">
                            <div className="space-y-6">
                              {/* Chart Section */}
                              {expandedChart[holding.symbol] && (
                                <div className="space-y-4">
                                  <div className="flex justify-between items-center">
                                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                                      <TrendingUp className="w-3 h-3" />
                                      Price History: {holding.symbol}
                                    </h4>
                                    <div className="flex gap-1">
                                      {['1D', '5D', '1M', '6M', '1Y', '5Y', 'MAX'].map(range => (
                                        <button
                                          key={range}
                                          onClick={() => toggleChart(holding.symbol, range)}
                                          className={cn(
                                            "px-2 py-1 rounded text-[10px] font-bold transition-all",
                                            selectedRange[holding.symbol] === range 
                                              ? "bg-blue-600 text-white" 
                                              : "bg-white text-slate-400 hover:text-slate-600 border border-slate-200"
                                          )}
                                        >
                                          {range}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                  
                                  <div className="h-48 w-full bg-white rounded-xl p-4 border border-slate-100 shadow-sm relative">
                                    {loadingChart[holding.symbol] ? (
                                      <div className="absolute inset-0 flex items-center justify-center bg-white/50 z-10">
                                        <RefreshCw className="w-6 h-6 text-blue-600 animate-spin" />
                                      </div>
                                    ) : priceHistory[holding.symbol]?.length ? (
                                    (() => {
                                      const rows = priceHistory[holding.symbol] || [];
                                      const trendColor = getTrendColor(rows);

                                      return (
                                        <ResponsiveContainer width="100%" height="100%" id={`chart-container-${holding.symbol}-${idx}`}>
                                          <AreaChart data={rows} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                                            <defs>
                                              <linearGradient id={`priceLineGradient-${holding.symbol}-${idx}`} x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor={trendColor} stopOpacity={0.28} />
                                                <stop offset="95%" stopColor={trendColor} stopOpacity={0.02} />
                                              </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                            <XAxis dataKey="date" hide />
                                            <YAxis hide domain={['auto', 'auto']} />
                                            <RechartsTooltip
                                              contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: '10px' }}
                                              formatter={(value) => [formatCurrency(typeof value === 'number' ? value : Number(value) || 0), 'Price']}
                                            />
                                            <Area
                                              type="monotone"
                                              dataKey="price"
                                              stroke={trendColor}
                                              strokeWidth={2}
                                              fill={`url(#priceLineGradient-${holding.symbol}-${idx})`}
                                              animationDuration={1000}
                                            />
                                          </AreaChart>
                                        </ResponsiveContainer>
                                      );
                                    })()
                                    ) : (
                                      <div className="h-full flex items-center justify-center text-slate-400 text-xs italic">
                                        No historical data available.
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* News Section */}
                              {expandedNews[holding.symbol] && (
                                <div className="space-y-4">
                                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                                    <RefreshCw className="w-3 h-3" />
                                    Latest News for {holding.symbol}
                                  </h4>
                                  {loadingNews[holding.symbol] ? (
                                    <div className="flex items-center gap-2 text-xs text-slate-400 italic">
                                      <RefreshCw className="w-3 h-3 animate-spin" />
                                      Fetching latest headlines...
                                    </div>
                                  ) : news[holding.symbol]?.length ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                      {news[holding.symbol].map((item, nIdx) => (
                                        <div
                                          key={nIdx}
                                          className="block p-3 bg-white rounded-xl border border-slate-100 hover:border-blue-200 transition-all shadow-sm group"
                                        >
                                          <a
                                            href={item.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-xs font-bold text-blue-600 mb-1 group-hover:underline"
                                          >
                                            {item.title}
                                          </a>
                                          <ExpandableText text={item.snippet} maxChars={130} className="text-[10px] text-slate-500 mb-2" />
                                          <div className="flex justify-between items-center text-[9px] text-slate-400 font-medium">
                                            <span>{item.source}</span>
                                            {item.date && <span>{item.date}</span>}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <p className="text-xs text-slate-400 italic">No recent news found for this symbol.</p>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                      {portfolio.holdings.length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-6 py-12 text-center text-slate-400 italic">
                            Your portfolio is empty. Add your first holding above.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'watchlist' && (
            <motion.div
              key="watchlist"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="flex justify-between items-end mb-8">
                <div>
                  <h2 className="text-2xl font-bold capitalize">{activeTab}</h2>
                  <p className="text-slate-500 text-sm">Monitor potential investments</p>
                  {isAutoAnalyzingWatchlist && (
                    <p className="text-[11px] text-blue-600 font-medium mt-2 flex items-center gap-2">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Analyzing saved watchlist...
                    </p>
                  )}
                </div>
                <button 
                  onClick={checkWatchlistAlerts}
                  disabled={isCheckingAlerts || !watchlist.some(w => w.targetPrice)}
                  className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-50 text-sm font-bold shadow-sm"
                >
                  <BellRing className={cn("w-4 h-4", isCheckingAlerts && "animate-pulse text-blue-500")} />
                  Check Alerts
                </button>
              </div>

              <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                <h3 className="font-bold text-lg mb-6">Track New Assets</h3>
                <div className="flex gap-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                    <input 
                      type="text" 
                      value={newWatchlistSymbol}
                      onChange={e => setNewWatchlistSymbol(e.target.value)}
                      placeholder="Enter stock symbol (e.g. AAPL, TSLA, BTC)..."
                      className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all"
                    />
                  </div>
                  <button 
                    onClick={handleAddWatchlist}
                    className="bg-slate-900 text-white font-bold px-8 rounded-2xl hover:bg-slate-800 transition-all"
                  >
                    Watch
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
                {watchlist.map(item => (
                  <motion.div 
                    key={item.symbol}
                    className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex flex-col"
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-slate-900 flex items-center justify-center text-white font-bold">
                          {item.symbol.slice(0, 2)}
                        </div>
                        <div>
                          <h4 className="font-bold text-lg">{item.symbol}</h4>
                          <div className="flex items-center gap-2">
                            <p className="text-[10px] text-slate-400 uppercase font-bold">Added {new Date(item.addedAt).toLocaleDateString()}</p>
                            {currentPrices[item.symbol] && (
                              <span className="text-[10px] font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded-md">
                                {formatCurrency(currentPrices[item.symbol])}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button 
                          onClick={() => {
                            if (alertSetup === item.symbol) {
                              setAlertSetup(null);
                            } else {
                              setAlertSetup(item.symbol);
                              setAlertForm({ price: item.targetPrice?.toString() || '', direction: item.alertDirection || 'ABOVE' });
                            }
                          }}
                          className={cn(
                            "p-2 transition-colors rounded-lg",
                            item.targetPrice ? "text-amber-500 bg-amber-50 hover:bg-amber-100" : "text-slate-300 hover:text-amber-500 hover:bg-slate-50"
                          )}
                          title={item.targetPrice ? "Edit Alert" : "Set Alert"}
                        >
                          {item.targetPrice ? <BellRing className="w-5 h-5" /> : <Bell className="w-5 h-5" />}
                        </button>
                        <button 
                          onClick={() => handleRemoveWatchlist(item.symbol)}
                          className="p-2 text-slate-300 hover:text-rose-500 transition-colors rounded-lg hover:bg-slate-50"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </div>

                    {/* Alert Setup / Display */}
                    {alertSetup === item.symbol ? (
                      <div className="mb-4 p-3 bg-amber-50 rounded-xl border border-amber-100 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-amber-800 uppercase tracking-wider">Set Price Alert</span>
                          <button onClick={() => setAlertSetup(null)} className="text-amber-500 hover:text-amber-700"><X className="w-4 h-4"/></button>
                        </div>
                        <div className="flex gap-2">
                          <select 
                            value={alertForm.direction}
                            onChange={e => setAlertForm(prev => ({ ...prev, direction: e.target.value as 'ABOVE'|'BELOW' }))}
                            className="bg-white border border-amber-200 rounded-lg px-2 py-1.5 text-sm font-medium text-amber-900 focus:outline-none focus:ring-2 focus:ring-amber-400"
                          >
                            <option value="ABOVE">Goes Above</option>
                            <option value="BELOW">Drops Below</option>
                          </select>
                          <input 
                            type="number" 
                            value={alertForm.price}
                            onChange={e => setAlertForm(prev => ({ ...prev, price: e.target.value }))}
                            placeholder="Target Price"
                            className="flex-1 bg-white border border-amber-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 min-w-0"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => handleSaveAlert(item.symbol)}
                            className="flex-1 bg-amber-500 text-white font-bold py-1.5 rounded-lg text-sm hover:bg-amber-600 transition-colors"
                          >
                            Save Alert
                          </button>
                          {item.targetPrice && (
                            <button 
                              onClick={() => { handleRemoveAlert(item.symbol); setAlertSetup(null); }}
                              className="px-3 bg-white text-rose-500 border border-rose-200 font-bold py-1.5 rounded-lg text-sm hover:bg-rose-50 transition-colors"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </div>
                    ) : item.targetPrice ? (
                      <div className="mb-4 p-2.5 bg-amber-50/50 rounded-xl border border-amber-100/50 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <BellRing className="w-3.5 h-3.5 text-amber-500" />
                          <span className="text-xs font-medium text-amber-800">
                            Alert when {item.alertDirection === 'ABOVE' ? '≥' : '≤'} {formatCurrency(item.targetPrice)}
                          </span>
                        </div>
                      </div>
                    ) : null}

                    <div className="mt-4 pt-6 border-t border-slate-50">
                      <div className="flex justify-between items-center mb-4">
                        <div className="flex gap-2">
                          <button 
                            onClick={() => toggleChart(item.symbol)}
                            className={cn(
                              "text-[10px] font-bold flex items-center gap-1 transition-colors",
                              expandedChart[item.symbol] ? "text-blue-600" : "text-slate-400 hover:text-blue-600"
                            )}
                          >
                            <TrendingUp className={cn("w-3 h-3", loadingChart[item.symbol] && "animate-spin")} />
                            {expandedChart[item.symbol] ? 'Hide Chart' : 'Show Chart'}
                          </button>
                          <button 
                            onClick={() => toggleNews(item.symbol, true)}
                            className={cn(
                              "text-[10px] font-bold flex items-center gap-1 transition-colors",
                              expandedNews[item.symbol] ? "text-blue-600" : "text-slate-400 hover:text-blue-600"
                            )}
                          >
                            <RefreshCw className={cn("w-3 h-3", loadingNews[item.symbol] && "animate-spin")} />
                            {expandedNews[item.symbol] ? 'Hide News' : 'Show News'}
                          </button>
                        </div>
                      </div>

                      <AnimatePresence>
                        {expandedChart[item.symbol] && (
                          <motion.div 
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden mb-4"
                          >
                            <div className="space-y-3 pt-2">
                              <div className="flex justify-between items-center">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Price History</p>
                                <div className="flex gap-1">
                                  {['1M', '1Y', 'MAX'].map(range => (
                                    <button
                                      key={range}
                                      onClick={() => toggleChart(item.symbol, range)}
                                      className={cn(
                                        "px-1.5 py-0.5 rounded text-[8px] font-bold transition-all",
                                        selectedRange[item.symbol] === range 
                                          ? "bg-blue-600 text-white" 
                                          : "bg-slate-100 text-slate-400 border border-slate-200"
                                      )}
                                    >
                                      {range}
                                    </button>
                                  ))}
                                </div>
                              </div>
                                <div className="h-32 w-full bg-slate-50 rounded-xl p-2 border border-slate-100 relative">
                                  {loadingChart[item.symbol] ? (
                                    <div className="absolute inset-0 flex items-center justify-center bg-slate-50/50 z-10">
                                      <RefreshCw className="w-4 h-4 text-blue-600 animate-spin" />
                                    </div>
                                  ) : priceHistory[item.symbol]?.length ? (
                                    (() => {
                                      const rows = priceHistory[item.symbol] || [];
                                      const trendColor = getTrendColor(rows);

                                      return (
                                        <ResponsiveContainer width="100%" height="100%" id={`watchlist-chart-${item.symbol}`}>
                                          <AreaChart data={rows} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
                                            <defs>
                                              <linearGradient id={`watchlistLineGradient-${item.symbol}`} x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor={trendColor} stopOpacity={0.25} />
                                                <stop offset="95%" stopColor={trendColor} stopOpacity={0.02} />
                                              </linearGradient>
                                            </defs>
                                            <XAxis dataKey="date" hide />
                                            <YAxis hide domain={['auto', 'auto']} />
                                            <RechartsTooltip
                                              contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', fontSize: '8px' }}
                                              formatter={(value) => [formatCurrency(typeof value === 'number' ? value : Number(value) || 0), 'Price']}
                                            />
                                            <Area
                                              type="monotone"
                                              dataKey="price"
                                              stroke={trendColor}
                                              strokeWidth={1.5}
                                              fill={`url(#watchlistLineGradient-${item.symbol})`}
                                              animationDuration={1000}
                                            />
                                          </AreaChart>
                                        </ResponsiveContainer>
                                      );
                                    })()
                                ) : (
                                  <div className="h-full flex items-center justify-center text-[8px] text-slate-400 italic">
                                    No data.
                                  </div>
                                )}
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      <AnimatePresence>
                        {expandedNews[item.symbol] && (
                          <motion.div 
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden mb-4"
                          >
                            <div className="space-y-3 pt-2">
                              {loadingNews[item.symbol] ? (
                                <div className="text-[10px] text-slate-400 italic">Loading general market news...</div>
                              ) : news[item.symbol]?.map((n, nIdx) => (
                                <div
                                  key={nIdx}
                                  className="block p-2 bg-slate-50 rounded-lg hover:bg-blue-50 transition-colors"
                                >
                                  <a
                                    href={n.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[10px] font-bold text-slate-700"
                                  >
                                    {n.title}
                                  </a>
                                  <ExpandableText text={n.snippet} maxChars={85} className="text-[9px] text-slate-500 mt-1" />
                                  <div className="flex justify-between text-[8px] text-slate-400 mt-1">
                                    <span>{n.source}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {analyses[item.symbol] ? (
                        <div className="space-y-4">
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-bold text-slate-400 uppercase">AI Verdict</span>
                            <span className={cn(
                              "text-xs font-bold px-3 py-1 rounded-full",
                              analyses[item.symbol].recommendation === 'BUY' ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                            )}>
                              {analyses[item.symbol].recommendation}
                            </span>
                          </div>
                          <ExpandableText
                            text={analyses[item.symbol].reasoning}
                            maxChars={180}
                            className="text-xs text-slate-600 leading-relaxed"
                          />
                          
                          {analyses[item.symbol].projectedGrowth && (
                            <div className="bg-blue-50 p-3 rounded-xl border border-blue-100">
                              <p className="text-[10px] font-bold text-blue-800 uppercase mb-1">Projected Growth</p>
                              <p className="text-xs text-blue-900">{analyses[item.symbol].projectedGrowth}</p>
                            </div>
                          )}

                          {analyses[item.symbol].keyFactors?.length ? (
                            <div className="flex flex-wrap gap-1">
                              {analyses[item.symbol].keyFactors?.map((factor, i) => (
                                <span key={i} className="px-2 py-1 bg-slate-100 text-slate-600 text-[9px] font-bold rounded-md uppercase tracking-wider">
                                  {factor}
                                </span>
                              ))}
                            </div>
                          ) : null}

                          {analyses[item.symbol].metrics && (
                            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100">
                              {analyses[item.symbol].metrics?.peRatio && (
                                <div>
                                  <p className="text-[9px] font-bold text-slate-400 uppercase">P/E Ratio</p>
                                  <p className="text-xs font-medium text-slate-700">{analyses[item.symbol].metrics?.peRatio}</p>
                                </div>
                              )}
                              {analyses[item.symbol].metrics?.marketCap && (
                                <div>
                                  <p className="text-[9px] font-bold text-slate-400 uppercase">Market Cap</p>
                                  <p className="text-xs font-medium text-slate-700">{analyses[item.symbol].metrics?.marketCap}</p>
                                </div>
                              )}
                              {analyses[item.symbol].metrics?.dividendYield && (
                                <div>
                                  <p className="text-[9px] font-bold text-slate-400 uppercase">Div Yield</p>
                                  <p className="text-xs font-medium text-slate-700">{analyses[item.symbol].metrics?.dividendYield}</p>
                                </div>
                              )}
                            </div>
                          )}

                          <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 pt-2">
                            <AlertCircle className="w-3 h-3" />
                            RISK: {analyses[item.symbol].riskLevel}
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center py-4 text-slate-400">
                          <RefreshCw className="w-6 h-6 mb-2 animate-spin opacity-20" />
                          <p className="text-[10px] uppercase font-bold tracking-widest">Analyzing Market Data...</p>
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
                {watchlist.length === 0 && (
                  <div className="col-span-full py-20 bg-white rounded-3xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400">
                    <List className="w-12 h-12 mb-4 opacity-10" />
                    <p className="font-medium">Your watchlist is empty</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'detailed' && (
            <motion.div
              key="detailed"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="grid grid-cols-1 xl:grid-cols-[280px_minmax(0,1fr)] gap-6"
            >
              {/* Left Sidebar - Tracked Symbols (Google Finance style watchlist sidebar) */}
              <aside className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm hidden xl:flex flex-col h-[calc(100vh-120px)] sticky top-6">
                <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-4">
                  <h3 className="text-sm font-bold text-slate-800">Your Lists</h3>
                  <button
                    onClick={() => updateAllPrices(true)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                    title="Refresh Prices"
                  >
                    <RefreshCw className={cn('w-4 h-4', isUpdatingPrices && 'animate-spin')} />
                  </button>
                </div>

                <div className="space-y-1 overflow-y-auto flex-1 pr-2">
                  {trackedSymbols.length > 0 ? trackedSymbols.map(symbol => (
                    <button
                      key={`detailed-list-${symbol}`}
                      onClick={() => setDetailedSymbol(symbol)}
                      className={cn(
                        'w-full flex justify-between items-center px-3 py-3 rounded-xl transition-all',
                        detailedSymbol === symbol
                          ? 'bg-blue-50 text-blue-700 font-bold'
                          : 'bg-transparent text-slate-600 hover:bg-slate-50'
                      )}
                    >
                      <span className="font-semibold">{symbol}</span>
                      <span className="text-sm font-medium">
                        {currentPrices[symbol] ? formatCurrency(currentPrices[symbol]) : '--'}
                      </span>
                    </button>
                  )) : (
                    <div className="text-xs text-slate-400 p-3 rounded-xl bg-slate-50 border border-slate-100">
                      Add holdings or watchlist symbols to populate this list.
                    </div>
                  )}
                </div>
              </aside>

              {/* Main Detailed Section - Google Finance Layout */}
              <section className="bg-white rounded-3xl border border-slate-200 p-6 md:p-8 shadow-sm flex flex-col">
                {(() => {
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
                  const mode = chartMode[detailedSymbol] || 'BOTH';

                  const rows = hasHistory ? toCandleRows(detailedHistory) : [];
                  const trendColor = getTrendColor(rows);

                  return (
                    <>
                      {/* 1. Header (Symbol & Price) */}
                      <div className="mb-8">
                        <div className="flex justify-between items-start">
                          <h2 className="text-3xl font-bold text-slate-900 tracking-tight">{detailedSymbol}</h2>
                          <div className="flex gap-2 relative">
                            <input
                              type="text"
                              value={detailedSymbol}
                              onChange={(e) => setDetailedSymbol(e.target.value.trim().toUpperCase())}
                              placeholder="Search symbol"
                              className="w-40 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                          </div>
                        </div>
                        
                        <div className="mt-6 flex flex-wrap items-end gap-3">
                          <span className="text-5xl font-medium text-slate-900 tracking-tight">
                            {liveOrLast > 0 ? formatCurrency(liveOrLast) : '--'}
                          </span>
                          <span className={cn(
                            'text-xl font-medium mb-1',
                            diff >= 0 ? 'text-emerald-600' : 'text-rose-600'
                          )}>
                            {hasHistory ? `${diff >= 0 ? '+' : ''}${formatCurrency(diff).replace('$', '')} (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)` : '--'}
                          </span>
                          <span className="text-sm text-slate-500 mb-2 ml-1 font-medium">Past {detailedRange}</span>
                        </div>
                      </div>

                      {/* 2. Chart Controls */}
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 border-b border-slate-100 pb-4">
                        <div className="flex flex-wrap gap-1">
                          {['1D', '5D', '1M', '6M', '1Y', '5Y', 'MAX'].map(range => (
                            <button
                              key={`range-${range}`}
                              onClick={() => setDetailedRange(range)}
                              className={cn(
                                'px-4 py-1.5 rounded-full text-sm font-medium transition-all',
                                detailedRange === range 
                                  ? 'bg-blue-50 text-blue-700' 
                                  : 'text-slate-600 hover:bg-slate-100'
                              )}
                            >
                              {range}
                            </button>
                          ))}
                        </div>
                        <div className="flex gap-1 bg-slate-50 p-1 rounded-xl border border-slate-200">
                          {(['LINE', 'CANDLES', 'BOTH'] as ChartMode[]).map(m => (
                            <button
                              key={`mode-${m}`}
                              onClick={() => setChartMode(prev => ({ ...prev, [detailedSymbol]: m }))}
                              className={cn(
                                'px-3 py-1 rounded-lg text-xs font-bold transition-all',
                                mode === m ? 'bg-white text-slate-900 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'
                              )}
                            >
                              {m === 'LINE' ? 'Line' : m === 'CANDLES' ? 'Candle' : 'Both'}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* 3. The Chart */}
                      <div className="h-[400px] w-full relative mb-12">
                        {isLoadingDetailed ? (
                          <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10">
                            <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
                          </div>
                        ) : hasHistory ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={rows} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                              <defs>
                                <linearGradient id={`lightLineGradient-${detailedSymbol}`} x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor={trendColor} stopOpacity={0.15} />
                                  <stop offset="95%" stopColor={trendColor} stopOpacity={0.0} />
                                </linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                              <XAxis
                                dataKey="date"
                                tick={{ fontSize: 11, fill: '#64748b' }}
                                tickLine={false}
                                axisLine={false}
                                minTickGap={40}
                                tickFormatter={(value) => formatChartAxisLabel(String(value), detailedRange)}
                              />
                              {/* Google Finance typically puts the Y axis on the right side */}
                              <YAxis 
                                tick={{ fontSize: 11, fill: '#64748b' }} 
                                tickLine={false} 
                                axisLine={false} 
                                domain={['auto', 'auto']} 
                                width={60}
                                orientation="right"
                                tickFormatter={(val) => `$${val}`}
                              />
                              <RechartsTooltip
                                contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', fontSize: '12px', background: '#ffffff', color: '#0f172a' }}
                                labelFormatter={(label) => formatChartAxisLabel(String(label), detailedRange)}
                                formatter={(value, name) => {
                                  const numeric = typeof value === 'number' ? value : Number(value) || 0;
                                  return [formatCurrency(numeric), name === 'price' ? 'Close' : name];
                                }}
                              />

                              {mode !== 'LINE' && (
                                <>
                                  <Bar dataKey="wickBase" stackId="wicks" fill="transparent" barSize={2} />
                                  <Bar dataKey="wickHeight" stackId="wicks" fill="transparent" barSize={2} shape={renderCandleWick} />
                                  <Bar dataKey="candleBase" stackId="candles" fill="transparent" barSize={6} />
                                  <Bar dataKey="candleBody" stackId="candles" barSize={6}>
                                    {rows.map((row) => (
                                      <Cell key={`candle-${detailedSymbol}-${row.date}`} fill={row.isUp ? TREND_UP_COLOR : TREND_DOWN_COLOR} />
                                    ))}
                                  </Bar>
                                </>
                              )}

                              {mode !== 'CANDLES' && (
                                <Area
                                  type="monotone"
                                  dataKey="price"
                                  stroke={trendColor}
                                  strokeWidth={2}
                                  fill={`url(#lightLineGradient-${detailedSymbol})`}
                                  dot={false}
                                  animationDuration={800}
                                />
                              )}
                            </ComposedChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="h-full flex items-center justify-center text-slate-400 text-sm italic">
                            No historical data found for this symbol.
                          </div>
                        )}
                      </div>

                      {/* 4. Key Stats Grid */}
                      <div className="mb-12">
                        <h3 className="text-xl font-medium text-slate-900 mb-6">Key stats</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-y-8 gap-x-6">
                          {[
                            { label: 'Previous close', value: formatCurrency(first) },
                            { label: 'Day range', value: `${formatCurrency(low)} - ${formatCurrency(high)}` },
                            { label: 'Open', value: formatCurrency(open) },
                            { label: 'Market cap', value: analysis?.metrics?.marketCap || '--' },
                            { label: 'P/E ratio', value: analysis?.metrics?.peRatio || '--' },
                            { label: 'Div yield', value: analysis?.metrics?.dividendYield || '--' },
                            { label: 'AI Verdict', value: analysis?.recommendation || '--' },
                            { label: 'Risk Level', value: analysis?.riskLevel || '--' },
                          ].map((stat, i) => (
                            <div key={i} className="flex flex-col border-t border-slate-100 pt-3">
                              <span className="text-sm text-slate-500 mb-1">{stat.label}</span>
                              <span className="text-base font-medium text-slate-900">{stat.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* 5. Additional Tabs (News / AI Insights) */}
                      <div>
                        <div className="flex gap-6 border-b border-slate-200 mb-6">
                          <button
                            onClick={() => setDetailedPanel('overview')}
                            className={cn('pb-3 text-sm font-medium transition-all border-b-2', detailedPanel === 'overview' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-900')}
                          >
                            AI Analysis
                          </button>
                          <button
                            onClick={() => {
                              setDetailedPanel('news');
                              if (!news[detailedSymbol]) toggleNews(detailedSymbol);
                            }}
                            className={cn('pb-3 text-sm font-medium transition-all border-b-2', detailedPanel === 'news' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-900')}
                          >
                            Latest News
                          </button>
                        </div>

                        <div className="min-h-[200px]">
                          {detailedPanel === 'overview' && (
                            <div className="space-y-6">
                              {analysis ? (
                                <>
                                  <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
                                    <h4 className="font-bold text-slate-900 mb-2 flex items-center gap-2">
                                      <Sparkles className="w-5 h-5 text-blue-600" /> AI Thesis
                                    </h4>
                                    <p className="text-sm text-slate-600 leading-relaxed">{analysis.reasoning}</p>
                                    
                                    {analysis.projectedGrowth && (
                                      <div className="mt-4 pt-4 border-t border-slate-200">
                                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Projected Growth</p>
                                        <p className="text-sm text-slate-700">{analysis.projectedGrowth}</p>
                                      </div>
                                    )}
                                  </div>
                                  
                                  {analysis.keyFactors?.length ? (
                                    <div>
                                      <h4 className="font-bold text-slate-900 mb-3 text-sm">Key Factors</h4>
                                      <div className="flex flex-wrap gap-2">
                                        {analysis.keyFactors.map((factor, i) => (
                                          <span key={i} className="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 text-xs font-medium rounded-full">
                                            {factor}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  ) : null}
                                </>
                              ) : (
                                <div className="text-center py-10">
                                  <p className="text-slate-500 text-sm">No AI analysis available for this asset. Make sure it's in your portfolio or watchlist to trigger an analysis.</p>
                                </div>
                              )}
                            </div>
                          )}

                          {detailedPanel === 'news' && (
                            <div>
                              {loadingNews[detailedSymbol] ? (
                                <div className="flex justify-center py-10">
                                  <RefreshCw className="w-6 h-6 text-slate-300 animate-spin" />
                                </div>
                              ) : news[detailedSymbol]?.length ? (
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                  {news[detailedSymbol].map((item, nIdx) => (
                                    <a
                                      key={`detailed-news-${nIdx}`}
                                      href={item.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="block p-5 rounded-2xl bg-white border border-slate-200 hover:border-blue-300 hover:shadow-md transition-all group"
                                    >
                                      <div className="flex justify-between items-start mb-2">
                                        <span className="text-xs font-bold text-slate-500">{item.source}</span>
                                        <span className="text-xs text-slate-400">{formatDate(item.date)}</span>
                                      </div>
                                      <h4 className="text-base font-bold text-slate-900 mb-2 group-hover:text-blue-600 transition-colors">
                                        {item.title}
                                      </h4>
                                      <p className="text-sm text-slate-500 line-clamp-2">{item.snippet}</p>
                                    </a>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-sm text-slate-500 text-center py-10">
                                  No recent news found.
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  );
                })()}
              </section>
            </motion.div>
          )}

          {activeTab === 'suggestions' && (
            <motion.div
              key="suggestions"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-8"
            >
              <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-3xl p-8 text-white relative overflow-hidden">
                <div className="relative z-10">
                  <h3 className="text-3xl font-bold mb-2">Market Discovery</h3>
                  <p className="text-blue-100 max-w-md mb-6">
                    Our AI scans current news, economic trends, and global events to find assets perfectly suited for a Roth IRA's long-term horizon.
                  </p>
                  <button 
                    onClick={fetchSuggestions}
                    disabled={isSuggesting}
                    className="bg-white text-blue-600 font-bold px-6 py-3 rounded-2xl hover:bg-blue-50 transition-all flex items-center gap-2 shadow-lg shadow-blue-900/20"
                  >
                    <RefreshCw className={cn("w-5 h-5", isSuggesting && "animate-spin")} />
                    {isSuggesting ? 'Scanning Markets...' : 'Generate New Suggestions'}
                  </button>
                </div>
                <Sparkles className="absolute right-[-20px] bottom-[-20px] w-64 h-64 text-white/10 rotate-12" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {suggestions.map((s, idx) => (
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    key={s.symbol}
                    className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100 hover:shadow-xl hover:shadow-slate-200/50 transition-all group"
                  >
                    <div className="flex justify-between items-start mb-6">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-2xl font-black text-slate-900">{s.symbol}</span>
                          <span className="text-xs font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-md">TRENDING</span>
                        </div>
                        <h4 className="text-slate-500 font-medium">{s.name}</h4>
                      </div>
                      <button 
                        onClick={() => {
                          setNewWatchlistSymbol(s.symbol);
                          setActiveTab('watchlist');
                        }}
                        className="p-3 bg-slate-50 rounded-2xl text-slate-400 group-hover:bg-blue-600 group-hover:text-white transition-all"
                      >
                        <Plus className="w-6 h-6" />
                      </button>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">The Trend</p>
                        <div className="flex items-center gap-2 text-slate-700 font-medium">
                          <ArrowUpRight className="w-5 h-5 text-emerald-500" />
                          {s.trend}
                        </div>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">AI Thesis</p>
                        <p className="text-sm text-slate-600 leading-relaxed">
                          {s.reason}
                        </p>
                      </div>
                      {s.keyFactors && s.keyFactors.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-2">
                          {s.keyFactors.map((factor, i) => (
                            <span key={i} className="px-2 py-1 bg-blue-50 text-blue-700 border border-blue-100 text-[9px] font-bold rounded-md uppercase tracking-wider">
                              {factor}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
                {!isSuggesting && suggestions.length === 0 && (
                  <div className="col-span-full py-20 flex flex-col items-center justify-center text-slate-400">
                    <Sparkles className="w-16 h-16 mb-4 opacity-10" />
                    <p className="text-lg font-medium">Click the button above to discover opportunities</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'settings' && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-2xl space-y-6"
            >
              <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
                <div className="space-y-8">
                  {/* Currency */}
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-blue-50 rounded-2xl text-blue-600">
                      <Globe className="w-6 h-6" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-bold text-slate-900 mb-1">Currency</h4>
                      <p className="text-sm text-slate-500 mb-4">Select your preferred currency for portfolio valuation.</p>
                      <select 
                        value={settings.currency}
                        onChange={e => setSettings(prev => ({ ...prev, currency: e.target.value }))}
                        className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      >
                        <option value="USD">USD - US Dollar</option>
                        <option value="EUR">EUR - Euro</option>
                        <option value="GBP">GBP - British Pound</option>
                        <option value="JPY">JPY - Japanese Yen</option>
                        <option value="CAD">CAD - Canadian Dollar</option>
                        <option value="AUD">AUD - Australian Dollar</option>
                      </select>
                    </div>
                  </div>

                  {/* Theme Mode */}
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-slate-100 rounded-2xl text-slate-700">
                      {settings.themeMode === 'DARK' ? <Moon className="w-6 h-6" /> : <Sun className="w-6 h-6" />}
                    </div>
                    <div className="flex-1">
                      <h4 className="font-bold text-slate-900 mb-1">Theme</h4>
                      <p className="text-sm text-slate-500 mb-4">Switch between light and dark mode.</p>
                      <div className="flex gap-2">
                        {[
                          { id: 'LIGHT', label: 'Light', icon: Sun },
                          { id: 'DARK', label: 'Dark', icon: Moon },
                        ].map(option => {
                          const Icon = option.icon;
                          return (
                            <button
                              key={option.id}
                              onClick={() => setSettings(prev => ({ ...prev, themeMode: option.id as 'LIGHT' | 'DARK' }))}
                              className={cn(
                                'px-4 py-2 rounded-xl text-sm font-medium border transition-all inline-flex items-center gap-2',
                                settings.themeMode === option.id
                                  ? 'bg-slate-900 text-white border-slate-900'
                                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                              )}
                            >
                              <Icon className="w-4 h-4" />
                              {option.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Date Format */}
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-amber-50 rounded-2xl text-amber-600">
                      <Calendar className="w-6 h-6" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-bold text-slate-900 mb-1">Date Format</h4>
                      <p className="text-sm text-slate-500 mb-4">How dates should be displayed across the app.</p>
                      <div className="flex gap-2">
                        {['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD'].map(format => (
                          <button
                            key={format}
                            onClick={() => setSettings(prev => ({ ...prev, dateFormat: format as any }))}
                            className={cn(
                              "px-4 py-2 rounded-xl text-sm font-medium border transition-all",
                              settings.dateFormat === format 
                                ? "bg-slate-900 text-white border-slate-900" 
                                : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                            )}
                          >
                            {format}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Investment Horizon */}
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-emerald-50 rounded-2xl text-emerald-600">
                      <Clock className="w-6 h-6" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-bold text-slate-900 mb-1">Investment Horizon</h4>
                      <p className="text-sm text-slate-500 mb-4">This helps AI tailor recommendations for your goals.</p>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        {[
                          { id: 'LONG_TERM', label: 'Long Term' },
                          { id: 'SHORT_TERM', label: 'Short Term' },
                          { id: 'BOTH', label: 'Balanced' }
                        ].map(horizon => (
                          <button
                            key={horizon.id}
                            onClick={() => setSettings(prev => ({ ...prev, investmentHorizon: horizon.id as any }))}
                            className={cn(
                              "px-4 py-2 rounded-xl text-sm font-medium border transition-all",
                              settings.investmentHorizon === horizon.id 
                                ? "bg-slate-900 text-white border-slate-900" 
                                : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                            )}
                          >
                            {horizon.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* News Sources */}
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-rose-50 rounded-2xl text-rose-600">
                      <Newspaper className="w-6 h-6" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-bold text-slate-900 mb-1">Preferred News Sources</h4>
                      <p className="text-sm text-slate-500 mb-4">AI will prioritize these sources when fetching news.</p>
                      <div className="flex flex-wrap gap-2">
                        {['Bloomberg', 'Reuters', 'CNBC', 'WSJ', 'Financial Times', 'Yahoo Finance'].map(source => {
                          const isSelected = settings.preferredNewsSources.includes(source);
                          return (
                            <button
                              key={source}
                              onClick={() => {
                                setSettings(prev => ({
                                  ...prev,
                                  preferredNewsSources: isSelected 
                                    ? prev.preferredNewsSources.filter(s => s !== source)
                                    : [...prev.preferredNewsSources, source]
                                }));
                              }}
                              className={cn(
                                "px-3 py-1.5 rounded-full text-xs font-bold border transition-all",
                                isSelected 
                                  ? "bg-rose-600 text-white border-rose-600" 
                                  : "bg-white text-slate-400 border-slate-200 hover:border-slate-300"
                              )}
                            >
                              {source}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-slate-900 text-white rounded-3xl p-8 shadow-xl shadow-slate-200">
                <h4 className="font-bold text-lg mb-2">Data Privacy</h4>
                <p className="text-slate-400 text-sm leading-relaxed">
                  All your portfolio data, watchlist items, and settings are stored locally in your browser's storage. 
                  We do not store your financial data on our servers. AI analysis is performed on-demand using the 
                  symbols and amounts you provide.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
