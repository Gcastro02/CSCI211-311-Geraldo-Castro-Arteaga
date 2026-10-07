import { useEffect, useMemo, useState } from 'react';
import { Check, Plus, RefreshCw, Sparkles } from 'lucide-react';
import { NewsItem, PriceData, StockAnalysis, StockHolding, UserSettings } from '../../types';
import { TechnicalSnapshot } from '../../lib/indicators';
import { getQuote, getStockNews, getStockPriceHistory, getTechnicals, type Quote } from '../../services/openaiService';
import { cn, parseDay } from '../../lib/utils';
import { Change } from '../ui/Change';
import { LineChart, type LinePoint } from '../ui/LineChart';
import { TechnicalsPanel } from '../TechnicalsPanel';
import type { Tab } from '../layout/AppHeader';

export type StockChartMode = 'LINE' | 'CANDLES';

const RANGES = [
  { id: '1D', caption: 'today' },
  { id: '5D', caption: 'past 5 days' },
  { id: '1M', caption: 'past month' },
  { id: '6M', caption: 'past 6 months' },
  { id: '1Y', caption: 'past year' },
  { id: '5Y', caption: 'past 5 years' },
  { id: 'MAX', caption: 'all time' },
] as const;
type StockRange = (typeof RANGES)[number]['id'];

const compactNumber = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 });

interface StockScreenProps {
  symbol: string;
  holdings: StockHolding[];
  inWatchlist: boolean;
  onToggleWatchlist: (symbol: string) => void;
  /** Cached indicators for tracked symbols; fetched here when absent. */
  technicals?: TechnicalSnapshot;
  technicalsLoading?: boolean;
  analysis?: StockAnalysis;
  analyzing: boolean;
  /** Undefined when AI features are not configured. */
  onRequestAnalysis?: (symbol: string) => void;
  chartMode: StockChartMode;
  onChartModeChange: (mode: StockChartMode) => void;
  settings: UserSettings;
  onNavigate: (tab: Tab) => void;
  formatCurrency: (amount: number) => string;
  formatDate: (date?: string) => string;
}

/**
 * One ticker's page: price, chart, your position, key stats, technicals, AI
 * research and news. Mount it with `key={symbol}` so every piece of loaded
 * state resets when the symbol changes.
 */
