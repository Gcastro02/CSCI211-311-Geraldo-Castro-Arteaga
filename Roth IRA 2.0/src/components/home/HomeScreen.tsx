import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { BellRing, Info, RefreshCw } from 'lucide-react';
import { NewsItem, PriceData, StockHolding, WatchlistItem } from '../../types';
import { RiskAudit } from '../../lib/portfolioMath';
import { buildHoldingsValueHistory } from '../../lib/portfolioHistory';
import { getStockPriceHistory } from '../../services/openaiService';
import { cn, parseDay } from '../../lib/utils';
import { Change } from '../ui/Change';
import { LineChart } from '../ui/LineChart';
import type { Tab } from '../layout/AppHeader';

export interface IndexQuote {
  key: string;
  symbol: string;
  snapshot?: { value: number; change: number; changePercent: number };
}

const CHART_RANGES = [
  { id: '1M', label: '1M', caption: 'past month' },
  { id: '6M', label: '6M', caption: 'past 6 months' },
  { id: '1Y', label: '1Y', caption: 'past year' },
  { id: '5Y', label: '5Y', caption: 'past 5 years' },
] as const;
type ChartRange = (typeof CHART_RANGES)[number]['id'];


interface HomeScreenProps {
  holdings: StockHolding[];
  audit: RiskAudit;
  unrealized: { gain: number; percent: number } | null;
  prices: Record<string, number>;
  previousCloses: Record<string, number>;
  watchlist: WatchlistItem[];
  indices: IndexQuote[];
  news: NewsItem[];
  loadingNews: boolean;
  isUpdatingPrices: boolean;
  onRefreshNews: () => void;
  onRefreshPrices: () => void;
  onOpenStock: (symbol: string) => void;
  onNavigate: (tab: Tab) => void;
  onSetCash: (amount: number) => void;
  formatCurrency: (amount: number) => string;
  formatDate: (date?: string) => string;
}

