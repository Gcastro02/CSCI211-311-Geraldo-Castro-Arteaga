/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  TrendingUp,
  Plus,
  Trash2,
  PieChart as PieChartIcon,
  List,
  Sparkles,
  AlertCircle,
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
  CheckCircle2,
  PiggyBank
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
  PriceData,
  Transaction
} from './types';
import {
  analyzePortfolio,
  getMarketSuggestions,
  analyzeWatchlistStock,
  getStockNews,
  getStockPriceHistory,
  getCurrentPrice,
  getTechnicals,
  isAiConfigured
} from './services/openaiService';
import { TechnicalSnapshot, scoreTechnicals } from './lib/indicators';
import { auditRisk, DEFAULT_RISK_THRESHOLD } from './lib/portfolioMath';
import { applyTransaction, reconcile, replayTransactions } from './lib/transactions';
import { contributionBasis, contributionYears, summarizeContributions } from './lib/contributions';
import { TechnicalsPanel } from './components/TechnicalsPanel';
import { RiskAuditCard } from './components/RiskAuditCard';
import { PositionSizer } from './components/PositionSizer';
import { ContributionTracker } from './components/ContributionTracker';
import { TransactionForm } from './components/TransactionForm';
import { TransactionHistory } from './components/TransactionHistory';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
const TREND_UP_COLOR = '#16a34a';
const TREND_DOWN_COLOR = '#dc2626';
type ChartMode = 'LINE' | 'CANDLES' | 'BOTH';

/**
 * Reserved cache key for the market-wide news feed. The watchlist and the
 * dashboard both pull news, and without a distinct key the general feed would
 * be cached under a ticker and then served back as that ticker's news.
 */
const GENERAL_NEWS_KEY = '__MARKET__';

const MARKET_INDICES = [
  { key: 'S&P 500', symbol: 'SPY' },
  { key: 'Nasdaq', symbol: 'QQQ' },
  { key: 'Dow', symbol: 'DIA' },
];

const defaultSettings: UserSettings = {
  currency: 'USD',
  dateFormat: 'MM/DD/YYYY',
  investmentHorizon: 'LONG_TERM',
  preferredNewsSources: [],
  themeMode: 'LIGHT',
  catchUpEligible: false,
  contributionLimitOverrides: {},
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
    catchUpEligible: candidate.catchUpEligible === true,
    // Settings saved before contribution tracking existed have no overrides.
    contributionLimitOverrides:
      candidate.contributionLimitOverrides && typeof candidate.contributionLimitOverrides === 'object'
        ? candidate.contributionLimitOverrides
        : {},
  };
};