export function StockScreen({
  symbol,
  holdings,
  inWatchlist,
  onToggleWatchlist,
  technicals,
  technicalsLoading,
  analysis,
  analyzing,
  onRequestAnalysis,
  chartMode,
  onChartModeChange,
  settings,
  onNavigate,
  formatCurrency,
  formatDate,
}: StockScreenProps) {
  const [range, setRange] = useState<StockRange>('6M');
  /** undefined while loading, null when the lookup failed. */
  const [quote, setQuote] = useState<Quote | null | undefined>(undefined);
  const [bars, setBars] = useState<PriceData[] | null>(null);
  const [ownTechnicals, setOwnTechnicals] = useState<TechnicalSnapshot | null | undefined>(undefined);
  const [news, setNews] = useState<NewsItem[] | null>(null);
  const [explain, setExplain] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getQuote(symbol).then(result => { if (!cancelled) setQuote(result); });
    getStockNews(symbol, settings)
      .then(items => { if (!cancelled) setNews(items); })
      .catch(() => { if (!cancelled) setNews([]); });
    return () => { cancelled = true; };
  }, [symbol]);

  // Symbols that aren't held or watched have no cached indicators.
  useEffect(() => {
    if (technicals || technicalsLoading) return;
    let cancelled = false;
    getTechnicals(symbol)
      .then(snapshot => { if (!cancelled) setOwnTechnicals(snapshot); })
      .catch(() => { if (!cancelled) setOwnTechnicals(null); });
    return () => { cancelled = true; };
  }, [symbol, technicals, technicalsLoading]);

  useEffect(() => {
    let cancelled = false;
    setBars(null);
    getStockPriceHistory(symbol, range, { sample: false })
      .then(rows => { if (!cancelled) setBars(rows); })
      .catch(() => { if (!cancelled) setBars([]); });
    return () => { cancelled = true; };
  }, [symbol, range]);

  const points: LinePoint[] = useMemo(
    () => (bars ?? []).map(bar => ({
      date: bar.date,
      value: bar.close ?? bar.price,
      open: bar.open,
      high: bar.high,
      low: bar.low,
    })),
    [bars],
  );

  const position = useMemo(() => {
    const lots = holdings.filter(h => h.symbol.trim().toUpperCase() === symbol);
    const shares = lots.reduce((sum, lot) => sum + lot.shares, 0);
    if (!(shares > 0)) return null;
    const cost = lots.reduce((sum, lot) => sum + lot.shares * (lot.averagePrice || 0), 0);
    return { shares, cost, averagePrice: cost > 0 ? cost / shares : null };
  }, [holdings, symbol]);

  const snapshot = technicals ?? ownTechnicals ?? undefined;
  const lastClose = points.length ? points[points.length - 1].value : undefined;
  const price = quote?.price ?? lastClose;
  const loadingQuote = quote === undefined;
  const notFound = quote === null && bars !== null && bars.length === 0;

  const today = quote?.previousClose && price
    ? { amount: price - quote.previousClose, percent: (price / quote.previousClose - 1) * 100 }
    : null;

  // 1D compares with the prior close, like the "today" figure; longer ranges
  // compare with the first bar in the range.
  const rangeStart = range === '1D' ? quote?.previousClose ?? points[0]?.value : points[0]?.value;
  const rangeChange = rangeStart && price && bars?.length
    ? { amount: price - rangeStart, percent: (price / rangeStart - 1) * 100 }
    : null;
  const rangeCaption = RANGES.find(r => r.id === range)!.caption;

  const chartDate = (value: string) => {
    if (range === '1D') return new Date(value).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const day = parseDay(value);
    if (range === 'MAX') return String(day.getFullYear());
    if (range === '1Y' || range === '5Y') return day.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    return day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const asOf = quote?.marketTime
    ? new Date(quote.marketTime).toLocaleString('en-US', {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
      })
    : null;

  const yearPosition = quote?.yearHigh && quote.yearLow && price && quote.yearHigh > quote.yearLow
    ? (price - quote.yearLow) / (quote.yearHigh - quote.yearLow)
    : null;

  const stats: { label: string; value: string; tip: string; estimated?: boolean }[] = [
    {
      label: 'Previous close',
      value: quote?.previousClose ? formatCurrency(quote.previousClose) : '—',
      tip: 'The price at the end of the last trading day.',
    },
    {
      label: 'Day range',
      value: quote?.dayLow && quote.dayHigh ? `${formatCurrency(quote.dayLow)} – ${formatCurrency(quote.dayHigh)}` : '—',
      tip: 'Lowest and highest price it traded at today.',
    },
    {
      label: '52-week range',
      value: quote?.yearLow && quote.yearHigh ? `${formatCurrency(quote.yearLow)} – ${formatCurrency(quote.yearHigh)}` : '—',
      tip: `Lowest and highest price over the past year.${
        yearPosition == null ? '' : yearPosition > 0.8 ? ' Today it’s near the top.' : yearPosition < 0.2 ? ' Today it’s near the bottom.' : ' Today it’s in the middle.'
      }`,
    },
    {
      label: 'Volume',
      value: quote?.volume ? compactNumber.format(quote.volume) : '—',
      tip: 'Shares traded today. High volume means it’s easy to buy or sell without moving the price.',
    },
    {
      label: 'Volatility (annual)',
      value: snapshot?.annualizedVolatility != null ? `${(snapshot.annualizedVolatility * 100).toFixed(0)}%` : '—',
      tip: 'How much the price typically swings over a year. Higher means a bumpier ride.',
    },
  ];

  // The language model has no live market data, so these are labeled estimates.
  if (analysis?.metrics?.marketCap) {
    stats.push({ label: 'Market cap', value: analysis.metrics.marketCap, tip: 'Share price × number of shares: what the whole company is valued at.', estimated: true });
  }
  if (analysis?.metrics?.peRatio) {
    stats.push({ label: 'P/E ratio', value: analysis.metrics.peRatio, tip: 'Price ÷ yearly profit per share — how much investors pay for each $1 of profit.', estimated: true });
  }
  if (analysis?.metrics?.dividendYield) {
    stats.push({ label: 'Dividend yield', value: analysis.metrics.dividendYield, tip: 'Cash paid to shareholders each year, as a percent of the price.', estimated: true });
  }

  if (notFound) {
    return (
      <div className="py-16 text-center">
        <h1 className="text-2xl font-medium">We couldn’t find “{symbol}”</h1>
        <p className="mt-2 text-sm text-muted">Check the ticker and try searching again.</p>
        <button
          type="button"
          onClick={() => onNavigate('home')}
          className="mt-6 h-11 rounded-full border border-edge px-5 text-sm font-medium text-accent hover:bg-surface"
        >
          Back to Home
        </button>
      </div>
    );
  }

  return (
    <div>
      <nav aria-label="Breadcrumb" className="text-[13px] text-muted">
        <button type="button" onClick={() => onNavigate('home')} className="text-accent hover:underline">Home</button>
        <span aria-hidden="true"> › </span>
        {symbol}
      </nav>

      {/* Name, price and actions */}
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-medium">
            {quote?.name ?? symbol}
            <span className="ml-2 font-mono text-sm font-normal text-muted">
              {symbol}{quote?.exchange && ` · ${quote.exchange}`}
            </span>
          </h1>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-3.5 gap-y-1">
            <span className="text-[40px] font-medium leading-tight tracking-tight">
              {price ? formatCurrency(price) : loadingQuote ? '…' : '—'}
            </span>
            {today && (
              <span className="text-base">
                <Change amount={today.amount} percent={today.percent} formatCurrency={formatCurrency} /> today
              </span>
            )}
          </div>
          {asOf && (
            <p className="mt-0.5 text-[13px] text-muted">
              As of {asOf}{quote?.currency && ` · ${quote.currency}`}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => onToggleWatchlist(symbol)}
          aria-pressed={inWatchlist}
          className={cn(
            'flex h-11 items-center gap-2 rounded-full border px-[18px] text-sm font-medium transition-colors',
            inWatchlist
              ? 'border-edge text-accent hover:bg-surface'
              : 'border-accent bg-accent text-on-accent hover:bg-accent-strong',
          )}
        >
          {inWatchlist ? <Check className="h-4 w-4" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
          {inWatchlist ? 'In watchlist' : 'Add to watchlist'}
        </button>
      </div>

      {position && price && (
        <section aria-label="Your position" className="mt-5 flex flex-wrap gap-x-8 gap-y-2 rounded-lg bg-surface px-5 py-4 text-sm">
          <span><span className="text-muted">You own</span> <span className="font-medium">{Number.isInteger(position.shares) ? position.shares : position.shares.toFixed(4)} shares</span></span>
          <span><span className="text-muted">Value</span> <span className="font-medium">{formatCurrency(position.shares * price)}</span></span>
          {position.averagePrice != null && (
            <>
              <span><span className="text-muted">Avg. cost</span> <span className="font-medium">{formatCurrency(position.averagePrice)}</span></span>
              <span>
                <span className="text-muted">Gain</span>{' '}
                <Change
                  amount={position.shares * price - position.cost}
                  percent={(position.shares * price / position.cost - 1) * 100}
                  formatCurrency={formatCurrency}
                />
              </span>
            </>
          )}
        </section>
      )}

      {/* One column on phones (stats right after the chart); stats beside the chart on wide screens. */}
      <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Chart */}
        <section aria-label="Price chart">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line">
            <div role="group" aria-label="Chart range" className="flex flex-wrap gap-1">
              {RANGES.map(option => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setRange(option.id)}
                  aria-pressed={range === option.id}
                  className={cn(
                    '-mb-px h-10 min-w-11 border-b-2 px-2.5 text-[13px] font-medium transition-colors',
                    range === option.id ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-ink',
                  )}
                >
                  {option.id}
                </button>
              ))}
            </div>
            <div role="group" aria-label="Chart style" className="ml-auto flex rounded-full border border-edge p-0.5 text-xs font-medium">
              {(['LINE', 'CANDLES'] as const).map(mode => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onChartModeChange(mode)}
                  aria-pressed={chartMode === mode}
                  className={cn(
                    'h-8 rounded-full px-3 transition-colors',
                    chartMode === mode ? 'bg-chip text-ink' : 'text-muted hover:text-ink',
                  )}
                >
                  {mode === 'LINE' ? 'Line' : 'Candles'}
                </button>
              ))}
            </div>
          </div>
          <p className="mt-3 min-h-5 text-sm text-muted">
            {rangeChange && (
              <>
                <Change amount={rangeChange.amount} percent={rangeChange.percent} formatCurrency={formatCurrency} /> {rangeCaption}
              </>
            )}
          </p>
          <div className="mt-6">
            {bars === null ? (
              <div className="flex h-[300px] items-center justify-center text-sm text-muted">
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> Loading chart…
              </div>
            ) : (
              <LineChart
                points={points}
                height={300}
                mode={chartMode === 'CANDLES' ? 'candles' : 'line'}
                baseline={range === '1D' ? quote?.previousClose ?? undefined : undefined}
                ariaLabel={`${symbol} price, ${rangeCaption}`}
                formatValue={formatCurrency}
                formatDate={chartDate}
              />
            )}
          </div>
        </section>

        {/* Key stats */}
        <aside className="flex min-w-0 flex-col gap-8 self-start lg:col-start-2 lg:row-span-4 lg:row-start-1">
          <section aria-labelledby="stats-heading">
            <div className="flex items-baseline justify-between">
              <h2 id="stats-heading" className="text-lg font-semibold">Key stats</h2>
              <button
                type="button"
                onClick={() => setExplain(prev => !prev)}
                aria-pressed={explain}
                className="text-sm text-accent hover:underline"
              >
                {explain ? 'Hide explanations' : 'Explain terms'}
              </button>
            </div>
            <dl className="mt-2">
              {stats.map(stat => (
                <div key={stat.label} className="border-b border-line-soft py-3">
                  <div className="flex justify-between gap-3">
                    <dt className="flex items-center gap-1.5 text-sm text-ink-2">
                      {stat.label}
                      {stat.estimated && (
                        <span
                          className="rounded bg-note px-1 py-px text-[10px] font-medium text-note-ink"
                          title="Estimated by the AI model, not measured from market data"
                        >
                          est.
                        </span>
                      )}
                    </dt>
                    <dd className="text-right text-sm font-medium">{stat.value}</dd>
                  </div>
                  {explain && <p className="mt-1 text-xs leading-relaxed text-muted">{stat.tip}</p>}
                </div>
              ))}
            </dl>
          </section>
        </aside>

        {/* Technicals */}
        <section aria-labelledby="technicals-heading">
          <h2 id="technicals-heading" className="text-lg font-semibold">Technicals</h2>
          <p className="mt-1 text-[13px] text-muted">Measured from daily prices, not predicted.</p>
          <div className="mt-3">
            <TechnicalsPanel
              snapshot={snapshot}
              loading={technicalsLoading || (!technicals && ownTechnicals === undefined)}
              explain={explain}
            />
          </div>
        </section>

        {/* AI research */}
        {onRequestAnalysis && (
          <section aria-labelledby="ai-heading">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="ai-heading" className="flex items-center gap-2 text-lg font-semibold">
                <Sparkles className="h-4 w-4 text-accent" aria-hidden="true" /> AI research
              </h2>
              <span className="text-xs text-muted">Written by a language model · not advice</span>
            </div>
            {analysis ? (
              <div className="mt-3 space-y-4 text-sm leading-relaxed">
                <p className="text-ink-2">{analysis.reasoning}</p>
                {analysis.projectedGrowth && (
                  <p><span className="text-muted">Outlook:</span> {analysis.projectedGrowth}</p>
                )}
                {analysis.keyFactors?.length ? (
                  <ul className="flex flex-wrap gap-2">
                    {analysis.keyFactors.map((factor, i) => (
                      <li key={i} className="rounded-full border border-line px-3 py-1 text-xs text-ink-2">{factor}</li>
                    ))}
                  </ul>
                ) : null}
                <p className="text-xs text-muted">
                  Model’s overall view: {analysis.recommendation.toLowerCase()} · risk {analysis.riskLevel.toLowerCase()}
                </p>
              </div>
            ) : (
              <div className="mt-3">
                <p className="text-sm text-ink-2">
                  Get a written summary that reasons over the measured indicators above.
                </p>
                <button
                  type="button"
                  onClick={() => onRequestAnalysis(symbol)}
                  disabled={analyzing}
                  className="mt-3 flex h-11 items-center gap-2 rounded-full border border-edge px-[18px] text-sm font-medium text-accent hover:bg-surface disabled:opacity-60"
                >
                  {analyzing && <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  {analyzing ? 'Writing research…' : 'Get AI research'}
                </button>
              </div>
            )}
          </section>
        )}

        {/* News */}
        <section aria-labelledby="stock-news-heading">
          <h2 id="stock-news-heading" className="text-lg font-semibold">News</h2>
          {news === null ? (
            <p className="mt-2 text-sm text-muted">Loading headlines…</p>
          ) : news.length === 0 ? (
            <p className="mt-2 text-sm text-muted">No recent news found for {symbol}.</p>
          ) : (
            <ul className="mt-1">
              {news.slice(0, 8).map((item, i) => (
                <li key={`${item.url}-${i}`} className="border-b border-line-soft py-3.5">
                  <p className="text-xs text-muted">
                    {item.source}
                    {item.date && ` · ${formatDate(item.date)}`}
                  </p>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 block text-[15px] font-medium leading-snug text-ink hover:text-accent"
                  >
                    {item.title}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
