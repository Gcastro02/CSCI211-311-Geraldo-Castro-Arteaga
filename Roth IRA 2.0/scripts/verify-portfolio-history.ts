/**
 * Checks for the Home chart's portfolio value history.
 * Run with:  npm run verify:history
 */

import { buildHoldingsValueHistory } from '../src/lib/portfolioHistory';
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

const near = (actual: number, expected: number, tolerance = 1e-6) =>
  Math.abs(actual - expected) < tolerance;

const bars = (pairs: Array<[string, number]>): PriceData[] =>
  pairs.map(([date, close]) => ({ date, price: close, close }));

// ---------------------------------------------------------------------------
{
  const points = buildHoldingsValueHistory(
    [{ symbol: 'AAA', shares: 2, averagePrice: 1 }],
    { AAA: bars([['2026-01-01', 10], ['2026-01-02', 11]]) },
    5,
  );
  check('values shares at each close plus cash', points.length === 2 && near(points[0].value, 25) && near(points[1].value, 27));
}

{
  const points = buildHoldingsValueHistory(
    [
      { symbol: 'aaa', shares: 1, averagePrice: 1 },
      { symbol: 'AAA ', shares: 2, averagePrice: 1 },
    ],
    { AAA: bars([['2026-01-01', 10]]) },
    0,
  );
  check('merges repeated lots, case and whitespace insensitive', points.length === 1 && near(points[0].value, 30));
}

{
  const points = buildHoldingsValueHistory(
    [
      { symbol: 'AAA', shares: 1, averagePrice: 1 },
      { symbol: 'BBB', shares: 1, averagePrice: 1 },
    ],
    {
      AAA: bars([['2026-01-01', 10], ['2026-01-02', 12], ['2026-01-03', 14]]),
      BBB: bars([['2026-01-02', 100], ['2026-01-03', 101]]),
    },
    0,
  );
  check('skips dates before every symbol has a price', points.length === 2 && points[0].date === '2026-01-02');
  check('sums symbols on shared dates', near(points[0].value, 112) && near(points[1].value, 115));
}

{
  const points = buildHoldingsValueHistory(
    [
      { symbol: 'AAA', shares: 1, averagePrice: 1 },
      { symbol: 'BBB', shares: 1, averagePrice: 1 },
    ],
    {
      AAA: bars([['2026-01-01', 10], ['2026-01-02', 12], ['2026-01-03', 14]]),
      BBB: bars([['2026-01-01', 100], ['2026-01-03', 90]]),
    },
    0,
  );
  check('carries a missing close forward', points.length === 3 && near(points[1].value, 112) && near(points[2].value, 104));
}

{
  const points = buildHoldingsValueHistory(
    [
      { symbol: 'AAA', shares: 1, averagePrice: 1 },
      { symbol: 'NOHIST', shares: 3, averagePrice: 1 },
    ],
    { AAA: bars([['2026-01-01', 10]]) },
    1,
    { NOHIST: 20 },
  );
  check('holds a symbol without history flat at its fallback price', near(points[0].value, 71));
}

{
  check('no holdings gives no points', buildHoldingsValueHistory([], {}, 100).length === 0);
  check('zero-share lots are ignored', buildHoldingsValueHistory([{ symbol: 'AAA', shares: 0, averagePrice: 1 }], { AAA: bars([['2026-01-01', 10]]) }, 0).length === 0);
  check('no history anywhere gives no points', buildHoldingsValueHistory([{ symbol: 'AAA', shares: 1, averagePrice: 1 }], {}, 0, { AAA: 5 }).length === 0);
}

// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
