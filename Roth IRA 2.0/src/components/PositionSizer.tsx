import { RiskAudit, calculatePositionSize, DEFAULT_CASH_BUFFER_PCT } from '../lib/portfolioMath';
import { cn } from '../lib/utils';

interface PositionSizerProps {
  audit: RiskAudit;
  /** Symbols offered in the dropdown (holdings + watchlist). */
  symbols: string[];
  prices: Record<string, number>;
  symbol: string;
  onSymbolChange: (symbol: string) => void;
  confidence: number;
  onConfidenceChange: (confidence: number) => void;
  formatCurrency: (amount: number) => string;
}

const LIMIT_COPY: Record<string, string> = {
  CONFIDENCE: 'Sized by your conviction level.',
  RISK_CAP: 'Capped by the position limit, not your cash.',
  CASH_BUFFER: 'Capped by available cash after the buffer.',
  NO_CASH: 'No spendable cash after the buffer.',
  AT_LIMIT: 'This position is already at or over the risk limit.',
  INVALID_PRICE: 'No live price available for this symbol.',
};

const fieldClass =
  'h-11 w-full rounded-lg border border-edge bg-surface px-3 text-sm text-ink focus:border-accent focus:outline-none';

/**
 * Interactive version of the bot's allocation block: given cash on hand, a
 * conviction level, and the portfolio's risk rules, how much can you actually
 * buy? Three constraints apply and the smallest one wins.
 */
export function PositionSizer({
  audit,
  symbols,
  prices,
  symbol,
  onSymbolChange,
  confidence,
  onConfidenceChange,
  formatCurrency,
}: PositionSizerProps) {
  const activeSymbol = symbol || symbols[0] || '';
  const price = prices[activeSymbol] ?? 0;
  const currentPosition = audit.positions.find(p => p.symbol === activeSymbol);

  const result = calculatePositionSize({
    price,
    cashBalance: audit.cashValue,
    totalPortfolioValue: audit.totalValue,
    currentPositionValue: currentPosition?.value ?? 0,
    confidence,
    riskThreshold: audit.riskThreshold,
  });

  const canBuy = result.shares > 0;

  return (
    <section aria-labelledby="sizer-heading">
      <h2 id="sizer-heading" className="text-lg font-semibold">Position sizer</h2>
      <p className="mt-1 text-sm text-ink-2">
        How much you could add without going over your {(audit.riskThreshold * 100).toFixed(0)}% position limit
        or spending the {(DEFAULT_CASH_BUFFER_PCT * 100).toFixed(0)}% of cash held back as a buffer.
      </p>

      {symbols.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Add a holding or watchlist symbol to use the sizer.</p>
      ) : (
        <div className="mt-4 grid gap-6 md:grid-cols-2">
          <div className="space-y-4">
            <div>
              <label htmlFor="sizer-symbol" className="text-sm text-ink-2">Stock to size</label>
              <select
                id="sizer-symbol"
                value={activeSymbol}
                onChange={e => onSymbolChange(e.target.value)}
                className={cn(fieldClass, 'mt-1')}
              >
                {symbols.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div>
              <div className="flex items-baseline justify-between">
                <label htmlFor="sizer-confidence" className="text-sm text-ink-2">Conviction</label>
                <span className="text-sm font-medium text-accent">{(confidence * 100).toFixed(0)}%</span>
              </div>
              <input
                id="sizer-confidence"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={confidence}
                onChange={e => onConfidenceChange(parseFloat(e.target.value))}
                className="mt-2 w-full accent-[var(--accent)]"
              />
              <p className="text-xs text-muted">How much of your spendable cash to commit.</p>
            </div>

            <dl className="text-sm">
              {[
                ['Current price', price > 0 ? formatCurrency(price) : 'unavailable'],
                ['Cash held back', formatCurrency(result.cashBuffer)],
                ['Spendable cash', formatCurrency(result.spendableCash)],
                ['Room under limit', formatCurrency(result.riskHeadroom)],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between border-t border-line-soft py-2">
                  <dt className="text-ink-2">{label}</dt>
                  <dd className="font-medium">{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="flex flex-col justify-center rounded-lg bg-surface p-5">
            <p className="text-sm text-muted">You could buy</p>
            {canBuy ? (
              <>
                <p className="mt-1 text-3xl font-medium tracking-tight">
                  {result.shares.toFixed(4)} <span className="text-base text-muted">shares</span>
                </p>
                <p className="text-lg font-medium text-accent">{formatCurrency(result.cost)}</p>
                <p className="mt-2 text-sm text-ink-2">
                  That would make {activeSymbol} {(result.resultingWeight * 100).toFixed(1)}% of the portfolio.
                </p>
              </>
            ) : (
              <p className="mt-1 text-2xl font-medium text-muted">Nothing right now</p>
            )}
            <p className="mt-4 border-t border-line pt-3 text-xs leading-relaxed text-muted">
              {LIMIT_COPY[result.limitedBy]} This is arithmetic against your own rules, not investment advice.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
