import { StockAnalysis, MarketSuggestion, StockHolding, NewsItem, UserSettings, PriceData } from "../types";
import { TechnicalSnapshot, computeIndicators, describeTechnicals } from "../lib/indicators";

const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY || "";
const OPENAI_MODEL = import.meta.env.VITE_OPENAI_MODEL || "gpt-4.1-mini";

/**
 * The account-type context matters more than it might look. Without it the
 * model reasons as though this were a taxable brokerage account and produces
 * advice that does not apply — harvesting losses for a deduction, timing sales
 * around long-term capital gains rates, avoiding wash sales. None of that is
 * relevant inside a Roth IRA, and all of it is actively misleading.
 */
const ROTH_CONTEXT = [
  "This is a Roth IRA, a US retirement account. Its rules change what advice is appropriate:",
  "sales inside the account are not taxable events, so there are no capital gains considerations and no long-term versus short-term holding period to optimize;",
  "tax-loss harvesting provides no benefit because losses cannot be deducted;",
  "wash-sale rules are not a concern for trades within the account;",
  "new money is capped by an annual contribution limit, so cash is scarce and rebalancing usually matters more than adding;",
  "the time horizon is retirement, so favour durable long-term reasoning over short-term trading ideas.",
  "Do not raise tax considerations that do not apply to this account type.",
].join(" ");

const BROKERAGE_CONTEXT = [
  "This is a regular taxable US brokerage account.",
  "Do not give personalized tax advice; where taxes could plausibly matter to a decision, say so briefly and suggest checking with a tax professional.",
].join(" ");

const systemPrompt = (settings: UserSettings) => [
  "You are a financial analysis assistant for a portfolio tracking and learning app.",
  "Return valid JSON only and no markdown.",
  settings.accountType === "ROTH_IRA" ? ROTH_CONTEXT : BROKERAGE_CONTEXT,
  "When measured indicator values are supplied, reason from those numbers rather than from recalled figures, and refer to them explicitly in your reasoning.",
  "Leave any field blank rather than guessing. Never invent a URL, a date, or a specific figure you were not given.",
].join(" ");

/** How the account is named inside prompts. */
const accountPhrase = (settings: UserSettings) =>
  settings.accountType === "ROTH_IRA" ? "a Roth IRA" : "a brokerage account";

// Always same-origin. In dev this is Vite's proxy (vite.config.ts); in
// production it is the Express proxy in server.ts. Calling
// query1.finance.yahoo.com from the browser fails on CORS — it sends no
// Access-Control-Allow-Origin — so the request has to be relayed either way.
const YAHOO_BASE_URL = "/yahoo-api";

const getYahooUrl = (path: string): string => `${YAHOO_BASE_URL}${path}`;

const normalizeToYahooSymbol = (symbol: string): string => {
  const s = symbol.trim().toUpperCase();
  if (!s) return "";
  if (s.endsWith(".US")) return s.slice(0, -3);
  return s.replace(/\./g, "-");
};

const getRangeStartDate = (range: string): Date | null => {
  const now = new Date();
  const start = new Date(now);
  switch (range) {
    case "1D":
      start.setDate(now.getDate() - 2);
      return start;
    case "5D":
      start.setDate(now.getDate() - 10);
      return start;
    case "1M":
      start.setMonth(now.getMonth() - 1);
      return start;
    case "6M":
      start.setMonth(now.getMonth() - 6);
      return start;
    case "1Y":
      start.setFullYear(now.getFullYear() - 1);
      return start;
    case "5Y":
      start.setFullYear(now.getFullYear() - 5);
      return start;
    case "MAX":
    default:
      return null;
  }
};

