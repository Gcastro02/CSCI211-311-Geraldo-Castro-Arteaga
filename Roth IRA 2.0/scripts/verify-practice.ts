/**
 * Checks for the practice-mode engine — above all, that nothing after the
 * simulated day can reach the player.
 * Run with:  npm run verify:practice
 */

import {
  PracticeScenario,
  SCENARIOS,
  accountState,
  advance,
  buildCustomScenario,
  buildMarket,
  buyAndHoldValue,
  drawdownFromHigh,
  goalStatus,
  isFinished,
  isValidSession,
  maxBuyShares,
  mysteryLabels,
  orderImpact,
  placeOrder,
  rescaleForMystery,
  startSession,
  visibleBars,
  worstDrawdown,
} from '../src/lib/practice';
import { needsOrderConfirmation } from '../src/lib/level';
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

const DATES = ['2026-01-02', '2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09', '2026-01-12'];
const series = (closes: number[]) => bars(DATES.map((d, i) => [d, closes[i]]));

// Two days of history, then trading from Jan 6. Day 5 is TEST's highest close
// of the whole series, so any look-ahead in a drawdown would show up before it.
const market = buildMarket({ TEST: series([100, 104, 100, 90, 80, 150, 120]) })!;

const scenario: PracticeScenario = {
  id: 'test',
  name: 'Test',
  summary: '',
  assets: [{ symbol: 'TEST', name: 'Test', isFund: false }],
  historyStart: '2026-01-02',
  start: '2026-01-06',
  end: '2026-01-12',
  startingCash: 1000,
};

// ---------------------------------------------------------------------------
// The calendar never invents a price
{
  const merged = buildMarket({
    A: bars([['2026-01-02', 10], ['2026-01-05', 11], ['2026-01-06', 12]]),
    B: bars([['2026-01-02', 50], ['2026-01-06', 52], ['2026-01-07', 53]]),
  })!;
  check('calendar keeps only days every asset traded', merged.dates.join() === '2026-01-02,2026-01-06');
  check('every asset is aligned to the calendar', merged.bars.A.map(b => b.date).join() === merged.dates.join() && merged.bars.B[1].close === 52);
  check('an asset with no data means no market', buildMarket({ A: bars([['2026-01-02', 10]]), B: [] }) === null);
  check('fewer than two common days means no market', buildMarket({ A: bars([['2026-01-02', 10]]) }) === null);
}

// ---------------------------------------------------------------------------
// No look-ahead
{
  let ok = true;
  for (let day = 0; day < market.dates.length; day++) {
    const seen = visibleBars(market.bars.TEST, day);
    if (seen.length !== day + 1 || seen.some(bar => bar.date > market.dates[day])) ok = false;
  }
  check('visible bars stop at the simulated day, for every day', ok);
  check('visible bars clamp a day past the end', visibleBars(market.bars.TEST, 99).length === DATES.length);
  check('visible bars clamp a negative day to the first bar', visibleBars(market.bars.TEST, -3).length === 1);

  // Highest close so far on Jan 8 is 104 (Jan 5); the later 150 must not count.
  check('drawdown ignores highs after the simulated day', near(drawdownFromHigh(market.bars.TEST, 4), 80 / 104 - 1));
  check('drawdown uses a new high once it happens', near(drawdownFromHigh(market.bars.TEST, 6), 120 / 150 - 1));
}

// ---------------------------------------------------------------------------
// Session start and clock
const session = startSession(scenario, market)!;
{
  check('session starts on the first day on or after the start date', session.day === 2);
  check('starting cash is a single deposit', session.transactions.length === 1 && session.transactions[0].type === 'CONTRIBUTION' && session.transactions[0].amount === 1000);
  check('no start day means no session', startSession({ ...scenario, start: '2027-01-01' }, market) === null);

  check('advance moves forward by whole days', advance(session, market, 1).day === 3);
  check('advance stops at the last day', advance(session, market, 50).day === DATES.length - 1);
  check('advance never moves backward', advance(session, market, -5).day === session.day);
  check('finished only on the last day', !isFinished(session, market) && isFinished(advance(session, market, 50), market));
}

