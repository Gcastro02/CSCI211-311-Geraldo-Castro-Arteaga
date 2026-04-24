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
}

export interface PortfolioData {
  cashBalance: number;
  holdings: StockHolding[];
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
}

export interface UserSettings {
  currency: string;
  dateFormat: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD';
  investmentHorizon: 'LONG_TERM' | 'SHORT_TERM' | 'BOTH';
  preferredNewsSources: string[];
}
