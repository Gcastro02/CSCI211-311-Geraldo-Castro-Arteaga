# ML Finance Bot - Visual Architecture & Workflow

## System Architecture

```
                    ┌─────────────────────────────────────┐
                    │   MARKET DATA SOURCE                 │
                    │  (Alpha Vantage + Yahoo Finance)    │
                    └────────────────┬────────────────────┘
                                     │
                    ┌────────────────┴────────────────┐
                    │                                  │
                    ▼                                  ▼
        ┌──────────────────────┐        ┌──────────────────────┐
        │  LIVE PRICE FEED     │        │  HISTORICAL DATA     │
        │  (Alpha Vantage API) │        │  (Yahoo Finance)     │
        │                      │        │  5 years of OHLCV    │
        └──────────────┬───────┘        └──────────────┬───────┘
                       │                               │
                       │                    ┌──────────▼──────────┐
                       │                    │ DATA COLLECTION     │
                       │                    │ (data_collector.py) │
                       │                    │                     │
                       │                    │ • Downloads OHLCV   │
                       │                    │ • Calculates 14     │
                       │                    │   indicators        │
                       │                    │ • Creates labels    │
                       │                    │ • Exports training  │
                       │                    │   dataset           │
                       │                    └──────────┬──────────┘
                       │                               │
                       │              ┌────────────────▼────────────────┐
                       │              │   MODEL TRAINING                 │
                       │              │   (train_model.py)               │
                       │              │                                  │
                       │              │ • Loads training dataset         │
                       │              │ • Trains Random Forest (100      │
                       │              │   trees, depth=15)              │
                       │              │ • Standardizes features          │
                       │              │ • Evaluates on test set          │
                       │              │ • Saves model artifacts:         │
                       │              │   - stock_classifier.pkl        │
                       │              │   - feature_scaler.pkl          │
                       │              │   - metadata.json               │
                       │              └────────────────┬────────────────┘
                       │                               │
        ┌──────────────▼─────────────────────────────┬▼────┐
        │                                                   │
        │   C++ PORTFOLIO MANAGEMENT BOT                   │
        │   (Roth-IRA-ML.cpp)                              │
        │                                                   │
        │  ┌─────────────────────────────────────────┐    │
        │  │ 1. MARKET DATA FETCH                    │    │
        │  │    • Connect to Alpha Vantage API       │    │
        │  │    • Get current price for ticker       │    │
        │  │    • Handle rate limiting (5 req/min)   │    │
        │  └──────────────────┬──────────────────────┘    │
        │                     │                             │
        │  ┌──────────────────▼──────────────────────┐    │
        │  │ 2. ML PREDICTION REQUEST                │    │
        │  │    • Spawn Python subprocess            │    │
        │  │    • Call predict.py with ticker        │    │
        │  │    • Parse JSON response                │    │
        │  └──────────────────┬──────────────────────┘    │
        │                     │                             │
        │         ┌───────────▼───────────┐                │
        │         │ PYTHON ML ENGINE      │                │
        │         │ (predict.py)          │                │
        │         │                       │                │
        │         │ • Download latest     │                │
        │         │   price data          │                │
        │         │ • Calculate 14        │                │
        │         │   technical           │                │
        │         │   indicators          │                │
        │         │ • Load pre-trained    │                │
        │         │   model               │                │
        │         │ • Predict buy/hold    │                │
        │         │   signal              │                │
        │         │ • Return JSON:        │                │
        │         │   {                  │                │
        │         │     buy_signal: bool, │                │
        │         │     confidence: 0-1,  │                │
        │         │     probability: 0-1, │                │
        │         │     status: string    │                │
        │         │   }                   │                │
        │         └───────────┬───────────┘                │
        │                     │                             │
        │  ┌──────────────────▼──────────────────────┐    │
        │  │ 3. TRADING DECISION LOGIC               │    │
        │  │    Decision Tree:                       │    │
        │  │    ├─ ML buy_signal == true?            │    │
        │  │    │  └─ Confidence > threshold (0.65)? │    │
        │  │    │     ├─ YES → BUY                   │    │
        │  │    │     └─ NO  → SKIP                  │    │
        │  │    └─ NO  → SKIP                        │    │
        │  └──────────────────┬──────────────────────┘    │
        │                     │                             │
        │  ┌──────────────────▼──────────────────────┐    │
        │  │ 4. POSITION SIZING                      │    │
        │  │    • Calculate shares to buy             │    │
        │  │    • (Future: risk-based allocation)     │    │
        │  │    • Currently: 1 share per signal       │    │
        │  └──────────────────┬──────────────────────┘    │
        │                     │                             │
        │  ┌──────────────────▼──────────────────────┐    │
        │  │ 5. LOG TRADE                            │    │
        │  │    Write to portfolio_log.csv:          │    │
        │  │    DATE,TICKER,PRICE,SHARES,VALUE       │    │
        │  └──────────────────┬──────────────────────┘    │
        │                     │                             │
        │  ┌──────────────────▼──────────────────────┐    │
        │  │ 6. RISK AUDIT                           │    │
        │  │    • Analyze holdings                   │    │
        │  │    • Check allocation % per stock       │    │
        │  │    • Flag positions > 25% limit         │    │
        │  │    • Print audit report                 │    │
        │  └──────────────────────────────────────────┘    │
        │                                                   │
        └─────────────────────────────────────────────────┘
                           │
                ┌──────────┴──────────┐
                │                     │
                ▼                     ▼
        ┌─────────────────┐  ┌──────────────────┐
        │ PORTFOLIO LOG   │  │ ALERT/DASHBOARD  │
        │ (CSV)           │  │ (Future)         │
        │                 │  │                  │
        │ Records all     │  │ • Email trades   │
        │ trades with     │  │ • Notify buys    │
        │ timestamps      │  │ • Show gains/loss│
        │ and values      │  │                  │
        └─────────────────┘  └──────────────────┘
```

