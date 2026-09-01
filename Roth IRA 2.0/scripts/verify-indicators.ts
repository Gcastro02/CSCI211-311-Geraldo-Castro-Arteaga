/**
 * Pins src/lib/indicators.ts to the Stock Trader Bot's original Python pipeline.
 *
 * `indicator-fixture.json` holds a synthetic 220-bar OHLCV series plus the
 * feature values that `ml_model/data_collector.py` produces for its final bar.
 * If the TypeScript port ever drifts from those numbers, this fails.
 *
 * Run with:  npm run verify:indicators
 * Regenerate the fixture (needs pandas + numpy):
 *   python scripts/generate-indicator-fixture.py
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { computeIndicators, TechnicalSnapshot } from '../src/lib/indicators';
import { PriceData } from '../src/types';

const here = path.dirname(fileURLToPath(import.meta.url));

interface Fixture {
  bars: PriceData[];
  expected: Record<string, number | null>;
}

/** Python feature name -> TechnicalSnapshot field. */
const FIELD_MAP: Record<string, keyof TechnicalSnapshot> = {
  return_5d: 'return5d',
  return_10d: 'return10d',
  return_20d: 'return20d',
  volume_change: 'volumeChange',
  volume_ma_ratio: 'volumeMaRatio',
  rsi_14: 'rsi14',
  macd: 'macd',
  macd_signal: 'macdSignal',
  macd_hist: 'macdHistogram',
  bb_position: 'bbPosition',
  close_vs_sma20: 'closeVsSma20',
  hl_range: 'hlRange',
  volatility_20: 'volatility20',
  overnight_gap: 'overnightGap',
  sma_5: 'sma5',
  sma_20: 'sma20',
  bb_upper: 'bbUpper',
  bb_lower: 'bbLower',
};

/** Loose enough for float reassociation, tight enough to catch a real bug. */
const TOLERANCE = 1e-9;

const fixture: Fixture = JSON.parse(readFileSync(path.join(here, 'indicator-fixture.json'), 'utf8'));
const snapshot = computeIndicators('FIXTURE', fixture.bars);

if (!snapshot) {
  console.error('computeIndicators returned null for the fixture series');
  process.exit(1);
}

let failures = 0;

for (const [pythonName, field] of Object.entries(FIELD_MAP)) {
  const expected = fixture.expected[pythonName];
  const actual = snapshot[field] as number | null;

  const bothNull = expected === null && actual === null;
  const relativeError =
    expected === null || actual === null
      ? Number.NaN
      : Math.abs(actual - expected) / Math.max(Math.abs(expected), 1e-9);

  const passed = bothNull || relativeError < TOLERANCE;
  if (!passed) failures++;

  const status = passed ? 'ok  ' : 'FAIL';
  const error = Number.isFinite(relativeError) ? `  rel=${relativeError.toExponential(2)}` : '';
  console.log(`${status} ${pythonName.padEnd(16)} python=${expected} ts=${actual}${error}`);
}

if (failures > 0) {
  console.error(`\n${failures} indicator(s) diverged from the Python reference.`);
  process.exit(1);
}

console.log(`\nAll ${Object.keys(FIELD_MAP).length} indicators match the Python reference.`);
