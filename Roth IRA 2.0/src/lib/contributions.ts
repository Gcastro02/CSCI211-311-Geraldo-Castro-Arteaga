/**
 * Roth IRA contribution limit tracking.
 *
 * The limit is the number that makes a Roth IRA a Roth IRA rather than a
 * brokerage account: exceed it and the excess is subject to a 6% excise tax for
 * every year it stays in the account. So the app needs to know it, and needs to
 * be honest about when it does not.
 */

import { Transaction, UserSettings } from '../types';

/**
 * Known elective contribution limits by tax year.
 *
 * The IRS adjusts these for inflation annually, which means any table baked
 * into an app goes stale. Rather than guess forward, unknown years are reported
 * as unverified so the UI can ask the user to confirm the current figure
 * against IRS Publication 590-A instead of quietly showing a wrong number.
 */
export const DEFAULT_CONTRIBUTION_LIMITS: Record<number, { standard: number; catchUp: number }> = {
  2023: { standard: 6500, catchUp: 7500 },
  2024: { standard: 7000, catchUp: 8000 },
  2025: { standard: 7000, catchUp: 8000 },
};

export interface ContributionLimit {
  /** Dollar limit in effect for this tax year. */
  amount: number;
  /**
   * False when the figure was carried forward from an earlier year or is
   * otherwise not known to be correct for this tax year.
   */
  verified: boolean;
  /** Where `amount` came from, for display. */
  source: 'table' | 'user-override' | 'carried-forward';
  /** Tax year the figure was actually published for, when carried forward. */
  carriedFromYear?: number;
}

/**
 * Resolve the contribution limit for a tax year.
 *
 * A user override always wins — it is the escape hatch for a year this build
 * predates. Otherwise the published table is used, and failing that the most
 * recent known year is carried forward and flagged unverified.
 */
export const getContributionLimit = (
  taxYear: number,
  settings: Pick<UserSettings, 'catchUpEligible' | 'contributionLimitOverrides'>,
): ContributionLimit => {
  const override = settings.contributionLimitOverrides?.[taxYear];
  if (Number.isFinite(override) && override > 0) {
    return { amount: override, verified: true, source: 'user-override' };
  }

  const published = DEFAULT_CONTRIBUTION_LIMITS[taxYear];
  if (published) {
    return {
      amount: settings.catchUpEligible ? published.catchUp : published.standard,
      verified: true,
      source: 'table',
    };
  }

  const knownYears = Object.keys(DEFAULT_CONTRIBUTION_LIMITS).map(Number).sort((a, b) => b - a);
  const latestYear = knownYears[0];
  const latest = DEFAULT_CONTRIBUTION_LIMITS[latestYear];

  return {
    amount: settings.catchUpEligible ? latest.catchUp : latest.standard,
    verified: false,
    source: 'carried-forward',
    carriedFromYear: latestYear,
  };
};

/**
 * The tax year a contribution counts against.
 *
 * Explicit `taxYear` wins, because a contribution made in the new year can be
 * designated for the prior one up to the filing deadline. Otherwise fall back
 * to the calendar year of the transaction date.
 */
export const taxYearOf = (transaction: Transaction): number =>
  transaction.taxYear ?? new Date(`${transaction.date}T00:00:00`).getFullYear();

export interface ContributionSummary {
  taxYear: number;
  contributed: number;
  limit: ContributionLimit;
  /** Never negative; 0 once the limit is reached. */
  remaining: number;
  /** Amount above the limit, which is what the excise tax applies to. */
  excess: number;
  /** 0-1, clamped, for progress display. */
  progress: number;
  overLimit: boolean;
  contributionCount: number;
}

/** Total CONTRIBUTION activity for one tax year, measured against the limit. */
export const summarizeContributions = (
  transactions: Transaction[],
  taxYear: number,
  settings: Pick<UserSettings, 'catchUpEligible' | 'contributionLimitOverrides'>,
): ContributionSummary => {
  const relevant = transactions.filter(
    tx => tx.type === 'CONTRIBUTION' && taxYearOf(tx) === taxYear,
  );

  // Withdrawing an excess contribution before the deadline is how you correct
  // one, so withdrawals tagged to a tax year reduce the total counted for it.
  const withdrawn = transactions
    .filter(tx => tx.type === 'WITHDRAWAL' && tx.taxYear === taxYear)
    .reduce((acc, tx) => acc + tx.amount, 0);

  const contributed = Math.max(0, relevant.reduce((acc, tx) => acc + tx.amount, 0) - withdrawn);
  const limit = getContributionLimit(taxYear, settings);

  return {
    taxYear,
    contributed,
    limit,
    remaining: Math.max(0, limit.amount - contributed),
    excess: Math.max(0, contributed - limit.amount),
    progress: limit.amount > 0 ? Math.min(1, contributed / limit.amount) : 0,
    overLimit: contributed > limit.amount,
    contributionCount: relevant.length,
  };
};

/** Tax years present in the log, newest first, always including `currentYear`. */
export const contributionYears = (transactions: Transaction[], currentYear: number): number[] => {
  const years = new Set<number>([currentYear]);
  transactions
    .filter(tx => tx.type === 'CONTRIBUTION')
    .forEach(tx => years.add(taxYearOf(tx)));
  return Array.from(years).sort((a, b) => b - a);
};

/**
 * Lifetime contributions minus withdrawals — the "basis" in a Roth IRA.
 *
 * This is the amount that can be withdrawn at any time without tax or penalty,
 * as distinct from earnings, which generally cannot until the account is five
 * years old and the holder is 59 1/2. Growth and dividends never add to it.
 */
export const contributionBasis = (transactions: Transaction[]): number => {
  const contributed = transactions
    .filter(tx => tx.type === 'CONTRIBUTION')
    .reduce((acc, tx) => acc + tx.amount, 0);

  const withdrawn = transactions
    .filter(tx => tx.type === 'WITHDRAWAL')
    .reduce((acc, tx) => acc + tx.amount, 0);

  return Math.max(0, contributed - withdrawn);
};
