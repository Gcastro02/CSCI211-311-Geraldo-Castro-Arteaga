/**
 * Transaction log replay: turns an ordered list of transactions into positions,
 * cash, and realized gains.
 *
 * Modelled on the Trading Simulator's `portfolio_log.csv`
 * (`date,ticker,price,shares,total`), extended with the cash-side events a
 * retirement account needs — contributions, withdrawals and dividends.
 *
 * Lots are matched FIFO on sale. Inside a Roth IRA realized gains are not a tax
 * event, so this exists to measure performance, not to prepare a return.
 */

import { AccountType, PortfolioData, RealizedGain, StockHolding, Transaction } from '../types';

/** Share quantities below this are treated as zero (float residue). */
const SHARE_EPSILON = 1e-9;

export const normalizeSymbol = (symbol?: string): string => (symbol || '').trim().toUpperCase();

/**
 * Chronological order, with a stable tiebreak so replay is deterministic when
 * several transactions share a date.
 */
export const sortTransactions = (transactions: Transaction[]): Transaction[] =>
  [...transactions].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

interface Lot {
  shares: number;
  pricePerShare: number;
  date: string;
}

export interface DerivedPosition {
  symbol: string;
  shares: number;
  /** Weighted average cost of the lots still open. */
  averagePrice: number;
  costBasis: number;
}

export interface ReplayResult {
  /** Net cash from contributions, withdrawals, dividends, buys and sells. */
  cashBalance: number;
  positions: DerivedPosition[];
  realizedGains: RealizedGain[];
  totalRealized: number;
  /** Sales that exceeded the shares the log accounts for. */
  warnings: string[];
}

/**
 * Replay a transaction log into portfolio state.
 *
 * Pure and deterministic: same log in, same state out. Nothing here reads the
 * network or the clock.
 */
export const replayTransactions = (transactions: Transaction[]): ReplayResult => {
  const ordered = sortTransactions(transactions);
  const lotsBySymbol = new Map<string, Lot[]>();
  const realizedGains: RealizedGain[] = [];
  const warnings: string[] = [];
  let cashBalance = 0;

  for (const tx of ordered) {
    const symbol = normalizeSymbol(tx.symbol);

    switch (tx.type) {
      case 'CONTRIBUTION':
      case 'DIVIDEND':
        cashBalance += tx.amount;
        break;

      case 'WITHDRAWAL':
        cashBalance -= tx.amount;
        break;

      case 'BUY': {
        if (!symbol || !tx.shares || tx.shares <= 0) break;
        cashBalance -= tx.amount;

        const lots = lotsBySymbol.get(symbol) ?? [];
        lots.push({
          shares: tx.shares,
          // Prefer the stated per-share price; fall back to the implied one so
          // a log that only recorded a total still produces a usable basis.
          pricePerShare: tx.pricePerShare ?? (tx.amount / tx.shares),
          date: tx.date,
        });
        lotsBySymbol.set(symbol, lots);
        break;
      }

      case 'SELL': {
        if (!symbol || !tx.shares || tx.shares <= 0) break;
        cashBalance += tx.amount;

        const lots = lotsBySymbol.get(symbol) ?? [];
        let remaining = tx.shares;
        let costBasis = 0;

        // FIFO: consume the oldest open lots first.
        while (remaining > SHARE_EPSILON && lots.length > 0) {
          const lot = lots[0];
          const taken = Math.min(lot.shares, remaining);

          costBasis += taken * lot.pricePerShare;
          lot.shares -= taken;
          remaining -= taken;

          if (lot.shares <= SHARE_EPSILON) lots.shift();
        }

        lotsBySymbol.set(symbol, lots);

        const unmatched = remaining > SHARE_EPSILON;
        if (unmatched) {
          warnings.push(
            `${tx.date}: sold ${tx.shares} ${symbol} but the log only accounts for ${(tx.shares - remaining).toFixed(4)}. Cost basis for the rest is unknown.`,
          );
        }

        realizedGains.push({
          symbol,
          date: tx.date,
          shares: tx.shares,
          proceeds: tx.amount,
          costBasis,
          // Unmatched shares carry no basis, so this overstates the gain — the
          // `unmatched` flag lets the UI say so rather than hide it.
          gain: tx.amount - costBasis,
          unmatched,
        });
        break;
      }
    }
  }

  const positions: DerivedPosition[] = Array.from(lotsBySymbol.entries())
    .map(([symbol, lots]) => {
      const shares = lots.reduce((acc, lot) => acc + lot.shares, 0);
      const costBasis = lots.reduce((acc, lot) => acc + lot.shares * lot.pricePerShare, 0);
      return {
        symbol,
        shares,
        averagePrice: shares > SHARE_EPSILON ? costBasis / shares : 0,
        costBasis,
      };
    })
    .filter(position => position.shares > SHARE_EPSILON)
    .sort((a, b) => a.symbol.localeCompare(b.symbol));

  return {
    cashBalance,
    positions,
    realizedGains,
    totalRealized: realizedGains.reduce((acc, gain) => acc + gain.gain, 0),
    warnings,
  };
};

/** Replayed positions in the shape the rest of the app already uses. */
export const positionsToHoldings = (positions: DerivedPosition[]): StockHolding[] =>
  positions.map(position => ({
    symbol: position.symbol,
    shares: position.shares,
    averagePrice: position.averagePrice,
  }));

export interface ReconciliationRow {
  symbol: string;
  loggedShares: number;
  heldShares: number;
  difference: number;
  /** Weighted-average cost carried on the holding. */
  heldAveragePrice: number;
  /** Cost of the lots FIFO says are still open. */
  loggedAveragePrice: number;
  /**
   * True when share counts agree but average cost does not. This is expected
   * after a partial sale — see `reconcile` — and is not an error.
   */
  costMethodOnly: boolean;
}

