/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Info, X, CheckCircle2 } from 'lucide-react';
import { localIsoDate, parseDay } from './lib/utils';
import {
  PortfolioData,
  StockHolding,
  WatchlistItem,
  StockAnalysis,
  MarketSuggestion,
  NewsItem,
  UserSettings,
  Transaction
} from './types';
import {
  analyzePortfolio,
  getMarketSuggestions,
  analyzeWatchlistStock,
  getStockNews,
  getStockPriceHistory,
  getQuote,
  getTechnicals,
  isAiConfigured
} from './services/openaiService';
import { TechnicalSnapshot } from './lib/indicators';
import { auditRisk, DEFAULT_RISK_THRESHOLD } from './lib/portfolioMath';
import { applyTransaction, reconcile, replayTransactions } from './lib/transactions';
import { contributionBasis, contributionYears, summarizeContributions } from './lib/contributions';
import { AppHeader, type Tab } from './components/layout/AppHeader';
import { HomeScreen } from './components/home/HomeScreen';
import { StockScreen, type StockChartMode } from './components/stock/StockScreen';
import { PortfolioScreen } from './components/portfolio/PortfolioScreen';
import { WatchlistScreen } from './components/watchlist/WatchlistScreen';
import { ActivityScreen } from './components/activity/ActivityScreen';
import { DiscoverScreen } from './components/discover/DiscoverScreen';
import { SettingsScreen } from './components/settings/SettingsScreen';

/** 'BOTH' (line over candles) was an option on the old stock page; it now shows as candles. */
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
  accountType: 'BROKERAGE',
  currency: 'USD',
  dateFormat: 'MM/DD/YYYY',
  investmentHorizon: 'LONG_TERM',
  preferredNewsSources: [],
  themeMode: 'DARK',
  catchUpEligible: false,
  contributionLimitOverrides: {},
};

