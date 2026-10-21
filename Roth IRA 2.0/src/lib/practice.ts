/**
 * Practice mode: trade play money through a stretch of past market history,
 * one simulated day at a time. Pure functions — no network, no storage, no
 * clock — so the rules that keep the simulator honest can be tested directly.
 *
 * The rules (DESIGN.md, "Rules that keep it honest"):
 * - No look-ahead. Prices reach the UI only through `visibleBars`, which stops
 *   at the simulated day. Nothing derived from a later bar may be shown —
 *   that includes goals, which are judged only on days already played.
 * - Orders fill at the simulated day's close.
 * - A practice account is its own transaction log, replayed with the same
 *   `replayTransactions` as the real Activity screen, and stored separately.
 * - No made-up prices. A scenario's calendar is the days every one of its
 *   assets traded, so nothing is forward-filled or interpolated.
 */

import { PriceData, Transaction } from '../types';
import { replayTransactions } from './transactions';

export interface ScenarioAsset {
  symbol: string;
  name: string;
  /**
   * A fund holding many companies. Single-position concentration limits are
   * about individual companies, so they don't apply to a fund.
   */
  isFund: boolean;
}

/** What a beginner is asked to aim for. Judged only on days already played. */
export type ScenarioGoal =
  /** The account never falls more than `limit` (e.g. 0.15) below the starting cash. */
  | { kind: 'MAX_DRAWDOWN'; limit: number }
  /** Finish with at least `value`. */
  | { kind: 'FINISH_ABOVE'; value: number }
  /** Finish ahead of the buy-and-hold yardstick. */
  | { kind: 'BEAT_BUY_AND_HOLD' };

export interface PracticeScenario {
  id: string;
  name: string;
  /** Shown before starting. */
  summary: string;
  assets: ScenarioAsset[];
  /** First day fetched, shown as context before trading starts. */
  historyStart: string;
  /** Trading starts on the first market day on or after this date. */
  start: string;
  end: string;
  startingCash: number;
  goal?: ScenarioGoal;
}

export const SCENARIOS: PracticeScenario[] = [
  {
    id: 'spy-2020',
    name: 'The 2020 crash',
    summary:
      'Start with $10,000 in early February 2020 and trade SPY through the next five months. ' +
      'You see each day as it happens, and nothing after it.',
    assets: [{ symbol: 'SPY', name: 'SPDR S&P 500 ETF — a fund holding the 500 largest US companies', isFund: true }],
    historyStart: '2020-01-02',
    start: '2020-02-03',
    end: '2020-06-30',
    startingCash: 10000,
    goal: { kind: 'MAX_DRAWDOWN', limit: 0.15 },
  },
  {
    id: 'crisis-2008',
    name: 'The 2008 financial crisis',
    summary:
      'Start with $10,000 in September 2008, as trouble spreads through the banks, and trade until June 2009. ' +
      'Choose between the whole market, a big bank and gold.',
    assets: [
      { symbol: 'SPY', name: 'SPDR S&P 500 ETF — a fund holding the 500 largest US companies', isFund: true },
      { symbol: 'JPM', name: 'JPMorgan Chase — a large US bank', isFund: false },
      { symbol: 'GLD', name: 'SPDR Gold Shares — a fund that tracks the price of gold', isFund: true },
    ],
    historyStart: '2008-08-01',
    start: '2008-09-02',
    end: '2009-06-30',
    startingCash: 10000,
    goal: { kind: 'FINISH_ABOVE', value: 9000 },
  },
  {
    id: 'bear-2022',
    name: 'The 2022 bear market',
    summary:
      'Start with $10,000 at the beginning of 2022, as interest rates start to rise, and trade through the year. ' +
      'Choose between the whole market, the big tech companies, and Apple.',
    assets: [
      { symbol: 'SPY', name: 'SPDR S&P 500 ETF — a fund holding the 500 largest US companies', isFund: true },
      { symbol: 'QQQ', name: 'Invesco QQQ — a fund holding the 100 largest Nasdaq companies, mostly tech', isFund: true },
      { symbol: 'AAPL', name: 'Apple', isFund: false },
    ],
    historyStart: '2021-12-01',
    start: '2022-01-03',
    end: '2022-12-30',
    startingCash: 10000,
    goal: { kind: 'BEAT_BUY_AND_HOLD' },
  },
  {
    id: 'sideways-2015',
    name: 'A sideways year',
    summary:
      'Start with $10,000 in January 2015 and trade through the year — a year without one big story. ' +
      'Choose between the whole market, Apple and Coca-Cola.',
    assets: [
      { symbol: 'SPY', name: 'SPDR S&P 500 ETF — a fund holding the 500 largest US companies', isFund: true },
      { symbol: 'AAPL', name: 'Apple', isFund: false },
      { symbol: 'KO', name: 'Coca-Cola', isFund: false },
    ],
    historyStart: '2014-12-01',
    start: '2015-01-02',
    end: '2015-12-31',
    startingCash: 10000,
    goal: { kind: 'FINISH_ABOVE', value: 10000 },
  },
];

