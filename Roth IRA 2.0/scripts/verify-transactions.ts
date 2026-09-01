/**
 * Checks for the contribution and transaction-replay logic.
 *
 * These are pure functions handling money, so they are worth pinning down.
 * Run with:  npm run verify:transactions
 */

import {
  replayTransactions,
  applyTransaction,
  reconcile,
  sortTransactions,
} from '../src/lib/transactions';
import {
  summarizeContributions,
  getContributionLimit,
  contributionBasis,
  contributionYears,
  DEFAULT_CONTRIBUTION_LIMITS,
} from '../src/lib/contributions';
import { PortfolioData, Transaction, UserSettings } from '../src/types';

let passed = 0;
let failed = 0;

const check = (name: string, condition: boolean, detail = '') => {
  if (condition) {
    passed++;
    console.log(`ok   ${name}`);
  } else {
    failed++;
    console.log(`FAIL ${name}${detail ? `  — ${detail}` : ''}`);
  }
};

const near = (actual: number, expected: number, tolerance = 1e-6) =>
  Math.abs(actual - expected) < tolerance;

const settings: Pick<UserSettings, 'catchUpEligible' | 'contributionLimitOverrides'> = {
  catchUpEligible: false,
  contributionLimitOverrides: {},
};

let counter = 0;
const tx = (partial: Omit<Transaction, 'id'>): Transaction => ({
  id: `t${String(++counter).padStart(3, '0')}`,
  ...partial,
});

// ---------------------------------------------------------------------------
console.log('\n--- FIFO cost basis ---');

{
  // Buy 10 @ $100, buy 10 @ $200, sell 15 @ $300.
  // FIFO: 10 from the $100 lot + 5 from the $200 lot = $2,000 basis.
  // Proceeds $4,500, so the gain is $2,500 and 5 shares remain at $200.
  const log = [
    tx({ date: '2025-01-10', type: 'BUY', symbol: 'AAPL', shares: 10, pricePerShare: 100, amount: 1000 }),
    tx({ date: '2025-02-10', type: 'BUY', symbol: 'AAPL', shares: 10, pricePerShare: 200, amount: 2000 }),
    tx({ date: '2025-03-10', type: 'SELL', symbol: 'AAPL', shares: 15, pricePerShare: 300, amount: 4500 }),
  ];

  const result = replayTransactions(log);
  const gain = result.realizedGains[0];

  check('matches oldest lots first', near(gain.costBasis, 2000), `basis=${gain.costBasis}`);
  check('realized gain is proceeds minus basis', near(gain.gain, 2500), `gain=${gain.gain}`);
  check('leaves the remainder open', near(result.positions[0].shares, 5), `shares=${result.positions[0]?.shares}`);
  check('remaining basis is the newer lot', near(result.positions[0].averagePrice, 200));
  check('no warnings for a covered sale', result.warnings.length === 0);
}

{
  // Selling more than the log holds: basis is only known for what it covers.
  const log = [
    tx({ date: '2025-01-10', type: 'BUY', symbol: 'VOO', shares: 2, pricePerShare: 400, amount: 800 }),
    tx({ date: '2025-06-10', type: 'SELL', symbol: 'VOO', shares: 5, pricePerShare: 500, amount: 2500 }),
  ];

  const result = replayTransactions(log);
  check('flags an oversell', result.realizedGains[0].unmatched === true);
  check('warns about the unmatched shares', result.warnings.length === 1);
  check('closes the position out', result.positions.length === 0);
}

{
  // A log recording only totals should still produce a usable basis.
  const log = [
    tx({ date: '2025-01-10', type: 'BUY', symbol: 'MSFT', shares: 4, amount: 1000 }),
    tx({ date: '2025-05-10', type: 'SELL', symbol: 'MSFT', shares: 4, amount: 1400 }),
  ];
  const result = replayTransactions(log);
  check('infers per-share price from the total', near(result.realizedGains[0].costBasis, 1000));
}

// ---------------------------------------------------------------------------
console.log('\n--- cash movement ---');

{
  const log = [
    tx({ date: '2025-01-02', type: 'CONTRIBUTION', amount: 7000, taxYear: 2025 }),
    tx({ date: '2025-01-05', type: 'BUY', symbol: 'VOO', shares: 10, pricePerShare: 500, amount: 5000 }),
    tx({ date: '2025-06-01', type: 'DIVIDEND', symbol: 'VOO', amount: 150 }),
    tx({ date: '2025-07-01', type: 'SELL', symbol: 'VOO', shares: 2, pricePerShare: 600, amount: 1200 }),
    tx({ date: '2025-08-01', type: 'WITHDRAWAL', amount: 500 }),
  ];

  const result = replayTransactions(log);
  // 7000 - 5000 + 150 + 1200 - 500 = 2850
  check('nets cash across every event type', near(result.cashBalance, 2850), `cash=${result.cashBalance}`);
  check('dividend does not create a position', result.positions.length === 1);
  check('sell reduces share count', near(result.positions[0].shares, 8));
}