const normalizeSettings = (raw: unknown): UserSettings => {
  if (!raw || typeof raw !== 'object') return defaultSettings;

  const candidate = raw as Partial<UserSettings>;
  return {
    ...defaultSettings,
    ...candidate,
    // Settings saved before account types existed came from the Roth-only
    // version of the app, so those accounts are Roth IRAs.
    accountType: candidate.accountType === 'BROKERAGE' ? 'BROKERAGE' : 'ROTH_IRA',
    preferredNewsSources: Array.isArray(candidate.preferredNewsSources)
      ? candidate.preferredNewsSources
      : [],
    themeMode: candidate.themeMode === 'LIGHT' ? 'LIGHT' : 'DARK',
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
  /** Symbol whose AI research the stock page is waiting on. */
  const [analyzingSymbol, setAnalyzingSymbol] = useState<string | null>(null);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [generalNews, setGeneralNews] = useState<NewsItem[]>([]);
  const [loadingGeneralNews, setLoadingGeneralNews] = useState(false);
  const [isAutoAnalyzingWatchlist, setIsAutoAnalyzingWatchlist] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('home');

  // Alert states
  const [notifications, setNotifications] = useState<{id: string, message: string, type: 'success'|'info'}[]>([]);
  const [isCheckingAlerts, setIsCheckingAlerts] = useState(false);
  const [currentPrices, setCurrentPrices] = useState<Record<string, number>>({});
  /** Prior session's close per symbol, for "today" changes. */
  const [previousCloses, setPreviousCloses] = useState<Record<string, number>>({});
  const [isUpdatingPrices, setIsUpdatingPrices] = useState(false);

  // Form states
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
    // data-theme selects the token set in index.css.
    root.dataset.theme = settings.themeMode === 'DARK' ? 'dark' : 'light';
  }, [settings.themeMode]);

  useEffect(() => {
    localStorage.setItem('roth_ira_chart_mode', JSON.stringify(chartMode));
  }, [chartMode]);

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

    // No cancellation, for the same reason as the indicator effect below: the
    // results are per symbol, and discarding them threw away paid API calls
    // that `attemptedAnalysis` then stopped from ever being retried.
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
        setIsAutoAnalyzingWatchlist(false);
      }
    };

    analyzeMissingWatchlist();
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

    // No cancellation: results are per symbol and stay valid after a re-run.
    // Discarding them stranded those symbols, because `attemptedTechnicals`
    // stops the next run from fetching them again — which happened on every
    // mount under StrictMode, leaving the indicators "computing" forever.
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
      const { prices, previous } = await fetchQuotes(itemsWithAlerts.map(item => item.symbol));
      setCurrentPrices(prev => ({ ...prev, ...prices }));
      setPreviousCloses(prev => ({ ...prev, ...previous }));

      if (evaluateAlerts(prices) === 0) {
        addNotification(`Checked ${itemsWithAlerts.length} alerts. No targets reached yet.`, 'info');
      }
    } finally {
      setIsCheckingAlerts(false);
    }
  };

  /** Fetch quotes for a list of symbols, skipping any that fail. */
  const fetchQuotes = async (symbols: string[]) => {
    const unique = Array.from(new Set(symbols.map(s => s.trim().toUpperCase()).filter(Boolean)));
    const prices: Record<string, number> = {};
    const previous: Record<string, number> = {};

    await Promise.all(unique.map(async (symbol) => {
      const quote = await getQuote(symbol);
      if (!quote) {
        console.error(`Failed to fetch a quote for ${symbol}`);
        return;
      }
      prices[symbol] = quote.price;
      if (quote.previousClose) previous[symbol] = quote.previousClose;
    }));

    return { prices, previous };
  };

  const updateAllPrices = async (showNotification = true) => {
    if (trackedSymbols.length === 0) return;

    setIsUpdatingPrices(true);
    try {
      const { prices, previous } = await fetchQuotes(trackedSymbols);
      setCurrentPrices(prev => ({ ...prev, ...prices }));
      setPreviousCloses(prev => ({ ...prev, ...previous }));

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

  const handleSaveAlert = (symbol: string, price: number, direction: 'ABOVE' | 'BELOW') => {
    setWatchlist(prev => prev.map(item =>
      item.symbol === symbol
        // Clearing lastAlertedAt re-arms the alert against the new target.
        ? { ...item, targetPrice: price, alertDirection: direction, lastAlertedAt: undefined }
        : item
    ));
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

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'N/A';
    // A bare 'YYYY-MM-DD' is a calendar day, not an instant: parsing it with
    // `new Date` reads UTC midnight, which displays as the previous day in US
    // time zones. Timestamps (news, watchlist adds) stay local-time instants.
    const date = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? parseDay(dateStr) : new Date(dateStr);
    if (Number.isNaN(date.getTime())) return 'N/A';
    if (settings.dateFormat === 'MM/DD/YYYY') return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
    if (settings.dateFormat === 'DD/MM/YYYY') return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
    return localIsoDate(date);
  };

  const handleAddHolding = (holding: StockHolding) => {
    setPortfolio(prev => ({ ...prev, holdings: [...prev.holdings, holding] }));
    addNotification(`Added ${holding.shares} ${holding.symbol} to your holdings.`, 'success');
  };

  const handleRemoveHolding = (index: number) => {
    setPortfolio(prev => ({
      ...prev,
      holdings: prev.holdings.filter((_, i) => i !== index)
    }));
  };

  const handleAddWatchlist = (symbol: string) => {
    if (watchlist.some(item => item.symbol === symbol)) {
      addNotification(`${symbol} is already on your watchlist.`, 'info');
      return;
    }

    // Analysis is left to the auto-analyze effect. Doing it here as well fired
    // two identical requests for every symbol added through this form.
    setWatchlist(prev => [...prev, { symbol, addedAt: new Date().toISOString() }]);
    addNotification(`Added ${symbol} to your watchlist.`, 'success');
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

  const handleToggleWatchlist = (symbol: string) => {
    if (watchlist.some(item => item.symbol === symbol)) {
      handleRemoveWatchlist(symbol);
      addNotification(`Removed ${symbol} from your watchlist.`, 'info');
    } else {
      handleAddWatchlist(symbol);
    }
  };

  /** AI research for one symbol, on request from its stock page. */
  const requestStockAnalysis = async (symbol: string) => {
    setAnalyzingSymbol(symbol);
    attemptedAnalysis.current.add(symbol);
    try {
      const analysis = await analyzeWatchlistStock(symbol, settings);
      setAnalyses(prev => ({ ...prev, [symbol]: analysis }));
    } catch (error) {
      console.error(`Failed to analyze ${symbol}`, error);
      addNotification(getErrorMessage(error, `AI research for ${symbol} failed.`), 'info');
    } finally {
      setAnalyzingSymbol(prev => (prev === symbol ? null : prev));
    }
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

  const openStock = (symbol: string) => {
    setDetailedSymbol(symbol.trim().toUpperCase());
    setActiveTab('detailed');
  };

  return (
    <div className="min-h-screen">
      {/* Notifications */}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex flex-col gap-2" aria-live="polite">
        <AnimatePresence>
          {notifications.map(note => (
            <motion.div
              key={note.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="pointer-events-auto flex max-w-sm items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3 text-ink shadow-lg"
            >
              {note.type === 'success'
                ? <CheckCircle2 className="h-5 w-5 shrink-0 text-up" />
                : <Info className="h-5 w-5 shrink-0 text-accent" />}
              <p className="text-sm leading-tight">{note.message}</p>
              <button
                onClick={() => setNotifications(prev => prev.filter(n => n.id !== note.id))}
                aria-label="Dismiss"
                className="ml-auto shrink-0 text-muted hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <AppHeader
        activeTab={activeTab}
        onNavigate={setActiveTab}
        onSearch={openStock}
        theme={settings.themeMode}
        onToggleTheme={() => setSettings(prev => ({ ...prev, themeMode: prev.themeMode === 'DARK' ? 'LIGHT' : 'DARK' }))}
      />

      <main className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6">
        {activeTab === 'home' ? (
          <HomeScreen
            holdings={portfolio.holdings}
            audit={riskAudit}
            unrealized={unrealized}
            prices={currentPrices}
            previousCloses={previousCloses}
            watchlist={watchlist}
            indices={MARKET_INDICES.map(index => ({ ...index, snapshot: marketSnapshot[index.key] }))}
            news={generalNews}
            loadingNews={loadingGeneralNews}
            isUpdatingPrices={isUpdatingPrices}
            onRefreshNews={fetchGeneralNews}
            onRefreshPrices={() => updateAllPrices(true)}
            onOpenStock={openStock}
            onNavigate={setActiveTab}
            onSetCash={amount => setPortfolio(prev => ({ ...prev, cashBalance: amount }))}
            formatCurrency={formatCurrency}
            formatDate={formatDate}
          />
        ) : activeTab === 'detailed' ? (
          <StockScreen
            key={detailedSymbol}
            symbol={detailedSymbol}
            holdings={portfolio.holdings}
            inWatchlist={watchlist.some(item => item.symbol === detailedSymbol)}
            onToggleWatchlist={handleToggleWatchlist}
            technicals={technicals[detailedSymbol]}
            technicalsLoading={loadingTechnicals[detailedSymbol]}
            analysis={analyses[detailedSymbol]}
            analyzing={analyzingSymbol === detailedSymbol || (isAutoAnalyzingWatchlist && !analyses[detailedSymbol] && watchlist.some(item => item.symbol === detailedSymbol))}
            onRequestAnalysis={isAiConfigured ? requestStockAnalysis : undefined}
            chartMode={(chartMode[detailedSymbol] ?? 'LINE') === 'LINE' ? 'LINE' : 'CANDLES'}
            onChartModeChange={(mode: StockChartMode) => setChartMode(prev => ({ ...prev, [detailedSymbol]: mode }))}
            settings={settings}
            onNavigate={setActiveTab}
            formatCurrency={formatCurrency}
            formatDate={formatDate}
          />
        ) : activeTab === 'holdings' ? (
          <PortfolioScreen
            holdings={portfolio.holdings}
            audit={riskAudit}
            unrealized={unrealized}
            prices={currentPrices}
            analyses={analyses}
            isUpdatingPrices={isUpdatingPrices}
            onRefreshPrices={() => updateAllPrices(true)}
            onAnalyze={isAiConfigured ? runPortfolioAnalysis : undefined}
            isAnalyzing={isAnalyzing}
            onAddHolding={handleAddHolding}
            onRemoveHolding={handleRemoveHolding}
            onOpenStock={openStock}
            onNavigate={setActiveTab}
            sizer={{
              symbols: trackedSymbols,
              symbol: sizerSymbol || trackedSymbols[0] || '',
              onSymbolChange: setSizerSymbol,
              confidence: sizerConfidence,
              onConfidenceChange: setSizerConfidence,
            }}
            formatCurrency={formatCurrency}
          />
        ) : activeTab === 'watchlist' ? (
          <WatchlistScreen
            watchlist={watchlist}
            prices={currentPrices}
            previousCloses={previousCloses}
            analyses={analyses}
            isAutoAnalyzing={isAutoAnalyzingWatchlist}
            aiEnabled={isAiConfigured}
            onAdd={handleAddWatchlist}
            onRemove={handleRemoveWatchlist}
            onSaveAlert={handleSaveAlert}
            onRemoveAlert={handleRemoveAlert}
            onCheckAlerts={checkWatchlistAlerts}
            isCheckingAlerts={isCheckingAlerts}
            onOpenStock={openStock}
            formatCurrency={formatCurrency}
            formatDate={formatDate}
          />
        ) : activeTab === 'activity' ? (
          <ActivityScreen
            accountType={settings.accountType}
            onAccountTypeChange={accountType => setSettings(prev => ({ ...prev, accountType }))}
            transactions={transactions}
            replay={replay}
            reconciliation={reconciliation}
            symbols={trackedSymbols}
            onRecord={handleRecordTransaction}
            onDelete={handleDeleteTransaction}
            contributions={{
              summary: contributionSummary,
              basis,
              years: availableTaxYears,
              selectedYear: selectedTaxYear,
              onYearChange: setSelectedTaxYear,
              onSetLimit: handleSetContributionLimit,
            }}
            formatCurrency={formatCurrency}
            formatDate={formatDate}
          />
        ) : activeTab === 'suggestions' ? (
          <DiscoverScreen
            suggestions={suggestions}
            isLoading={isSuggesting}
            onGenerate={isAiConfigured ? fetchSuggestions : undefined}
            watchlistSymbols={watchlist.map(item => item.symbol)}
            onAddToWatchlist={handleAddWatchlist}
            onOpenStock={openStock}
            accountType={settings.accountType}
          />
        ) : (
          <SettingsScreen
            settings={settings}
            onUpdate={patch => setSettings(prev => ({ ...prev, ...patch }))}
            aiEnabled={isAiConfigured}
            formatCurrency={formatCurrency}
          />
        )}
      </main>
    </div>
  );
}
