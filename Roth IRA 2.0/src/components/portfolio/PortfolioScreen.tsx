import { useState, type FormEvent } from 'react';
import { Plus, RefreshCw, Sparkles, Trash2 } from 'lucide-react';
import { StockAnalysis, StockHolding } from '../../types';
import { RiskAudit } from '../../lib/portfolioMath';
import { cn } from '../../lib/utils';
import { Change } from '../ui/Change';
import { RiskAuditCard } from '../RiskAuditCard';
import { PositionSizer } from '../PositionSizer';
import type { Tab } from '../layout/AppHeader';

interface PortfolioScreenProps {
  holdings: StockHolding[];
  audit: RiskAudit;
  unrealized: { gain: number; percent: number } | null;
  prices: Record<string, number>;
  analyses: Record<string, StockAnalysis>;
  isUpdatingPrices: boolean;
  onRefreshPrices: () => void;
  /** Undefined when AI features are not configured. */
  onAnalyze?: () => void;
  isAnalyzing: boolean;
  onAddHolding: (holding: StockHolding) => void;
  onRemoveHolding: (index: number) => void;
  onOpenStock: (symbol: string) => void;
  onNavigate: (tab: Tab) => void;
  sizer: {
    symbols: string[];
    symbol: string;
    onSymbolChange: (symbol: string) => void;
    confidence: number;
    onConfidenceChange: (confidence: number) => void;
  };
  formatCurrency: (amount: number) => string;
}

const fieldClass =
  'mt-1 h-11 w-full rounded-lg border border-edge bg-surface px-3 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none';

