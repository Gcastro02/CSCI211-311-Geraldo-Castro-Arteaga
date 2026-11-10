/**
 * Near-live prices: reading Yahoo's batch endpoint, and knowing when refreshing
 * is worth doing. Pure, so the rules can be tested without a market being open.
 */

export const LIVE_REFRESH_MS = 15_000;

/** Yahoo's batch endpoint refuses requests naming 25 symbols; 20 is accepted. */
export const LIVE_BATCH_SIZE = 20;

export interface LiveQuote {
  price: number;
  /** The prior session's close, for "today" changes. */
  previousClose: number | null;
  /** When the price is from, in seconds since 1970. */
  time: number | null;
}

/** The regular trading session, in seconds since 1970. */
export interface MarketSession {
  start: number;
  end: number;
}

export const isMarketOpen = (session: MarketSession | null, nowMs: number): boolean =>
  Boolean(session) && nowMs / 1000 >= session!.start && nowMs / 1000 < session!.end;

const lastPositive = (values: unknown): number | null => {
  if (!Array.isArray(values)) return null;
  for (let i = values.length - 1; i >= 0; i--) {
    const n = Number(values[i]);
    if (values[i] != null && Number.isFinite(n) && n > 0) return n;
  }
  return null;
};

/**
 * Quotes from a batch response, keyed by symbol as Yahoo wrote it. Symbols it
 * doesn't know are simply absent, so one bad ticker doesn't cost the others.
 */
export const parseSparkQuotes = (payload: unknown): Record<string, LiveQuote> => {
  const quotes: Record<string, LiveQuote> = {};
  if (!payload || typeof payload !== 'object') return quotes;
  for (const [symbol, entry] of Object.entries(payload as Record<string, any>)) {
    const price = lastPositive(entry?.close);
    if (price === null) continue;
    const previous = Number(entry?.chartPreviousClose ?? entry?.previousClose);
    quotes[symbol] = {
      price,
      previousClose: Number.isFinite(previous) && previous > 0 ? previous : null,
      time: lastPositive(entry?.timestamp),
    };
  }
  return quotes;
};

export const toBatches = <T,>(items: T[], size: number = LIVE_BATCH_SIZE): T[][] => {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size));
  return batches;
};

/** The newest price time among these quotes, for saying how fresh a screen is. */
export const newestTime = (quotes: Record<string, LiveQuote>): number | null => {
  const times = Object.values(quotes).map(q => q.time ?? 0);
  const newest = times.length ? Math.max(...times) : 0;
  return newest > 0 ? newest : null;
};
