import { useState } from 'react';
import { Plus } from 'lucide-react';
import { cn, localIsoDate } from '../lib/utils';
import { AccountType, Transaction, TransactionType } from '../types';
import { transactionLabel } from '../lib/transactions';

interface TransactionFormProps {
  onSubmit: (transaction: Omit<Transaction, 'id'>) => void;
  /** Suggestions for the symbol field. */
  symbols: string[];
  defaultTaxYear: number;
  accountType: AccountType;
}

const TYPES: TransactionType[] = ['CONTRIBUTION', 'BUY', 'SELL', 'DIVIDEND', 'WITHDRAWAL'];

/** Which fields each type needs. */
const needsSymbol = (type: TransactionType) => type !== 'CONTRIBUTION' && type !== 'WITHDRAWAL';
const needsShares = (type: TransactionType) => type === 'BUY' || type === 'SELL';
/** Tax years only mean something for Roth contributions and their corrections. */
const needsTaxYear = (type: TransactionType, accountType: AccountType) =>
  accountType === 'ROTH_IRA' && (type === 'CONTRIBUTION' || type === 'WITHDRAWAL');

const fieldClass =
  'mt-1 h-11 w-full rounded-lg border border-edge bg-surface px-3 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none';
const labelClass = 'text-sm text-ink-2';

export function TransactionForm({ onSubmit, symbols, defaultTaxYear, accountType }: TransactionFormProps) {
  const [type, setType] = useState<TransactionType>('CONTRIBUTION');
  const [date, setDate] = useState(() => localIsoDate());
  const [symbol, setSymbol] = useState('');
  const [shares, setShares] = useState('');
  const [price, setPrice] = useState('');
  const [amount, setAmount] = useState('');
  const [taxYear, setTaxYear] = useState(String(defaultTaxYear));
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const sharesNum = parseFloat(shares);
  const priceNum = parseFloat(price);
  const label = (t: TransactionType) => transactionLabel(t, accountType);
  const withTaxYear = needsTaxYear(type, accountType);

  // For trades the total follows from shares x price, so it is derived rather
  // than asked for — one less place for the two to disagree.
  const derivedAmount = needsShares(type) && Number.isFinite(sharesNum) && Number.isFinite(priceNum)
    ? sharesNum * priceNum
    : null;

  const effectiveAmount = derivedAmount ?? parseFloat(amount);

  const reset = () => {
    setSymbol('');
    setShares('');
    setPrice('');
    setAmount('');
    setNote('');
    setError(null);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    if (!date) return setError('Pick a date.');
    if (!Number.isFinite(effectiveAmount) || effectiveAmount <= 0) {
      return setError(needsShares(type) ? 'Enter shares and a price.' : 'Enter an amount above zero.');
    }
    if (needsSymbol(type) && !symbol.trim()) return setError('Enter a symbol.');
    if (needsShares(type) && (!Number.isFinite(sharesNum) || sharesNum <= 0)) {
      return setError('Enter a share count above zero.');
    }

    const parsedTaxYear = parseInt(taxYear, 10);

    onSubmit({
      date,
      type,
      amount: effectiveAmount,
      ...(needsSymbol(type) ? { symbol: symbol.trim().toUpperCase() } : {}),
      ...(needsShares(type) ? { shares: sharesNum, pricePerShare: priceNum } : {}),
      ...(withTaxYear && Number.isFinite(parsedTaxYear) ? { taxYear: parsedTaxYear } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
    });

    reset();
  };

  return (
    <section aria-labelledby="record-heading">
      <h2 id="record-heading" className="text-lg font-semibold">Record activity</h2>
      <p className="mt-1 text-sm text-ink-2">
        Log what happened at your broker. Buys and sells also update your holdings and cash.
      </p>

      <div role="group" aria-label="Activity type" className="mt-4 flex flex-wrap gap-2">
        {TYPES.map(option => (
          <button
            key={option}
            type="button"
            onClick={() => { setType(option); setError(null); }}
            aria-pressed={type === option}
            className={cn(
              'h-10 rounded-full border px-4 text-sm font-medium transition-colors',
              type === option ? 'border-accent bg-accent-tint text-accent' : 'border-edge text-ink-2 hover:text-ink',
            )}
          >
            {label(option)}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="tx-date" className={labelClass}>Date</label>
            <input id="tx-date" type="date" value={date} onChange={e => setDate(e.target.value)} className={fieldClass} />
          </div>

          {needsSymbol(type) && (
            <div>
              <label htmlFor="tx-symbol" className={labelClass}>Symbol</label>
              <input
                id="tx-symbol"
                list="tx-symbol-options"
                value={symbol}
                onChange={e => setSymbol(e.target.value)}
                placeholder="e.g. VOO"
                className={cn(fieldClass, 'uppercase placeholder:normal-case')}
              />
              <datalist id="tx-symbol-options">
                {symbols.map(s => <option key={s} value={s} />)}
              </datalist>
            </div>
          )}

          {needsShares(type) ? (
            <>
              <div>
                <label htmlFor="tx-shares" className={labelClass}>Shares</label>
                <input id="tx-shares" type="number" step="any" min="0" value={shares} onChange={e => setShares(e.target.value)} placeholder="0" className={fieldClass} />
              </div>
              <div>
                <label htmlFor="tx-price" className={labelClass}>Price per share</label>
                <input id="tx-price" type="number" step="any" min="0" value={price} onChange={e => setPrice(e.target.value)} placeholder="0.00" className={fieldClass} />
              </div>
            </>
          ) : (
            <div>
              <label htmlFor="tx-amount" className={labelClass}>Amount</label>
              <input id="tx-amount" type="number" step="any" min="0" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" className={fieldClass} />
            </div>
          )}

          {withTaxYear && (
            <div>
              <label htmlFor="tx-tax-year" className={labelClass}>Tax year</label>
              <input id="tx-tax-year" type="number" value={taxYear} onChange={e => setTaxYear(e.target.value)} className={fieldClass} />
            </div>
          )}
        </div>

        {withTaxYear && (
          <p className="text-xs leading-relaxed text-muted">
            {type === 'CONTRIBUTION'
              ? 'Set this to the prior year if the contribution is designated for it — allowed up to that year’s filing deadline.'
              : 'Tag a withdrawal to a tax year only when correcting an excess contribution for it.'}
          </p>
        )}

        <div className="flex flex-col gap-4 md:flex-row md:items-end">
          <div className="flex-1">
            <label htmlFor="tx-note" className={labelClass}>Note (optional)</label>
            <input id="tx-note" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. payroll transfer" className={fieldClass} />
          </div>
          <button
            type="submit"
            className="flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-accent px-5 text-sm font-medium text-on-accent hover:bg-accent-strong"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Record {label(type).toLowerCase()}
          </button>
        </div>

        {derivedAmount !== null && (
          <p className="text-sm text-ink-2">
            Total: <strong className="font-semibold text-ink">{derivedAmount.toFixed(2)}</strong> ({shares} × {price})
          </p>
        )}

        {error && <p role="alert" className="text-sm font-medium text-down">{error}</p>}
      </form>
    </section>
  );
}
