/**
 * Portfolio risk and sizing math, ported from the Trading Simulator's C++
 * (`PortfolioManager::performRiskAudit` and the allocation block inside
 * `runUpdate`). Pure functions over numbers the app already has — no network,
 * no model, no API key required.
 */

import { StockHolding } from '../types';

/** Max share of the portfolio any single position should occupy. */
export const DEFAULT_RISK_THRESHOLD = 0.25;

/** Share of cash the bot refused to spend, so a position is always openable. */
export const DEFAULT_CASH_BUFFER_PCT = 0.05;

// ---------------------------------------------------------------------------
// Concentration audit
// ---------------------------------------------------------------------------

export interface PositionWeight {
  symbol: string;
  shares: number;
  price: number;
  value: number;
  /** Fraction of total portfolio value, 0-1. */
  weight: number;
  overLimit: boolean;
  /** Dollars that would need to be sold to come back under the limit. */
  excessValue: number;
  /** True when the price is a fallback (average cost), not a live quote. */
  estimated: boolean;
}

export interface RiskAudit {
  totalValue: number;
  cashValue: number;
  cashWeight: number;
  holdingsValue: number;
  positions: PositionWeight[];
  overLimit: PositionWeight[];
  /** Herfindahl-Hirschman Index over position weights, 0-1. Higher = more concentrated. */
  concentrationIndex: number;
  /** Rough read on diversification derived from the HHI. */
  diversification: 'CONCENTRATED' | 'MODERATE' | 'DIVERSIFIED';
  riskThreshold: number;
}

/**
 * Weigh every position against the portfolio and flag anything above the risk
 * threshold. Mirrors the bot's audit, which printed `[!] OVER LIMIT` for any
 * position exceeding `RISK_THRESHOLD` of total value.
 *
 * Positions in the same symbol are merged, so adding a holding twice does not
 * understate concentration.
 */
export const auditRisk = (
  holdings: StockHolding[],
  livePrices: Record<string, number>,
  cashBalance: number,
  riskThreshold: number = DEFAULT_RISK_THRESHOLD,
): RiskAudit => {
  const merged = new Map<string, { shares: number; costBasis: number; price: number; estimated: boolean }>();

  holdings.forEach(holding => {
    const symbol = holding.symbol.trim().toUpperCase();
    if (!symbol) return;

    const live = livePrices[symbol];
    const hasLive = Number.isFinite(live) && live > 0;
    const existing = merged.get(symbol);

    if (existing) {
      existing.shares += holding.shares;
      existing.costBasis += holding.shares * holding.averagePrice;
      // A live quote for the symbol applies to every lot of it.
      if (hasLive) {
        existing.price = live;
        existing.estimated = false;
      }
    } else {
      merged.set(symbol, {
        shares: holding.shares,
        costBasis: holding.shares * holding.averagePrice,
        price: hasLive ? live : holding.averagePrice,
        estimated: !hasLive,
      });
    }
  });

  // Without a live quote, fall back to blended average cost across all lots.
  merged.forEach(entry => {
    if (entry.estimated && entry.shares > 0) {
      entry.price = entry.costBasis / entry.shares;
    }
  });

  const holdingsValue = Array.from(merged.values()).reduce((acc, e) => acc + e.shares * e.price, 0);
  const totalValue = holdingsValue + cashBalance;

  const positions: PositionWeight[] = Array.from(merged.entries())
    .map(([symbol, entry]) => {
      const value = entry.shares * entry.price;
      const weight = totalValue > 0 ? value / totalValue : 0;
      const excessValue = weight > riskThreshold ? value - riskThreshold * totalValue : 0;

      return {
        symbol,
        shares: entry.shares,
        price: entry.price,
        value,
        weight,
        overLimit: weight > riskThreshold,
        excessValue,
        estimated: entry.estimated,
      };
    })
    .sort((a, b) => b.weight - a.weight);

  // HHI over positions only — cash is not a concentration risk.
  const concentrationIndex = holdingsValue > 0
    ? positions.reduce((acc, p) => acc + (p.value / holdingsValue) ** 2, 0)
    : 0;

  return {
    totalValue,
    cashValue: cashBalance,
    cashWeight: totalValue > 0 ? cashBalance / totalValue : 0,
    holdingsValue,
    positions,
    overLimit: positions.filter(p => p.overLimit),
    concentrationIndex,
    diversification:
      concentrationIndex >= 0.5 ? 'CONCENTRATED' : concentrationIndex >= 0.25 ? 'MODERATE' : 'DIVERSIFIED',
    riskThreshold,
  };
};

