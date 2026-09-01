import { Calculator, Info } from 'lucide-react';
import { cn } from '../lib/utils';
import { RiskAudit, calculatePositionSize, DEFAULT_CASH_BUFFER_PCT } from '../lib/portfolioMath';

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
    <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
      <div className="flex items-center gap-2 mb-2">
        <Calculator className="w-5 h-5 text-blue-600" />
        <h3 className="font-bold text-lg">Position Sizer</h3>
      </div>
      <p className="text-sm text-slate-500 mb-6">
        How much you could add without breaching your {(audit.riskThreshold * 100).toFixed(0)}% position
        limit or spending your {(DEFAULT_CASH_BUFFER_PCT * 100).toFixed(0)}% cash buffer.
      </p>

      {symbols.length === 0 ? (
        <p className="text-sm text-slate-500 italic">Add a holding or watchlist symbol to use the sizer.</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="space-y-5">
            <div className="space-y-1">
              <label htmlFor="sizer-symbol" className="text-xs font-bold text-slate-400 uppercase">Symbol</label>
              <select
                id="sizer-symbol"
                value={activeSymbol}
                onChange={e => onSymbolChange(e.target.value)}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                {symbols.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between items-baseline">
                <label htmlFor="sizer-confidence" className="text-xs font-bold text-slate-400 uppercase">Conviction</label>
                <span className="text-sm font-bold text-blue-600">{(confidence * 100).toFixed(0)}%</span>
              </div>
              <input
                id="sizer-confidence"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={confidence}
                onChange={e => onConfidenceChange(parseFloat(e.target.value))}
                className="w-full accent-blue-600"
              />
              <p className="text-[10px] text-slate-400">
                Scales how much of your spendable cash to commit.
              </p>
            </div>

            <dl className="space-y-2 pt-2 border-t border-slate-100">
              {[
                ['Current price', price > 0 ? formatCurrency(price) : 'unavailable'],
                ['Cash held back', formatCurrency(result.cashBuffer)],
                ['Spendable cash', formatCurrency(result.spendableCash)],
                ['Room under limit', formatCurrency(result.riskHeadroom)],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between text-xs">
                  <dt className="text-slate-500">{label}</dt>
                  <dd className="font-medium text-slate-900 tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className={cn(
            'rounded-2xl p-6 flex flex-col justify-center border',
            canBuy ? 'bg-blue-50 border-blue-100' : 'bg-slate-50 border-slate-100',
          )}>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
              Suggested purchase
            </p>

            {canBuy ? (
              <>
                <p className="text-3xl font-bold text-slate-900 mb-1 tabular-nums">
                  {result.shares.toFixed(4)}
                  <span className="text-base font-medium text-slate-500 ml-2">shares</span>
                </p>
                <p className="text-lg font-medium text-blue-700 mb-4 tabular-nums">{formatCurrency(result.cost)}</p>
                <p className="text-xs text-slate-600">
                  Takes {activeSymbol} to {(result.resultingWeight * 100).toFixed(1)}% of the portfolio.
                </p>
              </>
            ) : (
              <p className="text-2xl font-bold text-slate-400 mb-4">No room to buy</p>
            )}

            <div className="flex items-start gap-2 mt-4 pt-4 border-t border-slate-200/70">
              <Info className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
              <p className="text-[10px] text-slate-500 leading-relaxed">
                {LIMIT_COPY[result.limitedBy]} This is arithmetic against your own rules, not investment advice.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
