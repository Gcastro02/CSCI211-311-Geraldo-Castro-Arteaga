import { Trash2, AlertTriangle, History, Info } from 'lucide-react';
import { cn } from '../lib/utils';
import { Transaction } from '../types';
import { ReplayResult, ReconciliationRow, cashDirection, sortTransactions, transactionLabel } from '../lib/transactions';

interface TransactionHistoryProps {
  transactions: Transaction[];
  replay: ReplayResult;
  reconciliation: ReconciliationRow[];
  onDelete: (id: string) => void;
  formatCurrency: (amount: number) => string;
  formatDate: (date?: string) => string;
}

const TYPE_STYLES: Record<Transaction['type'], string> = {
  CONTRIBUTION: 'bg-blue-100 text-blue-700',
  WITHDRAWAL: 'bg-rose-100 text-rose-700',
  BUY: 'bg-emerald-100 text-emerald-700',
  SELL: 'bg-amber-100 text-amber-700',
  DIVIDEND: 'bg-violet-100 text-violet-700',
};

/**
 * The transaction log, plus what it implies: realized gains and any drift
 * between the log and the manually-entered holdings.
 *
 * Realized gains are shown for performance, not tax. Inside a Roth IRA a sale
 * is not a taxable event, so there is nothing to report — the number is here to
 * answer "did that trade work out", not to fill in a return.
 */
