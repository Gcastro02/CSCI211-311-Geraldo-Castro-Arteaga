/**
 * Sorting a stock's headlines into ones about it and ones that merely mention
 * it. Yahoo's search lists the ticker among the "related tickers" of almost
 * every article it returns, including roundups where it is one of a dozen.
 */

import { NewsItem } from '../types';

/** Words that end a company's legal name or start a fund family's, and say nothing about it. */
const NAME_NOISE = new Set([
  'the', 'inc', 'incorporated', 'corp', 'corporation', 'co', 'company', 'companies', 'ltd', 'limited', 'plc', 'llc',
  'group', 'holdings', 'holding', 'class', 'trust', 'etf', 'fund', 'shares', 'spdr', 'ishares', 'vanguard', 'invesco',
  'schwab', 'proshares', 'direxion', 'wisdomtree', 'global', 'x',
]);
/** Common first words that would match far too much on their own. */
const GENERIC_FIRST_WORDS = new Set(['bank', 'first', 'general', 'united', 'american', 'international', 'national', 'new', 'royal']);

const squash = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Ways a headline might name the company, squashed to letters and digits:
 * "JPMorgan Chase & Co." → ['jpmorganchase', 'jpmorgan'], so "J.P. Morgan"
 * and "JPMorganChase" both match.
 */
export const companyNameKeys = (companyName?: string): string[] => {
  if (!companyName) return [];
  const words = companyName.split(/[\s,&.]+/).filter(w => w && !NAME_NOISE.has(w.toLowerCase()));
  const keys = new Set<string>();
  const full = squash(words.join(''));
  if (full.length >= 4) keys.add(full);
  const first = squash(words[0] ?? '');
  if (first.length >= 5 && !GENERIC_FIRST_WORDS.has(first)) keys.add(first);
  return [...keys];
};

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * About the stock: the headline names the company or the ticker, or Yahoo
 * lists the stock first among the article's tickers. Everything else only
 * mentions it. Order within each group is kept.
 */
export const rankNewsForSymbol = (items: NewsItem[], symbol: string, companyName?: string) => {
  const ticker = symbol.trim().toUpperCase();
  const tickerInTitle = new RegExp(`(^|[^A-Za-z0-9])${escapeRegExp(ticker)}([^A-Za-z0-9]|$)`);
  const keys = companyNameKeys(companyName);
  const about: NewsItem[] = [];
  const mentioning: NewsItem[] = [];
  for (const item of items) {
    const title = squash(item.title);
    const isAbout = tickerInTitle.test(item.title)
      || keys.some(key => title.includes(key))
      || item.relatedTickers?.[0]?.toUpperCase() === ticker;
    (isAbout ? about : mentioning).push(item);
  }
  return { about, mentioning };
};
