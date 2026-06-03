import { StockAnalysis, MarketSuggestion, StockHolding, NewsItem, UserSettings, PriceData } from "../types";


const SYSTEM_PROMPT =
  "You are a financial analysis assistant for a Roth IRA planning app. Return valid JSON only and no markdown.";

const STOOQ_BASE_URL = import.meta.env.DEV ? "/stooq-api" : "https://stooq.com";
const YAHOO_BASE_URL = import.meta.env.DEV ? "/yahoo-api" : "https://query1.finance.yahoo.com";

const getStooqUrl = (path: string): string => `${STOOQ_BASE_URL}${path}`;
const getYahooUrl = (path: string): string => `${YAHOO_BASE_URL}${path}`;

const normalizeToStooqSymbol = (symbol: string): string => {
  const s = symbol.trim().toLowerCase();
  if (!s) return "";
  if (s.includes(".")) return s;
  return `${s}.us`;
};

const normalizeToYahooSymbol = (symbol: string): string => {
  const s = symbol.trim().toUpperCase();
  if (!s) return "";
  if (s.endsWith(".US")) return s.slice(0, -3);
  return s.replace(/\./g, "-");
};

const fetchStooqCurrentPrice = async (symbol: string): Promise<number | null> => {
  const stooqSymbol = normalizeToStooqSymbol(symbol);
  if (!stooqSymbol) return null;

  const response = await fetch(getStooqUrl(`/q/l/?s=${encodeURIComponent(stooqSymbol)}&i=d`));
  if (!response.ok) return null;

  const csv = (await response.text()).trim();
  const parts = csv.split(",");
  // Stooq format: SYMBOL,DATE,TIME,OPEN,HIGH,LOW,CLOSE,VOLUME,...
  if (parts.length < 7) return null;

  const close = Number(parts[6]);
  if (!Number.isFinite(close) || close <= 0) return null;
  return close;
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
      return { range: "1d", interval: "1h" };
    case "5D":
      return { range: "5d", interval: "1h" };
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

const fetchYahooPriceHistory = async (symbol: string, selectedRange: string): Promise<PriceData[]> => {
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
  if (timestamps.length === 0 || closes.length === 0) return [];

  const rows: PriceData[] = [];
  const maxLen = Math.min(timestamps.length, closes.length);

  for (let i = 0; i < maxLen; i++) {
    const ts = Number(timestamps[i]);
    const open = Number(opens[i]);
    const high = Number(highs[i]);
    const low = Number(lows[i]);
    const close = Number(closes[i]);
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
    });
  }

  if (rows.length === 0) return [];

  if (isIntraday) {
    return sampleEvenly(rows.sort((a, b) => a.date.localeCompare(b.date)), 24);
  }

  const deduped = Array.from(new Map(rows.map((row) => [row.date, row])).values())
    .sort((a, b) => a.date.localeCompare(b.date));

  return sampleEvenly(deduped, 30);
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

const chatJson = async <T>(prompt: string): Promise<T> => {
  const response = await fetch("/api/openai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
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

export const getCurrentPrice = async (symbol: string): Promise<number> => {
  const livePrice = await fetchStooqCurrentPrice(symbol);
  return livePrice || 0;
};

export const getStockPriceHistory = async (symbol: string, range: string): Promise<PriceData[]> => {
  return fetchYahooPriceHistory(symbol, range);
};

export const getStockNews = async (symbol: string, settings: UserSettings, isGeneral: boolean = false): Promise<NewsItem[]> => {
  const sources = settings.preferredNewsSources.length > 0
    ? `Prefer sources like ${settings.preferredNewsSources.join(", ")}.`
    : "";

  const query = isGeneral
    ? `Latest general stock market and macroeconomic headlines. ${sources}`
    : `Latest financial news for ${symbol}. ${sources}`;

  const prompt = `Return ONLY JSON in this format: {"items": [{"title":"","url":"","source":"","snippet":"","date":""}]}.\n${query}`;
  const data = await chatJson<{ items?: NewsItem[] }>(prompt);
  return Array.isArray(data.items) ? data.items : [];
};

export const analyzePortfolio = async (holdings: StockHolding[], settings: UserSettings): Promise<StockAnalysis[]> => {
  if (holdings.length === 0) return [];

  const horizonText = settings.investmentHorizon === "BOTH"
    ? "both short-term and long-term"
    : settings.investmentHorizon.toLowerCase().replace("_", "-");

  const prompt = `Return ONLY JSON in this format: {"items": [{"symbol":"","recommendation":"BUY|SELL|HOLD","reasoning":"","riskLevel":"LOW|MEDIUM|HIGH","metrics":{"peRatio":"","marketCap":"","dividendYield":""},"projectedGrowth":"","keyFactors":["",""]}]}.\nAnalyze these holdings for a Roth IRA (${horizonText}): ${JSON.stringify(holdings)}.`;

  const data = await chatJson<{ items?: StockAnalysis[] }>(prompt);
  return Array.isArray(data.items) ? data.items : [];
};

export const getMarketSuggestions = async (settings: UserSettings): Promise<MarketSuggestion[]> => {
  const horizonText = settings.investmentHorizon === "BOTH"
    ? "both short-term and long-term"
    : settings.investmentHorizon.toLowerCase().replace("_", "-");

  const prompt = `Return ONLY JSON in this format: {"items": [{"symbol":"","name":"","reason":"","trend":"","keyFactors":["",""]}]}.\nSuggest 5 stocks or ETFs for Roth IRA growth for ${horizonText}.`;
  const data = await chatJson<{ items?: MarketSuggestion[] }>(prompt);
  return Array.isArray(data.items) ? data.items : [];
};

export const analyzeWatchlistStock = async (symbol: string, settings: UserSettings): Promise<StockAnalysis> => {
  const horizonText = settings.investmentHorizon === "BOTH"
    ? "both short-term and long-term"
    : settings.investmentHorizon.toLowerCase().replace("_", "-");

  const prompt = `Return ONLY JSON in this format: {"item": {"symbol":"","recommendation":"BUY|HOLD","reasoning":"","riskLevel":"LOW|MEDIUM|HIGH","metrics":{"peRatio":"","marketCap":"","dividendYield":""},"projectedGrowth":"","keyFactors":["",""]}}.\nAnalyze ${symbol} for a potential Roth IRA addition for ${horizonText}.`;
  const data = await chatJson<{ item?: StockAnalysis }>(prompt);

  return data.item || {
    symbol,
    recommendation: "HOLD",
    reasoning: "No analysis returned.",
    riskLevel: "MEDIUM",
  };
};