export function TransactionHistory({
  transactions,
  replay,
  reconciliation,
  onDelete,
  formatCurrency,
  formatDate,
}: TransactionHistoryProps) {
  // Newest first for reading, even though replay runs oldest-first.
  const ordered = sortTransactions(transactions).reverse();
  const closedTrades = replay.realizedGains.length;

  return (
    <div className="space-y-6">
      {replay.warnings.length > 0 && (
        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-900">
            <p className="font-bold mb-1">Incomplete cost basis</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              {replay.warnings.map((warning, i) => <li key={i}>{warning}</li>)}
            </ul>
          </div>
        </div>
      )}

      {reconciliation.length > 0 && (
        <div className="flex items-start gap-3 p-4 bg-slate-50 border border-slate-200 rounded-2xl">
          <Info className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
          <div className="text-sm text-slate-700 flex-1">
            <p className="font-bold mb-1">Log and holdings differ</p>
            <p className="text-xs text-slate-500 mb-3">
              Holdings remain the source of truth for valuation. A share-count difference is
              expected if you entered positions before you started logging transactions.
            </p>
            <div className="space-y-1.5">
              {reconciliation.map(row => (
                <div key={row.symbol} className="text-xs flex flex-wrap gap-x-3 gap-y-1 tabular-nums items-baseline">
                  <span className="font-bold w-16">{row.symbol}</span>
                  {row.costMethodOnly ? (
                    <>
                      <span className="text-slate-500">
                        avg cost {formatCurrency(row.heldAveragePrice)} vs {formatCurrency(row.loggedAveragePrice)} FIFO
                      </span>
                      <span
                        className="text-[9px] font-bold text-slate-500 bg-slate-200/70 px-1.5 py-0.5 rounded uppercase tracking-wider"
                        title="Weighted average across all lots vs. the cost of the lots FIFO left open. Both are correct; they diverge after a partial sale."
                      >
                        cost method
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="text-slate-500">holdings {row.heldShares.toFixed(4)}</span>
                      <span className="text-slate-400">log {row.loggedShares.toFixed(4)}</span>
                      <span className={cn('font-medium', row.difference > 0 ? 'text-amber-600' : 'text-blue-600')}>
                        {row.difference > 0 ? '+' : ''}{row.difference.toFixed(4)} unlogged
                      </span>
                    </>
                  )}
                </div>
              ))}
            </div>
            {reconciliation.some(row => row.costMethodOnly) && (
              <p className="text-[10px] text-slate-400 mt-3 leading-relaxed">
                A "cost method" row is not an error. Holdings carry a weighted average across every
                lot; the log carries the cost of whichever lots FIFO left open. They agree until you
                sell part of a position bought at different prices.
              </p>
            )}
          </div>
        </div>
      )}

      {closedTrades > 0 && (
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
          <div className="flex justify-between items-start mb-4">
            <h3 className="font-bold text-lg">Realized Performance</h3>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50 px-2 py-1 rounded-md">
              FIFO
            </span>
          </div>

          <div className="flex flex-wrap items-baseline gap-3 mb-4">
            <span className={cn(
              'text-3xl font-bold tabular-nums',
              replay.totalRealized >= 0 ? 'text-emerald-600' : 'text-rose-600',
            )}>
              {replay.totalRealized >= 0 ? '+' : '-'}{formatCurrency(Math.abs(replay.totalRealized))}
            </span>
            <span className="text-sm text-slate-400">
              across {closedTrades} closed {closedTrades === 1 ? 'sale' : 'sales'}
            </span>
          </div>

          <div className="space-y-2">
            {replay.realizedGains.map((gain, i) => (
              <div key={i} className="flex flex-wrap justify-between items-center gap-2 p-3 bg-slate-50 rounded-xl text-sm">
                <div className="flex items-center gap-3">
                  <span className="font-bold text-slate-900 w-14">{gain.symbol}</span>
                  <span className="text-xs text-slate-400">{formatDate(gain.date)}</span>
                  <span className="text-xs text-slate-500 tabular-nums">{gain.shares} sh</span>
                  {gain.unmatched && (
                    <span
                      className="text-[9px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded uppercase"
                      title="Sold more shares than the log accounts for, so this gain is overstated"
                    >
                      partial basis
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4 tabular-nums">
                  <span className="text-xs text-slate-400">
                    {formatCurrency(gain.costBasis)} → {formatCurrency(gain.proceeds)}
                  </span>
                  <span className={cn('font-bold', gain.gain >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
                    {gain.gain >= 0 ? '+' : '-'}{formatCurrency(Math.abs(gain.gain))}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <p className="text-[10px] text-slate-400 mt-4 leading-relaxed">
            Lots matched first-in, first-out. Shown for performance only — sales inside a Roth IRA
            are not taxable events and nothing here needs reporting.
          </p>
        </div>
      )}

      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6 border-b border-slate-50 flex items-center gap-2">
          <History className="w-5 h-5 text-slate-400" />
          <h3 className="font-bold text-lg">Transaction Log</h3>
          <span className="text-xs text-slate-400 ml-auto">
            {transactions.length} {transactions.length === 1 ? 'entry' : 'entries'}
          </span>
        </div>

        {ordered.length === 0 ? (
          <div className="px-6 py-16 text-center text-slate-400 italic">
            No activity recorded yet. Add a contribution above to start tracking against the annual limit.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50">
                  {['Date', 'Type', 'Detail', 'Tax year', 'Cash', ''].map(header => (
                    <th key={header} className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {ordered.map(transaction => {
                  const direction = cashDirection(transaction.type);
                  return (
                    <tr key={transaction.id} className="hover:bg-slate-50/30 transition-colors">
                      <td className="px-6 py-4 text-sm text-slate-600 whitespace-nowrap">
                        {formatDate(transaction.date)}
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn(
                          'text-[10px] font-bold px-2 py-1 rounded-lg uppercase tracking-wider whitespace-nowrap',
                          TYPE_STYLES[transaction.type],
                        )}>
                          {transactionLabel(transaction.type)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {transaction.symbol && (
                          <span className="font-bold text-slate-900 mr-2">{transaction.symbol}</span>
                        )}
                        {transaction.shares != null && transaction.pricePerShare != null && (
                          <span className="text-xs text-slate-400 tabular-nums">
                            {transaction.shares} @ {formatCurrency(transaction.pricePerShare)}
                          </span>
                        )}
                        {transaction.note && (
                          <span className="block text-xs text-slate-400 italic mt-0.5">{transaction.note}</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-400 tabular-nums">
                        {transaction.taxYear ?? '—'}
                      </td>
                      <td className={cn(
                        'px-6 py-4 font-bold tabular-nums whitespace-nowrap',
                        direction > 0 ? 'text-emerald-600' : 'text-slate-900',
                      )}>
                        {direction > 0 ? '+' : '-'}{formatCurrency(transaction.amount)}
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => onDelete(transaction.id)}
                          className="p-2 text-slate-300 hover:text-rose-500 transition-colors"
                          title="Delete this entry"
                          aria-label={`Delete ${transactionLabel(transaction.type)} from ${transaction.date}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
