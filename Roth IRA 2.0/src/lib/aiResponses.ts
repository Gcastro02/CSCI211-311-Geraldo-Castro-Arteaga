/**
 * Checking what the language model sends back before the app relies on it. Its
 * JSON usually matches the format it was asked for, but not always, and a
 * screen that assumes it does goes blank. Saved research passes through here
 * too, so a bad reply can't keep breaking a stock's page.
 */

import { MarketSuggestion, StockAnalysis } from '../types';

const text = (value: unknown): string => {
  if (typeof value === 'string') return value.trim();
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
};

const textList = (value: unknown): string[] => {
  const items = Array.isArray(value) ? value : [value];
  return items.map(text).filter(Boolean);
};

const oneOf = <T extends string>(value: unknown, allowed: readonly T[]): T | undefined => {
  const upper = text(value).toUpperCase();
  return allowed.find(option => option === upper);
};

/**
 * A usable analysis, or null. Without a recommendation, risk level and reasoning
 * there's nothing to show, and filling them in would invent an opinion the
 * model never gave.
 */
export const normalizeAnalysis = (raw: unknown, expectedSymbol?: string): StockAnalysis | null => {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, any>;

  const symbol = (expectedSymbol ?? text(data.symbol)).trim().toUpperCase();
  const recommendation = oneOf(data.recommendation, ['BUY', 'SELL', 'HOLD'] as const);
  const riskLevel = oneOf(data.riskLevel, ['LOW', 'MEDIUM', 'HIGH'] as const);
  const reasoning = text(data.reasoning);
  if (!symbol || !recommendation || !riskLevel || !reasoning) return null;

  const metrics = {
    peRatio: text(data.metrics?.peRatio),
    marketCap: text(data.metrics?.marketCap),
    dividendYield: text(data.metrics?.dividendYield),
  };
  const keyFactors = textList(data.keyFactors);
  const projectedGrowth = text(data.projectedGrowth);
  const analyzedAt = text(data.analyzedAt);

  return {
    symbol,
    recommendation,
    riskLevel,
    reasoning,
    ...(metrics.peRatio || metrics.marketCap || metrics.dividendYield ? { metrics } : {}),
    ...(projectedGrowth ? { projectedGrowth } : {}),
    ...(keyFactors.length ? { keyFactors } : {}),
    ...(analyzedAt ? { analyzedAt } : {}),
  };
};

/** A usable idea, or null when it doesn't name a stock and a reason for it. */
export const normalizeSuggestion = (raw: unknown): MarketSuggestion | null => {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, any>;
  const symbol = text(data.symbol).toUpperCase();
  const reason = text(data.reason);
  if (!symbol || !reason) return null;
  const keyFactors = textList(data.keyFactors);
  return {
    symbol,
    name: text(data.name) || symbol,
    reason,
    trend: text(data.trend),
    ...(keyFactors.length ? { keyFactors } : {}),
  };
};
