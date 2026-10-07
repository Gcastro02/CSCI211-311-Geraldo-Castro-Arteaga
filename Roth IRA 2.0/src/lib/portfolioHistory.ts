/**
 * Value of the portfolio's *current* holdings over past dates, for the Home
 * chart. Pure function — no network.
 */

import { PriceData, StockHolding } from '../types';

export interface ValuePoint {
  date: string;
  value: number;
}

/**
 * Today's share counts times each past day's close, plus today's cash.
 *
 * This answers "how has what I own now moved", not "what was my account worth
 * then": past buys, sells and cash changes are not replayed, so the line is
 * smooth across a trade that happened mid-range.
 *
 * - Repeated lots of one symbol are merged.
 * - A symbol with no history is held flat at its `fallbackPrices` entry (when
 *   there is one) rather than dropped, which would understate the total.
 * - A gap in one symbol's history carries its last close forward.
 * - Dates before every charted symbol has a price are skipped, so the line
 *   does not jump when a later-listed symbol first appears.
 */
export const buildHoldingsValueHistory = (
  holdings: StockHolding[],
  histories: Record<string, PriceData[]>,
  cash: number,
  fallbackPrices: Record<string, number> = {},
): ValuePoint[] => {
  const shares = new Map<string, number>();
  holdings.forEach(holding => {
    const symbol = holding.symbol.trim().toUpperCase();
    if (!symbol || !(holding.shares > 0)) return;
    shares.set(symbol, (shares.get(symbol) ?? 0) + holding.shares);
  });
  if (shares.size === 0) return [];

  let flatValue = Number.isFinite(cash) ? cash : 0;
  const closesBySymbol = new Map<string, Map<string, number>>();

  shares.forEach((count, symbol) => {
    const rows = histories[symbol] ?? [];
    if (rows.length === 0) {
      const fallback = fallbackPrices[symbol];
      if (Number.isFinite(fallback) && fallback > 0) flatValue += count * fallback;
      return;
    }
    closesBySymbol.set(symbol, new Map(rows.map(row => [row.date, row.close ?? row.price])));
  });
  if (closesBySymbol.size === 0) return [];

  const dates = Array.from(
    new Set(Array.from(closesBySymbol.values()).flatMap(closes => Array.from(closes.keys()))),
  ).sort();

  const lastClose = new Map<string, number>();
  const points: ValuePoint[] = [];

  for (const date of dates) {
    closesBySymbol.forEach((closes, symbol) => {
      const close = closes.get(date);
      if (close != null && Number.isFinite(close) && close > 0) lastClose.set(symbol, close);
    });
    if (lastClose.size < closesBySymbol.size) continue;

    let value = flatValue;
    lastClose.forEach((close, symbol) => {
      value += close * (shares.get(symbol) ?? 0);
    });
    points.push({ date, value });
  }

  return points;
};
