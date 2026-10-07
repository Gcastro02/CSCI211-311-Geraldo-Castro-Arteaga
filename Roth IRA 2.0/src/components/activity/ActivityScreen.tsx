import { AccountType, Transaction } from '../../types';
import { ContributionSummary } from '../../lib/contributions';
import { ReconciliationRow, ReplayResult } from '../../lib/transactions';
import { cn } from '../../lib/utils';
import { ContributionTracker } from '../ContributionTracker';
import { TransactionForm } from '../TransactionForm';
import { TransactionHistory } from '../TransactionHistory';

const ACCOUNT_TYPES: { id: AccountType; label: string }[] = [
  { id: 'BROKERAGE', label: 'Brokerage' },
  { id: 'ROTH_IRA', label: 'Roth IRA' },
];

interface ActivityScreenProps {
  accountType: AccountType;
  onAccountTypeChange: (accountType: AccountType) => void;
  transactions: Transaction[];
  replay: ReplayResult;
  reconciliation: ReconciliationRow[];
  symbols: string[];
  onRecord: (transaction: Omit<Transaction, 'id'>) => void;
  onDelete: (id: string) => void;
  contributions: {
    summary: ContributionSummary;
    basis: number;
    years: number[];
    selectedYear: number;
    onYearChange: (year: number) => void;
    onSetLimit: (year: number, amount: number) => void;
  };
  formatCurrency: (amount: number) => string;
  formatDate: (date?: string) => string;
}

/** The dated log of deposits, trades and dividends, plus Roth contribution tracking. */
export function ActivityScreen({
  accountType,
  onAccountTypeChange,
  transactions,
  replay,
  reconciliation,
  symbols,
  onRecord,
  onDelete,
  contributions,
  formatCurrency,
  formatDate,
}: ActivityScreenProps) {
  const isRoth = accountType === 'ROTH_IRA';

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Activity</h1>
          <p className="mt-1 max-w-xl text-sm text-muted">
            A dated record of money in and out and the trades you made. It powers realized gains
            {isRoth ? ' and your contribution limit.' : '.'}
          </p>
        </div>
        <div>
          <p id="account-type-label" className="text-sm text-ink-2">Account type</p>
          <div role="group" aria-labelledby="account-type-label" className="mt-1 flex rounded-full border border-edge p-0.5 text-sm font-medium">
            {ACCOUNT_TYPES.map(option => (
              <button
                key={option.id}
                type="button"
                onClick={() => onAccountTypeChange(option.id)}
                aria-pressed={accountType === option.id}
                className={cn(
                  'h-10 rounded-full px-4 transition-colors',
                  accountType === option.id ? 'bg-chip text-ink' : 'text-muted hover:text-ink',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isRoth && (
        <ContributionTracker
          summary={contributions.summary}
          basis={contributions.basis}
          years={contributions.years}
          onYearChange={contributions.onYearChange}
          onSetLimit={contributions.onSetLimit}
          formatCurrency={formatCurrency}
        />
      )}

      <TransactionForm
        onSubmit={onRecord}
        symbols={symbols}
        defaultTaxYear={contributions.selectedYear}
        accountType={accountType}
      />

      <TransactionHistory
        transactions={transactions}
        replay={replay}
        reconciliation={reconciliation}
        onDelete={onDelete}
        accountType={accountType}
        formatCurrency={formatCurrency}
        formatDate={formatDate}
      />
    </div>
  );
}
