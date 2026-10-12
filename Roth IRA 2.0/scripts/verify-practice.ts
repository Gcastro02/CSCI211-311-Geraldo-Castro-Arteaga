/**
 * Checks for the practice-mode engine — above all, that nothing after the
 * simulated day can reach the player.
 * Run with:  npm run verify:practice
 */

import {
  PracticeScenario,
  accountState,
  advance,
  buyAndHoldValue,
  drawdownFromHigh,
  isFinished,
  isValidSession,
  maxBuyShares,
  placeOrder,
  startSession,
  visibleBars,
} from '../src/lib/practice';
import { PriceData } from '../src/types';

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

const near = (actual: number, expected: number, tolerance = 1e-6) => Math.abs(actual - expected) < tolerance;

const bars = (pairs: Array<[string, number]>): PriceData[] =>
  pairs.map(([date, close]) => ({ date, price: close, close }));

// Two days of history, then trading from Jan 6. Day 5 is the highest close of
// the whole series, so any look-ahead in a drawdown would show up before it.
const series = bars([
  ['2026-01-02', 100],
  ['2026-01-05', 104],
  ['2026-01-06', 100],
  ['2026-01-07', 90],
  ['2026-01-08', 80],
  ['2026-01-09', 150],
  ['2026-01-12', 120],
]);

const scenario: PracticeScenario = {
  id: 'test',
  name: 'Test',
  summary: '',
  symbol: 'TEST',
  symbolName: 'Test',
  historyStart: '2026-01-02',
  start: '2026-01-06',
  end: '2026-01-12',
  startingCash: 1000,
};

// ---------------------------------------------------------------------------
// No look-ahead
{
  let ok = true;
  for (let day = 0; day < series.length; day++) {
    const seen = visibleBars(series, day);
    if (seen.length !== day + 1 || seen.some(bar => bar.date > series[day].date)) ok = false;
  }
  check('visible bars stop at the simulated day, for every day', ok);
  check('visible bars clamp a day past the end', visibleBars(series, 99).length === series.length);
  check('visible bars clamp a negative day to the first bar', visibleBars(series, -3).length === 1);

  // Highest close so far on Jan 8 is 104 (Jan 5); the later 150 must not count.
  check('drawdown ignores highs after the simulated day', near(drawdownFromHigh(series, 4), 80 / 104 - 1));
  check('drawdown uses a new high once it happens', near(drawdownFromHigh(series, 6), 120 / 150 - 1));
}

// ---------------------------------------------------------------------------
// Session start and clock
const session = startSession(scenario, series)!;
{
  check('session starts on the first bar on or after the start date', session.day === 2);
  check('starting cash is a single deposit', session.transactions.length === 1 && session.transactions[0].type === 'CONTRIBUTION' && session.transactions[0].amount === 1000);
  check('no start bar means no session', startSession({ ...scenario, start: '2027-01-01' }, series) === null);

  check('advance moves forward by whole days', advance(session, series, 1).day === 3);
  check('advance stops at the last bar', advance(session, series, 50).day === series.length - 1);
  check('advance never moves backward', advance(session, series, -5).day === session.day);
  check('finished only on the last bar', !isFinished(session, series) && isFinished(advance(session, series, 50), series));
}

// ---------------------------------------------------------------------------
// Orders fill at the day's close
{
  const bought = placeOrder(session, series, scenario, 'BUY', 5);
  check('a valid buy succeeds', Boolean(bought.session));
  if (bought.session) {
    const fill = bought.session.transactions[1];
    check('buy fills at the simulated day’s close', fill.pricePerShare === 100 && fill.date === '2026-01-06' && fill.amount === 500);
    const account = accountState(bought.session, series, scenario);
    check('cash drops by the cost', near(account.cash, 500) && account.shares === 5);
    check('the original session is not changed', session.transactions.length === 1);

    // Two days later the price is 80: value = 500 cash + 5 x 80.
    const later = advance(bought.session, series, 2);
    const laterAccount = accountState(later, series, scenario);
    check('account is valued at the current day’s close', near(laterAccount.value, 900) && near(laterAccount.returnPct, -0.1));

    const sold = placeOrder(later, series, scenario, 'SELL', 5);
    check('a valid sell succeeds', Boolean(sold.session));
    if (sold.session) {
      const after = accountState(sold.session, series, scenario);
      check('selling everything leaves only cash', after.shares === 0 && near(after.cash, 900));
      check('the realized loss is counted', near(after.realized, -100));
    }
  }

  const tooMuch = placeOrder(session, series, scenario, 'BUY', 11);
  check('a buy costing more than the cash is refused', !tooMuch.session && /afford 10 shares/.test(tooMuch.error ?? ''));
  check('selling shares not held is refused', Boolean(placeOrder(session, series, scenario, 'SELL', 1).error));
  check('fractional shares are refused', Boolean(placeOrder(session, series, scenario, 'BUY', 1.5).error));
  check('zero shares are refused', Boolean(placeOrder(session, series, scenario, 'BUY', 0).error));
  check('max buy is whole shares the cash covers', maxBuyShares(1000, 100) === 10 && maxBuyShares(999.99, 100) === 9 && maxBuyShares(1000, 0) === 0);
}

// ---------------------------------------------------------------------------
// Buy-and-hold yardstick and stored-session validation
{
  // 10 shares bought at 100 on Jan 6; on Jan 12 the close is 120.
  check('buy-and-hold buys whole shares on the first trading day', near(buyAndHoldValue(series, scenario, 6), 1200));
  check('buy-and-hold equals starting cash on day one', near(buyAndHoldValue(series, scenario, 2), 1000));

  check('a saved session that fits the bars is accepted', isValidSession(session, series));
  check('a saved session past the last bar is rejected', !isValidSession({ ...session, day: 99 }, series));
  check('garbage is rejected', !isValidSession({ foo: 1 }, series) && !isValidSession(null, series));
}

// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