const formatYyyyMmDd = (date: Date): string => {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const sampleEvenly = (rows: PriceData[], maxPoints: number): PriceData[] => {
  if (rows.length <= maxPoints) return rows;
  const result: PriceData[] = [];
  const step = (rows.length - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i++) {
    result.push(rows[Math.round(i * step)]);
  }
  return result;
};

const getYahooRangeAndInterval = (range: string): { range: string; interval: string } => {
  switch (range) {
    case "1D":
      return { range: "1d", interval: "5m" };
    case "5D":
      return { range: "1mo", interval: "1d" };
    case "1M":
      return { range: "1mo", interval: "1d" };
    case "6M":
      return { range: "6mo", interval: "1d" };
    case "1Y":
      return { range: "1y", interval: "1d" };
    case "5Y":
      return { range: "5y", interval: "1wk" };
    case "MAX":
    default:
      return { range: "max", interval: "1mo" };
  }
};

const fetchYahooPriceHistory = async (
  symbol: string,
  selectedRange: string,
  { sample = true }: { sample?: boolean } = {},
): Promise<PriceData[]> => {
  const yahooSymbol = normalizeToYahooSymbol(symbol);
  if (!yahooSymbol) return [];

  const startDate = getRangeStartDate(selectedRange);
  const { range, interval } = getYahooRangeAndInterval(selectedRange);
  const isIntraday = selectedRange === "1D";

  const response = await fetch(
    getYahooUrl(`/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=${range}&interval=${interval}`),
  );
  if (!response.ok) return [];

  const payload = await response.json();
  const result = payload?.chart?.result?.[0];
  const timestamps: number[] = Array.isArray(result?.timestamp) ? result.timestamp : [];
  const quote = result?.indicators?.quote?.[0] || {};
  const opens: Array<number | null> = quote.open || [];
  const highs: Array<number | null> = quote.high || [];
  const lows: Array<number | null> = quote.low || [];
  const closes: Array<number | null> = quote.close || [];
  const volumes: Array<number | null> = quote.volume || [];
  if (timestamps.length === 0 || closes.length === 0) return [];

  const rows: PriceData[] = [];
  const maxLen = Math.min(timestamps.length, closes.length);

  for (let i = 0; i < maxLen; i++) {
    const ts = Number(timestamps[i]);
    const open = Number(opens[i]);
    const high = Number(highs[i]);
    const low = Number(lows[i]);
    const close = Number(closes[i]);
    const volume = Number(volumes[i]);
    if (!Number.isFinite(ts) || !Number.isFinite(close) || close <= 0) continue;

    const date = new Date(ts * 1000);
    if (startDate && date < startDate) continue;

    const normalizedOpen = Number.isFinite(open) && open > 0 ? open : close;
    const normalizedHigh = Number.isFinite(high) && high > 0 ? high : Math.max(normalizedOpen, close);
    const normalizedLow = Number.isFinite(low) && low > 0 ? low : Math.min(normalizedOpen, close);

    rows.push({
      date: isIntraday ? date.toISOString() : formatYyyyMmDd(date),
      price: close,
      open: normalizedOpen,
      high: normalizedHigh,
      low: normalizedLow,
      close,
      volume: Number.isFinite(volume) && volume >= 0 ? volume : undefined,
    });
  }

  if (rows.length === 0) return [];

  if (isIntraday) {
    const sorted = rows.sort((a, b) => a.date.localeCompare(b.date));
    return sample ? sampleEvenly(sorted, 24) : sorted;
  }

  const deduped = Array.from(new Map(rows.map((row) => [row.date, row])).values())
    .sort((a, b) => a.date.localeCompare(b.date));

  return sample ? sampleEvenly(deduped, 30) : deduped;
};

const extractJson = <T>(content: string): T => {
  const cleaned = content.trim();

  if (cleaned.startsWith("```")) {
    const firstBrace = cleaned.indexOf("{") >= 0 ? cleaned.indexOf("{") : cleaned.indexOf("[");
    const lastBrace = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1)) as T;
    }
  }

  return JSON.parse(cleaned) as T;
};

const PLACEHOLDER_KEYS = ["MY_OPENAI_API_KEY", "YOUR_OPENAI_API_KEY"];

