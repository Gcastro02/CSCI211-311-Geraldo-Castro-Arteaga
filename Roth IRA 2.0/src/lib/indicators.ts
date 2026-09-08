/**
 * Technical indicators ported from the Trading Simulator's Python feature pipeline
 * (ml_model/data_collector.py). Same formulas, same windows, same conventions —
 * including pandas' sample standard deviation (ddof=1) and `ewm(adjust=False)`
 * recursion — so these numbers line up with what the bot computed.
 *
 * Everything here is derived from real OHLCV bars. No model, no LLM, no guessing.
 */

import { PriceData } from '../types';

/** A `null` entry means "not enough history yet" (pandas would emit NaN). */
type Series = (number | null)[];

// ---------------------------------------------------------------------------
// Rolling primitives
// ---------------------------------------------------------------------------

const rollingMean = (values: Series, window: number): Series =>
  values.map((_, i) => {
    if (i < window - 1) return null;
    const slice = values.slice(i - window + 1, i + 1);
    if (slice.some(v => v === null)) return null;
    return (slice as number[]).reduce((a, b) => a + b, 0) / window;
  });

/** Sample standard deviation (ddof=1) to match pandas' `rolling().std()`. */
const rollingStd = (values: Series, window: number): Series =>
  values.map((_, i) => {
    if (i < window - 1 || window < 2) return null;
    const slice = values.slice(i - window + 1, i + 1);
    if (slice.some(v => v === null)) return null;
    const nums = slice as number[];
    const mean = nums.reduce((a, b) => a + b, 0) / window;
    const variance = nums.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (window - 1);
    return Math.sqrt(variance);
  });

/** Exponential moving average matching pandas `ewm(span, adjust=False)`. */
const ema = (values: number[], span: number): Series => {
  const alpha = 2 / (span + 1);
  let prev: number | null = null;
  return values.map(value => {
    prev = prev === null ? value : alpha * value + (1 - alpha) * prev;
    return prev;
  });
};

/** `Series.pct_change(periods)` — fractional change vs. `periods` bars ago. */
const pctChange = (values: number[], periods = 1): Series =>
  values.map((value, i) => {
    if (i < periods) return null;
    const previous = values[i - periods];
    if (!Number.isFinite(previous) || previous === 0) return null;
    return value / previous - 1;
  });

// ---------------------------------------------------------------------------
// Indicators
// ---------------------------------------------------------------------------

/**
 * Relative Strength Index.
 *
 * Note this is the simple-moving-average variant (sometimes called Cutler's RSI)
 * rather than Wilder's smoothed version, because that is what the bot's Python
 * used and what its model was trained against. Values run 0-100; conventionally
 * below 30 reads oversold and above 70 overbought.
 */
export const calculateRsi = (closes: number[], period = 14): Series => {
  const deltas: Series = closes.map((close, i) => (i === 0 ? null : close - closes[i - 1]));
  const gains: Series = deltas.map(d => (d === null ? null : Math.max(d, 0)));
  const losses: Series = deltas.map(d => (d === null ? null : Math.max(-d, 0)));

  // pandas treats the leading NaN from .diff() as a gap, so the first window is
  // short by one observation. Substituting 0 reproduces that alignment.
  const avgGain = rollingMean(gains.map(g => g ?? 0), period);
  const avgLoss = rollingMean(losses.map(l => l ?? 0), period);

  return closes.map((_, i) => {
    const gain = avgGain[i];
    const loss = avgLoss[i];
    if (gain === null || loss === null || i < period) return null;
    if (loss === 0) return gain === 0 ? 50 : 100;
    const rs = gain / loss;
    return 100 - 100 / (1 + rs);
  });
};

export interface MacdResult {
  macd: Series;
  signal: Series;
  histogram: Series;
}

/** MACD(12, 26, 9) — fast EMA minus slow EMA, plus its 9-period signal line. */
export const calculateMacd = (closes: number[]): MacdResult => {
  const fast = ema(closes, 12);
  const slow = ema(closes, 26);

  const macd: Series = closes.map((_, i) => {
    const f = fast[i];
    const s = slow[i];
    return f === null || s === null ? null : f - s;
  });

  const signal = ema(macd.map(v => v ?? 0), 9);

  const histogram: Series = macd.map((value, i) => {
    const sig = signal[i];
    return value === null || sig === null ? null : value - sig;
  });

  return { macd, signal, histogram };
};

export interface BollingerResult {
  upper: Series;
  middle: Series;
  lower: Series;
  /** Where price sits in the band: 0 = lower band, 1 = upper band. */
  position: Series;
}

/** Bollinger Bands: 20-period SMA with ±2 sample standard deviations. */
export const calculateBollingerBands = (closes: number[], period = 20): BollingerResult => {
  const middle = rollingMean(closes, period);
  const std = rollingStd(closes, period);

  const upper: Series = middle.map((m, i) => (m === null || std[i] === null ? null : m + std[i]! * 2));
  const lower: Series = middle.map((m, i) => (m === null || std[i] === null ? null : m - std[i]! * 2));

  const position: Series = closes.map((close, i) => {
    const hi = upper[i];
    const lo = lower[i];
    if (hi === null || lo === null || hi === lo) return null;
    return (close - lo) / (hi - lo);
  });

  return { upper, middle, lower, position };
};