---

## Data Flow Example: Buy Signal

```
Input: AAPL in watchlist
│
├─ Fetch price: AAPL = $195.45
│
├─ Call ML model: predict.py AAPL
│  │
│  ├─ Download last 60 days of AAPL data
│  ├─ Calculate features:
│  │  • RSI = 52.3
│  │  • MACD = +0.42
│  │  • BB position = 0.68
│  │  • Volatility = 0.018
│  │  • [10 more features...]
│  │
│  ├─ Load pre-trained model
│  ├─ Predict: buy_signal=TRUE, confidence=0.72
│  │
│  └─ Return JSON: {"ticker": "AAPL", "buy_signal": true, "confidence": 0.72}
│
├─ Parse decision:
│  • buy_signal == true? ✓ YES
│  • confidence (0.72) > threshold (0.65)? ✓ YES
│
├─ EXECUTE: Buy 1 share @ $195.45
│
└─ Log to portfolio_log.csv:
   2026-02-15,AAPL,195.45,1,195.45
```

---

## Machine Learning Pipeline Details

### Feature Calculation (14 indicators)

```
Input: Daily OHLCV Data
│
├─ MOMENTUM FEATURES
│  ├─ Return 5d  = (Close[t] - Close[t-5]) / Close[t-5]
│  ├─ Return 10d = (Close[t] - Close[t-10]) / Close[t-10]
│  └─ Return 20d = (Close[t] - Close[t-20]) / Close[t-20]
│
├─ VOLUME FEATURES
│  ├─ Volume change = (Volume[t] - Volume[t-1]) / Volume[t-1]
│  └─ Volume MA ratio = Volume[t] / MA_20(Volume)
│
├─ TREND FEATURES
│  ├─ RSI (14) = 100 - 100/(1 + RS)  where RS = avg_gain/avg_loss
│  ├─ MACD = EMA(12) - EMA(26)
│  ├─ MACD Signal = EMA(9, MACD)
│  └─ MACD Histogram = MACD - Signal
│
├─ VOLATILITY FEATURES
│  ├─ Bollinger Band Upper = SMA(20) + 2*STD(20)
│  ├─ Bollinger Band Lower = SMA(20) - 2*STD(20)
│  ├─ BB Position = (Price - Lower) / (Upper - Lower)
│  └─ Volatility 20d = STD(Returns_20d)
│
├─ MOVING AVERAGE FEATURES
│  ├─ SMA 5  = Mean(Close[t-5:t])
│  ├─ SMA 10 = Mean(Close[t-10:t])
│  ├─ SMA 20 = Mean(Close[t-20:t])
│  └─ Close vs SMA20 = (Price - SMA20) / SMA20
│
└─ VOLATILITY & GAP FEATURES
   ├─ HL Range = (High - Low) / Close
   └─ Overnight Gap = (Open - Close[t-1]) / Close[t-1]

Output: Feature vector [14 dimensions]
```

### Model Architecture

```
Feature Vector [14 dimensions]
          │
          ▼
    ┌─────────────────┐
    │ StandardScaler  │  (Feature normalization)
    └────────┬────────┘
             │
             ▼
    ┌─────────────────────────────────┐
    │  RANDOM FOREST CLASSIFIER       │
    │  (100 Decision Trees)           │
    │                                 │
    │  Tree 1:                        │
    │  if RSI > 50 and MACD > 0 then  │
    │    ...predict BUY               │
    │                                 │
    │  Tree 2:                        │
    │  if Volatility < 0.02 and       │
    │     Volume > MA then            │
    │    ...predict BUY               │
    │  ...                            │
    │  Tree 100:                      │
    │  if Close > SMA20 and           │
    │     BB Position > 0.7 then      │
    │    ...predict BUY               │
    │                                 │
    │  Final Decision: MAJORITY VOTE  │
    │  (how many trees vote BUY)      │
    │                                 │
    └────────┬────────────────────────┘
             │
             ▼
    ┌─────────────────────────────────┐
    │ Output Layer                    │
    │                                 │
    │ Prediction: 0 or 1              │
    │ (HOLD/SELL or BUY)              │
    │                                 │
    │ Probability: 0.0-1.0            │
    │ (confidence of prediction)       │
    │                                 │
    │ Confidence Score:               │
    │ max(probability, 1-probability) │
    │                                 │
    └─────────────────────────────────┘
```

