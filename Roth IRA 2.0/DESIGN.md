# Design: where this app is heading

This app and the sibling `Trading Simulator/` folder were built separately. They
are being merged into **one app**: a Google Finance–style tool for tracking real
investments, with a fake-money practice mode and guidance that adapts to the
user's experience.

**No real money ever moves through the app.** Users trade at their own broker
and use this to monitor, learn and rehearse.

## The four parts

| Part | What it does | Status |
| --- | --- | --- |
| **Track** | Enter real holdings and transactions; monitor prices, charts, news, risk | Built (this app) |
| **Practice** | Trade fake money against historical prices, at any speed | Not started |
| **Learn** | Guidance scaled to a trading level chosen at onboarding | Not started |
| **Roth IRA** | Contribution limits, contribution basis | Built; becomes an optional bonus |

## Track (existing)

Keep everything the app does today: holdings, transaction log with FIFO cost
basis, watchlist and alerts, charts, measured indicators, risk audit, position
sizer, optional AI research.

**Roth features become opt-in.** Add an account type to settings
(`'BROKERAGE' | 'ROTH_IRA'`, default `BROKERAGE`). The contribution tracker and
Roth wording only appear for `ROTH_IRA`. Nothing is deleted.

## Practice

The point: rehearse trading without waiting for the market and without risking
anything.

### How a session works

1. Pick a **scenario**: a start date, an end date, starting cash, and the
   symbols available.
2. The app sets a **simulated clock** to the start date.
3. The user sees the market *as of that day* — charts, indicators, prices —
   and places buy/sell orders.
4. The user advances time: **next day**, **next week**, **play** (auto-advance
   at a chosen speed), or **skip to end**.
5. At the end: a results screen comparing the user against **buy-and-hold** of
   the same symbols and, later, against the bot (see below).

Presets make good lessons: the 2008 crash, the March 2020 crash and recovery,
the 2021 run-up, a flat year. A **mystery mode** hides the real dates and
tickers so the user cannot trade on hindsight ("I know 2020 recovers").

### Rules that keep it honest

- **No look-ahead.** Every chart, indicator and price shown must use only bars
  on or before the simulated date. This is the bug most likely to make the
  simulator lie, so it gets tests.
- **Fill price.** An order placed on day *D* fills at day *D*'s close. Simple
  and easy to explain; revisit if it proves too generous.
- **Practice and real data never mix.** Practice accounts use their own storage
  keys and never touch the real portfolio, transactions or watchlist.

### Reuse

Most of the engine already exists:

| Need | Already in |
| --- | --- |
| Account state from a list of trades | `replayTransactions()` in `src/lib/transactions.ts` — a practice account is a transaction log (`CONTRIBUTION` for starting cash, then `BUY`/`SELL`) |
| Position weights, concentration, sizing | `src/lib/portfolioMath.ts` |
| Indicators and score on a bar series | `computeIndicators()`, `scoreTechnicals()` in `src/lib/indicators.ts` — run them on bars truncated at the simulated date |
| Historical daily bars | `fetchYahooPriceHistory()` in `src/services/openaiService.ts` |

**One gap:** the price fetcher asks Yahoo for a relative `range` (`1y`, `5y`,
`max`), and long ranges come back weekly or monthly. Practice needs daily bars
for an arbitrary past window. The Yahoo chart endpoint accepts absolute
`period1`/`period2` timestamps with `interval=1d`; add a fetcher for that and
cache the bars per scenario so playback does not re-fetch.

### The bot as opponent

The `Trading Simulator` bot's rules — buy when the signal is strong enough,
size against a risk budget, stop-loss at −15%, take-profit at +30% — get ported
to TypeScript and run over the same scenario as the user. Its buy signal comes
from `scoreTechnicals()`, not the Python Random Forest, which was too weak to
ship (README: F1 0.42, ROC-AUC 0.657). The results screen then shows three
lines: you, the bot, buy-and-hold. This is the bot's long-term home; the C++
program stays in its folder as reference.

## Learn

### Onboarding

On first launch, ask the user's level. It is stored in settings and can be
changed at any time.