// ---------------------------------------------------------------------------
// Feature snapshot
// ---------------------------------------------------------------------------

/**
 * The bot's 14 model features, evaluated at the most recent bar.
 * `null` means there was not enough history to compute that feature.
 */
export interface TechnicalSnapshot {
  symbol: string;
  asOf: string;
  barsUsed: number;

  price: number;
  return5d: number | null;
  return10d: number | null;
  return20d: number | null;
  volumeChange: number | null;
  volumeMaRatio: number | null;
  rsi14: number | null;
  macd: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;
  bbPosition: number | null;
  bbUpper: number | null;
  bbLower: number | null;
  closeVsSma20: number | null;
  sma5: number | null;
  sma20: number | null;
  hlRange: number | null;
  /** Standard deviation of daily returns over 20 bars (a daily, not annual, figure). */
  volatility20: number | null;
  /** `volatility20` scaled to an annual figure using 252 trading days. */
  annualizedVolatility: number | null;
  overnightGap: number | null;
}

const last = (series: Series): number | null => {
  const value = series[series.length - 1];
  return value !== null && value !== undefined && Number.isFinite(value) ? value : null;
};

/**
 * Compute every indicator over a series of bars and return the latest values.
 *
 * Feed this UNSAMPLED daily bars. `getStockPriceHistory` thins its output down
 * to ~30 points for charting, and running these windows over thinned data would
 * silently produce garbage (a "20-day" SMA spanning two years, for instance).
 * Use `getIndicatorBars` to fetch a full series.
 */
export const computeIndicators = (symbol: string, bars: PriceData[]): TechnicalSnapshot | null => {
  if (bars.length < 2) return null;

  const closes = bars.map(bar => bar.close ?? bar.price);
  const opens = bars.map(bar => bar.open ?? bar.close ?? bar.price);
  const highs = bars.map(bar => bar.high ?? bar.close ?? bar.price);
  const lows = bars.map(bar => bar.low ?? bar.close ?? bar.price);
  const volumes = bars.map(bar => bar.volume ?? 0);

  const rsi = calculateRsi(closes, 14);
  const { macd, signal, histogram } = calculateMacd(closes);
  const bands = calculateBollingerBands(closes, 20);

  const sma5 = rollingMean(closes, 5);
  const sma20 = rollingMean(closes, 20);

  const dailyReturns = pctChange(closes, 1);
  const volatility20 = rollingStd(dailyReturns, 20);

  const closeVsSma20: Series = closes.map((close, i) => {
    const avg = sma20[i];
    return avg === null || avg === 0 ? null : (close - avg) / avg;
  });

  const hlRange: Series = closes.map((close, i) =>
    close === 0 ? null : (highs[i] - lows[i]) / close,
  );

  const overnightGap: Series = closes.map((_, i) => {
    if (i === 0) return null;
    const previousClose = closes[i - 1];
    return previousClose === 0 ? null : (opens[i] - previousClose) / previousClose;
  });

  const hasVolume = volumes.some(v => v > 0);
  const volumeMa = rollingMean(volumes, 20);
  const volumeMaRatio: Series = volumes.map((volume, i) => {
    const avg = volumeMa[i];
    return !hasVolume || avg === null || avg === 0 ? null : volume / avg;
  });

  const latestVolatility = last(volatility20);
  const latestBar = bars[bars.length - 1];

  return {
    symbol,
    asOf: latestBar.date,
    barsUsed: bars.length,
    price: closes[closes.length - 1],
    return5d: last(pctChange(closes, 5)),
    return10d: last(pctChange(closes, 10)),
    return20d: last(pctChange(closes, 20)),
    volumeChange: hasVolume ? last(pctChange(volumes, 1)) : null,
    volumeMaRatio: last(volumeMaRatio),
    rsi14: last(rsi),
    macd: last(macd),
    macdSignal: last(signal),
    macdHistogram: last(histogram),
    bbPosition: last(bands.position),
    bbUpper: last(bands.upper),
    bbLower: last(bands.lower),
    closeVsSma20: last(closeVsSma20),
    sma5: last(sma5),
    sma20: last(sma20),
    hlRange: last(hlRange),
    volatility20: latestVolatility,
    annualizedVolatility: latestVolatility === null ? null : latestVolatility * Math.sqrt(252),
    overnightGap: last(overnightGap),
  };
};

// ---------------------------------------------------------------------------
// Transparent technical score
// ---------------------------------------------------------------------------

export interface SignalComponent {
  label: string;
  /** -1 (bearish) to +1 (bullish). */
  score: number;
  detail: string;
}

