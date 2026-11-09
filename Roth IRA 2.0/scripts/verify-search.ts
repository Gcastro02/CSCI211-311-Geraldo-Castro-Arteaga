/**
 * Checks for looking up a symbol and for accepting the model's replies.
 * Run with:  npm run verify:search
 */

import { normalizeAnalysis, normalizeSuggestion } from '../src/lib/aiResponses';
import { SymbolMatch, cleanSearchInput, pickSymbolMatches, resolveSearch } from '../src/lib/symbolSearch';

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

// Typed input
check('input: lowercase and spaces', cleanSearchInput('  aapl ') === 'AAPL');
check('input: a leading $', cleanSearchInput('$tsla') === 'TSLA');
check('input: a share class with a space', cleanSearchInput('brk b') === 'BRK-B');
check('input: a two-word name is left alone', cleanSearchInput('coca cola') === 'COCA COLA');

// Yahoo's lookup, from a real response for "Apple"
{
  const matches = pickSymbolMatches([
    { symbol: 'AAPL', quoteType: 'EQUITY', longname: 'Apple Inc.', shortname: 'Apple' },
    { symbol: 'SAAPL=F', quoteType: 'FUTURE', shortname: 'Apple Inc Stock Futures' },
    { symbol: 'APLE', quoteType: 'EQUITY', shortname: 'Apple Hospitality REIT, Inc.' },
    { symbol: 'AAPL.TO', quoteType: 'EQUITY', shortname: 'APPLE CDR (CAD HEDGED)' },
    { symbol: '^BRKU', quoteType: 'ETF', shortname: 'Index' },
    { symbol: 'VOO', quoteType: 'ETF', shortname: 'Vanguard S&P 500 ETF' },
    { symbol: 'VFIAX', quoteType: 'MUTUALFUND', shortname: 'Vanguard 500 Index' },
    { quoteType: 'EQUITY', shortname: 'No symbol' },
  ]);
  check('lookup: only US stocks and funds', matches.map(m => m.symbol).join() === 'AAPL,APLE,VOO,VFIAX', matches.map(m => m.symbol).join());
  check('lookup: the full name is preferred', matches[0].name === 'Apple Inc.');
  check('lookup: says what each one is', matches.map(m => m.kind).join() === 'Stock,Stock,ETF,Fund');
  check('lookup: a share class keeps its hyphen', pickSymbolMatches([{ symbol: 'BRK-B', quoteType: 'EQUITY' }])[0].symbol === 'BRK-B');
  check('lookup: stops at the limit', pickSymbolMatches(Array(9).fill({ symbol: 'A', quoteType: 'EQUITY' }), 3).length === 3);
  check('lookup: nonsense gives nothing', pickSymbolMatches(undefined).length === 0 && pickSymbolMatches([null, 5]).length === 0);
}

// Pressing Enter
{
  const stock = (symbol: string, name: string): SymbolMatch => ({ symbol, name, kind: 'Stock' });
  const apple = [stock('AAPL', 'Apple Inc.'), stock('APLE', 'Apple Hospitality REIT, Inc.')];
  check('enter: a company name opens that company', resolveSearch('Apple', apple) === 'AAPL');
  check('enter: a misspelled ticker within the name opens it', resolveSearch('APPL', [stock('AAPL', 'Apple Inc.'), stock('APLD', 'Applied Digital')]) === 'AAPL');
  check('enter: spelling and punctuation of a name don’t matter', resolveSearch('coca cola', [stock('KO', 'The Coca-Cola Company')]) === 'KO');
  check('enter: a real ticker is taken as typed, even below a bigger company', resolveSearch('aple', apple) === 'APLE');
  check('enter: a ticker the lookup confirms beats a name match', resolveSearch('goog', [stock('GOOGL', 'Goog Class A'), stock('GOOG', 'Alphabet Inc.')]) === 'GOOG');
  check('enter: a share class typed with a space', resolveSearch('brk b', [stock('BRK-B', 'Berkshire Hathaway')]) === 'BRK-B');
  check('enter: a name that only contains the text doesn’t count', resolveSearch('brk b', [stock('BRKU', 'Direxion Daily BRKB Bull 2X')]) === 'BRK-B');
  check('enter: a leading "The" is ignored', resolveSearch('walt disney', [stock('DIS', 'The Walt Disney Company')]) === 'DIS');
  check('enter: no connection to the name goes as typed', resolveSearch('TSLAA', [stock('TSLA', 'Tesla, Inc.')]) === 'TSLAA');
  check('enter: no matches goes as typed', resolveSearch('zzzzqx', []) === 'ZZZZQX');
}

// The model's research, in the shapes that used to blank the stock page
{
  const good = { symbol: 'aapl', recommendation: 'hold', riskLevel: 'Low', reasoning: 'Because.' };
  const base = normalizeAnalysis(good)!;
  check('analysis: normal reply accepted, with its case tidied', base.symbol === 'AAPL' && base.recommendation === 'HOLD' && base.riskLevel === 'LOW');
  check('analysis: the symbol asked about wins', normalizeAnalysis(good, 'MSFT')!.symbol === 'MSFT');
  check('analysis: key factors as one string become a list', normalizeAnalysis({ ...good, keyFactors: 'a, b' })!.keyFactors!.join() === 'a, b');
  check('analysis: key factors that aren’t text are dropped', normalizeAnalysis({ ...good, keyFactors: [{ factor: 'x' }, 'kept'] })!.keyFactors!.join() === 'kept');
  check('analysis: no usable factors means none', normalizeAnalysis({ ...good, keyFactors: [{}] })!.keyFactors === undefined);
  check('analysis: numeric metrics become text', normalizeAnalysis({ ...good, metrics: { peRatio: 25 } })!.metrics!.peRatio === '25');
  check('analysis: empty metrics are left out', normalizeAnalysis({ ...good, metrics: {} })!.metrics === undefined);
  check('analysis: an object metric is dropped', normalizeAnalysis({ ...good, metrics: { peRatio: { v: 1 } } })!.metrics === undefined);
  check('analysis: no recommendation isn’t invented', normalizeAnalysis({ ...good, recommendation: undefined }) === null);
  check('analysis: an unknown recommendation isn’t accepted', normalizeAnalysis({ ...good, recommendation: 'MAYBE' }) === null);
  check('analysis: no reasoning means nothing to show', normalizeAnalysis({ ...good, reasoning: '' }) === null);
  check('analysis: the saved date survives', normalizeAnalysis({ ...good, analyzedAt: '2026-11-01T00:00:00Z' })!.analyzedAt === '2026-11-01T00:00:00Z');
  check('analysis: not an object', normalizeAnalysis('text') === null && normalizeAnalysis(null) === null);
}

// The model's ideas on Discover
{
  const idea = normalizeSuggestion({ symbol: ' voo', reason: 'Broad.', keyFactors: 'cheap' })!;
  check('idea: tidied, with a name to show', idea.symbol === 'VOO' && idea.name === 'VOO' && idea.keyFactors!.join() === 'cheap');
  check('idea: needs a symbol and a reason', normalizeSuggestion({ symbol: 'VOO' }) === null && normalizeSuggestion({ reason: 'x' }) === null);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