// ---------------------------------------------------------------------------
// Orders fill at the day's close
{
  const bought = placeOrder(session, market, scenario, 'TEST', 'BUY', 5);
  check('a valid buy succeeds', Boolean(bought.session));
  if (bought.session) {
    const fill = bought.session.transactions[1];
    check('buy fills at the simulated day’s close', fill.pricePerShare === 100 && fill.date === '2026-01-06' && fill.amount === 500);
    const account = accountState(bought.session, market, scenario);
    check('cash drops by the cost', near(account.cash, 500) && account.positions[0].shares === 5);
    check('the original session is not changed', session.transactions.length === 1);

    // Two days later the price is 80: value = 500 cash + 5 x 80.
    const later = advance(bought.session, market, 2);
    const laterAccount = accountState(later, market, scenario);
    check('account is valued at the current day’s close', near(laterAccount.value, 900) && near(laterAccount.returnPct, -0.1));
    // Buy on Jan 7 (day 3), then value Jan 6 (day 2): that buy must not count.
    const boughtLater = placeOrder(advance(session, market, 1), market, scenario, 'TEST', 'BUY', 5).session!;
    const earlier = accountState(boughtLater, market, scenario, 2);
    check('valuing an earlier day ignores later trades', near(earlier.cash, 1000) && earlier.positions[0].shares === 0);

    const sold = placeOrder(later, market, scenario, 'TEST', 'SELL', 5);
    check('a valid sell succeeds', Boolean(sold.session));
    if (sold.session) {
      const after = accountState(sold.session, market, scenario);
      check('selling everything leaves only cash', after.positions[0].shares === 0 && near(after.cash, 900));
      check('the realized loss is counted', near(after.realized, -100));
    }
  }

  const tooMuch = placeOrder(session, market, scenario, 'TEST', 'BUY', 11);
  check('a buy costing more than the cash is refused', !tooMuch.session && /afford 10 shares/.test(tooMuch.error ?? ''));
  check('selling shares not held is refused', Boolean(placeOrder(session, market, scenario, 'TEST', 'SELL', 1).error));
  check('fractional shares are refused', Boolean(placeOrder(session, market, scenario, 'TEST', 'BUY', 1.5).error));
  check('zero shares are refused', Boolean(placeOrder(session, market, scenario, 'TEST', 'BUY', 0).error));
  check('a symbol outside the scenario is refused', Boolean(placeOrder(session, market, scenario, 'NOPE', 'BUY', 1).error));
  check('max buy is whole shares the cash covers', maxBuyShares(1000, 100) === 10 && maxBuyShares(999.99, 100) === 9 && maxBuyShares(1000, 0) === 0);
}

// ---------------------------------------------------------------------------
// Several assets in one account
const multiMarket = buildMarket({
  AAA: series([10, 10, 10, 12, 8, 9, 11]),
  BBB: series([50, 50, 50, 45, 40, 60, 55]),
})!;
const multi: PracticeScenario = {
  ...scenario,
  assets: [{ symbol: 'AAA', name: 'A', isFund: false }, { symbol: 'BBB', name: 'B', isFund: true }],
};
{
  const s0 = startSession(multi, multiMarket)!;
  const s1 = placeOrder(s0, multiMarket, multi, 'AAA', 'BUY', 30).session!;
  const s2 = placeOrder(s1, multiMarket, multi, 'BBB', 'BUY', 10).session!;
  const later = accountState(advance(s2, multiMarket, 1), multiMarket, multi);
  // 1000 - 300 - 500 = 200 cash; then 30 x 12 + 10 x 45 = 810.
  check('positions in several assets add up', near(later.cash, 200) && near(later.value, 1010));
  check('positions are listed in scenario order', later.positions.map(p => p.symbol).join() === 'AAA,BBB');

  // Even split: 500 each at day 2 -> 50 AAA, 10 BBB. Day 6: 50 x 11 + 10 x 55 = 1100.
  check('buy-and-hold splits the cash evenly across assets', near(buyAndHoldValue(multiMarket, multi, 6), 1100));
  check('buy-and-hold equals starting cash on day one', near(buyAndHoldValue(multiMarket, multi, 2), 1000));
}