| Level | Who it's for |
| --- | --- |
| **Beginner** | Has never bought a stock, or not sure what a P/E or ETF is |
| **Intermediate** | Has a brokerage account, knows the basics, wants to get better |
| **Advanced** | Comfortable with indicators and position sizing; wants the tools, not the lessons |

### What the level changes

| | Beginner | Intermediate | Advanced |
| --- | --- | --- | --- |
| Term explanations (RSI, P/E, ETF…) | Inline, always shown | On hover | Off |
| Indicator panel | Plain-language summary first, numbers below | Numbers with one-line meaning | Numbers only |
| Before a practice trade | Confirmation explaining what will happen and the risk (e.g. "this would be 40% of your account") | Warning only when a risk limit is exceeded | No prompts |
| Practice scenarios | Guided presets with a goal ("survive the 2020 crash") | All presets | Presets plus custom |
| Default view | Simplified dashboard | Full app | Full app |

Guidance explains; it does not recommend. "RSI above 70 means the stock has
risen fast recently" — not "sell now." Same line the app already draws between
measured and estimated values.

## Look and feel

The current UI is being replaced. Agreed direction (mockup:
https://claude.ai/artifact/EspVbjVyVu7YYn9BYr1BxV):

- **Ticker-first, like Google Finance.** Search bar and market index strip at
  the top; screens organized around your portfolio and individual stocks, not a
  sidebar of tools. Top navigation: Home, Portfolio, Watchlist, Practice, Learn.
- **Flat and dense.** Hairline dividers and tables instead of rounded cards,
  gradients and drop shadows. No slide-in animation on every tab.
- **One accent color** (blue). Green and red are reserved for price direction
  and always paired with ▲/▼ so color is never the only signal.
- **Type:** IBM Plex Sans for UI, IBM Plex Mono for tickers, tabular numerals
  so figures line up in columns.
- **Dark mode is the default, light mode is a toggle** in the header and in
  settings. Every color is a CSS variable defined once per theme (`--bg`,
  `--text`, `--muted`, `--line`, `--accent`, `--up`, `--down`, …). This
  replaces the current approach in `src/index.css`, which fakes dark mode by
  overriding light Tailwind classes with `!important`.

## Engineering notes

- **Split `App.tsx` first.** It is ~2,800 lines with every tab inline. Adding
  practice mode and level-aware rendering on top of that will be painful. Move
  each tab into its own component before building new features.
- **Storage keys stay `roth_ira_*`.** Renaming them would wipe existing users'
  data. If they must change, migrate on load.
- **Level lives in `UserSettings`** as `experienceLevel: 'BEGINNER' |
  'INTERMEDIATE' | 'ADVANCED'`, next to the existing fields.
- Data stays in the browser (`localStorage`) for now. Accounts and sync are out
  of scope until the core works.

## Build order

1. **Restructure and restyle** — set up the theme variables, then rebuild each
   screen as its own component in the new look (Home first), replacing the
   matching section of `App.tsx` as it goes; add the account type setting and
   gate the Roth features behind it.
2. **Practice mode MVP** — daily-bar fetcher, simulated clock, buy/sell, next
   day/week controls, results vs. buy-and-hold. One preset. No-look-ahead tests.
3. **Levels** — onboarding question, `experienceLevel` setting, term
   explanations and trade confirmations scaled by level.
4. **Scenarios** — more presets, play-at-speed, mystery mode, guided goals for
   beginners.
5. **Bot opponent** — port the Trading Simulator rules; three-way results.
6. **Name** — the app outgrew "Roth IRA Portfolio Strategist"; pick a new name
   once the shape is settled.

## Open questions

- Is close-of-day fill too generous for teaching? Next day's open is more
  realistic but harder to explain.
- Should practice support short selling or options, or stay long-only stocks
  and ETFs? (Proposed: long-only to start.)
- How much of the beginner material is written by hand vs. generated by the AI
  panel? Hand-written is accurate and works without an API key.

## Not investment advice

Same as the rest of the app: this is a learning tool. Practice results on
historical data say nothing about future returns.