/** Holdings you entered by hand, plus risk and sizing tools over them. */
export function PortfolioScreen({
  holdings,
  audit,
  unrealized,
  prices,
  analyses,
  isUpdatingPrices,
  onRefreshPrices,
  onAnalyze,
  isAnalyzing,
  onAddHolding,
  onRemoveHolding,
  onOpenStock,
  onNavigate,
  sizer,
  formatCurrency,
}: PortfolioScreenProps) {
  const [symbol, setSymbol] = useState('');
  const [shares, setShares] = useState('');
  const [averagePrice, setAveragePrice] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const cleanSymbol = symbol.trim().toUpperCase();
    const shareCount = parseFloat(shares);
    const cost = parseFloat(averagePrice);
    if (!cleanSymbol) return setError('Enter a symbol.');
    if (!Number.isFinite(shareCount) || shareCount <= 0) return setError('Enter a share count above zero.');
    if (averagePrice.trim() && (!Number.isFinite(cost) || cost < 0)) return setError('Enter a valid average cost, or leave it blank.');
    onAddHolding({ symbol: cleanSymbol, shares: shareCount, averagePrice: Number.isFinite(cost) ? cost : 0 });
    setSymbol('');
    setShares('');
    setAveragePrice('');
    setError(null);
  };

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Portfolio</h1>
          <p className="mt-1 text-sm text-muted">
            {formatCurrency(audit.totalValue)} total
            {unrealized && (
              <> · <Change amount={unrealized.gain} percent={unrealized.percent} formatCurrency={formatCurrency} /> unrealized</>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onRefreshPrices}
            disabled={isUpdatingPrices || holdings.length === 0}
            className="flex h-11 items-center gap-2 rounded-full px-3 text-sm text-ink-2 hover:bg-surface hover:text-ink disabled:opacity-50"
          >
            <RefreshCw className={cn('h-4 w-4', isUpdatingPrices && 'animate-spin')} aria-hidden="true" />
            Refresh prices
          </button>
          {onAnalyze && (
            <button
              type="button"
              onClick={onAnalyze}
              disabled={isAnalyzing || holdings.length === 0}
              className="flex h-11 items-center gap-2 rounded-full border border-edge px-[18px] text-sm font-medium text-accent hover:bg-surface disabled:opacity-50"
            >
              {isAnalyzing
                ? <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
                : <Sparkles className="h-4 w-4" aria-hidden="true" />}
              {isAnalyzing ? 'Analyzing…' : 'AI review of holdings'}
            </button>
          )}
        </div>
      </div>

      {/* Add a holding */}
      <section aria-labelledby="add-holding-heading">
        <h2 id="add-holding-heading" className="text-lg font-semibold">Add a holding</h2>
        <p className="mt-1 text-sm text-ink-2">
          Enter something you own at your broker. To log a dated trade that also moves cash, use{' '}
          <button type="button" onClick={() => onNavigate('activity')} className="text-accent hover:underline">Activity</button>.
        </p>
        <form onSubmit={handleSubmit} className="mt-3 grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto]">
          <div>
            <label htmlFor="holding-symbol" className="text-sm text-ink-2">Symbol</label>
            <input id="holding-symbol" value={symbol} onChange={e => setSymbol(e.target.value)} placeholder="e.g. VOO" autoComplete="off" className={cn(fieldClass, 'uppercase placeholder:normal-case')} />
          </div>
          <div>
            <label htmlFor="holding-shares" className="text-sm text-ink-2">Shares</label>
            <input id="holding-shares" type="number" step="any" min="0" value={shares} onChange={e => setShares(e.target.value)} placeholder="0" className={fieldClass} />
          </div>
          <div>
            <label htmlFor="holding-cost" className="text-sm text-ink-2">Average cost per share</label>
            <input id="holding-cost" type="number" step="any" min="0" value={averagePrice} onChange={e => setAveragePrice(e.target.value)} placeholder="optional" className={fieldClass} />
          </div>
          <button type="submit" className="flex h-11 items-center justify-center gap-2 rounded-full bg-accent px-5 text-sm font-medium text-on-accent hover:bg-accent-strong">
            <Plus className="h-4 w-4" aria-hidden="true" /> Add
          </button>
        </form>
        {error && <p role="alert" className="mt-2 text-sm font-medium text-down">{error}</p>}
      </section>

      {/* Holdings */}
      <section aria-labelledby="holdings-list-heading">
        <h2 id="holdings-list-heading" className="text-lg font-semibold">Holdings</h2>
        {holdings.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Nothing here yet. Add your first holding above.</p>
        ) : (
          <div className="relative mt-3 overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead>
                <tr className="text-right text-xs text-muted">
                  <th scope="col" className="border-b border-line py-2 text-left font-medium">Symbol</th>
                  <th scope="col" className="border-b border-line py-2 font-medium">Shares</th>
                  <th scope="col" className="border-b border-line py-2 font-medium">Avg. cost</th>
                  <th scope="col" className="border-b border-line py-2 font-medium">Price</th>
                  <th scope="col" className="border-b border-line py-2 font-medium">Value</th>
                  <th scope="col" className="border-b border-line py-2 font-medium">Gain</th>
                  {onAnalyze && <th scope="col" className="border-b border-line py-2 pl-6 text-left font-medium">AI view</th>}
                  <th scope="col" className="border-b border-line py-2"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {holdings.map((holding, index) => {
                  const live = prices[holding.symbol];
                  const price = live || holding.averagePrice;
                  const value = holding.shares * price;
                  const cost = holding.shares * holding.averagePrice;
                  const analysis = analyses[holding.symbol];
                  return (
                    <tr key={`${holding.symbol}-${index}`} className="text-right">
                      <td className="border-b border-line-soft py-3 text-left">
                        <button type="button" onClick={() => onOpenStock(holding.symbol)} className="rounded bg-chip px-1.5 py-0.5 font-mono text-xs font-medium hover:text-accent">
                          {holding.symbol}
                        </button>
                      </td>
                      <td className="border-b border-line-soft py-3 text-ink-2">
                        {Number.isInteger(holding.shares) ? holding.shares : holding.shares.toFixed(4)}
                      </td>
                      <td className="border-b border-line-soft py-3 text-ink-2">
                        {holding.averagePrice > 0 ? formatCurrency(holding.averagePrice) : <span className="text-muted">—</span>}
                      </td>
                      <td className="border-b border-line-soft py-3">
                        {live ? formatCurrency(live) : <span className="text-muted" title="No live quote yet">—</span>}
                      </td>
                      <td className="border-b border-line-soft py-3 font-medium">{price > 0 ? formatCurrency(value) : '—'}</td>
                      <td className="border-b border-line-soft py-3">
                        {live && cost > 0
                          ? <Change amount={value - cost} percent={(value / cost - 1) * 100} formatCurrency={formatCurrency} />
                          : <span className="text-muted">—</span>}
                      </td>
                      {onAnalyze && (
                        <td className="max-w-[220px] border-b border-line-soft py-3 pl-6 text-left">
                          {analysis ? (
                            <button
                              type="button"
                              onClick={() => onOpenStock(holding.symbol)}
                              title={analysis.reasoning}
                              className="text-ink-2 hover:text-accent"
                            >
                              {analysis.recommendation.toLowerCase()} · risk {analysis.riskLevel.toLowerCase()}
                            </button>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                      )}
                      <td className="border-b border-line-soft py-3">
                        <button
                          type="button"
                          onClick={() => onRemoveHolding(index)}
                          aria-label={`Remove ${holding.symbol}`}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-down"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                <tr className="text-right text-muted">
                  <td className="py-3 text-left">Cash</td>
                  <td colSpan={3} className="py-3 text-xs">Edit on Home</td>
                  <td className="py-3 font-medium text-ink">{formatCurrency(audit.cashValue)}</td>
                  <td colSpan={onAnalyze ? 3 : 2} />
                </tr>
              </tbody>
            </table>
          </div>
        )}
        {onAnalyze && (
          <p className="mt-2 text-xs text-muted">AI view is written by a language model — an opinion to research, not advice.</p>
        )}
      </section>

      <div className="grid gap-10 lg:grid-cols-2">
        <RiskAuditCard audit={audit} formatCurrency={formatCurrency} onOpenStock={onOpenStock} />
        <PositionSizer
          audit={audit}
          symbols={sizer.symbols}
          prices={prices}
          symbol={sizer.symbol}
          onSymbolChange={sizer.onSymbolChange}
          confidence={sizer.confidence}
          onConfidenceChange={sizer.onConfidenceChange}
          formatCurrency={formatCurrency}
        />
      </div>
    </div>
  );
}
