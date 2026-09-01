# Architecture

How the pieces fit together, and what each run actually does.

## System overview

The C++ binary owns portfolio state and all trading rules. It knows nothing
about market data or machine learning — it shells out to Python for both and
reads back a small JSON object per ticker.

```
┌──────────────────────────────────────────────────────────────┐
│  watchlist.txt          portfolio_state.json                 │
│  (candidates)           (cash + open positions)              │
└───────────┬──────────────────────┬───────────────────────────┘
            │                      │
            v                      v
┌──────────────────────────────────────────────────────────────┐
│  trader.cpp                                                  │
│                                                              │
│   1. runExits()      close positions hitting stop/target     │
│   2. runEntries()    open or add where the model signals     │
│   3. performRiskAudit()   report concentration               │
│   4. persist()       write state (skipped on --dry-run)      │
│                                                              │
│   MLPredictor: popen("python3 predict.py TICKER")            │
│                one call per ticker per run, cached           │
└───────────┬──────────────────────────────────────────────────┘
            │  JSON on stdout
            v
┌──────────────────────────────────────────────────────────────┐
│  ml_model/predict.py                                         │
│                                                              │
│   download_historical_data(ticker, period="3mo")             │
│           │                                                  │
│           v                                                  │
│   create_features()  ──> 14 technical indicators             │
│           │                                                  │
│           v                                                  │
│   scaler.transform() ──> model.predict_proba()               │
│           │                                                  │
│           v                                                  │
│   {ticker, buy_signal, confidence, latest_price, ...}        │
└───────────┬──────────────────────────────────────────────────┘
            │
            v
      yfinance ──> Yahoo Finance
```

Alpha Vantage appears only in `legacy-alphavantage.cpp`, the superseded first
version. The current bot gets prices from yfinance via `predict.py`, in the same
call that returns the prediction.

## What one run does

```
load portfolio_state.json
  │
  ├─ EXITS (open positions, evaluated first so freed cash can be redeployed)
  │    │
  │    ├─ no live price?          -> skip, report status
  │    ├─ no cost basis?          -> skip, cannot evaluate a return
  │    ├─ return <= -STOP_LOSS    -> SELL all      (checked first)
  │    ├─ return >= +TAKE_PROFIT  -> SELL all
  │    ├─ ML_SELL_ENABLED and model says no, confidently -> SELL all
  │    └─ otherwise               -> hold
  │
  ├─ ENTRIES (watchlist)
  │    │
  │    ├─ model says no?                  -> skip
  │    ├─ confidence < threshold?         -> skip
  │    ├─ no cash after 5% buffer?        -> skip
  │    ├─ position already at risk cap?   -> skip
  │    └─ else BUY min(confidence x spendable, risk headroom, spendable)
  │
  ├─ RISK AUDIT   weight per position, flag anything over the cap
  │
  └─ persist (unless --dry-run)
```

### Position sizing

Three constraints, smallest wins:

```
cashBuffer      = cash x 0.05                  always retained
spendableCash   = cash - cashBuffer
confidenceAlloc = spendableCash x confidence   conviction sizes the buy
riskHeadroom    = (RISK_THRESHOLD x totalValue) - currentPositionValue

allocation = min(confidenceAlloc, riskHeadroom, spendableCash)
shares     = allocation / price
```

`totalValue` is cash plus every position marked to the prices seen this run,
falling back to cost for anything unpriced so the denominator stays honest.

## Cost basis

Positions carry a weighted average cost, updated on each buy:

```
avgCost = (oldShares x oldAvgCost + newShares x price) / (oldShares + newShares)
```

With one exception. A position loaded from the older state format has **no**
cost basis, and averaging a known price against an unknown one treated as zero
would fabricate a basis well below what was actually paid — the next run would
then read a large fictitious gain and sell. So a position with unknown basis
stays unknown, and its exit rules stay skipped, until a human fills in
`avg_cost` in `portfolio_state.json`.

## Feature pipeline

`data_collector.py:create_features()` produces 14 features from OHLCV bars:

