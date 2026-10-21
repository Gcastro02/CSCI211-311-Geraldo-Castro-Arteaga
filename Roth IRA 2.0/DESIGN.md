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
| **Practice** | Trade fake money against historical prices, at any speed | MVP built (one scenario) |
| **Learn** | Guidance scaled to a trading level chosen at onboarding | Levels built; lessons not started |
| **Roth IRA** | Contribution limits, contribution basis | Built; optional via account type |

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

1. ✅ **Restructure and restyle** — set up the theme variables, then rebuild each
   screen as its own component in the new look (Home first), replacing the
   matching section of `App.tsx` as it goes; add the account type setting and
   gate the Roth features behind it.
2. ✅ **Practice mode MVP** — daily-bar fetcher, simulated clock, buy/sell, next
   day/week controls, results vs. buy-and-hold. One preset. No-look-ahead tests.
   Built as `src/lib/practice.ts` (pure engine, checked by
   `npm run verify:practice`) and `src/components/practice/PracticeScreen.tsx`.
   MVP choices, to revisit in step 4: one tradable symbol per scenario; whole
   shares only; play runs at a fixed speed. Prices are Yahoo's actual closes
   (split-adjusted, not dividend-adjusted), so a learner sees the prices people
   saw at the time. The session lives under its own `practice_session` storage
   key and resumes after a refresh.
3. ✅ **Levels** — onboarding question, `experienceLevel` setting, term
   explanations and trade confirmations scaled by level.
   The rules live in `src/lib/level.ts`; screens ask it rather than checking
   the level themselves. Built: onboarding (also shown to existing users once),
   the Settings choice and header chip, inline/hover/off term explanations on
   the stock page, a plain-language indicator summary for beginners, the
   Home weight tip and practice market notes (hidden for advanced), practice
   order confirmations, and the AI writing at the reader's level.
   The "Default view" row was done afterwards: beginners' Home drops the
   market strip, market news and the price and today columns, and puts
   practice at the top; a link switches to the full dashboard and is
   remembered. ("Practice scenarios" was done in step 4.) Single-company concentration warnings don't apply to
   funds, only to individual stocks.
4. ✅ **Scenarios** — more presets, play-at-speed, mystery mode, guided goals for
   beginners.
   Four presets (2020 crash; 2008 crisis with SPY, JPM, GLD; 2022 bear market
   with SPY, QQQ, AAPL; sideways 2015 with SPY, AAPL, KO), each with a goal
   shown to beginners and judged only on days already played. Play at 1×, 2×
   or 5×. Mystery mode picks a preset at random, hides its name, dates and
   tickers, rescales prices to start at 100 (returns unchanged) and reveals the
   answer at the end. Advanced users can build their own scenario: up to three
   tickers over up to three years. Scenarios with several assets compare
   against the starting cash split evenly across them on day one and held; a
   scenario's calendar is only the days every asset traded, so no price is
   ever filled in or interpolated.
5. ✅ **Bot opponent** — port the Trading Simulator rules; three-way results.
   Built as `src/lib/practiceBot.ts` (checked by `npm run verify:bot`). The
   exit and sizing rules are trader.cpp's: sell everything at −15% (checked
   first) or +30% from the average cost; buy at 55% confidence or more,
   sized as confidence × cash after a 5% buffer, with at most 25% of the
   account in one company. The buy signal is not the Random Forest: it was
   trained on years that overlap the scenarios and needs Python, so the bot
   uses `scoreTechnicals` (the same indicators the model was fed) over the
   last 120 visible bars, read as a probability. Like the player it trades
   whole shares only, and funds are exempt from the 25% cap. Its account
   shows beside yours while you play; its trades, each with its reason, are
   revealed at the end with three-way standings.
6. ✅ **Name** — the app outgrew "Roth IRA Portfolio Strategist"; it is now
   **Paper Trail** (paper trading, plus a record of your real holdings). The
   storage keys keep their `roth_ira_*` names so existing data still loads.

## Decided

- Practice orders fill at the simulated day's close. Next day's open is more
  realistic, but "you trade at the price you're looking at" is easier to
  teach, and the bot and buy-and-hold get the same fills.
- Practice is long-only: buy and sell stocks and funds you hold. No short
  selling or options for now.
- AI research runs only when the user asks for it, and each result is kept
  for a week, since every request costs money.

## Open questions

- How much of the beginner material is written by hand vs. generated by the AI
  panel? Hand-written is accurate and works without an API key.

## Not investment advice

Same as the rest of the app: this is a learning tool. Practice results on
historical data say nothing about future returns.
