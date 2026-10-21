/**
 * The practice opponent: the Trading Simulator's bot (trader.cpp), replayed on
 * the same scenario, same days and same closing prices as the player.
 *
 * Its exit and sizing rules are ported unchanged. Its buy signal is not: the
 * original asked a Random Forest trained on the five years before its data
 * was collected — years that overlap the scenarios, so it would be trading
 * history it had already seen — and that model needs Python. Here the signal
 * comes from `scoreTechnicals`, built from the same indicators the model was
 * fed, computed only from bars up to the day being decided.
 *
 * Two deliberate differences from the original, both to make the matchup fair
 * against the player: whole shares only, and (as for the player) the 25%
 * single-position cap applies to individual companies, not to funds.
 */

import { PriceData } from '../types';
import { computeIndicators, scoreTechnicals } from './indicators';
import { PracticeMarket, PracticeScenario, PracticeSession, closeAt, maxBuyShares, scenarioStartDay, visibleBars } from './practice';

/** trader.cpp's defaults (RISK_THRESHOLD, ML_CONFIDENCE_THRESHOLD, STOP_LOSS_PCT, TAKE_PROFIT_PCT) and its cash buffer. */
export const BOT_RULES = {
  riskLimit: 0.25,
  minConfidence: 0.55,
  stopLoss: 0.15,
  takeProfit: 0.3,
  cashBuffer: 0.05,
};

/**
 * Bars the signal looks back over. The original's predictor fetched 60 days;
 * a bounded window also keeps a long scenario's replay linear in its length.
 */
const SIGNAL_WINDOW = 120;

export interface BotSignal {
  buy: boolean;
  /** 0.5–1 when buying: how strongly the indicators agree. */
  confidence: number;
  /** The technical score behind it, −100 to +100. */
  score: number;
  /** Plain reasons for a buy, strongest first. */
  reasons: string[];
}

/**
 * The bot's read of one asset from the bars it may see. The score (−100 to
 * +100) maps onto a probability the way the model's output did: above 0.5
 * means buy, and that probability is the confidence that sizes the order.
 */
export const botSignal = (bars: PriceData[]): BotSignal => {
  const snapshot = computeIndicators('', bars.slice(-SIGNAL_WINDOW));
  if (!snapshot) return { buy: false, confidence: 0, score: 0, reasons: [] };
  const { score, components } = scoreTechnicals(snapshot);
  const probability = (score + 100) / 200;
  const buy = probability > 0.5;
  return {
    buy,
    confidence: buy ? probability : 1 - probability,
    score,
    reasons: components
      .filter(c => c.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(c => c.detail),
  };
};

/** Why the bot made one trade. Buys carry the signal; sales carry the exit rule. */
export interface BotDecision {
  kind: 'BUY' | 'STOP_LOSS' | 'TAKE_PROFIT';
  txId: string;
  confidence?: number;
  score?: number;
  reasons?: string[];
  /** The 25% cap, not the confidence, limited the size. */
  capped?: boolean;
  returnPct?: number;
  averageCost?: number;
}

export interface BotRun {
  /** The bot's account as a practice session, so `accountState` can value it on any day. */
  session: PracticeSession;
  /** Why each trade was made, keyed to its transaction by `txId`. */
  decisions: BotDecision[];
}

/**
 * Play the bot from the scenario's first trading day through `throughDay`.
 * Each day it sees only `visibleBars` up to that day, sells first (stop-loss
 * before take-profit, as in trader.cpp), then buys. Fills at the day's close.
 *
 * `signal` is replaceable so tests can drive the rules with a fixed signal.
 */
export const runBot = (
  market: PracticeMarket,
  scenario: PracticeScenario,
  throughDay: number = market.dates.length - 1,
  signal: (bars: PriceData[]) => BotSignal = botSignal,
): BotRun => {
  const startDay = scenarioStartDay(market, scenario);
  const session: PracticeSession = {
    scenarioId: scenario.id,
    day: Math.max(startDay, Math.min(throughDay, market.dates.length - 1)),
    transactions: [
      { id: 'b000', date: market.dates[startDay], type: 'CONTRIBUTION', amount: scenario.startingCash, note: 'Starting play money' },
    ],
  };
  const decisions: BotDecision[] = [];
  let cash = scenario.startingCash;
  const held = new Map<string, { shares: number; averageCost: number }>();

  const record = (day: number, side: 'BUY' | 'SELL', symbol: string, shares: number, price: number) => {
    const id = `b${String(session.transactions.length).padStart(3, '0')}`;
    session.transactions.push({ id, date: market.dates[day], type: side, symbol, shares, pricePerShare: price, amount: shares * price });
    return id;
  };

  for (let day = startDay; day <= session.day; day++) {
    // Exits.
    for (const asset of scenario.assets) {
      const position = held.get(asset.symbol);
      if (!position) continue;
      const price = closeAt(market, asset.symbol, day);
      const returnPct = price / position.averageCost - 1;
      const kind = returnPct <= -BOT_RULES.stopLoss ? 'STOP_LOSS' : returnPct >= BOT_RULES.takeProfit ? 'TAKE_PROFIT' : null;
      if (!kind) continue;
      const txId = record(day, 'SELL', asset.symbol, position.shares, price);
      decisions.push({ kind, txId, returnPct, averageCost: position.averageCost });
      cash += position.shares * price;
      held.delete(asset.symbol);
    }

    // Entries, in scenario order.
    for (const asset of scenario.assets) {
      const read = signal(visibleBars(market.bars[asset.symbol], day));
      if (!read.buy || read.confidence < BOT_RULES.minConfidence) continue;

      const price = closeAt(market, asset.symbol, day);
      const spendable = cash * (1 - BOT_RULES.cashBuffer);
      const value = cash + scenario.assets.reduce((sum, a) => sum + (held.get(a.symbol)?.shares ?? 0) * closeAt(market, a.symbol, day), 0);
      const position = held.get(asset.symbol);
      const room = asset.isFund ? Infinity : Math.max(0, BOT_RULES.riskLimit * value - (position?.shares ?? 0) * price);
      const allocation = Math.min(spendable * read.confidence, room);
      const shares = maxBuyShares(allocation, price);
      if (shares <= 0) continue;

      const txId = record(day, 'BUY', asset.symbol, shares, price);
      decisions.push({ kind: 'BUY', txId, confidence: read.confidence, score: read.score, reasons: read.reasons, capped: room < spendable * read.confidence });
      cash -= shares * price;
      const before = position ?? { shares: 0, averageCost: 0 };
      held.set(asset.symbol, {
        shares: before.shares + shares,
        averageCost: (before.shares * before.averageCost + shares * price) / (before.shares + shares),
      });
    }
  }

  return { session, decisions };
};
