/**
 * The Charts tab's data rules: which bar sizes exist, how much history each
 * can show, and how a live price extends the latest bar. Pure, so they can be
 * tested without a chart or a market.
 */

import { PriceData } from '../types';

export interface ChartInterval {
  id: '1m' | '5m' | '15m' | '1h' | '1D' | '1W' | '1M';
  /** What the bar-size buttons say. */
  label: string;
  /** Spelled out, for screen readers and captions. */
  name: string;
  /**
   * Yahoo's parameters. Its intraday history is limited per bar size.
   * `fromStart` asks for everything since 1970 by date, because Yahoo's
   * `range=max` quietly turns every bar size into 3-month bars.
   */
  yahoo: { interval: string; range?: string; fromStart?: boolean };
  /** Bar length in seconds, for intraday bars. */
  seconds?: number;
}

/** Each with the most history Yahoo's free feed gives for it (checked Nov 2026). */
export const CHART_INTERVALS: ChartInterval[] = [
  { id: '1m', label: '1m', name: '1-minute', yahoo: { interval: '1m', range: '7d' }, seconds: 60 },
  { id: '5m', label: '5m', name: '5-minute', yahoo: { interval: '5m', range: '1mo' }, seconds: 300 },
  { id: '15m', label: '15m', name: '15-minute', yahoo: { interval: '15m', range: '60d' }, seconds: 900 },
  { id: '1h', label: '1h', name: '1-hour', yahoo: { interval: '1h', range: '2y' }, seconds: 3600 },
  { id: '1D', label: '1D', name: 'daily', yahoo: { interval: '1d', range: '10y' } },
  { id: '1W', label: '1W', name: 'weekly', yahoo: { interval: '1wk', fromStart: true } },
  { id: '1M', label: '1M', name: 'monthly', yahoo: { interval: '1mo', fromStart: true } },
];

export const findInterval = (id: string): ChartInterval =>
  CHART_INTERVALS.find(interval => interval.id === id) ?? CHART_INTERVALS[1];

export const isIntraday = (interval: ChartInterval) => interval.seconds !== undefined;

/** Bars shown when a chart first opens; the rest is a drag away. */
export const INITIAL_VISIBLE_BARS = 150;

/**
 * Yahoo ends weekly and monthly series with an extra point for today, after
 * the bar for the current week or month. Left alone it draws as a one-day bar
 * of its own; folded in, it brings that bar up to date.
 */
export const foldTrailingPoint = (bars: PriceData[], interval: ChartInterval): PriceData[] => {
  if ((interval.id !== '1W' && interval.id !== '1M') || bars.length < 2) return bars;
  const last = bars[bars.length - 1];
  const current = bars[bars.length - 2];
  const days = (Date.parse(last.date.slice(0, 10)) - Date.parse(current.date.slice(0, 10))) / 86_400_000;
  const sameBar = interval.id === '1W' ? days >= 0 && days < 7 : last.date.slice(0, 7) === current.date.slice(0, 7);
  if (!sameBar) return bars;
  const close = last.close ?? last.price;
  return [
    ...bars.slice(0, -2),
    {
      ...current,
      price: close,
      close,
      high: Math.max(current.high ?? close, last.high ?? close),
      low: Math.min(current.low ?? close, last.low ?? close),
    },
  ];
};

/** Simple moving average; null until there are `period` values to average. */
export const movingAverage = (values: number[], period: number): (number | null)[] => {
  const result: (number | null)[] = [];
  let sum = 0;
  values.forEach((value, i) => {
    sum += value;
    if (i >= period) sum -= values[i - period];
    result.push(i >= period - 1 ? sum / period : null);
  });
  return result;
};

/** "YYYY-MM-DD" in New York, the exchange's own date for a daily bar. */
export const exchangeDate = (ms: number) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);

const closeOf = (bar: PriceData) => bar.close ?? bar.price;

/**
 * Bars with a live price folded in: it extends the latest bar if that bar is
 * still open, or starts the next one. Intraday bars are measured from the last
 * bar's own start, since Yahoo's hourly bars begin at :30, not on the hour.
 * Returns the same array when the price changes nothing.
 */
export const applyLivePrice = (
  bars: PriceData[],
  price: number,
  nowMs: number,
  interval: ChartInterval,
): PriceData[] => {
  if (!(price > 0) || bars.length === 0) return bars;
  const last = bars[bars.length - 1];

  const extend = (bar: PriceData): PriceData => ({
    ...bar,
    price,
    close: price,
    high: Math.max(bar.high ?? closeOf(bar), price),
    low: Math.min(bar.low ?? closeOf(bar), price),
  });
  const start = (date: string): PriceData => ({ date, price, open: price, high: price, low: price, close: price, volume: 0 });

  if (interval.seconds) {
    const lastStart = Date.parse(last.date);
    if (!Number.isFinite(lastStart) || nowMs < lastStart) return bars;
    const elapsed = Math.floor((nowMs - lastStart) / (interval.seconds * 1000));
    if (elapsed === 0) return closeOf(last) === price ? bars : [...bars.slice(0, -1), extend(last)];
    return [...bars, start(new Date(lastStart + elapsed * interval.seconds * 1000).toISOString())];
  }

  // Daily: a new trading day starts a bar. Weekly and monthly bars already cover today.
  if (interval.id === '1D') {
    const today = exchangeDate(nowMs);
    if (last.date < today) return [...bars, start(today)];
  }
  return closeOf(last) === price ? bars : [...bars.slice(0, -1), extend(last)];
};