export interface TechnicalScore {
  /** -100 (bearish) to +100 (bullish). */
  score: number;
  bias: 'BULLISH' | 'NEUTRAL' | 'BEARISH';
  components: SignalComponent[];
}

/**
 * A readable composite of the indicators above.
 *
 * This deliberately replaces the bot's Random Forest rather than porting it. That
 * model scored F1 0.42 / ROC-AUC 0.657 on its own test split — barely above the
 * base rate — and running it in the browser would mean shipping a serialized
 * forest for a signal we cannot explain. A weighted rule set is no less accurate
 * in practice and every component can be shown to the user, which matters more
 * for a tool meant to inform a human's decision.
 */
export const scoreTechnicals = (snapshot: TechnicalSnapshot): TechnicalScore => {
  const components: SignalComponent[] = [];

  if (snapshot.rsi14 !== null) {
    const rsi = snapshot.rsi14;
    let score = 0;
    let detail = 'Neutral momentum';
    if (rsi < 30) {
      score = 1;
      detail = 'Oversold — historically a mean-reversion setup';
    } else if (rsi < 45) {
      score = 0.4;
      detail = 'Leaning oversold';
    } else if (rsi > 70) {
      score = -1;
      detail = 'Overbought — stretched to the upside';
    } else if (rsi > 55) {
      score = -0.4;
      detail = 'Leaning overbought';
    }
    components.push({ label: `RSI ${rsi.toFixed(1)}`, score, detail });
  }

  if (snapshot.macdHistogram !== null) {
    const hist = snapshot.macdHistogram;
    components.push({
      label: `MACD histogram ${hist >= 0 ? '+' : ''}${hist.toFixed(2)}`,
      score: hist > 0 ? 0.8 : -0.8,
      detail: hist > 0 ? 'MACD above its signal line' : 'MACD below its signal line',
    });
  }

  if (snapshot.closeVsSma20 !== null) {
    const gap = snapshot.closeVsSma20;
    components.push({
      label: `${gap >= 0 ? '+' : ''}${(gap * 100).toFixed(1)}% vs 20-day avg`,
      score: Math.max(-1, Math.min(1, gap * 10)),
      detail: gap >= 0 ? 'Trading above its 20-day average' : 'Trading below its 20-day average',
    });
  }

  if (snapshot.bbPosition !== null) {
    const pos = snapshot.bbPosition;
    let score = 0;
    let detail = 'Mid-band — no stretch either way';
    if (pos < 0.2) {
      score = 0.7;
      detail = 'Near the lower Bollinger band';
    } else if (pos > 0.8) {
      score = -0.7;
      detail = 'Near the upper Bollinger band';
    }
    components.push({ label: `Band position ${(pos * 100).toFixed(0)}%`, score, detail });
  }

  if (snapshot.sma5 !== null && snapshot.sma20 !== null) {
    const bullish = snapshot.sma5 > snapshot.sma20;
    components.push({
      label: bullish ? '5-day above 20-day' : '5-day below 20-day',
      score: bullish ? 0.6 : -0.6,
      detail: bullish ? 'Short-term trend is up' : 'Short-term trend is down',
    });
  }

  if (components.length === 0) {
    return { score: 0, bias: 'NEUTRAL', components };
  }

  const total = components.reduce((acc, c) => acc + c.score, 0);
  const score = Math.round((total / components.length) * 100);

  return {
    score,
    bias: score > 20 ? 'BULLISH' : score < -20 ? 'BEARISH' : 'NEUTRAL',
    components,
  };
};

/**
 * Render a snapshot as a compact line of facts for an LLM prompt, so the model
 * reasons over measured values instead of recalling them.
 */
export const describeTechnicals = (snapshot: TechnicalSnapshot): string => {
  const pct = (value: number | null, digits = 1) =>
    value === null ? 'n/a' : `${value >= 0 ? '+' : ''}${(value * 100).toFixed(digits)}%`;
  const num = (value: number | null, digits = 2) => (value === null ? 'n/a' : value.toFixed(digits));

  const { score, bias } = scoreTechnicals(snapshot);

  return [
    `${snapshot.symbol} (measured from ${snapshot.barsUsed} daily bars through ${snapshot.asOf})`,
    `price ${num(snapshot.price)}`,
    `RSI(14) ${num(snapshot.rsi14, 1)}`,
    `MACD ${num(snapshot.macd)} signal ${num(snapshot.macdSignal)} histogram ${num(snapshot.macdHistogram)}`,
    `Bollinger position ${snapshot.bbPosition === null ? 'n/a' : num(snapshot.bbPosition, 2)}`,
    `price vs 20d SMA ${pct(snapshot.closeVsSma20)}`,
    `returns 5d ${pct(snapshot.return5d)} / 10d ${pct(snapshot.return10d)} / 20d ${pct(snapshot.return20d)}`,
    `annualized volatility ${pct(snapshot.annualizedVolatility, 0)}`,
    `composite technical score ${score} (${bias})`,
  ].join(', ');
};
