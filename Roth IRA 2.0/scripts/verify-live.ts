/**
 * Checks for near-live prices, which mostly can't be seen working unless the
 * market happens to be open.
 * Run with:  npm run verify:live
 */

import { LIVE_BATCH_SIZE, isMarketOpen, newestTime, parseSparkQuotes, toBatches } from '../src/lib/liveQuotes';

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

// Market hours
{
  const session = { start: 1000, end: 2000 };
  check('hours: open during the session', isMarketOpen(session, 1500_000));
  check('hours: open at the first second', isMarketOpen(session, 1000_000));
  check('hours: closed at the last second', !isMarketOpen(session, 2000_000));
  check('hours: closed before and after', !isMarketOpen(session, 999_000) && !isMarketOpen(session, 2500_000));
  check('hours: closed until the hours are known', !isMarketOpen(null, 1500_000));
}

// Yahoo's batch response, in its real shape
{
  const quotes = parseSparkQuotes({
    AAPL: { symbol: 'AAPL', close: [344.17], timestamp: [1793912401], chartPreviousClose: 349.51, previousClose: null },
    KO: { symbol: 'KO', close: [95, 96.5, null], timestamp: [100, 200, null], chartPreviousClose: 94 },
    NOCLOSE: { symbol: 'NOCLOSE', close: null, timestamp: null },
    EMPTY: { symbol: 'EMPTY', close: [], timestamp: [] },
    ZERO: { symbol: 'ZERO', close: [0], timestamp: [5] },
    NOPREV: { symbol: 'NOPREV', close: [10], timestamp: [5] },
  });
  check('batch: reads the price, prior close and time', quotes.AAPL.price === 344.17 && quotes.AAPL.previousClose === 349.51 && quotes.AAPL.time === 1793912401);
  check('batch: skips a trailing gap for the last real price', quotes.KO.price === 96.5 && quotes.KO.time === 200);
  check('batch: a symbol without a price is left out', !('NOCLOSE' in quotes) && !('EMPTY' in quotes) && !('ZERO' in quotes));
  check('batch: a missing prior close is null, not zero', quotes.NOPREV.previousClose === null);
  check('batch: nonsense gives nothing', Object.keys(parseSparkQuotes(null)).length === 0 && Object.keys(parseSparkQuotes('x')).length === 0);
  check('freshness: the newest time wins', newestTime(quotes) === 1793912401);
  check('freshness: unknown without times', newestTime({}) === null && newestTime({ A: { price: 1, previousClose: null, time: null } }) === null);
}

// Batching
{
  const symbols = Array.from({ length: 45 }, (_, i) => `S${i}`);
  const batches = toBatches(symbols);
  check('batches: none over the size Yahoo accepts', batches.every(b => b.length <= LIVE_BATCH_SIZE) && LIVE_BATCH_SIZE < 25);
  check('batches: nothing lost or reordered', batches.flat().join() === symbols.join());
  check('batches: no symbols, no requests', toBatches([]).length === 0);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