export const findScenario = (id: string) => SCENARIOS.find(scenario => scenario.id === id);

/** Prices for a scenario: one calendar, and every asset's bars aligned to it. */
export interface PracticeMarket {
  dates: string[];
  /** For each symbol, one bar per calendar date: `bars[s][i].date === dates[i]`. */
  bars: Record<string, PriceData[]>;
}

export interface PracticeSession {
  scenarioId: string;
  /** Index into the market's calendar of the simulated "today". */
  day: number;
  /** Starting cash as a deposit, then the user's buys and sells. */
  transactions: Transaction[];
  /** Names, tickers and dates hidden; prices rescaled to start at 100. */
  mystery?: boolean;
  /** The scenario itself, for one the user built rather than a preset. */
  custom?: PracticeScenario;
}

export type OrderSide = 'BUY' | 'SELL';

const closeOf = (bar: PriceData) => bar.close ?? bar.price;

/**
 * Align each symbol's bars to the days every symbol traded. Returns null when
 * a symbol has no data, or fewer than two common days remain.
 */
export const buildMarket = (rowsBySymbol: Record<string, PriceData[]>): PracticeMarket | null => {
  const symbols = Object.keys(rowsBySymbol);
  if (symbols.length === 0 || symbols.some(s => rowsBySymbol[s].length === 0)) return null;

  const byDate = symbols.map(s => new Map(rowsBySymbol[s].map(bar => [bar.date, bar])));
  const dates = Array.from(byDate[0].keys())
    .filter(date => byDate.every(map => map.has(date)))
    .sort();
  if (dates.length < 2) return null;

  const bars: Record<string, PriceData[]> = {};
  symbols.forEach((symbol, i) => { bars[symbol] = dates.map(date => byDate[i].get(date)!); });
  return { dates, bars };
};

/** Index of the first calendar date on or after `date`, or -1 when there is none. */
export const firstIndexOnOrAfter = (dates: string[], date: string) => dates.findIndex(d => d >= date);

/** The calendar day trading starts on. */
export const scenarioStartDay = (market: PracticeMarket, scenario: PracticeScenario) =>
  firstIndexOnOrAfter(market.dates, scenario.start);

/**
 * The bars a player may see on simulated day `day`: everything up to and
 * including that day. The single gate between price data and the screen.
 */
export const visibleBars = (bars: PriceData[], day: number): PriceData[] =>
  bars.slice(0, Math.max(0, Math.min(day, bars.length - 1)) + 1);

export const closeAt = (market: PracticeMarket, symbol: string, day: number) => closeOf(market.bars[symbol][day]);

