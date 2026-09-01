export interface StockHolding {
  symbol: string;
  shares: number;
  averagePrice: number;
}

export interface WatchlistItem {
  symbol: string;
  addedAt: string;
  targetPrice?: number;
  alertDirection?: 'ABOVE' | 'BELOW';
  /**
   * Set when the target was crossed and cleared once price moves back across it.
   * Keeps a repeating price refresh from re-firing the same alert every cycle.
   */
  lastAlertedAt?: string;
}

export interface PortfolioData {
  cashBalance: number;
  holdings: StockHolding[];
}

/**
 * CONTRIBUTION is new money moved into the account — the only kind that counts
 * against the annual limit. DIVIDEND and growth happen inside the account and
 * never count, which is the distinction that makes limit tracking correct.
 */
export type TransactionType =
  | 'CONTRIBUTION'
  | 'WITHDRAWAL'
  | 'BUY'
  | 'SELL'
  | 'DIVIDEND';

export interface Transaction {
  id: string;
  /** Calendar date the transaction settled, as YYYY-MM-DD. */
  date: string;
  type: TransactionType;
  /** Always positive. `type` determines which way cash and shares move. */
  amount: number;
  /** Required for BUY, SELL and DIVIDEND. */
  symbol?: string;
  /** Required for BUY and SELL. */
  shares?: number;
  pricePerShare?: number;
  /**
   * CONTRIBUTION only: the tax year this counts against. Contributions made
   * between January 1 and that year's filing deadline may be designated for
   * the prior tax year, so this is not always the year in `date`.
   */
  taxYear?: number;
  note?: string;
}

/** A closed lot, matched FIFO against the sale that closed it. */
export interface RealizedGain {
  symbol: string;
  date: string;
  shares: number;
  proceeds: number;
  costBasis: number;
  gain: number;
  /** True when a sale exceeded the shares the log accounts for. */
  unmatched: boolean;
}

export interface StockAnalysis {
  symbol: string;
  recommendation: 'BUY' | 'SELL' | 'HOLD';
  reasoning: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  metrics?: {
    peRatio?: string;
    marketCap?: string;
    dividendYield?: string;
  };
  projectedGrowth?: string;
  keyFactors?: string[];
}

export interface MarketSuggestion {
  symbol: string;
  name: string;
  reason: string;
  trend: string;
  keyFactors?: string[];
}

export interface NewsItem {
  title: string;
  url: string;
  source: string;
  snippet: string;
  date?: string;
}

export interface PriceData {
  date: string;
  price: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
}

export interface UserSettings {
  currency: string;
  dateFormat: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD';
  investmentHorizon: 'LONG_TERM' | 'SHORT_TERM' | 'BOTH';
  preferredNewsSources: string[];
  themeMode: 'LIGHT' | 'DARK';
  /** Eligible for the age-50-and-over catch-up contribution. */
  catchUpEligible: boolean;
  /**
   * Per-tax-year contribution limit overrides, keyed by year. The IRS adjusts
   * the limit for inflation annually, so this is user-editable rather than
   * hardcoded — see DEFAULT_CONTRIBUTION_LIMITS in lib/contributions.ts.
   */
  contributionLimitOverrides: Record<number, number>;
}
