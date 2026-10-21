/**
 * Checks for the practice opponent: it never sees a later price, and its exit
 * and sizing rules match trader.cpp.
 * Run with:  npm run verify:bot
 */

import { PracticeScenario, accountState, buildMarket } from '../src/lib/practice';
import { BOT_RULES, BotSignal, botSignal, runBot } from '../src/lib/practiceBot';
import { replayTransactions } from '../src/lib/transactions';
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

/** Consecutive calendar days from 2026-01-01; the engine doesn't care about weekends. */
const dateAt = (i: number) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
const series = (closes: number[]): PriceData[] => closes.map((close, i) => ({ date: dateAt(i), price: close, close }));

const scenarioFor = (assets: Array<[string, boolean]>, startIndex: number, endIndex: number, startingCash = 10000): PracticeScenario => ({
  id: 'test',
  name: 'Test',
  summary: '',
  assets: assets.map(([symbol, isFund]) => ({ symbol, name: symbol, isFund })),
  historyStart: dateAt(0),
  start: dateAt(startIndex),
  end: dateAt(endIndex),
  startingCash,
});

const always = (confidence: number) => (): BotSignal => ({ buy: true, confidence, score: confidence * 200 - 100, reasons: ['test'] });
const never = (): BotSignal => ({ buy: false, confidence: 0.9, score: -80, reasons: [] });
/** Buy only on the first trading day, judged by how many bars the bot was shown. */
const onlyOnBar = (count: number, confidence: number) => (bars: PriceData[]): BotSignal =>
  bars.length === count ? always(confidence)() : never();

const trades = (run: ReturnType<typeof runBot>) => run.session.transactions.filter(tx => tx.type === 'BUY' || tx.type === 'SELL');

// ---------------------------------------------------------------------------
// The signal
{
  const rising = series(Array.from({ length: 60 }, (_, i) => 100 + i * 0.5 + Math.sin(i) * 2));
  const falling = series(Array.from({ length: 60 }, (_, i) => 200 - i * 1.5 + Math.sin(i) * 2));
  const up = botSignal(rising);
  const down = botSignal(falling);
  check('signal: buy ⇔ score above zero', up.buy === up.score > 0 && down.buy === down.score > 0, `up ${up.score}, down ${down.score}`);
  check('signal: confidence is the score read as a probability', near(up.confidence, up.buy ? (up.score + 100) / 200 : (100 - up.score) / 200));
  check('signal: a buy comes with its reasons', !up.buy || up.reasons.length > 0);
  check('signal: one bar gives no buy', !botSignal(series([100])).buy);
  const long = series([...Array(200).fill(50), ...rising.map(b => b.close!)]);
  check('signal: only the last 120 bars matter', botSignal(long).score === botSignal(long.slice(-120)).score);
}

// ---------------------------------------------------------------------------
// No look-ahead: deciding day d never depends on anything after d
{
  const n = 160;
  const a = series(Array.from({ length: n }, (_, i) => 100 + 20 * Math.sin(i / 9) + i * 0.1));
  const b = series(Array.from({ length: n }, (_, i) => 50 + 12 * Math.cos(i / 6) - i * 0.05));
  const scenario = scenarioFor([['AAA', false], ['FFF', true]], 40, n - 1);
  const full = runBot(buildMarket({ AAA: a, FFF: b })!, scenario);
  check('replay: the real signal trades on this market', trades(full).length > 0, `${trades(full).length} trades`);

  let identical = true;
  for (const cut of [45, 70, 100, 130]) {
    // The same market with every bar after `cut` deleted — and, separately, replaced with garbage.
    const truncated = runBot(buildMarket({ AAA: a.slice(0, cut + 1), FFF: b.slice(0, cut + 1) })!, { ...scenario, end: dateAt(cut) });
    const scrambled = runBot(
      buildMarket({
        AAA: a.map((bar, i) => (i > cut ? { ...bar, price: 1, close: 1 } : bar)),
        FFF: b.map((bar, i) => (i > cut ? { ...bar, price: 999, close: 999 } : bar)),
      })!,
      scenario,
    );
    const upTo = (run: ReturnType<typeof runBot>) => JSON.stringify(run.session.transactions.filter(tx => tx.date <= dateAt(cut)));
    if (upTo(truncated) !== upTo(full) || upTo(scrambled) !== upTo(full)) identical = false;
  }
  check('no look-ahead: trades up to any day are the same whatever comes after', identical);
  check('replay: the same market always gives the same trades', JSON.stringify(full) === JSON.stringify(runBot(buildMarket({ AAA: a, FFF: b })!, scenario)));
  check('replay: stopping early stops trading', runBot(buildMarket({ AAA: a, FFF: b })!, scenario, 60).session.transactions.every(tx => tx.date <= dateAt(60)));

  const market = buildMarket({ AAA: a, FFF: b })!;
  let healthy = true;
  for (let day = 40; day < n; day++) {
    const state = accountState(full.session, market, scenario, day);
    if (state.cash < -1e-9 || state.positions.some(p => p.shares < 0)) healthy = false;
  }
  check('replay: cash and shares never go negative', healthy);
  check('replay: every trade is whole shares', trades(full).every(tx => Number.isInteger(tx.shares)));
  check('replay: every trade has a reason', full.decisions.length === trades(full).length
    && trades(full).every(tx => full.decisions.some(d => d.txId === tx.id)));
}

