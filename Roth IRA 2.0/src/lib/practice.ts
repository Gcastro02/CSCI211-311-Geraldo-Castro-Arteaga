/**
 * Practice mode: trade play money through a stretch of past market history,
 * one simulated day at a time. Pure functions — no network, no storage, no
 * clock — so the rules that keep the simulator honest can be tested directly.
 *
 * The rules (DESIGN.md, "Rules that keep it honest"):
 * - No look-ahead. Prices reach the UI only through `visibleBars`, which stops
 *   at the simulated day. Nothing derived from a later bar may be shown.
 * - Orders fill at the simulated day's close.
 * - A practice account is its own transaction log, replayed with the same
 *   `replayTransactions` as the real Activity screen, and stored separately.
 */

import { PriceData, Transaction } from '../types';
import { replayTransactions } from './transactions';

export interface PracticeScenario {
  id: string;
  name: string;
  /** Shown before starting. */
  summary: string;
  /** The one symbol tradable in this scenario. */
  symbol: string;
  symbolName: string;
  /** First bar fetched, shown as context before trading starts. */
  historyStart: string;
  /** Trading starts on the first bar on or after this date. */
  start: string;
  end: string;
  startingCash: number;
}

export const SCENARIOS: PracticeScenario[] = [
  {
    id: 'spy-2020',
    name: 'The 2020 crash',
    summary:
      'Start with $10,000 in early February 2020 and trade SPY through the next five months. ' +
      'You see each day as it happens, and nothing after it.',
    symbol: 'SPY',
    symbolName: 'SPDR S&P 500 ETF — a fund holding the 500 largest US companies',
    historyStart: '2020-01-02',
    start: '2020-02-03',
    end: '2020-06-30',
    startingCash: 10000,
  },
];

export const findScenario = (id: string) => SCENARIOS.find(scenario => scenario.id === id);

export interface PracticeSession {
  scenarioId: string;
  /** Index into the scenario's bars of the simulated "today". */
  day: number;
  /** Starting cash as a deposit, then the user's buys and sells. */
  transactions: Transaction[];
}

export type OrderSide = 'BUY' | 'SELL';

const closeOf = (bar: PriceData) => bar.close ?? bar.price;

/** Index of the first bar on or after `date`, or -1 when there is none. */
export const firstIndexOnOrAfter = (bars: PriceData[], date: string) =>
  bars.findIndex(bar => bar.date >= date);

/**
 * The bars a player may see on simulated day `day`: everything up to and
 * including that day. The single gate between price data and the screen.
 */
export const visibleBars = (bars: PriceData[], day: number): PriceData[] =>
  bars.slice(0, Math.max(0, Math.min(day, bars.length - 1)) + 1);

export const startSession = (scenario: PracticeScenario, bars: PriceData[]): PracticeSession | null => {
  const day = firstIndexOnOrAfter(bars, scenario.start);
  if (day < 0) return null;
  return {
    scenarioId: scenario.id,
    day,
    transactions: [
      { id: 'p000', date: bars[day].date, type: 'CONTRIBUTION', amount: scenario.startingCash, note: 'Starting play money' },
    ],
  };
};

/** True once the clock has reached the scenario's last bar. */
export const isFinished = (session: PracticeSession, bars: PriceData[]) => session.day >= bars.length - 1;

/** Move the clock forward, never past the last bar and never backward. */
export const advance = (session: PracticeSession, bars: PriceData[], days: number): PracticeSession => ({
  ...session,
  day: Math.min(session.day + Math.max(0, Math.floor(days)), bars.length - 1),
});

export interface AccountState {
  cash: number;
  shares: number;
  /** Average cost of the shares still held, or 0 with none. */
  averageCost: number;
  price: number;
  value: number;
  /** Fraction gained since the start, e.g. 0.05 for +5%. */
  returnPct: number;
  realized: number;
}

/** The account on the simulated day, valued at that day's close. */
export const accountState = (session: PracticeSession, bars: PriceData[], scenario: PracticeScenario): AccountState => {
  const replay = replayTransactions(session.transactions);
  const position = replay.positions.find(p => p.symbol === scenario.symbol);
  const price = closeOf(bars[session.day]);
  const shares = position?.shares ?? 0;
  const value = replay.cashBalance + shares * price;
  return {
    cash: replay.cashBalance,
    shares,
    averageCost: position?.averagePrice ?? 0,
    price,
    value,
    returnPct: value / scenario.startingCash - 1,
    realized: replay.totalRealized,
  };
};

/** Whole shares the cash on hand buys at the day's close. */
export const maxBuyShares = (cash: number, price: number) =>
  price > 0 ? Math.floor((cash + 1e-9) / price) : 0;

/** Exactly one of the two is set: the updated session, or why the order was refused. */
export interface OrderResult {
  session?: PracticeSession;
  error?: string;
}

/**
 * Buy or sell whole shares at the simulated day's close. Rejects anything the
 * account can't cover rather than letting cash or shares go negative.
 */
export const placeOrder = (
  session: PracticeSession,
  bars: PriceData[],
  scenario: PracticeScenario,
  side: OrderSide,
  shares: number,
): OrderResult => {
  if (!Number.isInteger(shares) || shares <= 0) return { error: 'Enter a whole number of shares above zero.' };

  const account = accountState(session, bars, scenario);
  const price = account.price;
  const amount = shares * price;

  if (side === 'BUY' && amount > account.cash + 1e-9) {
    const affordable = maxBuyShares(account.cash, price);
    return { error: `That costs more than your cash. You can afford ${affordable} share${affordable === 1 ? '' : 's'}.` };
  }
  if (side === 'SELL' && shares > account.shares + 1e-9) {
    return { error: `You only hold ${account.shares} share${account.shares === 1 ? '' : 's'}.` };
  }

  const transaction: Transaction = {
    id: `p${String(session.transactions.length).padStart(3, '0')}`,
    date: bars[session.day].date,
    type: side,
    symbol: scenario.symbol,
    shares,
    pricePerShare: price,
    amount,
  };
  return { session: { ...session, transactions: [...session.transactions, transaction] } };
};

/**
 * What putting all the starting cash into the symbol on the first trading day
 * and never touching it would be worth on `day` — the yardstick for the player.
 */
export const buyAndHoldValue = (bars: PriceData[], scenario: PracticeScenario, day: number) => {
  const startDay = firstIndexOnOrAfter(bars, scenario.start);
  const entry = closeOf(bars[startDay]);
  const shares = maxBuyShares(scenario.startingCash, entry);
  return scenario.startingCash - shares * entry + shares * closeOf(bars[day]);
};

/** How far the day's close sits below the highest close seen so far (≤ 0). */
export const drawdownFromHigh = (bars: PriceData[], day: number) => {
  const seen = visibleBars(bars, day).map(closeOf);
  const high = Math.max(...seen);
  return seen[seen.length - 1] / high - 1;
};

/** A stored session is usable only if it still fits the bars it refers to. */
export const isValidSession = (value: unknown, bars: PriceData[]): value is PracticeSession => {
  const session = value as PracticeSession;
  return Boolean(
    session
      && typeof session.scenarioId === 'string'
      && Number.isInteger(session.day)
      && session.day >= 0
      && session.day < bars.length
      && Array.isArray(session.transactions)
      && session.transactions.length > 0,
  );
};