// ---------------------------------------------------------------------------
// Position sizing
// ---------------------------------------------------------------------------

export interface PositionSizeInput {
  price: number;
  cashBalance: number;
  totalPortfolioValue: number;
  /** Current dollar value already held in this symbol. */
  currentPositionValue: number;
  /** 0-1. Scales how much of spendable cash to commit. */
  confidence: number;
  riskThreshold?: number;
  cashBufferPct?: number;
}

export interface PositionSizeResult {
  shares: number;
  cost: number;
  /** Cash deliberately held back and never spent. */
  cashBuffer: number;
  spendableCash: number;
  /** What confidence alone would have allocated, before the risk cap. */
  confidenceAllocation: number;
  /** Dollars available under the risk cap before this position hits the limit. */
  riskHeadroom: number;
  /** Which constraint actually decided the number, for display. */
  limitedBy: 'CONFIDENCE' | 'RISK_CAP' | 'CASH_BUFFER' | 'NO_CASH' | 'AT_LIMIT' | 'INVALID_PRICE';
  resultingWeight: number;
}

/**
 * Work out how many shares to buy given cash on hand, a confidence level, and
 * the portfolio's risk rules — the bot's allocation block, made interactive.
 *
 * Three constraints apply in order, and the smallest wins:
 *   1. Hold back `cashBufferPct` of cash and never spend it.
 *   2. Commit `confidence x spendable cash` — stronger conviction, bigger buy.
 *   3. Never let the position exceed `riskThreshold` of total portfolio value.
 */
export const calculatePositionSize = ({
  price,
  cashBalance,
  totalPortfolioValue,
  currentPositionValue,
  confidence,
  riskThreshold = DEFAULT_RISK_THRESHOLD,
  cashBufferPct = DEFAULT_CASH_BUFFER_PCT,
}: PositionSizeInput): PositionSizeResult => {
  const cashBuffer = Math.max(0, cashBalance) * cashBufferPct;
  const spendableCash = Math.max(0, cashBalance - cashBuffer);

  const clampedConfidence = Math.max(0, Math.min(1, confidence));
  const confidenceAllocation = spendableCash * clampedConfidence;

  const maxAllowed = riskThreshold * totalPortfolioValue;
  const riskHeadroom = Math.max(0, maxAllowed - currentPositionValue);

  const empty = (limitedBy: PositionSizeResult['limitedBy']): PositionSizeResult => ({
    shares: 0,
    cost: 0,
    cashBuffer,
    spendableCash,
    confidenceAllocation,
    riskHeadroom,
    limitedBy,
    resultingWeight: totalPortfolioValue > 0 ? currentPositionValue / totalPortfolioValue : 0,
  });

  if (!Number.isFinite(price) || price <= 0) return empty('INVALID_PRICE');
  if (spendableCash <= 0) return empty('NO_CASH');
  if (riskHeadroom <= 0) return empty('AT_LIMIT');

  const cost = Math.min(confidenceAllocation, riskHeadroom, spendableCash);
  // Zero conviction means the user asked for nothing, not that a cap bound them.
  if (cost <= 0) return empty(confidenceAllocation <= 0 ? 'CONFIDENCE' : 'RISK_CAP');

  const limitedBy: PositionSizeResult['limitedBy'] =
    cost === riskHeadroom && riskHeadroom < confidenceAllocation
      ? 'RISK_CAP'
      : cost === spendableCash && spendableCash < confidenceAllocation
        ? 'CASH_BUFFER'
        : 'CONFIDENCE';

  return {
    shares: cost / price,
    cost,
    cashBuffer,
    spendableCash,
    confidenceAllocation,
    riskHeadroom,
    limitedBy,
    resultingWeight:
      totalPortfolioValue > 0 ? (currentPositionValue + cost) / totalPortfolioValue : 0,
  };
};