### Model Training Pipeline

```
Historical Data (5 years, 10 stocks)
       │
       ├─ Clean & normalize
       ├─ Calculate features
       └─ Create labels (1 if price ↑ 2% in 5 days, else 0)
              │
              ▼
    Training Set (80%)    Test Set (20%)
       │                       │
       ├─ Standardize          │
       │                       │
       ├─ Fit 100 trees        │
       │  (Random subsamples)   │
       │                       │
       ├─ Tune hyperparameters │
       │  max_depth=15         │
       │  min_samples_leaf=5   │
       │                       │
       └─ Train complete ──────┼──→ Evaluate on test set
                               │
                               ├─ Accuracy:  58%
                               ├─ F1 Score:  52%
                               └─ ROC-AUC:   61%
                                    │
                                    └─→ Save model artifacts
                                       if performance acceptable
```

---

## Raspberry Pi Deployment Flow

```
Development Machine          Raspberry Pi
    (Your Laptop)             (24/7 Trader)
         │                           │
         ├─ Train Model              │
         │  (5-15 min)               │
         │                           │
         ├─ Save:                    │
         │ • stock_classifier.pkl    │
         │ • feature_scaler.pkl      │
         │ • metadata.json           │
         │                           │
         ├─ SCP files ───────────────┼──→ ml_model/models/
         │                           │
         ├─ Build bot ───────────────┼──→ Roth-IRA-ML (binary)
         │ (Makefile)                │
         │                           │
         └─────────────────────────┐ │
                                   │ │
                                   │ ▼
                              ┌──────────────┐
                              │   systemd    │
                              │   (cron or   │
                              │   daemon)    │
                              └──────┬───────┘
                                     │
                         ┌───────────┴───────────┐
                         │                       │
                    Market Open              After Hours
                    (Daily)                  (Monthly)
                         │                       │
                         ▼                       ▼
                  ┌──────────────┐        ┌──────────────┐
                  │ Run Bot      │        │ Retrain      │
                  │ Roth-IRA-ML  │        │ Model        │
                  └──────┬───────┘        │              │
                         │               │ • Collect    │
                         ├─ Fetch prices │   new data   │
                         ├─ ML predict   │ • Train      │
                         ├─ Log trades   │   Random     │
                         └─ Risk audit   │   Forest     │
                                         │ • Save new   │
                                         │   weights    │
                                         └──────────────┘
                                         
                     Daily: Run at 9:30 AM EST
                  Monthly: Run on first Sunday
```

---

## Configuration Hierarchy

```
Global Defaults
   │
   ├─ Hardcoded in code
   │  (Roth-IRA-ML.cpp)
   │  • API key: "OWJMTJTHU3LCRV1F"
   │  • Watchlist: VOO, AAPL, MSFT
   │  • Risk threshold: 25%
   │  • ML threshold: 0.65
   │
   ├─ Environment variables (Override)
   │  • ALPHAVANTAGE_API_KEY
   │  • ML_CONFIDENCE_THRESHOLD
   │  • WATCHLIST
   │
   └─ config.env (Systemd)
      • Source before running service
      • Separate from code
      • Secure on production
```

---

## Decision Tree Example

```
Is ML model ready?
  ├─ NO → Skip (model_not_ready)
  │
  └─ YES
      ├─ Get stock price
      │
      ├─ Call Python predict.py
      │  └─ Executes: python3 ml_model/predict.py AAPL
      │
      ├─ Parse JSON response
      │
      └─ Evaluate buying conditions
         ├─ Condition 1: buy_signal == true?
         │  ├─ NO → Don't buy (ML says HOLD/SELL)
         │  │
         │  └─ YES → Check next condition
         │
         └─ Condition 2: confidence > 0.65?
            ├─ NO → Don't buy (confidence too low)
            │
            └─ YES → BUY!
               ├─ Calculate position size
               ├─ Log to portfolio_log.csv
               └─ Continue to next ticker
```

---

## Status Codes from ML Model

```json
{
  "status": "success",                    // ✓ Prediction successful
  "status": "insufficient_data",          // ⚠ <30 days of history
  "status": "feature_calculation_failed", // ⚠ Indicators couldn't compute
  "status": "invalid_features",           // ⚠ NaN or Inf in features
  "status": "error: <message>",           // ✗ Exception occurred
  "status": "model_not_ready"             // ✗ Model files missing
}
```

---

This architecture ensures:

✓ **Modularity** — Python ML independent from C++ bot
✓ **Scalability** — Easy to add more stocks to watchlist
✓ **Reliability** — Error handling at each step
✓ **Performance** — Lightweight for Raspberry Pi
✓ **Maintainability** — Clear data flow and logging