// ---------------------------------------------------------------------------
// Order impact (shown before confirming) matches what gets recorded
{
  const buy = orderImpact(session, market, scenario, 'TEST', 'BUY', 4)!;
  check('buy impact: cost, cash and weight after', near(buy.amount, 400) && near(buy.cashAfter, 600) && buy.sharesAfter === 4 && near(buy.weightAfter, 0.4) && buy.realizedGain === null);
  check('impact of a refused order is null', orderImpact(session, market, scenario, 'TEST', 'BUY', 11) === null);
  check('working out the impact doesn’t place the order', session.transactions.length === 1);

  // Buy 4 at 100 (Jan 6), 4 more at 90 (Jan 7), then sell 5 at 80 (Jan 8):
  // FIFO sells 4 @100 and 1 @90 -> basis 490, proceeds 400, loss 90.
  let s2 = placeOrder(session, market, scenario, 'TEST', 'BUY', 4).session!;
  s2 = placeOrder(advance(s2, market, 1), market, scenario, 'TEST', 'BUY', 4).session!;
  const sell = orderImpact(advance(s2, market, 1), market, scenario, 'TEST', 'SELL', 5)!;
  check('sell impact locks in the FIFO gain the log will record', near(sell.realizedGain!, -90) && sell.sharesAfter === 3);
}

// ---------------------------------------------------------------------------
// When a practice order stops for confirmation
{
  const big = { side: 'BUY' as const, weightAfter: 0.4 };
  const small = { side: 'BUY' as const, weightAfter: 0.1 };
  const sale = { side: 'SELL' as const, weightAfter: 0.4 };
  check('beginners confirm every order', needsOrderConfirmation('BEGINNER', small, 0.25) && needsOrderConfirmation('BEGINNER', sale, 0.25));
  check('intermediates confirm only buys over the limit', needsOrderConfirmation('INTERMEDIATE', big, 0.25) && !needsOrderConfirmation('INTERMEDIATE', small, 0.25) && !needsOrderConfirmation('INTERMEDIATE', sale, 0.25));
  check('no limit (a fund) means no intermediate prompt', !needsOrderConfirmation('INTERMEDIATE', big, Infinity));
  check('advanced users are never prompted', !needsOrderConfirmation('ADVANCED', big, 0.25));
}

// ---------------------------------------------------------------------------
// Goals are judged only on days already played
{
  // All in on Jan 6 at 100: 10 shares. Jan 7 = 900 (-10%), Jan 8 = 800 (-20%).
  const allIn = placeOrder(session, market, scenario, 'TEST', 'BUY', 10).session!;
  const day3 = advance(allIn, market, 1);
  const day4 = advance(allIn, market, 2);
  check('worst drawdown covers only days played', near(worstDrawdown(day3, market, scenario), -0.1) && near(worstDrawdown(day4, market, scenario), -0.2));

  const limit15 = { kind: 'MAX_DRAWDOWN' as const, limit: 0.15 };
  check('drawdown goal undecided while within the limit', goalStatus(limit15, day3, market, scenario).met === null);
  check('drawdown goal fails as soon as the limit is broken', goalStatus(limit15, day4, market, scenario).met === false);
  // The later rally to 150 must not undo a failure that already happened.
  check('a later rally doesn’t undo a broken limit', goalStatus(limit15, advance(allIn, market, 50), market, scenario).met === false);
  check('drawdown goal met when the limit holds to the end', goalStatus(limit15, advance(session, market, 50), market, scenario).met === true);

  const above = { kind: 'FINISH_ABOVE' as const, value: 1100 };
  check('finish goal undecided before the end, even when ahead', goalStatus(above, advance(allIn, market, 3), market, scenario).met === null);
  // Day 6 close 120: 10 shares = 1200.
  check('finish goal judged on the last day', goalStatus(above, advance(allIn, market, 50), market, scenario).met === true);

  const beat = { kind: 'BEAT_BUY_AND_HOLD' as const };
  check('matching buy-and-hold doesn’t beat it', goalStatus(beat, advance(allIn, market, 50), market, scenario).met === false);
  check('holding cash through a rise loses to buy-and-hold', goalStatus(beat, advance(session, market, 50), market, scenario).met === false);
}