export const startSession = (
  scenario: PracticeScenario,
  market: PracticeMarket,
  options: { mystery?: boolean; custom?: boolean } = {},
): PracticeSession | null => {
  const day = scenarioStartDay(market, scenario);
  if (day < 0) return null;
  return {
    scenarioId: scenario.id,
    day,
    transactions: [
      { id: 'p000', date: market.dates[day], type: 'CONTRIBUTION', amount: scenario.startingCash, note: 'Starting play money' },
    ],
    ...(options.mystery ? { mystery: true } : {}),
    ...(options.custom ? { custom: scenario } : {}),
  };
};

/** True once the clock has reached the last market day. */
export const isFinished = (session: PracticeSession, market: PracticeMarket) => session.day >= market.dates.length - 1;

/** Move the clock forward, never past the last day and never backward. */
export const advance = (session: PracticeSession, market: PracticeMarket, days: number): PracticeSession => ({
  ...session,
  day: Math.min(session.day + Math.max(0, Math.floor(days)), market.dates.length - 1),
});

export interface PositionState {
  symbol: string;
  shares: number;
  /** Average cost of the shares still held. */
  averageCost: number;
  price: number;
  value: number;
}

export interface AccountState {
  cash: number;
  /** Every scenario asset, held or not, in scenario order. */
  positions: PositionState[];
  value: number;
  /** Fraction gained since the start, e.g. 0.05 for +5%. */
  returnPct: number;
  realized: number;
}

/**
 * The account at the close of `day` (default: the simulated today), counting
 * only trades made on or before that day.
 */
