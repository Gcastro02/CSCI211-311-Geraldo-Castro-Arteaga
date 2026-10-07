import { AlertTriangle, Check } from 'lucide-react';
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
    <section aria-labelledby="contributions-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="contributions-heading" className="text-lg font-semibold">Roth IRA contributions</h2>
        <div className="flex items-center gap-2">
          <label htmlFor="tax-year" className="text-sm text-ink-2">Tax year</label>
          <select
            id="tax-year"
            value={taxYear}
            onChange={e => onYearChange(Number(e.target.value))}
            className="h-11 rounded-lg border border-edge bg-surface px-3 text-sm text-ink focus:border-accent focus:outline-none"
          >
            {years.map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[34px] font-medium tracking-tight">{formatCurrency(contributed)}</span>
        <span className="text-base text-muted">of {formatCurrency(limit.amount)}</span>
      </div>

      <div className="mt-2 h-2 overflow-hidden rounded-full bg-line-soft">
        <div
          className={cn('h-full rounded-full transition-all', overLimit ? 'bg-down' : progress >= 0.999 ? 'bg-up' : 'bg-accent')}
          style={{ width: `${Math.max(progress * 100, contributed > 0 ? 2 : 0)}%` }}
        />
      </div>

      <p className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {overLimit ? (
          <span className="font-semibold text-down">{formatCurrency(excess)} over the limit</span>
        ) : remaining === 0 ? (
          <span className="flex items-center gap-1.5 font-semibold text-up">
            <Check className="h-4 w-4" aria-hidden="true" /> Limit reached for {taxYear}
          </span>
        ) : (
          <span className="text-ink-2">
            <strong className="font-semibold text-ink">{formatCurrency(remaining)}</strong> left for {taxYear}
          </span>
        )}
        <span className="text-muted">
          {summary.contributionCount} contribution{summary.contributionCount === 1 ? '' : 's'} recorded
        </span>
      </p>

      {overLimit && (
        <div className="mt-4 flex items-start gap-3 rounded-lg border border-down/40 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-down" aria-hidden="true" />
          <div className="text-sm leading-relaxed">
            <p className="font-semibold">Excess contribution</p>
            <p className="mt-1 text-ink-2">
              An excess contribution is generally subject to a 6% excise tax for each year it stays in the
              account. It can usually be corrected by withdrawing the excess (and what it earned) before the tax
              filing deadline. Record that as a withdrawal tagged to {taxYear}.
            </p>
          </div>
        </div>
      )}

      {/* The IRS adjusts the limit annually, so a table baked into the app goes
          stale. Say so rather than showing a stale figure as fact. */}
      {!limit.verified && (
        <div className="mt-4 flex items-start gap-3 rounded-lg bg-note px-4 py-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-note-ink" aria-hidden="true" />
          <div className="flex-1 text-sm leading-relaxed">
            <p className="font-semibold text-note-ink">Unverified limit for {taxYear}</p>
            <p className="mt-1 text-ink-2">
              This app only has published figures through {limit.carriedFromYear}, so it is showing that year's{' '}
              {formatCurrency(limit.amount)}. Confirm the {taxYear} limit in IRS Publication 590-A and set it here.
            </p>
            <form
              onSubmit={e => {
                e.preventDefault();
                const input = e.currentTarget.elements.namedItem('limit') as HTMLInputElement;
                const value = parseFloat(input.value);
                if (Number.isFinite(value) && value > 0) onSetLimit(taxYear, value);
              }}
              className="mt-3 flex flex-wrap gap-2"
            >
              <input
                name="limit"
                type="number"
                min={1}
                step={100}
                defaultValue={limit.amount}
                aria-label={`Contribution limit for ${taxYear}`}
                className="h-11 w-32 rounded-lg border border-edge bg-canvas px-3 text-sm text-ink focus:border-accent focus:outline-none"
              />
              <button
                type="submit"
                className="h-11 rounded-full bg-accent px-5 text-sm font-medium text-on-accent hover:bg-accent-strong"
              >
                Set {taxYear} limit
              </button>
            </form>
          </div>
        </div>
      )}

      <dl className="mt-5 grid gap-x-8 sm:grid-cols-2">
        <div className="border-t border-line py-3">
          <dt className="text-sm text-ink-2">Contribution basis</dt>
          <dd className="mt-0.5 text-lg font-medium">{formatCurrency(basis)}</dd>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Lifetime contributions less withdrawals. This part can generally be withdrawn at any time without tax
            or penalty — earnings can't.
          </p>
        </div>
        <div className="border-t border-line py-3">
          <dt className="text-sm text-ink-2">Where the limit comes from</dt>
          <dd className="mt-0.5 text-lg font-medium">
            {limit.source === 'user-override' ? 'You set it'
              : limit.source === 'table' ? 'Published IRS figure'
                : `Carried from ${limit.carriedFromYear}`}
          </dd>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Eligibility also phases out above certain incomes, which this app doesn't track.
          </p>
        </div>
      </dl>

      <p className="mt-2 text-xs leading-relaxed text-muted">
        Contributions made between January 1 and the filing deadline may count toward the prior tax year — set the
        tax year when recording one. Dividends and growth inside the account never count toward the limit.
      </p>
    </section>
  );
}