/** Stable id for a new transaction. */
const createTransactionId = () =>
  `tx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

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
    const saved = localStorage.getItem('roth_ira_portfolio');
    return saved ? JSON.parse(saved) : { cashBalance: 0, holdings: [] };
  });

  const [watchlist, setWatchlist] = useState<WatchlistItem[]>(() => {
    const saved = localStorage.getItem('roth_ira_watchlist');
    return saved ? JSON.parse(saved) : [];
  });

  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    const saved = localStorage.getItem('roth_ira_transactions');
    if (!saved) return [];
    try {
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  const [selectedTaxYear, setSelectedTaxYear] = useState(() => new Date().getFullYear());

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
  const [activeTab, setActiveTab] = useState<'dashboard' | 'holdings' | 'activity' | 'watchlist' | 'detailed' | 'suggestions' | 'settings'>('dashboard');

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
  const [detailedPanel, setDetailedPanel] = useState<'technicals' | 'overview' | 'news'>('technicals');
  const [marketSnapshot, setMarketSnapshot] = useState<Record<string, { value: number; change: number; changePercent: number }>>({});

  // Measured technical indicators, computed locally from OHLCV bars.
  const [technicals, setTechnicals] = useState<Record<string, TechnicalSnapshot>>({});
  const [loadingTechnicals, setLoadingTechnicals] = useState<Record<string, boolean>>({});

  // Position sizing calculator inputs (Holdings tab).
  const [sizerSymbol, setSizerSymbol] = useState('');
  const [sizerConfidence, setSizerConfidence] = useState(0.65);

  // Memoized so it is referentially stable — this feeds effect dependency
  // arrays, and a fresh array every render would re-run them on every render.
  const trackedSymbols = useMemo(
    () => Array.from(
      new Set([
        ...portfolio.holdings.map(h => h.symbol.trim().toUpperCase()),
        ...watchlist.map(w => w.symbol.trim().toUpperCase()),
      ].filter(Boolean)),
    ),
    [portfolio.holdings, watchlist],
  );

  const [detailedSymbol, setDetailedSymbol] = useState<string>(() => {
    return portfolio.holdings[0]?.symbol?.trim().toUpperCase()
      || watchlist[0]?.symbol?.trim().toUpperCase()
      || 'AAPL';
  });
  /** Draft text for the Detailed tab's symbol box, committed on submit. */
  const [detailedSymbolDraft, setDetailedSymbolDraft] = useState(detailedSymbol);
  const priceRefreshKey = trackedSymbols.join('|');

  // Symbols already sent for analysis, so a failure is not retried forever by
  // the auto-analyze effect below (which re-runs whenever `analyses` changes).
  const attemptedAnalysis = useRef<Set<string>>(new Set());

  // Same guard for indicator fetches: a symbol with too little history never
  // lands in `technicals`, so without this it would be re-fetched every render.
  const attemptedTechnicals = useRef<Set<string>>(new Set());

  useEffect(() => {
    localStorage.setItem('roth_ira_portfolio', JSON.stringify(portfolio));
  }, [portfolio]);

  useEffect(() => {
    localStorage.setItem('roth_ira_watchlist', JSON.stringify(watchlist));
  }, [watchlist]);

  useEffect(() => {
    localStorage.setItem('roth_ira_transactions', JSON.stringify(transactions));
  }, [transactions]);

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

  // Keep the search box in step with selections made from the sidebar.
  useEffect(() => {
    setDetailedSymbolDraft(detailedSymbol);
  }, [detailedSymbol]);

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
      try {
        const results = await Promise.all(MARKET_INDICES.map(async ({ key, symbol }) => {
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
      const data = await getStockNews(GENERAL_NEWS_KEY, settings, true);
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
    if (!isAiConfigured) return;

    // Skip anything already analyzed *or already tried*. Without the second
    // check a symbol that errors out gets re-requested every time `analyses`
    // changes, which burns API calls in a loop that never resolves.
    const missingSymbols = watchlist
      .map(item => item.symbol.trim().toUpperCase())
      .filter(symbol => symbol && !analyses[symbol] && !attemptedAnalysis.current.has(symbol));

    if (missingSymbols.length === 0) {
      setIsAutoAnalyzingWatchlist(false);
      return;
    }

    missingSymbols.forEach(symbol => attemptedAnalysis.current.add(symbol));

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
  }, [watchlist, analyses, settings, isAiConfigured]);

  // Measured indicators for every tracked symbol. Independent of the AI path —
  // these work with no API key at all.
  useEffect(() => {
    if (trackedSymbols.length === 0) return;

    const missing = trackedSymbols.filter(
      symbol => !technicals[symbol] && !attemptedTechnicals.current.has(symbol),
    );
    if (missing.length === 0) return;

    missing.forEach(symbol => attemptedTechnicals.current.add(symbol));

    let cancelled = false;
    setLoadingTechnicals(prev => {
      const next = { ...prev };
      missing.forEach(symbol => { next[symbol] = true; });
      return next;
    });

    (async () => {
      const results = await Promise.all(
        missing.map(async (symbol) => {
          try {
            return { symbol, snapshot: await getTechnicals(symbol) };
          } catch (error) {
            console.error(`Failed to compute indicators for ${symbol}`, error);
            return { symbol, snapshot: null };
          }
        }),
      );

      if (cancelled) return;

      setTechnicals(prev => {
        const next = { ...prev };
        results.forEach(({ symbol, snapshot }) => {
          if (snapshot) next[symbol] = snapshot;
        });
        return next;
      });
      setLoadingTechnicals(prev => {
        const next = { ...prev };
        results.forEach(({ symbol }) => { delete next[symbol]; });
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [trackedSymbols, technicals]);

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

  useEffect(() => {
    if (!isAiConfigured) {
      addNotification('AI features are disabled. Set VITE_OPENAI_API_KEY in .env and restart the app.', 'info');
    }
  }, [isAiConfigured]);

  /**
   * Fire notifications for any alert whose target the given prices have crossed.
   * Returns how many fired so callers can report "nothing triggered".
   *
   * A symbol only alerts once per crossing: `lastAlertedAt` is stamped when it
   * fires and cleared when price moves back to the other side of the target.
   * Without that, a five-minute refresh would re-notify forever.
   */
  const evaluateAlerts = (prices: Record<string, number>): number => {
    let triggered = 0;
    const firedSymbols: string[] = [];

    watchlist.forEach(item => {
      if (!item.targetPrice) return;
      const price = prices[item.symbol];
      if (!Number.isFinite(price) || price <= 0) return;

      const crossed = item.alertDirection === 'BELOW'
        ? price <= item.targetPrice
        : price >= item.targetPrice;

      if (crossed && !item.lastAlertedAt) {
        addNotification(
          item.alertDirection === 'BELOW'
            ? `${item.symbol} dropped to ${formatCurrency(price)}, below your ${formatCurrency(item.targetPrice)} target.`
            : `${item.symbol} reached ${formatCurrency(price)}, above your ${formatCurrency(item.targetPrice)} target.`,
          'success',
        );
        firedSymbols.push(item.symbol);
        triggered++;
      } else if (!crossed && item.lastAlertedAt) {
        // Back on the other side — re-arm so the next crossing notifies again.
        firedSymbols.push(item.symbol);
      }
    });

    if (firedSymbols.length > 0) {
      setWatchlist(prev => prev.map(item => {
        if (!firedSymbols.includes(item.symbol)) return item;
        return item.lastAlertedAt
          ? { ...item, lastAlertedAt: undefined }
          : { ...item, lastAlertedAt: new Date().toISOString() };
      }));
    }

    return triggered;
  };

  const checkWatchlistAlerts = async () => {
    const itemsWithAlerts = watchlist.filter(item => item.targetPrice);
    if (itemsWithAlerts.length === 0) {
      addNotification('No active alerts to check.', 'info');
      return;
    }

    setIsCheckingAlerts(true);
    try {
      const prices = await fetchPrices(itemsWithAlerts.map(item => item.symbol));
      setCurrentPrices(prev => ({ ...prev, ...prices }));

      if (evaluateAlerts(prices) === 0) {
        addNotification(`Checked ${itemsWithAlerts.length} alerts. No targets reached yet.`, 'info');
      }
    } finally {
      setIsCheckingAlerts(false);
    }
  };

  /** Fetch quotes for a list of symbols, skipping any that fail. */
  const fetchPrices = async (symbols: string[]): Promise<Record<string, number>> => {
    const unique = Array.from(new Set(symbols.map(s => s.trim().toUpperCase()).filter(Boolean)));
    const prices: Record<string, number> = {};

    await Promise.all(unique.map(async (symbol) => {
      try {
        const price = await getCurrentPrice(symbol);
        if (price > 0) prices[symbol] = price;
      } catch (error) {
        console.error(`Failed to fetch current price for ${symbol}`, error);
      }
    }));

    return prices;
  };

  const updateAllPrices = async (showNotification = true) => {
    if (trackedSymbols.length === 0) return;

    setIsUpdatingPrices(true);
    try {
      const prices = await fetchPrices(trackedSymbols);
      setCurrentPrices(prev => ({ ...prev, ...prices }));

      // Every refresh is also an alert check — otherwise a target could be hit
      // and cleared between two manual presses of "Check Alerts".
      evaluateAlerts(prices);

      const updatedCount = Object.keys(prices).length;
      if (showNotification) {
        addNotification(
          updatedCount > 0
            ? `Updated prices for ${updatedCount} ${updatedCount === 1 ? 'asset' : 'assets'}.`
            : 'Could not update any prices at this time.',
          updatedCount > 0 ? 'success' : 'info',
        );
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
        // Clearing lastAlertedAt re-arms the alert against the new target.
        ? { ...item, targetPrice: price, alertDirection: alertForm.direction, lastAlertedAt: undefined }
        : item
    ));
    setAlertSetup(null);
    addNotification(`Alert set for ${symbol} at ${formatCurrency(price)}`, 'success');
  };

  const handleRemoveAlert = (symbol: string) => {
    setWatchlist(prev => prev.map(item => {
      if (item.symbol === symbol) {
        const { targetPrice, alertDirection, lastAlertedAt, ...rest } = item;
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

  /**
   * Currency with an explicit sign. Formatting the absolute value and prefixing
   * the sign keeps this correct for every currency — the old code stripped a
   * literal '$', which left "€-12.40" mangled for any non-dollar setting.
   */
  const formatSignedCurrency = (amount: number) =>
    `${amount >= 0 ? '+' : '-'}${formatCurrency(Math.abs(amount))}`;

  const formatPercent = (value: number, digits = 1) =>
    `${value >= 0 ? '+' : ''}${value.toFixed(digits)}%`;

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

  const toggleNews = async (symbol: string) => {
    const isExpanded = expandedNews[symbol];
    setExpandedNews(prev => ({ ...prev, [symbol]: !isExpanded }));

    if (!isExpanded && !news[symbol]) {
      setLoadingNews(prev => ({ ...prev, [symbol]: true }));
      try {
        const stockNews = await getStockNews(symbol, settings);
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

  const handleAddWatchlist = () => {
    const symbol = newWatchlistSymbol.trim().toUpperCase();
    if (!symbol) return;
    if (watchlist.some(item => item.symbol === symbol)) {
      addNotification(`${symbol} is already on your watchlist.`, 'info');
      setNewWatchlistSymbol('');
      return;
    }

    // Analysis is left to the auto-analyze effect. Doing it here as well fired
    // two identical requests for every symbol added through this form.
    setWatchlist(prev => [...prev, { symbol, addedAt: new Date().toISOString() }]);
    setNewWatchlistSymbol('');
  };

  const handleRemoveWatchlist = (symbol: string) => {
    setWatchlist(prev => prev.filter(item => item.symbol !== symbol));
    setAnalyses(prev => {
      const next = { ...prev };
      delete next[symbol];
      return next;
    });
    // Forget the attempt so re-adding the symbol analyzes it again.
    attemptedAnalysis.current.delete(symbol);
    attemptedTechnicals.current.delete(symbol);
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

  // Single source of truth for portfolio valuation and concentration. Merges
  // repeated lots of the same symbol, so holding AAPL twice is one position.
  const riskAudit = useMemo(
    () => auditRisk(portfolio.holdings, currentPrices, portfolio.cashBalance, DEFAULT_RISK_THRESHOLD),
    [portfolio.holdings, portfolio.cashBalance, currentPrices],
  );

  const totalValue = riskAudit.totalValue;

  // Built from merged positions, so duplicate symbols no longer produce two
  // slices sharing a React key (which React warns about and renders oddly).
  const chartData = useMemo(
    () => [
      { name: 'Cash', value: portfolio.cashBalance },
      ...riskAudit.positions.map(position => ({ name: position.symbol, value: position.value })),
    ].filter(entry => entry.value > 0),
    [portfolio.cashBalance, riskAudit.positions],
  );

  // Transaction log replayed into positions, cash and realized gains.
  const replay = useMemo(() => replayTransactions(transactions), [transactions]);

  const reconciliation = useMemo(
    () => reconcile(portfolio, replay.positions),
    [portfolio, replay.positions],
  );

  const contributionSummary = useMemo(
    () => summarizeContributions(transactions, selectedTaxYear, settings),
    [transactions, selectedTaxYear, settings],
  );

  const basis = useMemo(() => contributionBasis(transactions), [transactions]);

  const availableTaxYears = useMemo(
    () => contributionYears(transactions, new Date().getFullYear()),
    [transactions],
  );

  const handleRecordTransaction = (draft: Omit<Transaction, 'id'>) => {
    const transaction: Transaction = { ...draft, id: createTransactionId() };

    setTransactions(prev => [...prev, transaction]);
    // Keep holdings and cash in step with the log, so recording activity is a
    // single action rather than an edit in two places.
    setPortfolio(prev => applyTransaction(prev, transaction));

    if (transaction.taxYear) setSelectedTaxYear(transaction.taxYear);

    addNotification(
      `Recorded ${transaction.type.toLowerCase()} of ${formatCurrency(transaction.amount)}.`,
      'success',
    );
  };

  const handleDeleteTransaction = (id: string) => {
    const transaction = transactions.find(item => item.id === id);
    setTransactions(prev => prev.filter(item => item.id !== id));

    // Deleting only removes the log entry. Reversing its effect on holdings
    // would be wrong when positions were also edited by hand, so the
    // reconciliation panel reports the difference instead.
    if (transaction) {
      addNotification(
        `Removed log entry. Holdings and cash were left unchanged — check the reconciliation panel.`,
        'info',
      );
    }
  };

  const handleSetContributionLimit = (year: number, amount: number) => {
    setSettings(prev => ({
      ...prev,
      contributionLimitOverrides: { ...prev.contributionLimitOverrides, [year]: amount },
    }));
    addNotification(`Set the ${year} contribution limit to ${formatCurrency(amount)}.`, 'success');
  };

  /** Total unrealized gain/loss, only across positions with a live quote. */
  const unrealized = useMemo(() => {
    let costBasis = 0;
    let marketValue = 0;

    portfolio.holdings.forEach(holding => {
      const symbol = holding.symbol.trim().toUpperCase();
      const livePrice = currentPrices[symbol];
      if (!Number.isFinite(livePrice) || livePrice <= 0) return;
      costBasis += holding.shares * holding.averagePrice;
      marketValue += holding.shares * livePrice;
    });

    if (costBasis <= 0) return null;
    const gain = marketValue - costBasis;
    return { gain, percent: (gain / costBasis) * 100, costBasis };
  }, [portfolio.holdings, currentPrices]);

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
          { id: 'activity', icon: PiggyBank, label: 'Activity' },
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
              {unrealized && (
                <p className={cn(
                  'text-xs font-medium',
                  unrealized.gain >= 0 ? 'text-emerald-600' : 'text-rose-600',
                )}>
                  {formatSignedCurrency(unrealized.gain)} ({formatPercent(unrealized.percent, 2)}) unrealized
                </p>
              )}
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
                    {riskAudit.positions.length === 0 ? (
                      <p className="text-sm text-slate-500 italic">Add holdings to get AI insights.</p>
                    ) : (
                      riskAudit.positions.slice(0, 3).map(position => {
                        const analysis = analyses[position.symbol];
                        const technical = technicals[position.symbol];
                        const technicalBias = technical ? scoreTechnicals(technical).bias : null;

                        return (
                          <div key={position.symbol} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                            <div>
                              <p className="font-bold text-sm">{position.symbol}</p>
                              {/* Measured signal shows even with AI disabled. */}
                              <p className="text-[10px] text-slate-400 uppercase">
                                {technicalBias ? `Technicals: ${technicalBias}` : 'Recommendation'}
                              </p>
                            </div>
                            {analysis ? (
                              <span className={cn(
                                "text-xs font-bold px-2 py-1 rounded-lg",
                                analysis.recommendation === 'BUY' && "bg-emerald-100 text-emerald-700",
                                analysis.recommendation === 'HOLD' && "bg-amber-100 text-amber-700",
                                analysis.recommendation === 'SELL' && "bg-rose-100 text-rose-700",
                              )}>
                                {analysis.recommendation}
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400 italic">
                                {isAiConfigured ? 'Pending analysis' : 'AI disabled'}
                              </span>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              {/* Market Snapshot — index moves over the last session */}
              <div className="lg:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-4">
                {MARKET_INDICES.map(({ key }) => {
                  const snapshot = marketSnapshot[key];
                  const isUp = (snapshot?.change ?? 0) >= 0;

                  return (
                    <div key={key} className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">{key}</p>
                      {snapshot ? (
                        <>
                          <p className="text-2xl font-bold text-slate-900 tabular-nums">{formatCurrency(snapshot.value)}</p>
                          <p className={cn(
                            'text-sm font-medium flex items-center gap-1 mt-1',
                            isUp ? 'text-emerald-600' : 'text-rose-600',
                          )}>
                            {isUp ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                            {formatSignedCurrency(snapshot.change)} ({formatPercent(snapshot.changePercent, 2)})
                          </p>
                        </>
                      ) : (
                        <p className="text-sm text-slate-300 italic">Loading...</p>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Risk & Diversification audit */}
              <div className="lg:col-span-3">
                <RiskAuditCard audit={riskAudit} formatCurrency={formatCurrency} />
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

              <PositionSizer
                audit={riskAudit}
                symbols={trackedSymbols}
                prices={currentPrices}
                symbol={sizerSymbol || trackedSymbols[0] || ''}
                onSymbolChange={setSizerSymbol}
                confidence={sizerConfidence}
                onConfidenceChange={setSizerConfidence}
                formatCurrency={formatCurrency}
              />

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
                      {/* Chart/news state is keyed by symbol, so only the first
                          lot of a symbol renders the detail row — otherwise two
                          lots of the same ticker each drew their own copy. */}
                      {portfolio.holdings.map((holding, idx) =>
                        portfolio.holdings.findIndex(h => h.symbol === holding.symbol) === idx
                        && (expandedChart[holding.symbol] || expandedNews[holding.symbol]) && (
                        <tr key={`details-${holding.symbol}`} className="bg-slate-50/50">
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

          {activeTab === 'activity' && (
            <motion.div
              key="activity"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <ContributionTracker
                summary={contributionSummary}
                basis={basis}
                years={availableTaxYears}
                onYearChange={setSelectedTaxYear}
                onSetLimit={handleSetContributionLimit}
                formatCurrency={formatCurrency}
              />

              <TransactionForm
                onSubmit={handleRecordTransaction}
                symbols={trackedSymbols}
                defaultTaxYear={selectedTaxYear}
              />

              <TransactionHistory
                transactions={transactions}
                replay={replay}
                reconciliation={reconciliation}
                onDelete={handleDeleteTransaction}
                formatCurrency={formatCurrency}
                formatDate={formatDate}
              />
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
                            onClick={() => toggleNews(item.symbol)}
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
                                <div className="text-[10px] text-slate-400 italic">Loading {item.symbol} news...</div>
                              ) : news[item.symbol]?.length === 0 ? (
                                <div className="text-[10px] text-slate-400 italic">No recent news for {item.symbol}.</div>
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
                  const snapshot = technicals[detailedSymbol];
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

                  // The close of the bar before the latest one — the actual
                  // "previous close". The old code showed `first`, the opening
                  // bar of the whole range, which for 1Y was a year-old price.
                  const previousRow = detailedHistory[detailedHistory.length - 2];
                  const previousClose = previousRow ? (previousRow.close ?? previousRow.price) : 0;

                  const periodHigh = hasHistory
                    ? Math.max(...detailedHistory.map(row => row.high ?? row.close ?? row.price))
                    : 0;
                  const periodLow = hasHistory
                    ? Math.min(...detailedHistory.map(row => row.low ?? row.close ?? row.price))
                    : 0;

                  // Bars are daily except 1D (hourly), 5Y (weekly) and MAX (monthly),
                  // so calling the latest bar's span a "day range" would be wrong.
                  const barLabel = detailedRange === '1D'
                    ? 'Hour'
                    : detailedRange === '5Y'
                      ? 'Week'
                      : detailedRange === 'MAX'
                        ? 'Month'
                        : 'Day';

                  const rows = hasHistory ? toCandleRows(detailedHistory) : [];
                  const trendColor = getTrendColor(rows);

                  return (
                    <>
                      {/* 1. Header (Symbol & Price) */}
                      <div className="mb-8">
                        <div className="flex justify-between items-start">
                          <h2 className="text-3xl font-bold text-slate-900 tracking-tight">{detailedSymbol}</h2>
                          {/* Commit on submit rather than per keystroke — typing
                              "AAPL" into the old version fired four lookups. */}
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              const next = detailedSymbolDraft.trim().toUpperCase();
                              if (next) setDetailedSymbol(next);
                            }}
                            className="flex gap-2 relative"
                          >
                            <input
                              type="text"
                              value={detailedSymbolDraft}
                              onChange={(e) => setDetailedSymbolDraft(e.target.value)}
                              onBlur={() => setDetailedSymbolDraft(detailedSymbol)}
                              placeholder="Search symbol"
                              aria-label="Search symbol"
                              className="w-40 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                          </form>
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
                            { label: 'Previous close', value: previousClose > 0 ? formatCurrency(previousClose) : '--' },
                            { label: 'Open', value: open > 0 ? formatCurrency(open) : '--' },
                            { label: `${barLabel} range`, value: hasHistory ? `${formatCurrency(low)} - ${formatCurrency(high)}` : '--' },
                            { label: `${detailedRange} range`, value: hasHistory ? `${formatCurrency(periodLow)} - ${formatCurrency(periodHigh)}` : '--' },
                            { label: 'RSI (14)', value: snapshot?.rsi14 != null ? snapshot.rsi14.toFixed(1) : '--' },
                            {
                              label: 'Ann. volatility',
                              value: snapshot?.annualizedVolatility != null
                                ? `${(snapshot.annualizedVolatility * 100).toFixed(0)}%`
                                : '--',
                            },
                            // These three come from the language model, which has no
                            // live market data — flagged so they are not read as measured.
                            { label: 'Market cap', value: analysis?.metrics?.marketCap || '--', estimated: true },
                            { label: 'P/E ratio', value: analysis?.metrics?.peRatio || '--', estimated: true },
                          ].map((stat, i) => (
                            <div key={i} className="flex flex-col border-t border-slate-100 pt-3">
                              <span className="text-sm text-slate-500 mb-1 flex items-center gap-1">
                                {stat.label}
                                {stat.estimated && stat.value !== '--' && (
                                  <span
                                    className="text-[9px] font-bold text-amber-600 bg-amber-50 px-1 py-0.5 rounded uppercase"
                                    title="Estimated by the AI model, not measured from market data"
                                  >
                                    est
                                  </span>
                                )}
                              </span>
                              <span className="text-base font-medium text-slate-900">{stat.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* 5. Additional Tabs (News / AI Insights) */}
                      <div>
                        <div className="flex gap-6 border-b border-slate-200 mb-6">
                          <button
                            onClick={() => setDetailedPanel('technicals')}
                            className={cn('pb-3 text-sm font-medium transition-all border-b-2', detailedPanel === 'technicals' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-900')}
                          >
                            Technicals
                          </button>
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
                          {detailedPanel === 'technicals' && (
                            <TechnicalsPanel
                              snapshot={snapshot}
                              loading={loadingTechnicals[detailedSymbol]}
                            />
                          )}

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
                      <h4 className="font-bold text-slate-900 mb-1">Display Currency</h4>
                      <p className="text-sm text-slate-500 mb-4">Which currency symbol and number format to display.</p>
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
                      {/* Market data arrives in USD and there is no FX conversion,
                          so any other choice relabels the same numbers. */}
                      {settings.currency !== 'USD' && (
                        <div className="mt-3 flex items-start gap-2 p-3 bg-amber-50 border border-amber-100 rounded-xl">
                          <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                          <p className="text-xs text-amber-800 leading-relaxed">
                            Prices are quoted in USD and are <strong>not converted</strong>. Selecting
                            {' '}{settings.currency} changes the symbol and formatting only — the
                            underlying values are still US dollars.
                          </p>
                        </div>
                      )}
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
                      <p className="text-sm text-slate-500 mb-4">
                        This helps AI tailor recommendations for your goals. A Roth IRA is a
                        retirement account, so long term is usually the fitting choice.
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        {[
                          { id: 'LONG_TERM', label: 'Long Term' },
                          { id: 'BOTH', label: 'Balanced' },
                          { id: 'SHORT_TERM', label: 'Short Term' }
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

                  {/* Catch-up contributions */}
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-blue-50 rounded-2xl text-blue-600">
                      <PiggyBank className="w-6 h-6" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-bold text-slate-900 mb-1">Catch-Up Contributions</h4>
                      <p className="text-sm text-slate-500 mb-4">
                        Account holders aged 50 and over may contribute an additional catch-up
                        amount each year. This raises the limit used on the Activity tab.
                      </p>
                      <div className="flex gap-2">
                        {[
                          { value: false, label: 'Under 50' },
                          { value: true, label: '50 or over' },
                        ].map(option => (
                          <button
                            key={String(option.value)}
                            onClick={() => setSettings(prev => ({ ...prev, catchUpEligible: option.value }))}
                            className={cn(
                              'px-4 py-2 rounded-xl text-sm font-medium border transition-all',
                              settings.catchUpEligible === option.value
                                ? 'bg-slate-900 text-white border-slate-900'
                                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300',
                            )}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>

                      {Object.keys(settings.contributionLimitOverrides).length > 0 && (
                        <div className="mt-4 p-3 bg-slate-50 border border-slate-100 rounded-xl">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                            Your limit overrides
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(settings.contributionLimitOverrides)
                              .sort(([a], [b]) => Number(b) - Number(a))
                              .map(([year, amount]) => (
                                <span
                                  key={year}
                                  className="inline-flex items-center gap-2 text-xs font-medium bg-white border border-slate-200 rounded-lg px-2 py-1"
                                >
                                  {year}: {formatCurrency(amount)}
                                  <button
                                    onClick={() => setSettings(prev => {
                                      const next = { ...prev.contributionLimitOverrides };
                                      delete next[Number(year)];
                                      return { ...prev, contributionLimitOverrides: next };
                                    })}
                                    className="text-slate-300 hover:text-rose-500 transition-colors"
                                    aria-label={`Remove the ${year} override`}
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </span>
                              ))}
                          </div>
                        </div>
                      )}
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
