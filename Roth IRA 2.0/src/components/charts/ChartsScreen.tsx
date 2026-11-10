import { useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { CHART_INTERVALS, ChartInterval, applyLivePrice, findInterval, isIntraday } from '../../lib/chartData';
import { LiveQuote } from '../../lib/liveQuotes';
import { cleanSearchInput } from '../../lib/symbolSearch';
import { cn } from '../../lib/utils';
import { PriceData } from '../../types';
import { getChartBars, getQuote, type Quote } from '../../services/openaiService';
import { Change } from '../ui/Change';
import { PriceFreshness, PriceStatus } from '../ui/PriceStatus';
import { SymbolInput } from '../ui/SymbolInput';
import { ChartStyle, PriceChart } from './PriceChart';

/** Per-browser chart preferences, like the theme. */
const VIEW_KEY = 'roth_ira_chart_view';
const AVERAGE_CHOICES = [20, 50, 200];

interface ChartView {
  interval: ChartInterval['id'];
  style: ChartStyle;
  volume: boolean;
  averages: number[];
}

const readView = (): ChartView => {
  const fallback: ChartView = { interval: '5m', style: 'candles', volume: true, averages: [] };
  try {
    const saved = JSON.parse(localStorage.getItem(VIEW_KEY) || '{}');
    return {
      interval: findInterval(saved.interval).id,
      style: saved.style === 'line' ? 'line' : 'candles',
      volume: saved.volume !== false,
      averages: Array.isArray(saved.averages) ? saved.averages.filter((n: unknown) => AVERAGE_CHOICES.includes(n as number)) : [],
    };
  } catch {
    return fallback;
  }
};

interface ChartsScreenProps {
  symbol: string;
  onSymbolChange: (symbol: string) => void;
  /** Holdings and watchlist, for the side panel. */
  symbols: string[];
  prices: Record<string, number>;
  previousCloses: Record<string, number>;
  /** The newest price for `symbol` from the app's fast refresh. */
  live?: LiveQuote;
  priceStatus: PriceFreshness;
  onOpenStock: (symbol: string) => void;
  formatCurrency: (amount: number) => string;
}

const INDEXES = [
  { symbol: 'SPY', name: 'S&P 500' },
  { symbol: 'QQQ', name: 'Nasdaq 100' },
  { symbol: 'DIA', name: 'Dow' },
];

/** The full-width chart workspace: one symbol, any bar size, switched from the side panel. */
export function ChartsScreen({
  symbol,
  onSymbolChange,
  symbols,
  prices,
  previousCloses,
  live,
  priceStatus,
  onOpenStock,
  formatCurrency,
}: ChartsScreenProps) {
  const [view, setView] = useState<ChartView>(readView);
  const [bars, setBars] = useState<PriceData[] | null>(null);
  const [quote, setQuote] = useState<Quote | null | undefined>(undefined);
  const [search, setSearch] = useState('');
  const interval = findInterval(view.interval);

  const updateView = (patch: Partial<ChartView>) => {
    setView(current => {
      const next = { ...current, ...patch };
      try {
        localStorage.setItem(VIEW_KEY, JSON.stringify(next));
      } catch {
        // Blocked storage: the choice lasts until the page reloads.
      }
      return next;
    });
  };

  // The bars, and again every minute while the market is open, so anything the
  // live price can't know (volume, a corrected bar) catches up.
  useEffect(() => {
    let cancelled = false;
    setBars(null);
    const load = (initial: boolean) => getChartBars(symbol, interval)
      .then(rows => { if (!cancelled && (initial || rows.length)) setBars(rows); })
      .catch(() => { if (!cancelled && initial) setBars([]); });
    load(true);
    if (!priceStatus.marketOpen) return () => { cancelled = true; };
    const timer = setInterval(() => { if (!document.hidden) load(false); }, 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [symbol, interval.id, priceStatus.marketOpen]);

  useEffect(() => {
    let cancelled = false;
    setQuote(undefined);
    getQuote(symbol).then(result => { if (!cancelled) setQuote(result); });
    return () => { cancelled = true; };
  }, [symbol]);

  // Each fast-refresh price moves the latest bar, between those reloads.
  // Keyed on price and time together: a new price is never skipped for sharing a second.
  const lastLive = useRef('');
  useEffect(() => {
    const key = live ? `${live.time}|${live.price}` : '';
    if (!live || !priceStatus.marketOpen || lastLive.current === key) return;
    lastLive.current = key;
    setBars(current => (current ? applyLivePrice(current, live.price, (live.time ?? Date.now() / 1000) * 1000, interval) : current));
  }, [live, priceStatus.marketOpen, interval.id]);

  const price = live?.price ?? quote?.price ?? (bars?.length ? bars[bars.length - 1].close ?? bars[bars.length - 1].price : undefined);
  const previousClose = quote?.previousClose ?? live?.previousClose ?? null;
  const today = price && previousClose ? { amount: price - previousClose, percent: (price / previousClose - 1) * 100 } : null;
  const intraday = isIntraday(interval);
  const notFound = quote === null && bars !== null && bars.length === 0;

  const panel = useMemo(() => Array.from(new Set(symbols)).filter(s => !INDEXES.some(i => i.symbol === s)), [symbols]);
  const row = (s: string, name?: string) => {
    const p = prices[s];
    const prev = previousCloses[s];
    return (
      <li key={s}>
        <button
          type="button"
          onClick={() => onSymbolChange(s)}
          aria-current={s === symbol ? 'true' : undefined}
          className={cn('flex min-h-11 w-full items-center justify-between gap-3 rounded px-2 py-2 text-left text-sm hover:bg-surface', s === symbol && 'bg-chip')}
        >
          <span className="min-w-0">
            <span className="font-mono text-[13px] font-medium">{s}</span>
            {name && <span className="ml-2 text-xs text-muted">{name}</span>}
          </span>
          <span className="flex flex-col items-end">
            <span className="font-medium tabular-nums">{p ? formatCurrency(p) : '—'}</span>
            {p && prev ? <Change percent={(p / prev - 1) * 100} className="text-xs" /> : null}
          </span>
        </button>
      </li>
    );
  };

  const toggle = (on: boolean, label: string, onClick: () => void) => (
    <button
      key={label}
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn('h-8 rounded-full border px-3 text-xs font-medium transition-colors', on ? 'border-accent bg-accent-tint text-accent' : 'border-edge text-muted hover:text-ink')}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <h1 className="text-xl font-semibold"><span className="font-mono">{symbol}</span></h1>
            <span className="truncate text-sm text-muted">{quote?.name}</span>
            <button type="button" onClick={() => onOpenStock(symbol)} className="text-sm text-accent hover:underline">Stock page</button>
          </div>
          <div className="mt-0.5 flex flex-wrap items-baseline gap-x-3">
            <span className="text-[28px] font-medium tabular-nums tracking-tight">{price ? formatCurrency(price) : '—'}</span>
            {today && <span className="text-sm"><Change amount={today.amount} percent={today.percent} formatCurrency={formatCurrency} /> today</span>}
          </div>
          <PriceStatus status={priceStatus} />
        </div>
        <form
          onSubmit={event => {
            event.preventDefault();
            const typed = cleanSearchInput(search);
            if (typed) { onSymbolChange(typed); setSearch(''); }
          }}
          className="w-full max-w-xs"
        >
          <label htmlFor="charts-symbol" className="sr-only">Chart another company or ticker</label>
          <SymbolInput
            id="charts-symbol"
            value={search}
            onChange={setSearch}
            onSelect={s => { onSymbolChange(s); setSearch(''); }}
            placeholder="Chart another stock…"
            className="h-10 w-full rounded-full border border-edge bg-surface px-4 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none"
          />
        </form>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-y border-line py-2">
        <div role="group" aria-label="Bar size" className="flex flex-wrap gap-0.5">
          {CHART_INTERVALS.map(option => (
            <button
              key={option.id}
              type="button"
              onClick={() => updateView({ interval: option.id })}
              aria-pressed={interval.id === option.id}
              aria-label={`${option.name} bars`}
              className={cn('h-8 min-w-9 rounded px-2 text-[13px] font-medium', interval.id === option.id ? 'bg-chip text-accent' : 'text-muted hover:text-ink')}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div role="group" aria-label="Chart style" className="flex rounded-full border border-edge p-0.5 text-xs font-medium">
          {(['candles', 'line'] as const).map(s => (
            <button
              key={s}
              type="button"
              onClick={() => updateView({ style: s })}
              aria-pressed={view.style === s}
              className={cn('h-7 rounded-full px-3', view.style === s ? 'bg-chip text-ink' : 'text-muted hover:text-ink')}
            >
              {s === 'candles' ? 'Candles' : 'Line'}
            </button>
          ))}
        </div>
        <div role="group" aria-label="Indicators" className="flex flex-wrap items-center gap-1.5">
          {toggle(view.volume, 'Volume', () => updateView({ volume: !view.volume }))}
          {AVERAGE_CHOICES.map(n => toggle(view.averages.includes(n), `MA ${n}`, () =>
            updateView({ averages: view.averages.includes(n) ? view.averages.filter(a => a !== n) : [...view.averages, n].sort((a, b) => a - b) })))}
        </div>
        {bars && bars.length > 0 && (
          <span className="ml-auto text-xs text-muted">
            {bars.length.toLocaleString()} {interval.name} bars · drag to scroll back, scroll to zoom
          </span>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
        <section aria-label={`${symbol} chart`} className="h-[min(70vh,680px)] min-h-[380px]">
          {bars === null ? (
            <div className="flex h-full items-center justify-center text-sm text-muted">
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> Loading {interval.name} bars…
            </div>
          ) : notFound ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted">
              <p>No chart for “{symbol}”. Check the ticker, or search for the company above.</p>
            </div>
          ) : bars.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted">
              No {interval.name} bars came back. Try another bar size, or check your connection.
            </div>
          ) : (
            <PriceChart
              bars={bars}
              intraday={intraday}
              style={view.style}
              dataKey={`${symbol}|${interval.id}`}
              showVolume={view.volume}
              averages={view.averages}
              baseline={intraday && interval.id !== '1h' ? previousClose ?? undefined : undefined}
              formatPrice={formatCurrency}
              ariaLabel={`${symbol} ${interval.name} ${view.style === 'candles' ? 'candles' : 'line chart'}, ${bars.length} bars`}
            />
          )}
        </section>

        <aside aria-label="Symbols" className="flex min-w-0 flex-col gap-5">
          <section aria-labelledby="charts-mine">
            <h2 id="charts-mine" className="px-2 text-xs font-medium uppercase tracking-wide text-muted">Your stocks</h2>
            {panel.length === 0 ? (
              <p className="mt-2 px-2 text-sm text-muted">Holdings and watchlist stocks show up here.</p>
            ) : (
              <ul className="mt-1">{panel.map(s => row(s))}</ul>
            )}
          </section>
          <section aria-labelledby="charts-indexes">
            <h2 id="charts-indexes" className="px-2 text-xs font-medium uppercase tracking-wide text-muted">Market</h2>
            <ul className="mt-1">{INDEXES.map(i => row(i.symbol, i.name))}</ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
