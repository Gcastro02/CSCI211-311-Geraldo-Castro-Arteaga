/**
 * Checks for the Charts tab's data rules.
 * Run with:  npm run verify:chart
 */

import { CHART_INTERVALS, applyLivePrice, exchangeDate, findInterval, foldTrailingPoint, movingAverage } from '../src/lib/chartData';
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

const bar = (date: string, close: number, high = close, low = close): PriceData => ({ date, price: close, open: close, high, low, close, volume: 100 });

// Bar sizes
check('intervals: every one has Yahoo parameters', CHART_INTERVALS.every(i => i.yahoo.interval && (i.yahoo.range || i.yahoo.fromStart)));
check('intervals: none uses range=max, which Yahoo turns into 3-month bars', CHART_INTERVALS.every(i => i.yahoo.range !== 'max'));
check('intervals: 1m stays within the 7 days Yahoo allows', findInterval('1m').yahoo.range === '7d');
check('intervals: an unknown id falls back to 5m', findInterval('nope').id === '5m');

// Moving average
{
  const ma = movingAverage([1, 2, 3, 4, 5], 3);
  check('average: empty until enough values', ma[0] === null && ma[1] === null);
  check('average: rolls forward', ma[2] === 2 && ma[3] === 3 && ma[4] === 4);
  check('average: longer than the data is all empty', movingAverage([1, 2], 5).every(v => v === null));
}

// Live prices into 1-minute bars
{
  const m1 = findInterval('1m');
  const bars = [bar('2026-11-10T15:00:00.000Z', 100, 101, 99), bar('2026-11-10T15:01:00.000Z', 100.5, 100.8, 100.2)];
  const t = Date.parse('2026-11-10T15:01:30Z');
  const higher = applyLivePrice(bars, 101.2, t, m1);
  check('1m: within the bar, it updates the close', higher.length === 2 && higher[1].close === 101.2);
  check('1m: a new high raises the high', higher[1].high === 101.2 && higher[1].low === 100.2);
  check('1m: a new low lowers the low', applyLivePrice(bars, 99.9, t, m1)[1].low === 99.9);
  check('1m: earlier bars are untouched', higher[0] === bars[0]);
  const next = applyLivePrice(bars, 101, Date.parse('2026-11-10T15:02:05Z'), m1);
  check('1m: past the bar’s end, a new bar starts', next.length === 3 && next[2].date === '2026-11-10T15:02:00.000Z' && next[2].open === 101);
  const gap = applyLivePrice(bars, 101, Date.parse('2026-11-10T15:05:10Z'), m1);
  check('1m: after a quiet stretch, the bar lands on its own minute', gap[2].date === '2026-11-10T15:05:00.000Z');
  check('1m: the same price changes nothing', applyLivePrice(bars, 100.5, t, m1) === bars);
  check('1m: a clock behind the last bar changes nothing', applyLivePrice(bars, 105, Date.parse('2026-11-10T14:00:00Z'), m1) === bars);
}

// Hourly bars start at :30
{
  const h1 = findInterval('1h');
  const bars = [bar('2026-11-10T14:30:00.000Z', 100)];
  check('1h: 10:20 is still the 9:30 bar', applyLivePrice(bars, 102, Date.parse('2026-11-10T15:20:00Z'), h1).length === 1);
  const next = applyLivePrice(bars, 102, Date.parse('2026-11-10T15:31:00Z'), h1);
  check('1h: 10:31 starts the 10:30 bar', next.length === 2 && next[1].date === '2026-11-10T15:30:00.000Z');
}

// Daily, weekly
{
  const d1 = findInterval('1D');
  const bars = [bar('2026-11-09', 100), bar('2026-11-10', 101)];
  const noonET = Date.parse('2026-11-10T17:00:00Z');
  check('exchange date: New York’s, not UTC’s', exchangeDate(Date.parse('2026-11-11T02:00:00Z')) === '2026-11-10');
  check('1D: today’s bar is updated', applyLivePrice(bars, 103, noonET, d1).at(-1)!.close === 103 && applyLivePrice(bars, 103, noonET, d1).length === 2);
  const newDay = applyLivePrice(bars.slice(0, 1), 103, noonET, d1);
  check('1D: a new trading day starts a bar', newDay.length === 2 && newDay[1].date === '2026-11-10');
  const weekly = applyLivePrice([bar('2026-11-09', 100)], 104, noonET, findInterval('1W'));
  check('1W: the current week’s bar is updated, not extended', weekly.length === 1 && weekly[0].close === 104);
}

// Yahoo's extra point for today, from a real weekly and monthly response
{
  const weekly = foldTrailingPoint([bar('2026-11-02', 342.37, 355.38, 325.33), bar('2026-11-09', 350.69, 352.33, 344.78), bar('2026-11-10', 348.51, 353.87, 346.46)], findInterval('1W'));
  check('1W: today’s point folds into this week’s bar', weekly.length === 2 && weekly[1].date === '2026-11-09');
  check('1W: the week takes today’s close and widest range', weekly[1].close === 348.51 && weekly[1].high === 353.87 && weekly[1].low === 344.78);
  const monthly = foldTrailingPoint([bar('2026-10-01', 344.63), bar('2026-11-01', 342.37, 355.38, 325.33), bar('2026-11-10', 348.51, 353.87, 346.46)], findInterval('1M'));
  check('1M: today’s point folds into this month’s bar', monthly.length === 2 && monthly[1].close === 348.51 && monthly[1].high === 355.38);
  const separate = [bar('2026-10-26', 1), bar('2026-11-02', 2)];
  check('1W: a real next week is left alone', foldTrailingPoint(separate, findInterval('1W')) === separate);
  const daily = [bar('2026-11-09', 1), bar('2026-11-10', 2)];
  check('1D: daily bars are never folded', foldTrailingPoint(daily, findInterval('1D')) === daily);
}

check('nothing to extend: no bars, or no price', applyLivePrice([], 5, 0, findInterval('1m')).length === 0 && applyLivePrice([bar('2026-11-10', 1)], 0, 0, findInterval('1D')).length === 1);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