{
  // Replay must not depend on input order.
  const shuffled = [
    tx({ date: '2025-03-10', type: 'SELL', symbol: 'X', shares: 5, pricePerShare: 30, amount: 150 }),
    tx({ date: '2025-01-10', type: 'BUY', symbol: 'X', shares: 5, pricePerShare: 10, amount: 50 }),
    tx({ date: '2025-02-10', type: 'BUY', symbol: 'X', shares: 5, pricePerShare: 20, amount: 100 }),
  ];
  const result = replayTransactions(shuffled);
  check('sorts before replaying', near(result.realizedGains[0].costBasis, 50), `basis=${result.realizedGains[0].costBasis}`);
  check('sortTransactions is chronological', sortTransactions(shuffled)[0].date === '2025-01-10');
}

// ---------------------------------------------------------------------------
console.log('\n--- contribution limits ---');

{
  const log = [
    tx({ date: '2025-03-01', type: 'CONTRIBUTION', amount: 3000, taxYear: 2025 }),
    tx({ date: '2025-09-01', type: 'CONTRIBUTION', amount: 2000, taxYear: 2025 }),
    tx({ date: '2025-06-01', type: 'DIVIDEND', symbol: 'VOO', amount: 900 }),
    tx({ date: '2025-06-15', type: 'SELL', symbol: 'VOO', shares: 1, pricePerShare: 600, amount: 600 }),
  ];

  const summary = summarizeContributions(log, 2025, settings);
  check('counts only contributions', near(summary.contributed, 5000), `contributed=${summary.contributed}`);
  check('dividends and sales do not count', !near(summary.contributed, 6500));
  check('remaining is limit minus contributed', near(summary.remaining, 7000 - 5000));
  check('not flagged over limit', summary.overLimit === false);
}

{
  // A January contribution designated for the prior tax year.
  const log = [
    tx({ date: '2026-02-01', type: 'CONTRIBUTION', amount: 1000, taxYear: 2025 }),
    tx({ date: '2026-02-01', type: 'CONTRIBUTION', amount: 500, taxYear: 2026 }),
  ];

  check('honours prior-year designation', near(summarizeContributions(log, 2025, settings).contributed, 1000));
  check('does not double-count into the calendar year', near(summarizeContributions(log, 2026, settings).contributed, 500));
}

{
  const log = [tx({ date: '2025-05-01', type: 'CONTRIBUTION', amount: 9000, taxYear: 2025 })];
  const summary = summarizeContributions(log, 2025, settings);
  check('detects an excess contribution', summary.overLimit === true);
  check('reports the excess amount', near(summary.excess, 2000), `excess=${summary.excess}`);
  check('clamps progress at 1', summary.progress === 1);
}

{
  // Withdrawing an excess before the deadline is the correction path.
  const log = [
    tx({ date: '2025-05-01', type: 'CONTRIBUTION', amount: 9000, taxYear: 2025 }),
    tx({ date: '2026-03-01', type: 'WITHDRAWAL', amount: 2000, taxYear: 2025 }),
  ];
  const summary = summarizeContributions(log, 2025, settings);
  check('a tagged withdrawal corrects an excess', near(summary.contributed, 7000) && !summary.overLimit);
}

{
  const catchUp = { catchUpEligible: true, contributionLimitOverrides: {} };
  check('catch-up raises the limit', getContributionLimit(2025, catchUp).amount === 8000);
  check('standard limit for under 50', getContributionLimit(2025, settings).amount === 7000);
}

{
  const knownYears = Object.keys(DEFAULT_CONTRIBUTION_LIMITS).map(Number);
  const futureYear = Math.max(...knownYears) + 5;
  const limit = getContributionLimit(futureYear, settings);

  check('unknown year is marked unverified', limit.verified === false);
  check('unknown year carries forward', limit.source === 'carried-forward');
  check('names the year it carried from', limit.carriedFromYear === Math.max(...knownYears));

  const overridden = getContributionLimit(futureYear, {
    catchUpEligible: false,
    contributionLimitOverrides: { [futureYear]: 7500 },
  });
  check('user override wins and is trusted', overridden.amount === 7500 && overridden.verified);
}

// ---------------------------------------------------------------------------
console.log('\n--- contribution basis ---');

{
  const log = [
    tx({ date: '2024-01-01', type: 'CONTRIBUTION', amount: 7000, taxYear: 2024 }),
    tx({ date: '2025-01-01', type: 'CONTRIBUTION', amount: 7000, taxYear: 2025 }),
    tx({ date: '2025-06-01', type: 'DIVIDEND', symbol: 'VOO', amount: 400 }),
    tx({ date: '2025-07-01', type: 'WITHDRAWAL', amount: 1000 }),
  ];

  check('basis is contributions less withdrawals', near(contributionBasis(log), 13000), `basis=${contributionBasis(log)}`);
  check('growth never adds to basis', !near(contributionBasis(log), 13400));
  check('lists every contribution year', contributionYears(log, 2026).join(',') === '2026,2025,2024');
}

// ---------------------------------------------------------------------------
console.log('\n--- applyTransaction ---');

