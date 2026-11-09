/**
 * Turning what someone typed into the symbols they might mean. "APPL", "Apple"
 * and "apple inc" should all be able to reach AAPL.
 */

export interface SymbolMatch {
  symbol: string;
  name: string;
  kind: 'Stock' | 'ETF' | 'Fund';
}

const KINDS: Record<string, SymbolMatch['kind']> = { EQUITY: 'Stock', ETF: 'ETF', MUTUALFUND: 'Fund' };

/**
 * The results of Yahoo's lookup that this app can show. Futures and indexes
 * aren't things you hold here, and a dotted symbol is a foreign listing quoted
 * in its own currency, which would read as dollars since nothing is converted.
 */
export const pickSymbolMatches = (quotes: unknown, limit = 6): SymbolMatch[] => {
  if (!Array.isArray(quotes)) return [];
  const matches: SymbolMatch[] = [];
  for (const quote of quotes) {
    const symbol = typeof quote?.symbol === 'string' ? quote.symbol.trim().toUpperCase() : '';
    const kind = KINDS[String(quote?.quoteType).toUpperCase()];
    if (!symbol || !kind || /[.=^]/.test(symbol)) continue;
    matches.push({ symbol, name: String(quote.longname || quote.shortname || symbol).trim(), kind });
    if (matches.length === limit) break;
  }
  return matches;
};

/** "$aapl " → "AAPL", and "brk b" → "BRK-B", the way share classes are written. */
export const cleanSearchInput = (raw: string): string =>
  raw.trim().toUpperCase().replace(/^\$/, '').replace(/^([A-Z]{1,5}) ([A-Z])$/, '$1-$2');

const squash = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Where pressing Enter should go. A ticker that exists is taken as typed, even
 * when a bigger company sorts above it. Otherwise, if the top match's name
 * starts with what was typed ("tesla", "coca cola", "APPL"), that's the one
 * meant. Only the start counts: "Direxion Daily BRKB Bull 2X" contains "BRKB"
 * but isn't Berkshire. Anything else is passed through, and the stock page
 * offers "did you mean".
 */
export const resolveSearch = (query: string, matches: SymbolMatch[]): string => {
  const typed = cleanSearchInput(query);
  if (matches.some(match => match.symbol === typed)) return typed;
  const top = matches[0];
  const words = squash(query);
  const name = squash(top?.name.replace(/^the\s+/i, '') ?? '');
  return top && words && name.startsWith(words) ? top.symbol : typed;
};
