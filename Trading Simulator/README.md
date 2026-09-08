# Stock Trader Bot

A paper-trading bot. It reads a watchlist, asks a Python ML model whether each
symbol looks like a buy, sizes positions against a risk budget, applies exit
rules to open positions, and records everything to local files.

**It does not connect to a broker and never places a real order.** All trades
are simulated against `portfolio_state.json`.

```
watchlist.txt ──> trader (C++) ──> predict.py (Python) ──> yfinance
                     │                    │
                     │              buy signal + confidence + price
                     v
              entry / exit rules
                     │
                     v
      portfolio_state.json + portfolio_log.csv
```

## Quick start

```bash
bash quickstart.sh        # install deps, train the model, build
./trader --dry-run        # see what it would do, writing nothing
./trader                  # run for real
```

Or with make:

```bash
make setup-ml    # download data and train
make            # build
make dry-run    # evaluate without writing
make run        # run for real
```

**Start with `--dry-run`.** It prints every decision and touches no files.

## How it decides

Each run does three things, in this order.

### 1. Exits

Open positions are checked first, so cash freed by a sale can be redeployed in
the same run. Rules apply in order of precedence:

| Rule | Default | Env var |
| --- | --- | --- |
| Stop loss — close when down this much from average cost | 15% | `STOP_LOSS_PCT` |
| Take profit — close when up this much | 30% | `TAKE_PROFIT_PCT` |
| Model exit — close when the model stops signalling a buy | **off** | `ML_SELL_ENABLED` |

Stop loss takes precedence because capping a loss matters more than realizing a
gain. Set either percentage to `0` to disable it.

Model-driven exits are off by default on purpose — see
[About the model](#about-the-model).

### 2. Entries

Each watchlist symbol is bought only if **all** of these hold:

- the model signals a buy,
- its confidence is at least `ML_CONFIDENCE_THRESHOLD` (default 0.55),
- there is spendable cash after the 5% buffer,
- the position is below `RISK_THRESHOLD` of total portfolio value (default 25%).

Size is `confidence x spendable cash`, then capped by whichever binds first: the
room left under the risk limit, or the cash left after the buffer.

### 3. Risk audit

Prints each position's weight against total portfolio value and flags anything
over the limit.

## Configuration

Everything is environment variables. Copy the template and edit:

```bash
cp config.env.example config.env
source config.env && ./trader --dry-run
```

`PYTHON_BIN` points at a specific interpreter if `python3` is not the one with
your dependencies:

```bash
PYTHON_BIN=/path/to/venv/bin/python ./trader --dry-run
```

## State files

**`watchlist.txt`** — one ticker per line. Symbols the bot may buy.

**`portfolio_state.json`** — current cash and positions:

```json
{
  "cash_usd": 54.47,
  "holdings": {
    "FRO": { "shares": 5.0, "avg_cost": 21.30 }
  }
}
```

An older format stored a bare share count per ticker (`"FRO": 5.0`). That still
loads, but those positions have **no cost basis**, so stop-loss and take-profit
cannot be evaluated for them and are skipped — the bot says so on each run
rather than guessing. Buying more does not invent one either, since averaging a
known price against an unknown one produces a basis far below what was actually
paid and would trigger a fictitious take-profit. To enable exit rules on a
carried-over position, fill in its `avg_cost` by hand.

**`portfolio_log.csv`** — append-only trade log:

```
date,ticker,price,shares,total,side
```

`side` was added when selling was implemented, so rows with only five fields
were buys.

## About the model

`ml_model/` trains a Random Forest to predict whether a stock gains 2% over the
next 5 trading days, from 14 technical features (RSI, MACD, Bollinger position,
momentum, volume ratios, volatility). `predict.py` is called as a subprocess and
returns JSON.

Its own test metrics, in `ml_model/models/stock_classifier_metadata.json`:

| Metric | Value |
| --- | --- |
| Accuracy | 0.695 |
| F1 | 0.423 |
| ROC-AUC | 0.657 |

**Read those honestly.** 69% accuracy sounds good until you notice the label is
imbalanced; F1 0.42 and ROC-AUC 0.657 put this only modestly above guessing. It
is good enough to rank candidates, and thin evidence on which to close a
position — which is why model-driven exits default to off while the fixed
stop-loss and take-profit default to on.

Nothing here has been backtested. Before trusting any of these rules, replay
them over history and compare against buy-and-hold.

Retrain on fresh data with `make setup-ml`.

## Layout

```
trader.cpp                  the bot
legacy-alphavantage.cpp     superseded first version, kept for reference
Makefile                    build and run targets
config.env.example          all tunables
trader-bot.service          systemd unit for unattended runs
quickstart.sh               one-shot setup
watchlist.txt               symbols to consider
portfolio_state.json        cash and positions
portfolio_log.csv           trade history
ml_model/
  data_collector.py         yfinance download + feature engineering
  train_model.py            fits the Random Forest
  predict.py                inference, called by the C++ bot
include/nlohmann/json.hpp   vendored JSON library
```

`legacy-alphavantage.cpp` was the first version: quote from Alpha Vantage, log a
one-share buy regardless of signal, audit using cost basis from the CSV.
`trader.cpp` replaces it entirely. It needs libcurl — `make legacy`.

## Running unattended

See [RASPBERRY_PI_GUIDE.md](RASPBERRY_PI_GUIDE.md). In short: copy
`trader-bot.service` to `/etc/systemd/system/`, point `WorkingDirectory` and
`ExecStart` at your install path, and enable it.

## Not investment advice

This is a coursework project for learning, not a trading system. The model is
weak, the rules are unvalidated, and none of it has been backtested. Do not
wire it to a real brokerage account.