const hasClientKey = (() => {
  const trimmed = OPENAI_API_KEY.trim();
  return trimmed.length > 0 && !PLACEHOLDER_KEYS.includes(trimmed);
})();

/**
 * How AI calls reach OpenAI:
 *   'client' - a VITE_OPENAI_API_KEY is set, so call OpenAI directly. Convenient
 *              for local development, but note that anything with a VITE_ prefix
 *              is compiled into the bundle and readable by anyone loading a
 *              deployed page. Fine locally, not fine on a public host.
 *   'server' - no client key, but a production build, so assume server.ts is
 *              relaying with a server-side OPENAI_API_KEY.
 *   'disabled' - no key anywhere; AI features are switched off in the UI.
 */
export const AI_MODE: 'client' | 'server' | 'disabled' =
  hasClientKey ? 'client' : import.meta.env.DEV ? 'disabled' : 'server';

export const isAiConfigured = AI_MODE !== 'disabled';

const chatJson = async <T>(prompt: string, settings: UserSettings): Promise<T> => {
  if (AI_MODE === 'disabled') {
    throw new Error("Missing OpenAI API key. Set VITE_OPENAI_API_KEY in .env and restart the app.");
  }

  if (AI_MODE === 'server') {
    const response = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ system: systemPrompt(settings), prompt }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error || `AI request failed: ${response.status}`);
    }

    return extractJson<T>(payload?.content || "");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt(settings) },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI request failed: ${response.status} ${body}`);
  }

  const payload = await response.json();
  const content: string = payload?.choices?.[0]?.message?.content || "";
  return extractJson<T>(content);
};

export interface Quote {
  price: number;
  /** The prior session's close, for "today" change. Null when Yahoo omits it. */
  previousClose: number | null;
  name?: string;
  exchange?: string;
  currency?: string;
  dayHigh?: number;
  dayLow?: number;
  yearHigh?: number;
  yearLow?: number;
  volume?: number;
  /** ISO time of the last regular-session trade. */
  marketTime?: string;
}

/** A positive finite number, or undefined. */
const positive = (value: unknown): number | undefined => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/**
 * Live quote from the Yahoo chart endpoint's metadata, which carries
 * `regularMarketPrice` alongside the bars. For a one-day range,
 * `chartPreviousClose` is the close of the session before it.
 */
const fetchYahooQuote = async (symbol: string): Promise<Quote | null> => {
  const yahooSymbol = normalizeToYahooSymbol(symbol);
  if (!yahooSymbol) return null;

  const response = await fetch(
    getYahooUrl(`/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=1d&interval=1d`),
  );
  if (!response.ok) return null;

  const payload = await response.json();
  const meta = payload?.chart?.result?.[0]?.meta;
  const price = Number(meta?.regularMarketPrice ?? meta?.previousClose);
  if (!Number.isFinite(price) || price <= 0) return null;

  const marketSeconds = positive(meta?.regularMarketTime);
  return {
    price,
    previousClose: positive(meta?.chartPreviousClose ?? meta?.previousClose) ?? null,
    name: meta?.longName || meta?.shortName || undefined,
    exchange: meta?.fullExchangeName || meta?.exchangeName || undefined,
    currency: meta?.currency || undefined,
    dayHigh: positive(meta?.regularMarketDayHigh),
    dayLow: positive(meta?.regularMarketDayLow),
    yearHigh: positive(meta?.fiftyTwoWeekHigh),
    yearLow: positive(meta?.fiftyTwoWeekLow),
    volume: positive(meta?.regularMarketVolume),
    marketTime: marketSeconds ? new Date(marketSeconds * 1000).toISOString() : undefined,
  };
};

/** Price plus previous close, or null when unavailable. */
export const getQuote = async (symbol: string): Promise<Quote | null> => {
  try {
    return await fetchYahooQuote(symbol);
  } catch {
    return null;
  }
};

/**
 * Current price for a symbol, or 0 when unavailable.
 *
 * This previously read Stooq's `/q/l/` CSV endpoint, which no longer exists —
 * it 404s for every symbol, and Stooq's CSV download is now behind a JavaScript
 * browser check. Every quote silently returned 0, which is why holdings fell
 * back to average cost. Yahoo serves a real-time quote from the same host
 * already supplying chart data.
 */
export const getCurrentPrice = async (symbol: string): Promise<number> =>
  (await getQuote(symbol))?.price || 0;

/**
 * Price bars for charting. Thinned to ~30 points unless `sample: false`, which
 * the stock page uses so its full-width chart shows every bar.
 */
export const getStockPriceHistory = async (
  symbol: string,
  range: string,
  options: { sample?: boolean } = {},
): Promise<PriceData[]> => {
  return fetchYahooPriceHistory(symbol, range, options);
};

/**
 * Full, unsampled daily bars for indicator math.
 *
 * `getStockPriceHistory` thins its result to ~30 points so charts stay readable.
 * Rolling windows over thinned data are meaningless, so technical analysis needs
 * its own fetch. A year of daily bars gives every 20-period window room to warm up.
 */
export const getIndicatorBars = async (symbol: string): Promise<PriceData[]> => {
  return fetchYahooPriceHistory(symbol, "1Y", { sample: false });
};

/**
 * Measured indicators for a symbol, or null when there is not enough history.
 * Computed locally from OHLCV — no API key needed and no model involved.
 */
export const getTechnicals = async (symbol: string): Promise<TechnicalSnapshot | null> => {
  const bars = await getIndicatorBars(symbol);
  if (bars.length < 30) return null;
  return computeIndicators(symbol.trim().toUpperCase(), bars);
};

/**
 * Real headlines from Yahoo Finance's search endpoint.
 *
 * This used to ask the language model for news, which cannot work: the model has
 * no web access during a completion, so every headline, publisher and URL it
 * returned was invented and the links went nowhere. These are actual articles
 * with working links and real publish times.
 */
export const getStockNews = async (
  symbol: string,
  settings: UserSettings,
  isGeneral: boolean = false,
): Promise<NewsItem[]> => {
  const query = isGeneral ? "stock market" : normalizeToYahooSymbol(symbol);
  if (!query) return [];

  const response = await fetch(
    getYahooUrl(`/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=0&newsCount=12`),
  );
  if (!response.ok) {
    throw new Error(`News request failed: ${response.status}`);
  }

  const payload = await response.json();
  const rawItems: any[] = Array.isArray(payload?.news) ? payload.news : [];

  const items: NewsItem[] = rawItems
    .filter((item) => item?.title && item?.link)
    .map((item) => {
      const publishedSeconds = Number(item.providerPublishTime);
      return {
        title: String(item.title),
        url: String(item.link),
        source: String(item.publisher || "Yahoo Finance"),
        // The search endpoint returns no summary text, so the related tickers
        // stand in as context rather than leaving the card blank.
        snippet: Array.isArray(item.relatedTickers) && item.relatedTickers.length > 0
          ? `Related: ${item.relatedTickers.slice(0, 6).join(", ")}`
          : "",
        date: Number.isFinite(publishedSeconds) && publishedSeconds > 0
          ? new Date(publishedSeconds * 1000).toISOString()
          : undefined,
      };
    });

  // Preferred sources move to the front rather than filtering others out, so the
  // feed never empties just because a favourite publisher had a quiet day.
  const preferred = settings.preferredNewsSources.map((source) => source.toLowerCase());
  if (preferred.length === 0) return items;

  const isPreferred = (item: NewsItem) =>
    preferred.some((source) => item.source.toLowerCase().includes(source));

  return [...items.filter(isPreferred), ...items.filter((item) => !isPreferred(item))];
};

/** Gather measured indicators for a set of symbols, skipping any that fail. */
const collectTechnicals = async (symbols: string[]): Promise<TechnicalSnapshot[]> => {
  const results = await Promise.all(
    symbols.map(async (symbol) => {
      try {
        const bars = await getIndicatorBars(symbol);
        if (bars.length < 30) return null;
        return computeIndicators(symbol.trim().toUpperCase(), bars);
      } catch {
        return null;
      }
    }),
  );

  return results.filter((snapshot): snapshot is TechnicalSnapshot => snapshot !== null);
};

/**
 * Turn snapshots into a prompt block of measured facts. This is what stops the
 * model from inventing indicator values it has no way to know.
 */
const technicalsPromptBlock = (snapshots: TechnicalSnapshot[]): string => {
  if (snapshots.length === 0) return "";
  return `\n\nMeasured indicators computed from live OHLCV data (use these; do not substitute remembered values):\n${snapshots
    .map((snapshot) => `- ${describeTechnicals(snapshot)}`)
    .join("\n")}`;
};

export const analyzePortfolio = async (holdings: StockHolding[], settings: UserSettings): Promise<StockAnalysis[]> => {
  if (holdings.length === 0) return [];

  const horizonText = settings.investmentHorizon === "BOTH"
    ? "both short-term and long-term"
    : settings.investmentHorizon.toLowerCase().replace("_", "-");

  const symbols = Array.from(new Set(holdings.map((h) => h.symbol.trim().toUpperCase()).filter(Boolean)));
  const snapshots = await collectTechnicals(symbols);

  const prompt = `Return ONLY JSON in this format: {"items": [{"symbol":"","recommendation":"BUY|SELL|HOLD","reasoning":"","riskLevel":"LOW|MEDIUM|HIGH","metrics":{"peRatio":"","marketCap":"","dividendYield":""},"projectedGrowth":"","keyFactors":["",""]}]}.\nAnalyze these holdings for ${accountPhrase(settings)} (${horizonText}): ${JSON.stringify(holdings)}.${technicalsPromptBlock(snapshots)}`;

  const data = await chatJson<{ items?: StockAnalysis[] }>(prompt, settings);
  return Array.isArray(data.items) ? data.items : [];
};

export const getMarketSuggestions = async (settings: UserSettings): Promise<MarketSuggestion[]> => {
  const horizonText = settings.investmentHorizon === "BOTH"
    ? "both short-term and long-term"
    : settings.investmentHorizon.toLowerCase().replace("_", "-");

  const prompt = `Return ONLY JSON in this format: {"items": [{"symbol":"","name":"","reason":"","trend":"","keyFactors":["",""]}]}.\nSuggest 5 stocks or ETFs for growth in ${accountPhrase(settings)} for ${horizonText}.`;
  const data = await chatJson<{ items?: MarketSuggestion[] }>(prompt, settings);
  return Array.isArray(data.items) ? data.items : [];
};

export const analyzeWatchlistStock = async (symbol: string, settings: UserSettings): Promise<StockAnalysis> => {
  const horizonText = settings.investmentHorizon === "BOTH"
    ? "both short-term and long-term"
    : settings.investmentHorizon.toLowerCase().replace("_", "-");

  const snapshots = await collectTechnicals([symbol]);

  const prompt = `Return ONLY JSON in this format: {"item": {"symbol":"","recommendation":"BUY|HOLD","reasoning":"","riskLevel":"LOW|MEDIUM|HIGH","metrics":{"peRatio":"","marketCap":"","dividendYield":""},"projectedGrowth":"","keyFactors":["",""]}}.\nAnalyze ${symbol} as a potential addition to ${accountPhrase(settings)} for ${horizonText}.${technicalsPromptBlock(snapshots)}`;
  const data = await chatJson<{ item?: StockAnalysis }>(prompt, settings);

  return data.item || {
    symbol,
    recommendation: "HOLD",
    reasoning: "No analysis returned.",
    riskLevel: "MEDIUM",
  };
};
