import { AlertTriangle, PiggyBank, Info, Check } from 'lucide-react';
import { cn } from '../lib/utils';
import { ContributionSummary } from '../lib/contributions';

interface ContributionTrackerProps {
  summary: ContributionSummary;
  /** Lifetime contributions less withdrawals. */
  basis: number;
  years: number[];
  onYearChange: (year: number) => void;
  /** Save a verified limit for this tax year. */
  onSetLimit: (year: number, amount: number) => void;
  formatCurrency: (amount: number) => string;
}

/**
 * Contributions for one tax year, measured against the annual limit.
 *
 * The limit is the number that matters most in a Roth IRA — exceeding it incurs
 * a 6% excise tax for every year the excess stays in the account — so when the
 * app is not sure of the figure it says so instead of showing a confident
 * number that might be wrong.
 */
export function ContributionTracker({
  summary,
  basis,
  years,
  onYearChange,
  onSetLimit,
  formatCurrency,
}: ContributionTrackerProps) {
  const { limit, contributed, remaining, excess, progress, overLimit, taxYear } = summary;

  return (
    <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-slate-100">
      <div className="flex flex-wrap justify-between items-start gap-4 mb-8">
        <div className="flex items-center gap-2">
          <PiggyBank className="w-5 h-5 text-blue-600" />
          <h3 className="font-bold text-lg">Contributions</h3>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="tax-year" className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Tax year
          </label>
          <select
            id="tax-year"
            value={taxYear}
            onChange={e => onYearChange(Number(e.target.value))}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
          >
            {years.map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-x-3 gap-y-1 mb-4">
        <span className="text-4xl font-bold text-slate-900 tabular-nums">{formatCurrency(contributed)}</span>
        <span className="text-lg text-slate-400 mb-1">of {formatCurrency(limit.amount)}</span>
      </div>

      <div className="relative h-3 rounded-full bg-slate-100 overflow-hidden mb-3">
        <div
          className={cn(
            'absolute inset-y-0 left-0 rounded-full transition-all duration-500',
            overLimit ? 'bg-rose-500' : progress >= 0.999 ? 'bg-emerald-500' : 'bg-blue-500',
          )}
          style={{ width: `${Math.max(progress * 100, contributed > 0 ? 2 : 0)}%` }}
        />
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm mb-6">
        {overLimit ? (
          <span className="font-bold text-rose-600">{formatCurrency(excess)} over the limit</span>
        ) : remaining === 0 ? (
          <span className="font-bold text-emerald-600 flex items-center gap-1.5">
            <Check className="w-4 h-4" /> Limit reached for {taxYear}
          </span>
        ) : (
          <span className="text-slate-600">
            <strong className="text-slate-900">{formatCurrency(remaining)}</strong> remaining for {taxYear}
          </span>
        )}
        <span className="text-slate-400">
          {summary.contributionCount} contribution{summary.contributionCount === 1 ? '' : 's'} recorded
        </span>
      </div>

      {overLimit && (
        <div className="flex items-start gap-3 p-4 mb-4 bg-rose-50 border border-rose-200 rounded-2xl">
          <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
          <div className="text-sm text-rose-900 leading-relaxed">
            <p className="font-bold mb-1">Excess contribution</p>
            <p>
              An excess contribution is generally subject to a 6% excise tax for each year it stays
              in the account. It can usually be corrected by withdrawing the excess (and what it
              earned) before the tax filing deadline. Record that as a withdrawal tagged to {taxYear}.
            </p>
          </div>
        </div>
      )}

      {/* The IRS adjusts the limit annually, so a table baked into the app goes
          stale. Say so rather than showing a stale figure as fact. */}
      {!limit.verified && (
        <div className="flex items-start gap-3 p-4 mb-4 bg-amber-50 border border-amber-200 rounded-2xl">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-900 leading-relaxed flex-1">
            <p className="font-bold mb-1">Unverified limit for {taxYear}</p>
            <p className="mb-3">
              This app only has published figures through {limit.carriedFromYear}, so it is showing
              that year's {formatCurrency(limit.amount)}. Confirm the {taxYear} limit in IRS
              Publication 590-A and set it here.
            </p>
            <form
              onSubmit={e => {
                e.preventDefault();
                const input = (e.currentTarget.elements.namedItem('limit') as HTMLInputElement);
                const value = parseFloat(input.value);
                if (Number.isFinite(value) && value > 0) onSetLimit(taxYear, value);
              }}
              className="flex gap-2"
            >
              <input
                name="limit"
                type="number"
                min={1}
                step={100}
                defaultValue={limit.amount}
                aria-label={`Contribution limit for ${taxYear}`}
                className="w-32 px-3 py-1.5 bg-white border border-amber-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
              <button
                type="submit"
                className="px-4 py-1.5 bg-amber-500 text-white text-sm font-bold rounded-lg hover:bg-amber-600 transition-colors"
              >
                Set {taxYear} limit
              </button>
            </form>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-6 border-t border-slate-100">
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
            Contribution basis
          </p>
          <p className="text-xl font-bold text-slate-900 tabular-nums">{formatCurrency(basis)}</p>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            Lifetime contributions less withdrawals. This portion can generally be withdrawn at any
            time without tax or penalty — earnings cannot.
          </p>
        </div>
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
            Limit source
          </p>
          <p className="text-xl font-bold text-slate-900">
            {limit.source === 'user-override' ? 'You set this'
              : limit.source === 'table' ? 'Published figure'
                : `Carried from ${limit.carriedFromYear}`}
          </p>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            Eligibility also phases out above certain income levels, which this app does not track.
          </p>
        </div>
      </div>

      <div className="flex items-start gap-2 mt-6 pt-4 border-t border-slate-100">
        <Info className="w-3.5 h-3.5 text-slate-300 shrink-0 mt-0.5" />
        <p className="text-[10px] text-slate-400 leading-relaxed">
          Contributions made between January 1 and the filing deadline may count toward the prior
          tax year — set the tax year explicitly when recording one. Dividends and growth inside the
          account never count toward the limit.
        </p>
      </div>
    </div>
  );
}