{
  const start: PortfolioData = { cashBalance: 1000, holdings: [] };

  const afterBuy = applyTransaction(start, tx({
    date: '2025-01-01', type: 'BUY', symbol: 'aapl', shares: 2, pricePerShare: 100, amount: 200,
  }));
  check('buy opens a position', afterBuy.holdings.length === 1);
  check('buy normalizes the symbol', afterBuy.holdings[0].symbol === 'AAPL');
  check('buy debits cash', near(afterBuy.cashBalance, 800));

  const afterSecond = applyTransaction(afterBuy, tx({
    date: '2025-02-01', type: 'BUY', symbol: 'AAPL', shares: 2, pricePerShare: 200, amount: 400,
  }));
  check('second buy merges into one position', afterSecond.holdings.length === 1);
  check('recomputes weighted average cost', near(afterSecond.holdings[0].averagePrice, 150));

  const afterSell = applyTransaction(afterSecond, tx({
    date: '2025-03-01', type: 'SELL', symbol: 'AAPL', shares: 4, pricePerShare: 250, amount: 1000,
  }));
  check('selling out removes the position', afterSell.holdings.length === 0);
  check('sell credits cash', near(afterSell.cashBalance, 1400));

  const afterContribution = applyTransaction(start, tx({
    date: '2025-01-01', type: 'CONTRIBUTION', amount: 500, taxYear: 2025,
  }));
  check('contribution credits cash only', near(afterContribution.cashBalance, 1500) && afterContribution.holdings.length === 0);
}

// ---------------------------------------------------------------------------
console.log('\n--- reconciliation ---');

{
  const portfolio: PortfolioData = {
    cashBalance: 0,
    holdings: [{ symbol: 'AAPL', shares: 10, averagePrice: 100 }],
  };
  const { positions } = replayTransactions([
    tx({ date: '2025-01-01', type: 'BUY', symbol: 'AAPL', shares: 6, pricePerShare: 100, amount: 600 }),
  ]);

  const rows = reconcile(portfolio, positions);
  check('reports drift between log and holdings', rows.length === 1 && near(rows[0].difference, 4), JSON.stringify(rows));

  const matched = reconcile(portfolio, replayTransactions([
    tx({ date: '2025-01-01', type: 'BUY', symbol: 'AAPL', shares: 10, pricePerShare: 100, amount: 1000 }),
  ]).positions);
  check('silent when they agree', matched.length === 0);
}

{
  // Partial sale of lots bought at different prices: weighted average and FIFO
  // legitimately disagree on the remaining cost. Shares still match, so this
  // must be reported as a cost-method difference, not as missing activity.
  const log = [
    tx({ date: '2026-01-26', type: 'BUY', symbol: 'MSFT', shares: 1, pricePerShare: 465.95, amount: 465.95 }),
    tx({ date: '2026-02-02', type: 'BUY', symbol: 'MSFT', shares: 1, pricePerShare: 423.37, amount: 423.37 }),
    tx({ date: '2026-07-15', type: 'SELL', symbol: 'MSFT', shares: 1.5, pricePerShare: 500, amount: 750 }),
  ];

  let portfolio: PortfolioData = { cashBalance: 0, holdings: [] };
  for (const entry of log) portfolio = applyTransaction(portfolio, entry);

  const { positions } = replayTransactions(log);
  const rows = reconcile(portfolio, positions);

  check('share counts still agree after a partial sale', near(rows[0].difference, 0));
  check('flags the cost-method difference', rows[0].costMethodOnly === true);
  check('weighted average is carried on the holding', near(rows[0].heldAveragePrice, 444.66, 0.01));
  check('FIFO leaves the newer lot open', near(rows[0].loggedAveragePrice, 423.37, 0.01));
}

// ---------------------------------------------------------------------------
console.log('\n--- edge cases ---');

{
  const empty = replayTransactions([]);
  check('empty log yields zero state', empty.cashBalance === 0 && empty.positions.length === 0);

  const noShares = replayTransactions([
    tx({ date: '2025-01-01', type: 'BUY', symbol: 'AAPL', shares: 0, amount: 0 }),
  ]);
  check('ignores a zero-share buy', noShares.positions.length === 0);

  const sellNothing = replayTransactions([
    tx({ date: '2025-01-01', type: 'SELL', symbol: 'GHOST', shares: 1, pricePerShare: 10, amount: 10 }),
  ]);
  check('selling an unheld symbol has zero basis', near(sellNothing.realizedGains[0].costBasis, 0));
  check('and is flagged unmatched', sellNothing.realizedGains[0].unmatched === true);

  // Fractional shares sold to exactly zero must not leave float residue.
  const fractional = replayTransactions([
    tx({ date: '2025-01-01', type: 'BUY', symbol: 'META', shares: 0.13614454188155378, pricePerShare: 659.25, amount: 89.75 }),
    tx({ date: '2025-02-01', type: 'SELL', symbol: 'META', shares: 0.13614454188155378, pricePerShare: 700, amount: 95.3 }),
  ]);
  check('fractional round-trip closes cleanly', fractional.positions.length === 0);
}

// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
