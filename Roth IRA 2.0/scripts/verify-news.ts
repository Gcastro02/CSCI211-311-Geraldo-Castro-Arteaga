/**
 * Checks for sorting a stock page's headlines, on real Yahoo results.
 * Run with:  npm run verify:news
 */

import { companyNameKeys, rankNewsForSymbol } from '../src/lib/news';
import { NewsItem } from '../src/types';

let passed = 0;
let failed = 0;

const check = (name: string, condition: boolean, detail = '') => {
  if (condition) {
    passed++;
    console.log(`ok   ${name}`);
  } else {
    failed++;
    console.log(`FAIL ${name}${detail ? `  — ${detail}` : ''}`);
  }
};

const item = (title: string, relatedTickers: string[]): NewsItem => ({ title, relatedTickers, url: title, source: 'Test', snippet: '' });
const titles = (items: NewsItem[]) => items.map(i => i.title);

// Names
check('names: legal suffixes dropped', companyNameKeys('Apple Inc.').join() === 'apple');
check('names: punctuation ignored', companyNameKeys('The Coca-Cola Company').join() === 'cocacola');
check('names: first word kept when it is distinctive', companyNameKeys('JPMorgan Chase & Co.').includes('jpmorgan'));
check('names: a generic first word is not used alone', !companyNameKeys('Bank of America Corporation').includes('bank'));
check('names: fund family words dropped', !companyNameKeys('SPDR Gold Shares').some(k => k.includes('spdr')));
check('names: nothing without a name', companyNameKeys(undefined).length === 0);

// Coca-Cola, from a real search for KO
{
  const { about, mentioning } = rankNewsForSymbol([
    item('How Much Upside Is Left In Coca-Cola Stock After Its Run?', ['KO', '^GSPC', 'PEP']),
    item('Pepsi discontinues a fast-food soda fans can’t get in stores', ['PEP', 'KO']),
    item('Can Coca-Cola (KO) Stock Support 28 Times Earnings?', ['KO', 'PEP']),
    item('Treasury Yields Are Near 5%. Should Retirees Rethink Dividend Stocks?', ['PEP', 'JNJ', 'O', 'PG', 'KO']),
    item('PepsiCo closes Knoxville plant, cuts 122 jobs', ['PEP', 'KO']),
    item('How Coca-Cola Got Burned With a $5 Billion Bet on Costa Coffee', ['KO', 'KC=F', 'SBUX']),
  ], 'KO', 'The Coca-Cola Company');
  check('KO: headlines about Coca-Cola kept', about.length === 3, titles(about).join(' | '));
  check('KO: Pepsi and roundups only mention it', mentioning.length === 3 && titles(mentioning).every(t => !t.includes('Coca-Cola')));
}

// JPMorgan, which headlines spell several ways
{
  const { about, mentioning } = rankNewsForSymbol([
    item('JPMorgan’s Turkish Brokerage Unit to Surrender Operating License', ['JPM']),
    item('J.P. Morgan Projects 10% a Year for Bitcoin', ['BTC-USD', 'JPM']),
    item('JPMorganChase Expands Support for Atlanta Small Businesses', ['JPM']),
    item('Bank of America (BAC): Is Its Wealth Business More Valuable?', ['BAC', 'JPM']),
    item('3 Bank Stocks Raised Their Dividends 10% or More This Year', ['WFC', 'GS', 'JPM']),
  ], 'JPM', 'JPMorgan Chase & Co.');
  check('JPM: "JPMorgan", "J.P. Morgan" and "JPMorganChase" all count', about.length === 3, titles(about).join(' | '));
  check('JPM: other banks only mention it', titles(mentioning).join() === ['Bank of America (BAC): Is Its Wealth Business More Valuable?', '3 Bank Stocks Raised Their Dividends 10% or More This Year'].join());
}

// Tickers in headlines
{
  const { about } = rankNewsForSymbol([
    item('Forget GLD. Investors Sent $500 Million to the Cheaper SPDR Gold Fund', ['GC=F', 'GLD', 'GLDM']),
    item('Gold ETFs to Watch Amid Fed Rate Hike', ['GC=F', 'GLD', 'IAU']),
    item('The Zacks Analyst Blog Highlights GLD, IAU, GLDM', ['GC=F', 'IAU', 'GLD']),
  ], 'GLD', 'SPDR Gold Shares');
  // "SPDR Gold Shares" comes down to "gold", and gold news is news about a gold fund.
  check('GLD: gold headlines count for a gold fund', about.length === 3);
  const tickerOnly = rankNewsForSymbol([
    item('Forget GLD. Investors Sent $500 Million Elsewhere', ['GC=F', 'GLD']),
    item('Precious metals slide after the jobs report', ['GC=F', 'GLD']),
  ], 'GLD');
  check('ticker: in a headline counts, with no name known', titles(tickerOnly.about).join() === 'Forget GLD. Investors Sent $500 Million Elsewhere');
  check('ticker: not matched inside another word', rankNewsForSymbol([item('Knockout results for KOSPI', ['^KS11', 'KO'])], 'KO').about.length === 0);
  check('ticker: not matched in lowercase', rankNewsForSymbol([item('A ko punch for markets', ['SPY', 'KO'])], 'KO').about.length === 0);
  check('ticker: listed first counts with no name known', rankNewsForSymbol([item('Earnings preview', ['KO', 'PEP'])], 'KO').about.length === 1);
  check('order is kept within each group', titles(rankNewsForSymbol([item('B KO', []), item('A KO', [])], 'KO').about).join() === 'B KO,A KO');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
