/**
 * Checks for the concentration audit and position sizer, above all that funds
 * aren't held to a limit meant for single companies.
 * Run with:  npm run verify:risk
 */

import { auditRisk, calculatePositionSize } from '../src/lib/portfolioMath';
import { isFund } from '../src/lib/funds';

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

const near = (actual: number, expected: number, tolerance = 1e-6) => Math.abs(actual - expected) < tolerance;

// Which symbols are funds
check('funds: known funds without a quote', isFund('SPY') && isFund(' voo '));
check('funds: a company is not a fund', !isFund('AAPL'));
check('funds: a quote that says fund wins', isFund('ZZFUND', { ZZFUND: true }));
check('funds: a quote that says company wins', !isFund('SPY', { SPY: false }));

// The audit
{
  const holdings = [
    { symbol: 'SPY', shares: 10, averagePrice: 400 },
    { symbol: 'AAPL', shares: 20, averagePrice: 150 },
  ];
  const prices = { SPY: 500, AAPL: 200 };
  const audit = auditRisk(holdings, prices, 1000, 0.25, symbol => isFund(symbol));
  const spy = audit.positions.find(p => p.symbol === 'SPY')!;
  const aapl = audit.positions.find(p => p.symbol === 'AAPL')!;
  check('audit: a fund over 25% is not flagged', spy.weight > 0.25 && spy.isFund && !spy.overLimit && spy.excessValue === 0, `${spy.weight}`);
  check('audit: a company over 25% still is', aapl.overLimit && near(aapl.excessValue, 4000 - 0.25 * 10000));
  check('audit: only the company is listed as over', audit.overLimit.map(p => p.symbol).join() === 'AAPL');
  check('audit: without a fund check every position is held to the limit', auditRisk(holdings, prices, 1000).overLimit.length === 2);
}

// The sizer
{
  const base = { price: 100, cashBalance: 10000, totalPortfolioValue: 10000, currentPositionValue: 0, confidence: 1 };
  const company = calculatePositionSize({ ...base, riskThreshold: 0.25 });
  check('sizer: a company is capped at 25%', near(company.cost, 2500) && company.limitedBy === 'RISK_CAP');
  const fund = calculatePositionSize({ ...base, riskThreshold: Infinity });
  check('sizer: a fund is only limited by the cash buffer', near(fund.cost, 9500) && fund.limitedBy === 'CONFIDENCE');
  const empty = calculatePositionSize({ ...base, cashBalance: 0, totalPortfolioValue: 0, riskThreshold: Infinity });
  check('sizer: a fund with an empty account gives nothing, not NaN', empty.shares === 0 && empty.limitedBy === 'NO_CASH' && !Number.isNaN(empty.riskHeadroom));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