| Group | Features |
| --- | --- |
| Momentum | `return_5d`, `return_10d`, `return_20d` |
| Volume | `volume_change`, `volume_ma_ratio` |
| Oscillator | `rsi_14` |
| Trend | `macd`, `macd_signal`, `macd_hist`, `close_vs_sma20` |
| Volatility | `bb_position`, `hl_range`, `volatility_20` |
| Gap | `overnight_gap` |

Conventions worth knowing, because they are not the only reasonable choices:

- **RSI** uses a simple moving average of gains and losses (Cutler's RSI), not
  Wilder's smoothing.
- **Bollinger Bands** use pandas' sample standard deviation (`ddof=1`).
- **MACD** uses `ewm(adjust=False)`, i.e. the recursive form.

These same conventions are reimplemented in TypeScript in the sibling *Roth IRA
2.0* project and pinned to this pipeline by a fixture test, so changing one here
will fail that test there.

## Model

| Property | Value |
| --- | --- |
| Type | `RandomForestClassifier` |
| Trees | 100, max depth 15 |
| Class weight | balanced |
| Label | gained >= 2% over the next 5 trading days |
| Training window | 5 years per ticker |
| Test accuracy | 0.695 |
| Test F1 | 0.423 |
| Test ROC-AUC | 0.657 |

Hyperparameters were chosen for a Raspberry Pi: small enough to load and infer
quickly, shallow enough to keep memory modest.

The metrics are weak. Accuracy looks respectable only because the label is
imbalanced; F1 0.42 and ROC-AUC 0.657 put this modestly above chance. That is
why the model gates entries but does not, by default, drive exits.

## Prediction status codes

`predict.py` always returns JSON with a `status`. The C++ side treats anything
other than `success` as "no opinion" and moves on.

| Status | Meaning |
| --- | --- |
| `success` | Prediction valid; `latest_price` usable |
| `insufficient_data` | Fewer than 30 bars returned |
| `feature_calculation_failed` | All rows dropped as NaN |
| `invalid_features` | Non-finite values in the feature vector |
| `error: ...` | Exception inside Python |
| `model_not_ready` | Model files missing (C++ side) |
| `execution_failed` | `popen` failed (C++ side) |
| `empty_output` | Python produced nothing (C++ side) |
| `subprocess_error: ...` | Output was not JSON (C++ side) |

## Configuration

Every tunable is an environment variable, read once at startup in `main()`.
`config.env.example` documents all of them.

| Variable | Default | Effect |
| --- | --- | --- |
| `ML_CONFIDENCE_THRESHOLD` | 0.55 | Minimum confidence to buy |
| `RISK_THRESHOLD` | 0.25 | Max weight per position |
| `STOP_LOSS_PCT` | 0.15 | Exit below this loss; 0 disables |
| `TAKE_PROFIT_PCT` | 0.30 | Exit above this gain; 0 disables |
| `ML_SELL_ENABLED` | off | Let the model close positions |
| `ML_SELL_CONFIDENCE` | 0.70 | Confidence needed for a model exit |
| `DRY_RUN` | off | Same as `--dry-run` |
| `PYTHON_BIN` | `python3` | Interpreter for inference |

## Files written

**`portfolio_state.json`** — rewritten in full each run:

```json
{
  "cash_usd": 54.47,
  "holdings": { "FRO": { "shares": 5.0, "avg_cost": 21.30 } }
}
```

**`portfolio_log.csv`** — appended, never rewritten:

```
date,ticker,price,shares,total,side
```

`side` was appended last so rows written before selling existed still parse;
a five-field row is a buy.

Neither is touched under `--dry-run`.

## Known gaps

- **No backtest.** None of these rules have been evaluated against history or
  compared to buy-and-hold. This is the biggest missing piece.
- **No rebalancing.** The audit reports a position over the cap but will not
  trim it; it only refuses to add more.
- **Sells are all-or-nothing.** No partial profit-taking.
- **No transaction costs or slippage** are modelled anywhere.