/**
 * Compare what the log implies against the manually-entered holdings.
 *
 * Holdings stay the source of truth for valuation so existing data keeps
 * working, which means the two can drift. This surfaces the drift instead of
 * letting it sit there silently.
 *
 * Average cost is reported separately because the two are measured differently
 * and legitimately disagree after a partial sale: holdings carry a weighted
 * average across every lot, while the replay carries the cost of whichever lots
 * FIFO left open. Buy 1 at 465 and 1 at 423, sell 1.5, and the remaining half
 * share is worth 444 on a weighted average and 423 under FIFO. Neither is
 * wrong, so this flags the difference as a method difference rather than an
 * inconsistency to go fix.
 */
export const reconcile = (
  portfolio: PortfolioData,
  positions: DerivedPosition[],
): ReconciliationRow[] => {
  const held = new Map<string, { shares: number; cost: number }>();
  portfolio.holdings.forEach(holding => {
    const symbol = normalizeSymbol(holding.symbol);
    const existing = held.get(symbol) ?? { shares: 0, cost: 0 };
    held.set(symbol, {
      shares: existing.shares + holding.shares,
      cost: existing.cost + holding.shares * holding.averagePrice,
    });
  });

  const logged = new Map(positions.map(position => [position.symbol, position]));
  const symbols = Array.from(new Set([...held.keys(), ...logged.keys()])).sort();

  return symbols
    .map(symbol => {
      const heldEntry = held.get(symbol);
      const loggedEntry = logged.get(symbol);

      const heldShares = heldEntry?.shares ?? 0;
      const loggedShares = loggedEntry?.shares ?? 0;
      const difference = heldShares - loggedShares;

      const heldAveragePrice = heldEntry && heldEntry.shares > SHARE_EPSILON
        ? heldEntry.cost / heldEntry.shares
        : 0;
      const loggedAveragePrice = loggedEntry?.averagePrice ?? 0;

      const sharesAgree = Math.abs(difference) <= 1e-6;
      const costsDiffer = heldShares > SHARE_EPSILON
        && loggedShares > SHARE_EPSILON
        && Math.abs(heldAveragePrice - loggedAveragePrice) > 0.005;

      return {
        symbol,
        loggedShares,
        heldShares,
        difference,
        heldAveragePrice,
        loggedAveragePrice,
        costMethodOnly: sharesAgree && costsDiffer,
      };
    })
    .filter(row => Math.abs(row.difference) > 1e-6 || row.costMethodOnly);
};

/**
 * Apply one transaction to portfolio state.
 *
 * Used when recording a transaction through the UI, so the log and the holdings
 * move together instead of requiring the user to update both by hand. BUY
 * merges into the existing position at a recomputed weighted average cost.
 */
export const applyTransaction = (portfolio: PortfolioData, tx: Transaction): PortfolioData => {
  const symbol = normalizeSymbol(tx.symbol);

  switch (tx.type) {
    case 'CONTRIBUTION':
    case 'DIVIDEND':
      return { ...portfolio, cashBalance: portfolio.cashBalance + tx.amount };

    case 'WITHDRAWAL':
      return { ...portfolio, cashBalance: portfolio.cashBalance - tx.amount };

    case 'BUY': {
      if (!symbol || !tx.shares || tx.shares <= 0) return portfolio;

      const pricePerShare = tx.pricePerShare ?? (tx.amount / tx.shares);
      const existingIndex = portfolio.holdings.findIndex(
        holding => normalizeSymbol(holding.symbol) === symbol,
      );

      const holdings = [...portfolio.holdings];
      if (existingIndex >= 0) {
        const existing = holdings[existingIndex];
        const totalShares = existing.shares + tx.shares;
        const totalCost = existing.shares * existing.averagePrice + tx.shares * pricePerShare;
        holdings[existingIndex] = {
          ...existing,
          shares: totalShares,
          averagePrice: totalShares > 0 ? totalCost / totalShares : 0,
        };
      } else {
        holdings.push({ symbol, shares: tx.shares, averagePrice: pricePerShare });
      }

      return { cashBalance: portfolio.cashBalance - tx.amount, holdings };
    }

    case 'SELL': {
      if (!symbol || !tx.shares || tx.shares <= 0) return portfolio;

      // Average cost is unchanged by a sale, so only the share count moves.
      const holdings = portfolio.holdings
        .map(holding => {
          if (normalizeSymbol(holding.symbol) !== symbol) return holding;
          return { ...holding, shares: Math.max(0, holding.shares - tx.shares!) };
        })
        .filter(holding => holding.shares > SHARE_EPSILON);

      return { cashBalance: portfolio.cashBalance + tx.amount, holdings };
    }

    default:
      return portfolio;
  }
};

/** Human-readable label for a transaction type. */
/**
 * Display name for a transaction type. New money is a "contribution" in a Roth
 * IRA, where the word has a legal meaning, and a "deposit" anywhere else.
 */
export const transactionLabel = (type: Transaction['type'], accountType: AccountType = 'ROTH_IRA'): string => ({
  CONTRIBUTION: accountType === 'ROTH_IRA' ? 'Contribution' : 'Deposit',
  WITHDRAWAL: 'Withdrawal',
  BUY: 'Buy',
  SELL: 'Sell',
  DIVIDEND: 'Dividend',
}[type]);

/** Sign of a transaction's effect on cash, for display. */
export const cashDirection = (type: Transaction['type']): 1 | -1 =>
  type === 'WITHDRAWAL' || type === 'BUY' ? -1 : 1;
