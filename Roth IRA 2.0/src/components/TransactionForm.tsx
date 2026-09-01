import { useState } from 'react';
import { Plus } from 'lucide-react';
import { cn } from '../lib/utils';
import { Transaction, TransactionType } from '../types';
import { transactionLabel } from '../lib/transactions';

interface TransactionFormProps {
  onSubmit: (transaction: Omit<Transaction, 'id'>) => void;
  /** Suggestions for the symbol field. */
  symbols: string[];
  defaultTaxYear: number;
}

const TYPES: TransactionType[] = ['CONTRIBUTION', 'BUY', 'SELL', 'DIVIDEND', 'WITHDRAWAL'];

/** Which fields each type needs. */
const needsSymbol = (type: TransactionType) => type !== 'CONTRIBUTION' && type !== 'WITHDRAWAL';
const needsShares = (type: TransactionType) => type === 'BUY' || type === 'SELL';
const needsTaxYear = (type: TransactionType) => type === 'CONTRIBUTION' || type === 'WITHDRAWAL';

const todayIso = () => new Date().toISOString().slice(0, 10);

export function TransactionForm({ onSubmit, symbols, defaultTaxYear }: TransactionFormProps) {
  const [type, setType] = useState<TransactionType>('CONTRIBUTION');
  const [date, setDate] = useState(todayIso);
  const [symbol, setSymbol] = useState('');
  const [shares, setShares] = useState('');
  const [price, setPrice] = useState('');
  const [amount, setAmount] = useState('');
  const [taxYear, setTaxYear] = useState(String(defaultTaxYear));
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const sharesNum = parseFloat(shares);
  const priceNum = parseFloat(price);

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
      ...(needsTaxYear(type) && Number.isFinite(parsedTaxYear) ? { taxYear: parsedTaxYear } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
    });

    reset();
  };

  const inputClass =
    'w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all';
  const labelClass = 'text-xs font-bold text-slate-400 uppercase';

  return (
    <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-slate-100">
      <h3 className="font-bold text-lg mb-6">Record Activity</h3>

      <div className="flex flex-wrap gap-2 mb-6">
        {TYPES.map(option => (
          <button
            key={option}
            type="button"
            onClick={() => { setType(option); setError(null); }}
            className={cn(
              'px-4 py-2 rounded-xl text-sm font-medium border transition-all',
              type === option
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300',
            )}
          >
            {transactionLabel(option)}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="space-y-1">
            <label htmlFor="tx-date" className={labelClass}>Date</label>
            <input id="tx-date" type="date" value={date} onChange={e => setDate(e.target.value)} className={inputClass} />
          </div>

          {needsSymbol(type) && (
            <div className="space-y-1">
              <label htmlFor="tx-symbol" className={labelClass}>Symbol</label>
              <input
                id="tx-symbol"
                list="tx-symbol-options"
                value={symbol}
                onChange={e => setSymbol(e.target.value)}
                placeholder="e.g. VOO"
                className={inputClass}
              />
              <datalist id="tx-symbol-options">
                {symbols.map(s => <option key={s} value={s} />)}
              </datalist>
            </div>
          )}

          {needsShares(type) ? (
            <>
              <div className="space-y-1">
                <label htmlFor="tx-shares" className={labelClass}>Shares</label>
                <input
                  id="tx-shares"
                  type="number"
                  step="any"
                  min="0"
                  value={shares}
                  onChange={e => setShares(e.target.value)}
                  placeholder="0.00"
                  className={inputClass}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="tx-price" className={labelClass}>Price / share</label>
                <input
                  id="tx-price"
                  type="number"
                  step="any"
                  min="0"
                  value={price}
                  onChange={e => setPrice(e.target.value)}
                  placeholder="0.00"
                  className={inputClass}
                />
              </div>
            </>
          ) : (
            <div className="space-y-1">
              <label htmlFor="tx-amount" className={labelClass}>Amount</label>
              <input
                id="tx-amount"
                type="number"
                step="any"
                min="0"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                className={inputClass}
              />
            </div>
          )}

          {needsTaxYear(type) && (
            <div className="space-y-1">
              <label htmlFor="tx-tax-year" className={labelClass}>Tax year</label>
              <input
                id="tx-tax-year"
                type="number"
                value={taxYear}
                onChange={e => setTaxYear(e.target.value)}
                className={inputClass}
              />
            </div>
          )}
        </div>

        {needsTaxYear(type) && (
          <p className="text-[11px] text-slate-400 leading-relaxed">
            {type === 'CONTRIBUTION'
              ? 'Set this to the prior year if the contribution is designated for it — allowed up to that year\'s filing deadline.'
              : 'Tag a withdrawal to a tax year only when correcting an excess contribution for it.'}
          </p>
        )}

        <div className="flex flex-col md:flex-row gap-4 md:items-end">
          <div className="space-y-1 flex-1">
            <label htmlFor="tx-note" className={labelClass}>Note (optional)</label>
            <input
              id="tx-note"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="e.g. payroll transfer"
              className={inputClass}
            />
          </div>

          <button
            type="submit"
            className="bg-blue-600 text-white font-bold px-6 py-2 rounded-xl hover:bg-blue-700 transition-all flex items-center justify-center gap-2 shrink-0"
          >
            <Plus className="w-5 h-5" />
            Record {transactionLabel(type)}
          </button>
        </div>

        {derivedAmount !== null && (
          <p className="text-xs text-slate-500">
            Total: <strong className="text-slate-900">{derivedAmount.toFixed(2)}</strong> ({shares} x {price})
          </p>
        )}

        {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
      </form>
    </div>
  );
}
