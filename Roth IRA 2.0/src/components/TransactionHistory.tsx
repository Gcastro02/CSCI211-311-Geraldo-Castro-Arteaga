import { AlertTriangle, Info, Trash2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { AccountType, Transaction } from '../types';
import { ReplayResult, ReconciliationRow, cashDirection, sortTransactions, transactionLabel } from '../lib/transactions';

interface TransactionHistoryProps {
  transactions: Transaction[];
  replay: ReplayResult;
  reconciliation: ReconciliationRow[];
  onDelete: (id: string) => void;
  accountType: AccountType;
  formatCurrency: (amount: number) => string;
  formatDate: (date?: string) => string;
}

/**
 * The transaction log, plus what it implies: realized gains and any drift
 * between the log and the manually-entered holdings.
 *
 * Realized gains are shown for performance. Inside a Roth IRA a sale is not a
 * taxable event; in a brokerage account it may be, which the footnote says.
 */
export function TransactionHistory({
  transactions,
  replay,
  reconciliation,
  onDelete,
  accountType,
  formatCurrency,
  formatDate,
}: TransactionHistoryProps) {
  // Newest first for reading, even though replay runs oldest-first.
  const ordered = sortTransactions(transactions).reverse();
  const closedTrades = replay.realizedGains.length;
  const isRoth = accountType === 'ROTH_IRA';
  const label = (type: Transaction['type']) => transactionLabel(type, accountType);

  return (
    <div className="flex flex-col gap-10">
      {replay.warnings.length > 0 && (
        <div className="flex items-start gap-3 rounded-lg bg-note px-4 py-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-note-ink" aria-hidden="true" />
          <div className="text-sm">
            <p className="font-semibold text-note-ink">Incomplete cost basis</p>
            <ul className="mt-1 list-inside list-disc space-y-1 text-ink-2">
              {replay.warnings.map((warning, i) => <li key={i}>{warning}</li>)}
            </ul>
          </div>
        </div>
      )}

      {reconciliation.length > 0 && (
        <section aria-labelledby="reconcile-heading" className="flex items-start gap-3 rounded-lg bg-surface px-4 py-4">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
          <div className="flex-1 text-sm">
            <h2 id="reconcile-heading" className="font-semibold">Log and holdings differ</h2>
            <p className="mt-1 text-ink-2">
              Holdings stay the source of truth for valuation. A share-count difference is expected if you entered
              positions before you started logging activity.
            </p>
            <ul className="mt-3 space-y-1.5">
              {reconciliation.map(row => (
                <li key={row.symbol} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="w-16 font-mono text-[13px] font-medium">{row.symbol}</span>
                  {row.costMethodOnly ? (
                    <span
                      className="text-ink-2"
                      title="Weighted average across all lots vs. the cost of the lots FIFO left open. Both are correct; they diverge after a partial sale."
                    >
                      avg cost {formatCurrency(row.heldAveragePrice)} vs {formatCurrency(row.loggedAveragePrice)} FIFO
                      <span className="ml-2 text-xs text-muted">(cost method)</span>
                    </span>
                  ) : (
                    <>
                      <span className="text-ink-2">holdings {row.heldShares.toFixed(4)}</span>
                      <span className="text-muted">log {row.loggedShares.toFixed(4)}</span>
                      <span className="font-medium text-warn-ink">
                        {row.difference > 0 ? '+' : ''}{row.difference.toFixed(4)} not logged
                      </span>
                    </>
                  )}
                </li>
              ))}
            </ul>
            {reconciliation.some(row => row.costMethodOnly) && (
              <p className="mt-3 text-xs leading-relaxed text-muted">
                A "cost method" row isn't an error. Holdings carry a weighted average across every lot; the log carries
                the cost of whichever lots FIFO left open. They agree until you sell part of a position bought at
                different prices.
              </p>
            )}
          </div>
        </section>
      )}

      {closedTrades > 0 && (
        <section aria-labelledby="realized-heading">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="realized-heading" className="text-lg font-semibold">Realized gains</h2>
            <span className="text-xs text-muted">Lots matched first in, first out</span>
          </div>
          <p className="mt-2 flex flex-wrap items-baseline gap-3">
            <span className={cn('text-[28px] font-medium tracking-tight', replay.totalRealized >= 0 ? 'text-up' : 'text-down')}>
              {replay.totalRealized >= 0 ? '+' : '−'}{formatCurrency(Math.abs(replay.totalRealized))}
            </span>
            <span className="text-sm text-muted">
              across {closedTrades} closed {closedTrades === 1 ? 'sale' : 'sales'}
            </span>
          </p>
          <ul className="mt-3">
            {replay.realizedGains.map((gain, i) => (
              <li key={i} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line-soft py-2.5 text-sm">
                <span className="flex items-baseline gap-3">
                  <span className="w-14 font-mono text-[13px] font-medium">{gain.symbol}</span>
                  <span className="text-muted">{formatDate(gain.date)}</span>
                  <span className="text-ink-2">{gain.shares} sh</span>
                  {gain.unmatched && (
                    <span className="text-xs text-warn-ink" title="Sold more shares than the log accounts for, so this gain is overstated">
                      partial basis
                    </span>
                  )}
                </span>
                <span className="flex items-baseline gap-4">
                  <span className="text-muted">{formatCurrency(gain.costBasis)} → {formatCurrency(gain.proceeds)}</span>
                  <span className={cn('font-medium', gain.gain >= 0 ? 'text-up' : 'text-down')}>
                    {gain.gain >= 0 ? '+' : '−'}{formatCurrency(Math.abs(gain.gain))}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            {isRoth
              ? 'Shown for performance only — sales inside a Roth IRA are not taxable events and nothing here needs reporting.'
              : 'Shown for performance. In a taxable account, sales can have tax consequences — your broker’s tax forms are the record that counts.'}
          </p>
        </section>
      )}

      <section aria-labelledby="log-heading">
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="log-heading" className="text-lg font-semibold">Activity log</h2>
          <span className="text-sm text-muted">
            {transactions.length} {transactions.length === 1 ? 'entry' : 'entries'}
          </span>
        </div>

        {ordered.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            Nothing recorded yet.{' '}
            {isRoth ? 'Add a contribution above to start tracking against the annual limit.' : 'Add a deposit or a trade above to start the log.'}
          </p>
        ) : (
          <div className="relative mt-3 overflow-x-auto">
            <table className="w-full min-w-[600px] border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th scope="col" className="border-b border-line py-2 font-medium">Date</th>
                  <th scope="col" className="border-b border-line py-2 font-medium">Type</th>
                  <th scope="col" className="border-b border-line py-2 font-medium">Detail</th>
                  {isRoth && <th scope="col" className="border-b border-line py-2 font-medium">Tax year</th>}
                  <th scope="col" className="border-b border-line py-2 text-right font-medium">Cash</th>
                  <th scope="col" className="border-b border-line py-2"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {ordered.map(transaction => {
                  const direction = cashDirection(transaction.type);
                  return (
                    <tr key={transaction.id}>
                      <td className="whitespace-nowrap border-b border-line-soft py-3 text-ink-2">{formatDate(transaction.date)}</td>
                      <td className="border-b border-line-soft py-3">
                        <span className="whitespace-nowrap rounded bg-chip px-2 py-0.5 text-xs font-medium">{label(transaction.type)}</span>
                      </td>
                      <td className="border-b border-line-soft py-3">
                        {transaction.symbol && <span className="mr-2 font-mono text-[13px] font-medium">{transaction.symbol}</span>}
                        {transaction.shares != null && transaction.pricePerShare != null && (
                          <span className="text-muted">{transaction.shares} @ {formatCurrency(transaction.pricePerShare)}</span>
                        )}
                        {transaction.note && <span className="mt-0.5 block text-xs text-muted">{transaction.note}</span>}
                      </td>
                      {isRoth && <td className="border-b border-line-soft py-3 text-muted">{transaction.taxYear ?? '—'}</td>}
                      <td className={cn('whitespace-nowrap border-b border-line-soft py-3 text-right font-medium', direction > 0 && 'text-up')}>
                        {direction > 0 ? '+' : '−'}{formatCurrency(transaction.amount)}
                      </td>
                      <td className="border-b border-line-soft py-3 text-right">
                        <button
                          type="button"
                          onClick={() => onDelete(transaction.id)}
                          aria-label={`Delete ${label(transaction.type).toLowerCase()} from ${transaction.date}`}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-down"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