export function HomeScreen({
  holdings,
  audit,
  unrealized,
  prices,
  previousCloses,
  watchlist,
  indices,
  news,
  loadingNews,
  isUpdatingPrices,
  onRefreshNews,
  onRefreshPrices,
  onOpenStock,
  onNavigate,
  onSetCash,
  formatCurrency,
  formatDate,
}: HomeScreenProps) {
  const [range, setRange] = useState<ChartRange>('6M');
  const [histories, setHistories] = useState<Partial<Record<ChartRange, Record<string, PriceData[]>>>>({});
  const [loadingChart, setLoadingChart] = useState(false);
  const [editingCash, setEditingCash] = useState(false);
  const [cashDraft, setCashDraft] = useState('');

  const symbols = audit.positions.map(p => p.symbol);
  const symbolKey = symbols.join('|');

  // Fetch each held symbol's history for the selected range once, then reuse it.
  useEffect(() => {
    const cached = histories[range] ?? {};
    const missing = symbols.filter(symbol => !cached[symbol]);
    if (missing.length === 0) {
      setLoadingChart(false);
      return;
    }

    let cancelled = false;
    setLoadingChart(true);
    Promise.all(
      missing.map(async symbol => {
        try {
          return [symbol, await getStockPriceHistory(symbol, range)] as const;
        } catch {
          // Stored as empty so a failing symbol is not re-requested every render.
          return [symbol, [] as PriceData[]] as const;
        }
      }),
    ).then(entries => {
      if (cancelled) return;
      setHistories(prev => ({ ...prev, [range]: { ...prev[range], ...Object.fromEntries(entries) } }));
      setLoadingChart(false);
    });

    return () => {
      cancelled = true;
    };
  }, [range, symbolKey]);

  const points = useMemo(() => {
    const fallback = Object.fromEntries(audit.positions.map(p => [p.symbol, p.price]));
    return buildHoldingsValueHistory(holdings, histories[range] ?? {}, audit.cashValue, fallback);
  }, [holdings, histories, range, audit]);

  const dayChange = (symbol: string) => {
    const price = prices[symbol];
    const previous = previousCloses[symbol];
    if (!(price > 0) || !(previous > 0)) return null;
    return { amount: price - previous, percent: (price / previous - 1) * 100 };
  };

  const portfolioToday = useMemo(() => {
    let amount = 0;
    let base = 0;
    audit.positions.forEach(position => {
      const previous = previousCloses[position.symbol];
      if (position.estimated || !(previous > 0)) return;
      amount += position.shares * (position.price - previous);
      base += position.shares * previous;
    });
    return base > 0 ? { amount, percent: (amount / base) * 100 } : null;
  }, [audit.positions, previousCloses]);

  const rangeInfo = CHART_RANGES.find(r => r.id === range)!;
  const startValue = points[0]?.value;
  const rangeChange = startValue && startValue > 0 && !loadingChart
    ? { amount: audit.totalValue - startValue, percent: (audit.totalValue / startValue - 1) * 100 }
    : null;

  const chartDate = (value: string) =>
    parseDay(value).toLocaleDateString('en-US', range === '1Y' || range === '5Y'
      ? { month: 'short', year: 'numeric' }
      : { month: 'short', day: 'numeric' });

  const handleCashSubmit = (event: FormEvent) => {
    event.preventDefault();
    const amount = parseFloat(cashDraft);
    if (!Number.isFinite(amount) || amount < 0) return;
    onSetCash(amount);
    setEditingCash(false);
  };

  const positions = [...audit.positions].sort((a, b) => b.value - a.value);
  const limitPct = Math.round(audit.riskThreshold * 100);
  const hasHoldings = positions.length > 0;

  return (
    <div className="flex flex-col gap-8">
      {/* Market strip */}
      <section aria-label="Markets" className="-mt-2 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] border-b border-line">
        {indices.map(index => (
          <div key={index.key} className="flex flex-col gap-0.5 py-3 pr-4">
            <span className="text-[13px] text-muted">
              {index.key} <span className="font-mono text-xs">· {index.symbol}</span>
            </span>
            {index.snapshot ? (
              <span className="flex items-baseline gap-2.5">
                <span className="text-[15px] font-medium">{formatCurrency(index.snapshot.value)}</span>
                <Change percent={index.snapshot.changePercent} amount={index.snapshot.change} className="text-[13px]" />
              </span>
            ) : (
              <span className="text-[15px] text-muted">—</span>
            )}
          </div>
        ))}
      </section>

      <div className="flex flex-wrap gap-10">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-8">
          {/* Portfolio value and chart */}
          <section aria-labelledby="portfolio-heading">
            <div className="flex items-start justify-between gap-4">
              <h1 id="portfolio-heading" className="text-sm font-medium text-muted">Your portfolio</h1>
              <button
                type="button"
                onClick={onRefreshPrices}
                disabled={isUpdatingPrices || !hasHoldings}
                className="-mr-2 -mt-2 flex h-11 items-center gap-2 rounded-full px-3 text-sm text-ink-2 transition-colors hover:bg-surface hover:text-ink disabled:opacity-50"
              >
                <RefreshCw className={cn('h-4 w-4', isUpdatingPrices && 'animate-spin')} aria-hidden="true" />
                Refresh prices
              </button>
            </div>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="text-[40px] font-medium leading-tight tracking-tight">{formatCurrency(audit.totalValue)}</span>
              {rangeChange && (
                <>
                  <Change amount={rangeChange.amount} percent={rangeChange.percent} formatCurrency={formatCurrency} className="text-base" />
                  <span className="text-sm text-muted">{rangeInfo.caption}</span>
                </>
              )}
            </div>
            <p className="mt-1 text-sm text-muted">
              {portfolioToday && (
                <>Today <Change amount={portfolioToday.amount} percent={portfolioToday.percent} formatCurrency={formatCurrency} /> · </>
              )}
              {unrealized && (
                <>Unrealized <Change amount={unrealized.gain} percent={unrealized.percent} formatCurrency={formatCurrency} /> · </>
              )}
              Tracking only — trades happen at your broker
            </p>

            {hasHoldings ? (
              <>
                <div role="group" aria-label="Chart range" className="mt-5 flex gap-1 border-b border-line">
                  {CHART_RANGES.map(option => (
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
                      {option.label}
                    </button>
                  ))}
                </div>
                <div className="mt-6">
                  {loadingChart ? (
                    <div className="flex h-[260px] items-center justify-center text-sm text-muted">
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> Loading price history…
                    </div>
                  ) : (
                    <LineChart
                      points={points}
                      ariaLabel={`Value of your current holdings over the ${rangeInfo.caption}`}
                      formatValue={formatCurrency}
                      formatDate={chartDate}
                    />
                  )}
                </div>
                <p className="mt-3 text-xs text-muted">
                  Shows what your current holdings were worth at past prices. Past trades and cash changes aren’t replayed.
                </p>
              </>
            ) : (
              <div className="mt-6 rounded-lg border border-line p-6">
                <h2 className="text-base font-semibold">Start by adding what you own</h2>
                <p className="mt-1 text-sm text-ink-2">
                  Enter the stocks and ETFs in your brokerage account to track their value here. Nothing is bought or sold.
                </p>
                <button
                  type="button"
                  onClick={() => onNavigate('holdings')}
                  className="mt-4 h-11 rounded-full bg-accent px-5 text-sm font-medium text-on-accent hover:bg-accent-strong"
                >
                  Add holdings
                </button>
              </div>
            )}
          </section>

          {/* Holdings table */}
          {hasHoldings && (
            <section aria-labelledby="holdings-heading">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="holdings-heading" className="text-lg font-semibold">Holdings</h2>
                <button
                  type="button"
                  onClick={() => onNavigate('holdings')}
                  className="h-11 rounded-full border border-edge px-[18px] text-sm font-medium text-accent hover:bg-surface"
                >
                  Manage holdings
                </button>
              </div>
              <div className="relative mt-3 overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse text-sm">
                  <thead>
                    <tr className="text-right text-xs text-muted">
                      <th scope="col" className="border-b border-line py-2 text-left font-medium">Symbol</th>
                      <th scope="col" className="border-b border-line py-2 font-medium">Price</th>
                      <th scope="col" className="border-b border-line py-2 font-medium">Today</th>
                      <th scope="col" className="border-b border-line py-2 font-medium">Shares</th>
                      <th scope="col" className="border-b border-line py-2 font-medium">Value</th>
                      <th scope="col" className="border-b border-line py-2 pl-4 text-left font-medium">Weight</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map(position => {
                      const today = dayChange(position.symbol);
                      const weightPct = position.weight * 100;
                      return (
                        <tr key={position.symbol} className="text-right">
                          <td className="border-b border-line-soft py-3 text-left">
                            <button
                              type="button"
                              onClick={() => onOpenStock(position.symbol)}
                              className="rounded bg-chip px-1.5 py-0.5 font-mono text-xs font-medium text-ink hover:text-accent"
                            >
                              {position.symbol}
                            </button>
                          </td>
                          <td className="border-b border-line-soft py-3">
                            {formatCurrency(position.price)}
                            {position.estimated && (
                              <span className="ml-1 text-xs text-muted" title="No live quote — valued at your average cost">est.</span>
                            )}
                          </td>
                          <td className="border-b border-line-soft py-3">
                            {today ? <Change percent={today.percent} /> : <span className="text-muted">—</span>}
                          </td>
                          <td className="border-b border-line-soft py-3 text-ink-2">
                            {Number.isInteger(position.shares) ? position.shares : position.shares.toFixed(4)}
                          </td>
                          <td className="border-b border-line-soft py-3 font-medium">{formatCurrency(position.value)}</td>
                          <td className="border-b border-line-soft py-3 pl-4 text-left">
                            <div className="flex items-center gap-2.5">
                              <div className="h-1.5 w-20 rounded-full bg-line-soft">
                                <div
                                  className={cn('h-1.5 rounded-full', position.overLimit ? 'bg-warn' : 'bg-accent')}
                                  style={{ width: `${Math.min(weightPct * 2, 100)}%` }}
                                />
                              </div>
                              <span className={cn(position.overLimit && 'font-semibold text-warn-ink')}>
                                {weightPct.toFixed(1)}%{position.overLimit && ` · over ${limitPct}%`}
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="text-right text-muted">
                      <td className="py-3 text-left">Cash</td>
                      <td colSpan={3} className="py-3">
                        {!editingCash && (
                          <button
                            type="button"
                            onClick={() => {
                              setCashDraft(audit.cashValue.toString());
                              setEditingCash(true);
                            }}
                            className="text-sm text-accent hover:underline"
                          >
                            Edit
                          </button>
                        )}
                      </td>
                      <td className="py-3 font-medium text-ink">
                        {editingCash ? (
                          <form onSubmit={handleCashSubmit} className="flex items-center justify-end gap-2">
                            <label htmlFor="cash-input" className="sr-only">Cash balance</label>
                            <input
                              id="cash-input"
                              type="number"
                              min="0"
                              step="0.01"
                              value={cashDraft}
                              onChange={event => setCashDraft(event.target.value)}
                              autoFocus
                              className="h-9 w-28 rounded border border-edge bg-surface px-2 text-right text-sm text-ink focus:border-accent focus:outline-none"
                            />
                            <button type="submit" className="text-sm font-medium text-accent">Save</button>
                            <button type="button" onClick={() => setEditingCash(false)} className="text-sm text-muted">Cancel</button>
                          </form>
                        ) : (
                          formatCurrency(audit.cashValue)
                        )}
                      </td>
                      <td className="py-3 pl-4 text-left">{(audit.cashWeight * 100).toFixed(1)}%</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {audit.overLimit.length > 0 && (
                <aside aria-label="Concentration note" className="mt-4 flex items-start gap-3.5 rounded-lg bg-surface px-[18px] py-4">
                  <Info className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
                  <p className="text-sm leading-relaxed">
                    <strong className="font-semibold">
                      {audit.overLimit
                        .map(p => `${p.symbol} is ${(p.weight * 100).toFixed(1)}%`)
                        .join(', ')}{' '}
                      of your portfolio.
                    </strong>{' '}
                    <span className="text-ink-2">
                      Weight is how much of your money sits in one holding. Above {limitPct}%, one company’s bad
                      news can move your whole account. This describes your mix; it isn’t advice to sell.
                    </span>{' '}
                    <button type="button" onClick={() => onNavigate('holdings')} className="text-accent hover:underline">
                      See the risk breakdown
                    </button>
                  </p>
                </aside>
              )}
            </section>
          )}
        </div>

        <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-8">
          {/* Watchlist */}
          <section aria-labelledby="watchlist-heading">
            <div className="flex items-baseline justify-between">
              <h2 id="watchlist-heading" className="text-lg font-semibold">Watchlist</h2>
              <button type="button" onClick={() => onNavigate('watchlist')} className="text-sm text-accent hover:underline">
                Manage
              </button>
            </div>
            {watchlist.length === 0 ? (
              <p className="mt-3 text-sm text-muted">Nothing on your watchlist yet. Search a ticker above to look one up.</p>
            ) : (
              <ul className="mt-3">
                {watchlist.map(item => {
                  const today = dayChange(item.symbol);
                  return (
                    <li key={item.symbol} className="border-b border-line-soft">
                      <button
                        type="button"
                        onClick={() => onOpenStock(item.symbol)}
                        className="flex min-h-11 w-full items-center justify-between gap-3 py-3 text-left hover:bg-surface"
                      >
                        <span className="flex items-center gap-2 font-mono text-[13px] font-medium">
                          {item.symbol}
                          {item.targetPrice && (
                            <BellRing
                              className="h-3.5 w-3.5 text-muted"
                              aria-label={`Alert when ${item.alertDirection === 'BELOW' ? 'below' : 'above'} ${formatCurrency(item.targetPrice)}`}
                            />
                          )}
                        </span>
                        <span className="flex flex-col items-end gap-0.5">
                          <span className="text-sm font-medium">{prices[item.symbol] ? formatCurrency(prices[item.symbol]) : '—'}</span>
                          {today && <Change percent={today.percent} className="text-xs" />}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Market news */}
          <section aria-labelledby="news-heading">
            <div className="flex items-baseline justify-between">
              <h2 id="news-heading" className="text-lg font-semibold">Market news</h2>
              <button
                type="button"
                onClick={onRefreshNews}
                disabled={loadingNews}
                aria-label="Refresh news"
                className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-ink disabled:opacity-50"
              >
                <RefreshCw className={cn('h-4 w-4', loadingNews && 'animate-spin')} />
              </button>
            </div>
            {loadingNews && news.length === 0 ? (
              <p className="mt-2 text-sm text-muted">Loading headlines…</p>
            ) : news.length === 0 ? (
              <p className="mt-2 text-sm text-muted">No recent news available.</p>
            ) : (
              <ul className="mt-1">
                {news.slice(0, 6).map((item, i) => (
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
        </aside>
      </div>
    </div>
  );
}