// ---------------------------------------------------------------------------
// Sizing: confidence × spendable cash, the 5% buffer, and the 25% cap
{
  const flat = series(Array(10).fill(100));
  const stock = scenarioFor([['AAA', false]], 3, 9);
  const fund = scenarioFor([['FFF', true]], 3, 9);

  // A company: spendable × 0.8 = $7,600, but the cap allows $2,500 → 25 shares.
  const capped = runBot(buildMarket({ AAA: flat })!, stock, 3, onlyOnBar(4, 0.8));
  check('sizing: a company is capped at 25% of the account', trades(capped)[0]?.shares === 25, `${trades(capped)[0]?.shares}`);
  check('sizing: a capped buy says so', capped.decisions[0]?.kind === 'BUY' && capped.decisions[0].capped);

  // A fund isn't capped: $10,000 × 0.95 × 0.8 = $7,600 → 76 shares.
  const sized = runBot(buildMarket({ FFF: flat })!, fund, 3, onlyOnBar(4, 0.8));
  check('sizing: a fund is sized by confidence × spendable cash', trades(sized)[0]?.shares === 76, `${trades(sized)[0]?.shares}`);
  check('sizing: an uncapped buy says so', sized.decisions[0]?.kind === 'BUY' && !sized.decisions[0].capped);

  // Buying every day: never below 5% of the cash before each buy, never over the cap.
  const daily = runBot(buildMarket({ FFF: flat })!, fund, 9, always(1));
  let cash = 10000;
  let buffered = true;
  for (const tx of trades(daily)) {
    if (cash - tx.amount < cash * BOT_RULES.cashBuffer - 1e-9) buffered = false;
    cash -= tx.amount;
  }
  check('sizing: every buy leaves 5% of the cash, even at full confidence', buffered && trades(daily).length >= 2, `${trades(daily).length} buys`);
  const dailyStock = runBot(buildMarket({ AAA: flat })!, stock, 9, always(1));
  const weight = accountState(dailyStock.session, buildMarket({ AAA: flat })!, stock, 9).positions[0].value / 10000;
  check('sizing: repeated buys don’t push a company past 25%', weight <= BOT_RULES.riskLimit + 1e-9, `${(weight * 100).toFixed(1)}%`);

  check('sizing: below 55% confidence it doesn’t buy', trades(runBot(buildMarket({ FFF: flat })!, fund, 9, always(0.54))).length === 0);
  check('sizing: at 55% it does', trades(runBot(buildMarket({ FFF: flat })!, fund, 9, always(0.55))).length > 0);
  check('sizing: a share it can’t afford isn’t bought', trades(runBot(buildMarket({ FFF: series(Array(10).fill(20000)) })!, fund, 9, always(1))).length === 0);
}

// ---------------------------------------------------------------------------
// Exits: stop-loss at −15%, take-profit at +30%, everything sold
{
  const fund = scenarioFor([['FFF', true]], 3, 9);
  const exitOn = (closes: number[]) => {
    const run = runBot(buildMarket({ FFF: series(closes) })!, fund, 9, onlyOnBar(4, 0.8));
    const sale = trades(run).find(tx => tx.type === 'SELL');
    return { run, sale, decision: run.decisions.find(d => d.txId === sale?.id) };
  };

  const stop = exitOn([100, 100, 100, 100, 95, 86, 84.9, 80, 70, 60]);
  check('exit: stop-loss sells everything at −15.1%', stop.sale?.date === dateAt(6) && stop.sale?.shares === 76, `${stop.sale?.date} ${stop.sale?.shares}`);
  check('exit: the stop-loss decision records the loss', stop.decision?.kind === 'STOP_LOSS' && near(stop.decision.returnPct, -0.151));
  check('exit: −14.9% is held', !exitOn([100, 100, 100, 100, 95, 85.1, 85.1, 85.1, 85.1, 85.1]).sale);

  const take = exitOn([100, 100, 100, 100, 110, 120, 129, 130, 140, 150]);
  check('exit: take-profit sells everything at +30%', take.sale?.date === dateAt(7) && take.decision?.kind === 'TAKE_PROFIT', `${take.sale?.date}`);
  check('exit: +29% is held', !exitOn([100, 100, 100, 100, 110, 120, 129, 129, 129, 129]).sale);

  const realized = replayTransactions(take.run.session.transactions).totalRealized;
  check('exit: the gain is booked against the average cost', near(realized, 76 * 30), `${realized}`);

  // 57 shares at 100, then 20 at 120, average about 105.19; −15% from that is about 89.4.
  // Measured from the first buy it would hold until 85; from the last, sell at 95.
  const twoBuys = runBot(
    buildMarket({ FFF: series([100, 100, 100, 100, 120, 95, 90, 89, 89, 89]) })!,
    fund,
    9,
    bars => (bars.length === 4 || bars.length === 5 ? always(0.6)() : never()),
  );
  const firstSale = trades(twoBuys).find(tx => tx.type === 'SELL');
  check('exit: measured from the average cost of all shares held', trades(twoBuys).filter(tx => tx.type === 'BUY').length === 2 && firstSale?.date === dateAt(7), `${firstSale?.date}`);

  // Sells come before buys on the same day, so the stop-loss frees cash for a re-entry.
  const reentry = runBot(buildMarket({ FFF: series([100, 100, 100, 100, 80, 80, 80, 80, 80, 80]) })!, fund, 4, always(0.8));
  const day4 = reentry.session.transactions.filter(tx => tx.date === dateAt(4)).map(tx => tx.type);
  check('exit: sells run before buys on the same day', day4[0] === 'SELL' && day4.includes('BUY'), day4.join(','));
}

// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
