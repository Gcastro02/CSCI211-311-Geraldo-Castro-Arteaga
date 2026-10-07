import { Fragment, useState, type FormEvent } from 'react';
import { Bell, BellRing, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { StockAnalysis, WatchlistItem } from '../../types';
import { cn } from '../../lib/utils';
import { Change } from '../ui/Change';

type AlertDirection = 'ABOVE' | 'BELOW';

interface WatchlistScreenProps {
  watchlist: WatchlistItem[];
  prices: Record<string, number>;
  previousCloses: Record<string, number>;
  analyses: Record<string, StockAnalysis>;
  /** True while saved watchlist symbols are being analyzed by the AI. */
  isAutoAnalyzing: boolean;
  aiEnabled: boolean;
  onAdd: (symbol: string) => void;
  onRemove: (symbol: string) => void;
  onSaveAlert: (symbol: string, price: number, direction: AlertDirection) => void;
  onRemoveAlert: (symbol: string) => void;
  onCheckAlerts: () => void;
  isCheckingAlerts: boolean;
  onOpenStock: (symbol: string) => void;
  formatCurrency: (amount: number) => string;
  formatDate: (date?: string) => string;
}

const fieldClass =
  'h-11 rounded-lg border border-edge bg-surface px-3 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none';

/** Symbols you're following, with price alerts. Details live on each stock page. */
export function WatchlistScreen({
  watchlist,
  prices,
  previousCloses,
  analyses,
  isAutoAnalyzing,
  aiEnabled,
  onAdd,
  onRemove,
  onSaveAlert,
  onRemoveAlert,
  onCheckAlerts,
  isCheckingAlerts,
  onOpenStock,
  formatCurrency,
  formatDate,
}: WatchlistScreenProps) {
  const [newSymbol, setNewSymbol] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [alertPrice, setAlertPrice] = useState('');
  const [alertDirection, setAlertDirection] = useState<AlertDirection>('ABOVE');
  const [alertError, setAlertError] = useState<string | null>(null);

  const columnCount = aiEnabled ? 6 : 5;
  const hasAlerts = watchlist.some(item => item.targetPrice);

  const handleAdd = (event: FormEvent) => {
    event.preventDefault();
    const symbol = newSymbol.trim().toUpperCase();
    if (!symbol) return;
    onAdd(symbol);
    setNewSymbol('');
  };

  const startEditing = (item: WatchlistItem) => {
    setEditing(item.symbol);
    setAlertPrice(item.targetPrice?.toString() ?? '');
    setAlertDirection(item.alertDirection ?? 'ABOVE');
    setAlertError(null);
  };

  const handleSaveAlert = (event: FormEvent, symbol: string) => {
    event.preventDefault();
    const price = parseFloat(alertPrice);
    if (!Number.isFinite(price) || price <= 0) return setAlertError('Enter a target price above zero.');
    onSaveAlert(symbol, price, alertDirection);
    setEditing(null);
  };

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Watchlist</h1>
          <p className="mt-1 text-sm text-muted">
            Stocks you’re following. Click a symbol for its chart, stats and news.
          </p>
        </div>
        <button
          type="button"
          onClick={onCheckAlerts}
          disabled={isCheckingAlerts || !hasAlerts}
          className="flex h-11 items-center gap-2 rounded-full border border-edge px-[18px] text-sm font-medium text-accent hover:bg-surface disabled:opacity-50"
        >
          <BellRing className={cn('h-4 w-4', isCheckingAlerts && 'animate-pulse')} aria-hidden="true" />
          Check alerts now
        </button>
      </div>

      <form onSubmit={handleAdd} className="flex max-w-xl gap-2">
        <label htmlFor="watch-symbol" className="sr-only">Symbol to watch</label>
        <input
          id="watch-symbol"
          value={newSymbol}
          onChange={e => setNewSymbol(e.target.value)}
          placeholder="Add a symbol, e.g. MSFT"
          autoComplete="off"
          className={cn(fieldClass, 'min-w-0 flex-1 uppercase placeholder:normal-case')}
        />
        <button type="submit" className="flex h-11 items-center gap-2 rounded-full bg-accent px-5 text-sm font-medium text-on-accent hover:bg-accent-strong">
          <Plus className="h-4 w-4" aria-hidden="true" /> Watch
        </button>
      </form>

      <section aria-label="Watched symbols">
        {watchlist.length === 0 ? (
          <p className="text-sm text-muted">Your watchlist is empty. Add a symbol above, or use Add to watchlist on any stock page.</p>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="text-right text-xs text-muted">
                  <th scope="col" className="border-b border-line py-2 text-left font-medium">Symbol</th>
                  <th scope="col" className="border-b border-line py-2 font-medium">Price</th>
                  <th scope="col" className="border-b border-line py-2 font-medium">Today</th>
                  <th scope="col" className="border-b border-line py-2 pl-8 text-left font-medium">Price alert</th>
                  {aiEnabled && <th scope="col" className="border-b border-line py-2 text-left font-medium">AI view</th>}
                  <th scope="col" className="border-b border-line py-2"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {watchlist.map(item => {
                  const price = prices[item.symbol];
                  const previous = previousCloses[item.symbol];
                  const analysis = analyses[item.symbol];
                  const isEditing = editing === item.symbol;
                  return (
                    <Fragment key={item.symbol}>
                      <tr className="text-right">
                        <td className="border-b border-line-soft py-3 text-left">
                          <button type="button" onClick={() => onOpenStock(item.symbol)} className="rounded bg-chip px-1.5 py-0.5 font-mono text-xs font-medium hover:text-accent">
                            {item.symbol}
                          </button>
                          <span className="ml-3 text-xs text-muted">added {formatDate(item.addedAt)}</span>
                        </td>
                        <td className="border-b border-line-soft py-3 font-medium">{price ? formatCurrency(price) : '—'}</td>
                        <td className="border-b border-line-soft py-3">
                          {price && previous ? <Change percent={(price / previous - 1) * 100} /> : <span className="text-muted">—</span>}
                        </td>
                        <td className="border-b border-line-soft py-3 pl-8 text-left">
                          {item.targetPrice ? (
                            <button type="button" onClick={() => startEditing(item)} className="flex items-center gap-1.5 text-ink hover:text-accent">
                              <BellRing className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                              {item.alertDirection === 'BELOW' ? 'Below' : 'Above'} {formatCurrency(item.targetPrice)}
                            </button>
                          ) : (
                            <button type="button" onClick={() => startEditing(item)} className="flex items-center gap-1.5 text-muted hover:text-accent">
                              <Bell className="h-3.5 w-3.5" aria-hidden="true" /> Set alert
                            </button>
                          )}
                        </td>
                        {aiEnabled && (
                          <td className="border-b border-line-soft py-3 text-left">
                            {analysis ? (
                              <button type="button" onClick={() => onOpenStock(item.symbol)} title={analysis.reasoning} className="text-ink-2 hover:text-accent">
                                {analysis.recommendation.toLowerCase()} · risk {analysis.riskLevel.toLowerCase()}
                              </button>
                            ) : isAutoAnalyzing ? (
                              <span className="flex items-center gap-1.5 text-muted">
                                <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Analyzing
                              </span>
                            ) : (
                              <span className="text-muted">—</span>
                            )}
                          </td>
                        )}
                        <td className="border-b border-line-soft py-3">
                          <button
                            type="button"
                            onClick={() => onRemove(item.symbol)}
                            aria-label={`Remove ${item.symbol} from watchlist`}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-down"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                      {isEditing && (
                        <tr>
                          <td colSpan={columnCount} className="border-b border-line-soft bg-surface px-4 py-4">
                            <form onSubmit={event => handleSaveAlert(event, item.symbol)} className="flex flex-wrap items-end gap-3">
                              <p className="w-full text-sm font-medium">Alert me when {item.symbol}…</p>
                              <div>
                                <label htmlFor={`alert-dir-${item.symbol}`} className="sr-only">Direction</label>
                                <select
                                  id={`alert-dir-${item.symbol}`}
                                  value={alertDirection}
                                  onChange={e => setAlertDirection(e.target.value as AlertDirection)}
                                  className={fieldClass}
                                >
                                  <option value="ABOVE">rises above</option>
                                  <option value="BELOW">drops below</option>
                                </select>
                              </div>
                              <div>
                                <label htmlFor={`alert-price-${item.symbol}`} className="sr-only">Target price</label>
                                <input
                                  id={`alert-price-${item.symbol}`}
                                  type="number"
                                  step="any"
                                  min="0"
                                  value={alertPrice}
                                  onChange={e => setAlertPrice(e.target.value)}
                                  placeholder="Target price"
                                  autoFocus
                                  className={cn(fieldClass, 'w-36')}
                                />
                              </div>
                              <button type="submit" className="h-11 rounded-full bg-accent px-5 text-sm font-medium text-on-accent hover:bg-accent-strong">Save alert</button>
                              {item.targetPrice && (
                                <button
                                  type="button"
                                  onClick={() => { onRemoveAlert(item.symbol); setEditing(null); }}
                                  className="h-11 rounded-full px-4 text-sm font-medium text-down hover:bg-canvas"
                                >
                                  Remove alert
                                </button>
                              )}
                              <button type="button" onClick={() => setEditing(null)} className="h-11 rounded-full px-4 text-sm text-ink-2 hover:bg-canvas">Cancel</button>
                              {alertError && <p role="alert" className="w-full text-sm font-medium text-down">{alertError}</p>}
                            </form>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs leading-relaxed text-muted">
          Prices refresh every 5 minutes while the app is open, and alerts are checked on each refresh. An alert fires
          once per crossing and re-arms when the price moves back.
        </p>
      </section>
    </div>
  );
}