export const accountState = (
  session: PracticeSession,
  market: PracticeMarket,
  scenario: PracticeScenario,
  day: number = session.day,
): AccountState => {
  const date = market.dates[day];
  const replay = replayTransactions(session.transactions.filter(tx => tx.date <= date));
  const positions = scenario.assets.map(asset => {
    const held = replay.positions.find(p => p.symbol === asset.symbol);
    const price = closeAt(market, asset.symbol, day);
    const shares = held?.shares ?? 0;
    return { symbol: asset.symbol, shares, averageCost: held?.averagePrice ?? 0, price, value: shares * price };
  });
  const value = replay.cashBalance + positions.reduce((sum, p) => sum + p.value, 0);
  return {
    cash: replay.cashBalance,
    positions,
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
 * Buy or sell whole shares of one scenario asset at the simulated day's close.
 * Rejects anything the account can't cover rather than letting cash or shares
 * go negative.
 */
export const placeOrder = (
  session: PracticeSession,
  market: PracticeMarket,
  scenario: PracticeScenario,
  symbol: string,
  side: OrderSide,
  shares: number,
): OrderResult => {
  if (!scenario.assets.some(asset => asset.symbol === symbol)) return { error: 'That isn’t tradable in this scenario.' };
  if (!Number.isInteger(shares) || shares <= 0) return { error: 'Enter a whole number of shares above zero.' };

  const account = accountState(session, market, scenario);
  const position = account.positions.find(p => p.symbol === symbol)!;
  const amount = shares * position.price;

  if (side === 'BUY' && amount > account.cash + 1e-9) {
    const affordable = maxBuyShares(account.cash, position.price);
    return { error: `That costs more than your cash. You can afford ${affordable} share${affordable === 1 ? '' : 's'}.` };
  }
  if (side === 'SELL' && shares > position.shares + 1e-9) {
    return { error: `You only hold ${position.shares} share${position.shares === 1 ? '' : 's'}.` };
  }

  const transaction: Transaction = {
    id: `p${String(session.transactions.length).padStart(3, '0')}`,
    date: market.dates[session.day],
    type: side,
    symbol,
    shares,
    pricePerShare: position.price,
    amount,
  };
  return { session: { ...session, transactions: [...session.transactions, transaction] } };
};

export interface OrderImpact {
  amount: number;
  price: number;
  cashAfter: number;
  sharesAfter: number;
  /** The position's share of the account after the order, 0–1. */
  weightAfter: number;
  /** Gain (or loss, negative) this sale locks in; null for a buy. */
  realizedGain: number | null;
}

/**
 * What an order would do, worked out by actually applying it — so the numbers
 * shown before confirming match what gets recorded. Null if it would be refused.
 */
export const orderImpact = (
  session: PracticeSession,
  market: PracticeMarket,
  scenario: PracticeScenario,
  symbol: string,
  side: OrderSide,
  shares: number,
): OrderImpact | null => {
  const result = placeOrder(session, market, scenario, symbol, side, shares);
  if (!result.session) return null;
  const before = accountState(session, market, scenario);
  const after = accountState(result.session, market, scenario);
  const position = after.positions.find(p => p.symbol === symbol)!;
  return {
    amount: shares * position.price,
    price: position.price,
    cashAfter: after.cash,
    sharesAfter: position.shares,
    weightAfter: after.value > 0 ? position.value / after.value : 0,
    realizedGain: side === 'SELL' ? after.realized - before.realized : null,
  };
};

/**
 * The yardstick: the starting cash split evenly across every asset on the
 * first trading day (whole shares), then never touched. With one asset this
 * is simply "put it all in and hold".
 */
export const buyAndHoldValue = (market: PracticeMarket, scenario: PracticeScenario, day: number) => {
  const startDay = scenarioStartDay(market, scenario);
  const slice = scenario.startingCash / scenario.assets.length;
  let value = scenario.startingCash;
  for (const asset of scenario.assets) {
    const entry = closeAt(market, asset.symbol, startDay);
    const shares = maxBuyShares(slice, entry);
    value += shares * (closeAt(market, asset.symbol, day) - entry);
  }
  return value;
};

/**
 * The account's lowest point so far relative to the starting cash (≤ 0), over
 * the days already played — never peeking past the simulated day.
 */
export const worstDrawdown = (session: PracticeSession, market: PracticeMarket, scenario: PracticeScenario) => {
  const startDay = scenarioStartDay(market, scenario);
  let worst = 0;
  for (let day = startDay; day <= session.day; day++) {
    worst = Math.min(worst, accountState(session, market, scenario, day).value / scenario.startingCash - 1);
  }
  return worst;
};

/** `met` is null while the outcome can't yet be known from the days played. */
export interface GoalStatus {
  met: boolean | null;
  /** The number the goal is judged on, for showing progress. */
  current: number;
}

export const goalStatus = (
  goal: ScenarioGoal,
  session: PracticeSession,
  market: PracticeMarket,
  scenario: PracticeScenario,
): GoalStatus => {
  const finished = isFinished(session, market);
  const value = accountState(session, market, scenario).value;
  switch (goal.kind) {
    case 'MAX_DRAWDOWN': {
      const worst = worstDrawdown(session, market, scenario);
      // Breaking the limit fails the goal at once; staying within it only
      // counts as met once the scenario is over.
      const failed = worst < -goal.limit - 1e-12;
      return { met: failed ? false : finished ? true : null, current: worst };
    }
    case 'FINISH_ABOVE':
      return { met: finished ? value >= goal.value - 1e-9 : null, current: value };
    case 'BEAT_BUY_AND_HOLD': {
      const lead = value - buyAndHoldValue(market, scenario, session.day);
      return { met: finished ? lead > 1e-9 : null, current: lead };
    }
  }
};

/** How far the day's close sits below the highest close seen so far (≤ 0). */
export const drawdownFromHigh = (bars: PriceData[], day: number) => {
  const seen = visibleBars(bars, day).map(closeOf);
  const high = Math.max(...seen);
  return seen[seen.length - 1] / high - 1;
};

/**
 * Mystery mode's prices: each asset rescaled so its close on the first trading
 * day is 100. Every ratio — and so every return — is unchanged, but the price
 * level no longer gives away which stock or year it is.
 */
export const rescaleForMystery = (market: PracticeMarket, startDay: number): PracticeMarket => {
  const bars: Record<string, PriceData[]> = {};
  for (const [symbol, rows] of Object.entries(market.bars)) {
    const factor = 100 / closeOf(rows[startDay]);
    const scale = (v?: number) => (v == null ? v : v * factor);
    bars[symbol] = rows.map(bar => ({
      ...bar,
      price: bar.price * factor,
      open: scale(bar.open),
      high: scale(bar.high),
      low: scale(bar.low),
      close: scale(bar.close),
    }));
  }
  return { dates: market.dates, bars };
};

/** Stand-in names for mystery mode: "Fund A", "Stock B", … in scenario order. */
export const mysteryLabels = (scenario: PracticeScenario): Record<string, string> =>
  Object.fromEntries(
    scenario.assets.map((asset, i) => [asset.symbol, `${asset.isFund ? 'Fund' : 'Stock'} ${String.fromCharCode(65 + i)}`]),
  );

/** Well-known funds, so a custom scenario holding them isn't held to single-company limits. */
const KNOWN_FUNDS = new Set(['SPY', 'VOO', 'IVV', 'VTI', 'QQQ', 'DIA', 'IWM', 'GLD', 'SLV', 'TLT', 'AGG', 'BND', 'VEA', 'VWO', 'EFA', 'SCHD', 'VGT', 'XLK', 'XLF', 'ARKK']);

export interface CustomScenarioInput {
  symbols: string;
  start: string;
  end: string;
  startingCash: number;
}

/**
 * Check a scenario the user built and turn it into one. `today` is passed in
 * (as 'YYYY-MM-DD') so this stays free of the clock.
 */
export const buildCustomScenario = (
  input: CustomScenarioInput,
  today: string,
): { scenario?: PracticeScenario; error?: string } => {
  const symbols = Array.from(new Set(
    input.symbols.split(/[\s,]+/).map(s => s.trim().toUpperCase()).filter(Boolean),
  ));
  if (symbols.length === 0) return { error: 'Enter at least one ticker.' };
  if (symbols.length > 3) return { error: 'Pick up to three tickers.' };
  if (symbols.some(s => !/^[A-Z][A-Z0-9.-]{0,9}$/.test(s))) return { error: 'Tickers are letters, like AAPL or SPY.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.start) || !/^\d{4}-\d{2}-\d{2}$/.test(input.end)) return { error: 'Pick a start and an end date.' };
  if (input.start < '1994-01-01') return { error: 'Start in 1994 or later.' };
  if (input.end >= today) return { error: 'End before today — practice uses days that have already happened.' };
  const spanDays = (Date.parse(input.end) - Date.parse(input.start)) / 86_400_000;
  if (spanDays < 30) return { error: 'Make it at least a month long.' };
  if (spanDays > 3 * 366) return { error: 'Keep it to three years or less.' };
  if (!(input.startingCash >= 100 && input.startingCash <= 10_000_000)) return { error: 'Starting cash must be between $100 and $10,000,000.' };

  const historyStart = new Date(Date.parse(input.start) - 45 * 86_400_000).toISOString().slice(0, 10);
  return {
    scenario: {
      id: 'custom',
      name: 'Your scenario',
      summary: `${symbols.join(', ')} from ${input.start} to ${input.end}.`,
      assets: symbols.map(symbol => ({ symbol, name: symbol, isFund: KNOWN_FUNDS.has(symbol) })),
      historyStart,
      start: input.start,
      end: input.end,
      startingCash: input.startingCash,
    },
  };
};

/** A stored session is usable only if it still fits the market it refers to. */
export const isValidSession = (value: unknown, market: PracticeMarket): value is PracticeSession => {
  const session = value as PracticeSession;
  return Boolean(
    session
      && typeof session.scenarioId === 'string'
      && Number.isInteger(session.day)
      && session.day >= 0
      && session.day < market.dates.length
      && Array.isArray(session.transactions)
      && session.transactions.length > 0,
  );
};