// ---------------------------------------------------------------------------
// Mystery mode and custom scenarios
{
  const scaled = rescaleForMystery(multiMarket, 2);
  check('mystery prices start at 100 on the first trading day', near(scaled.bars.AAA[2].close!, 100) && near(scaled.bars.BBB[2].close!, 100));
  check('mystery rescaling keeps every return', near(scaled.bars.AAA[6].close! / scaled.bars.AAA[2].close!, 11 / 10) && near(scaled.bars.BBB[3].price / scaled.bars.BBB[2].price, 45 / 50));
  check('mystery rescaling doesn’t touch the original', multiMarket.bars.AAA[2].close === 10);
  check('mystery labels say fund or stock, not the name', JSON.stringify(mysteryLabels(multi)) === JSON.stringify({ AAA: 'Stock A', BBB: 'Fund B' }));

  const ok = buildCustomScenario({ symbols: 'aapl, spy aapl', start: '2019-01-02', end: '2019-06-28', startingCash: 5000 }, '2026-10-20');
  check('custom scenario: tickers cleaned and de-duplicated', ok.scenario?.assets.map(a => a.symbol).join() === 'AAPL,SPY');
  check('custom scenario: known funds marked as funds', ok.scenario?.assets[1].isFund === true && ok.scenario?.assets[0].isFund === false);
  check('custom scenario: history starts before trading', Boolean(ok.scenario && ok.scenario.historyStart < ok.scenario.start));
  const bad = (input: Partial<Parameters<typeof buildCustomScenario>[0]>) =>
    buildCustomScenario({ symbols: 'AAPL', start: '2019-01-02', end: '2019-06-28', startingCash: 5000, ...input }, '2026-10-20').error;
  check('custom scenario: needs a ticker', Boolean(bad({ symbols: ' , ' })));
  check('custom scenario: at most three tickers', Boolean(bad({ symbols: 'A B C D' })));
  check('custom scenario: must end before today', Boolean(bad({ end: '2026-10-20' })));
  check('custom scenario: at least a month long', Boolean(bad({ end: '2019-01-20' })));
  check('custom scenario: sensible starting cash', Boolean(bad({ startingCash: 0 })));
}

// ---------------------------------------------------------------------------
// Presets and stored sessions
{
  check('every preset has a unique id', new Set(SCENARIOS.map(s => s.id)).size === SCENARIOS.length);
  check('every preset starts after its history and ends after it starts', SCENARIOS.every(s => s.historyStart < s.start && s.start < s.end));
  check('every preset has a goal for beginners', SCENARIOS.every(s => Boolean(s.goal)));
  check('the original 2020 scenario keeps its id (saved sessions still load)', SCENARIOS.some(s => s.id === 'spy-2020'));

  check('a saved session that fits the market is accepted', isValidSession(session, market));
  check('a saved session past the last day is rejected', !isValidSession({ ...session, day: 99 }, market));
  check('garbage is rejected', !isValidSession({ foo: 1 }, market) && !isValidSession(null, market));
}

// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
