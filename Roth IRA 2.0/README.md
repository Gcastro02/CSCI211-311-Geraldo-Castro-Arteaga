# Roth IRA Portfolio Strategist 2.0

Portfolio tracking for a Roth IRA: contributions against the annual limit, a
transaction log with FIFO cost basis, holdings and cash, a watchlist with price
alerts, price charts, measured technical indicators, position-concentration
analysis, and optional AI research.

All portfolio data lives in the browser's `localStorage`. Nothing is stored
server-side.

This app is being expanded with a fake-money practice mode and level-based
guidance, absorbing the sibling `Trading Simulator` bot. See
[DESIGN.md](DESIGN.md) for the plan.

## Running it

```bash
npm install
npm run dev          # http://localhost:3000
```

For a production build:

```bash
npm run build
npm run serve        # http://localhost:8080
```

`npm run serve` matters — see [Why there is a server](#why-there-is-a-server).

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server with the Yahoo proxy |
| `npm run build` | Production bundle into `dist/` |
| `npm run serve` | Express server: serves `dist/`, proxies market data, optional AI relay |
| `npm run lint` | `tsc --noEmit` |
| `npm run verify` | Runs both verification suites below |
| `npm run verify:indicators` | Checks the indicator math against the Python reference |
| `npm run verify:transactions` | Checks contribution limits, FIFO basis, and replay |

## The Activity tab

This is what makes the app Roth-specific rather than a generic tracker.

**Contributions are tracked against the annual limit** per tax year. Exceeding
it generally incurs a 6% excise tax for each year the excess remains, so the app
flags it and explains the correction. Only `CONTRIBUTION` entries count —
dividends and growth inside the account never do.

**Contributions can be designated for the prior tax year** up to that year's
filing deadline, so a contribution carries an explicit tax year rather than
being inferred from its date.

**The annual limit is not hardcoded.** The IRS adjusts it for inflation, so any
figure baked into a build eventually goes stale. `DEFAULT_CONTRIBUTION_LIMITS`
in `src/lib/contributions.ts` holds the years this build knows; for any other
year the app carries the most recent figure forward, marks it **unverified**,
and asks you to confirm it against IRS Publication 590-A. Confirmed values are
saved as per-year overrides.

**Contribution basis** — lifetime contributions less withdrawals — is shown
separately, since that portion can generally be withdrawn at any time without
tax or penalty while earnings cannot.

Not tracked: the income-based eligibility phase-out, and the 5-year rule.

### Cost basis

Sales are matched **FIFO** and shown as realized gain or loss. This is for
measuring performance only — a sale inside a Roth IRA is not a taxable event and
nothing here needs reporting.

Holdings remain the source of truth for valuation, and recording a transaction
updates them automatically. The two can still diverge in two ways, both surfaced
in the reconciliation panel:

- **Share count drift** — positions entered before you started logging.
- **Cost method** — holdings carry a weighted average across all lots; the
  replay carries the cost of the lots FIFO left open. These agree until you sell
  part of a position bought at different prices, at which point both numbers are
  correct and simply answer different questions.

## Where the numbers come from

The app draws a deliberate line between **measured** and **estimated** values.

**Measured** — computed locally from real OHLCV bars, no API key required:

- Prices and charts (Yahoo Finance)
- RSI(14), MACD(12/26/9), Bollinger Bands(20, 2σ), SMA 5/20, realized
  volatility, momentum returns, volume ratios — see `src/lib/indicators.ts`
- Position weights, concentration, and sizing — see `src/lib/portfolioMath.ts`
- News headlines (Yahoo Finance search)

**Estimated** — produced by a language model and labelled `est` in the UI:

- P/E ratio, market cap, dividend yield
- BUY/HOLD/SELL recommendations, reasoning, projected growth
- Market suggestions

The model has no live market access, so it cannot know a current P/E. Those
fields are shown because they are useful context, but they are flagged so they
are not mistaken for measurements. Measured indicators are passed *into* the
prompt so the model reasons over real numbers rather than recalling them.

### Indicator provenance

`src/lib/indicators.ts` is a port of the Python feature pipeline from the
sibling **Trading Simulator** project (`ml_model/data_collector.py`), matching its
formulas and conventions exactly — including pandas' sample standard deviation
(`ddof=1`) and `ewm(adjust=False)` recursion.

`npm run verify:indicators` checks all 18 features against a fixture generated
by the original Python, and currently matches to floating-point precision. To
regenerate the fixture (needs `pandas` and `numpy`, plus the bot project on
disk):

```bash
python scripts/generate-indicator-fixture.py
```

The bot's Random Forest classifier was **not** ported. It scored F1 0.42 /
ROC-AUC 0.657 on its own test split — close enough to the base rate that
shipping it would add opacity without adding accuracy. `scoreTechnicals()`
replaces it with a weighted rule set whose every component is shown in the UI.

## Why there is a server

Yahoo Finance sends no `Access-Control-Allow-Origin` header, so a browser cannot
call it directly. In development Vite's proxy handles this; a static production
build has no proxy, so **every price and news request fails on CORS**.
`server.ts` reproduces the dev proxy for production.

It also offers an optional AI relay. See the security note below.

## Configuration

Copy `.env.example` to `.env`.

**Local development** — set `VITE_OPENAI_API_KEY`. AI features light up
immediately, and the app works fine without it (everything measured still
works; only the AI panels switch off).

**Anything hosted** — leave `VITE_OPENAI_API_KEY` unset and set
`OPENAI_API_KEY` instead. Anything prefixed with `VITE_` is compiled into the
client bundle, so a `VITE_OPENAI_API_KEY` on a public page can be read by any
visitor and used at your expense. With only `OPENAI_API_KEY` set, the client
posts to `/api/ai/chat` and the key never leaves the server.

The client picks its path automatically (`AI_MODE` in
`src/services/openaiService.ts`): a client key means direct calls, no client key
in a production build means the server relay, and no key anywhere in
development means AI features are disabled.

## Display currency

Market data is quoted in USD and there is **no FX conversion**. Changing the
currency setting changes the symbol and number formatting only; the underlying
values remain US dollars. The settings page says so when a non-USD currency is
selected.

## Not investment or tax advice

Technical indicators describe recent price behaviour; they do not predict it.
The position sizer is arithmetic against rules you set, not a recommendation.
The AI panels are research prompts, not guidance.

Contribution tracking is a convenience, not a compliance tool. It does not know
your income, your other IRAs, or your filing status — all of which affect how
much you may actually contribute. Confirm limits and eligibility against IRS
Publication 590-A or a tax professional before acting on anything here.
