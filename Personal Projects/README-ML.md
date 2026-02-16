# Roth IRA Finance Bot - ML Stock Selection

A machine learning-enhanced Raspberry Pi finance bot that automatically identifies promising stocks and manages a diversified portfolio based on technical analysis.

## Architecture

```
┌─────────────────────────────────────────────────┐
│           C++ Portfolio Bot                      │
│         (Roth-IRA-ML.cpp)                        │
└────────────────┬────────────────────────────────┘
                 │
          ┌──────▼──────┐
          │ ML Predictor│
          └──────┬──────┘
                 │ calls
                 ▼
┌─────────────────────────────────────────────────┐
│    Python ML Inference Engine                    │
│      (ml_model/predict.py)                       │
│                                                  │
│  • Loads pre-trained Random Forest model        │
│  • Calculates technical indicators              │
│  • Returns buy/hold/sell predictions            │
└────────────────┬────────────────────────────────┘
                 │
    ┌────────────┼────────────┐
    ▼            ▼            ▼
  Yahoo       Model          Feature
  Finance     Store          Cache
  (OHLCV)   (joblib)     (standards)
```

## Quick Start

### 1. Install Dependencies

**Local Machine (Linux/Mac):**
```bash
cd ml_model
pip3 install -r requirements.txt
```

**Raspberry Pi:**
```bash
# Use pre-compiled wheels for ARM to save time
pip3 install --only-binary :all: numpy pandas scikit-learn joblib yfinance
```

### 2. Train the ML Model (one-time setup)

```bash
cd ml_model
bash setup.sh
```

This will:
- Download 5 years of historical stock data for VOO, AAPL, MSFT, GOOGL, AMZN, META, NVDA, SPY, QQQ, IWM
- Calculate 14 technical indicators for each stock
- Train a Random Forest classifier to predict price movements
- Save trained model to `models/stock_classifier.pkl`

**Expected runtime:** 10-15 minutes (first time)

### 3. Build the Bot

```bash
# Build ML-integrated version
make -f Makefile-ML Roth-IRA-ML

# Or build with standard Makefile
make all
```

### 4. Run the Bot

```bash
# With ML predictions (recommended)
./Roth-IRA-ML

# Without ML (original logic)
./Roth-IRA
```

## Configuration

### API Keys
Set your Alpha Vantage API key as an environment variable (secure on Raspberry Pi):
```bash
export ALPHAVANTAGE_API_KEY="your_key_here"
./Roth-IRA-ML
```

Or edit the fallback in `Roth-IRA-ML.cpp` for testing.

### Tunable Parameters

In `Roth-IRA-ML.cpp` main():

```cpp
// ML confidence threshold (0.0-1.0)
// Only buy when model confidence > this value
PortfolioManager myIRA("portfolio_log.csv", 0.25, apiKey, 0.65);
                                                           ^^^^
                                                      ML threshold
```

- **0.5**: Most aggressive (high false positives)
- **0.65**: Balanced (default)
- **0.75**: Conservative (fewer trades, higher quality)

## Features

### ML Model Details

**Model Type:** Random Forest Classifier (100 trees, max_depth=15)

**Input Features:**
- Price momentum (5d, 10d, 20d returns)
- Volume trends and ratios
- RSI (Relative Strength Index)
- MACD (Moving Average Convergence Divergence)
- Bollinger Bands positioning
- Simple Moving Averages (5, 10, 20 day)
- Volatility (20-day standard deviation)
- Overnight gaps

**Output:** Buy/Hold/Sell signal with confidence score (0.0-1.0)

**Training Data:** 5 years of daily OHLCV data from 10 major stocks/ETFs

### Risk Management

- **Position Concentration:** Limits any single stock to 25% of portfolio
- **ML-Gated Buying:** Only executes trades when ML model confidence > threshold
- **Risk Audit:** Analyzes diversification after trading day
- **API Rate Limiting:** Respects Alpha Vantage free tier (5 req/min)

## File Structure

```
Personal Projects/
├── Roth-IRA.cpp              # Original bot (no ML)
├── Roth-IRA-ML.cpp           # ML-integrated bot
├── Makefile-ML               # Build configuration
├── portfolio_log.csv         # Trade history (auto-generated)
│
└── ml_model/
    ├── setup.sh              # One-time setup script
    ├── requirements.txt      # Python dependencies
    ├── data_collector.py     # Downloads OHLCV data & calculates features
    ├── train_model.py        # Trains Random Forest model
    ├── predict.py            # Inference wrapper (called by C++ bot)
    │
    ├── data/
    │   └── training_dataset.pkl  # Prepared training data
    │
    └── models/
        ├── stock_classifier.pkl          # Trained model
        ├── feature_scaler.pkl            # Feature normalization
        └── stock_classifier_metadata.json # Model performance metrics
```

## Testing

### Test ML Predictions Directly

```bash
cd ml_model

# Single stock prediction
python3 predict.py AAPL

# Expected output:
# {
#   "ticker": "AAPL",
#   "buy_signal": true,
#   "confidence": 0.72,
#   "probability": 0.72,
#   "status": "success",
#   "latest_price": 195.45,
#   "volatility": 0.018
# }

# Batch prediction
python3 predict.py --batch VOO,MSFT,NVDA
```

### Test Full Integration

```bash
# Build with ML
make -f Makefile-ML Roth-IRA-ML

# Run bot (processes watchlist with ML)
./Roth-IRA-ML

# View trades in portfolio
cat portfolio_log.csv
```

## Performance & Metrics

After training, check `ml_model/models/stock_classifier_metadata.json`:

```json
{
  "model_type": "RandomForestClassifier",
  "n_estimators": 100,
  "max_depth": 15,
  "test_accuracy": 0.58,
  "test_f1": 0.52,
  "test_roc_auc": 0.61,
  "feature_cols": [...]
}
```

**Interpretation:**
- **Accuracy 58%:** Better than random (50%), validates model learns patterns
- **F1 0.52:** Balanced precision/recall
- **ROC-AUC 0.61:** Reasonable discrimination between buy/hold

These metrics indicate the model identifies legitimate market patterns from technical indicators.

## Raspberry Pi Optimization

### Memory Footprint
- Model size: ~2 MB (joblib compressed)
- Feature scaler: ~50 KB
- Typical heap usage: 50-100 MB

Fits comfortably on Raspberry Pi 4B (4GB).

### Deployment Checklist

1. **Install Python packages:**
   ```bash
   pip3 install --only-binary :all: -r ml_model/requirements.txt
   ```

2. **Copy trained model:**
   ```bash
   scp -r ml_model user@raspberrypi:~/roth-bot/
   ```

3. **Compile bot:**
   ```bash
   make -f Makefile-ML Roth-IRA-ML
   ```

4. **Set up systemd service** (optional, for auto-start):
   ```ini
   [Unit]
   Description=Roth IRA ML Bot
   After=network.target
   
   [Service]
   Type=simple
   User=pi
   ExecStart=/home/pi/roth-bot/Roth-IRA-ML
   Restart=always
   
   [Install]
   WantedBy=multi-user.target
   ```

   ```bash
   sudo cp roth-bot.service /etc/systemd/system/
   sudo systemctl enable roth-bot.service
   sudo systemctl start roth-bot.service
   ```

### Performance Optimization (Future)

- Quantize model (20-30% size reduction)
- Use TensorFlow Lite instead of scikit-learn
- Implement model caching to avoid reloads
- Pre-calculate features for next trading day

## Troubleshooting

### Model Not Found Error
```
ERROR: ML model not found!
Run: cd ml_model && bash setup.sh
```
**Solution:** Train the model first.

### API Rate Limit Exceeded
```
Error fetching AAPL (Check API limit)
```
**Solution:** Alpha Vantage free tier = 5 requests/min. Bot waits 15s between tickers. Upgrade API key for higher limits.

### Python Subprocess Fails
```
status: "execution_failed"
```
**Solution:** Ensure `ml_model/predict.py` is executable and Python 3.7+ is installed.

## Future Enhancements

- [ ] **Sell Signal:** Implement profit-taking and stop-loss logic
- [ ] **Multi-timeframe:** Add weekly/monthly signals alongside daily
- [ ] **Economic Data:** Integrate unemployment/inflation rates from final-project DataList
- [ ] **Portfolio Rebalancing:** Automatic weight adjustment
- [ ] **Backtesting:** Historical performance simulation
- [ ] **Live Model Updates:** Continuous learning from new trades
- [ ] **Web Dashboard:** Real-time portfolio visualization

## References

- **Alpha Vantage API:** https://www.alphavantage.co
- **scikit-learn Random Forest:** https://scikit-learn.org/stable/modules/ensemble.html#forests
- **CURLCPP Integration:** https://curl.se/libcurl/c
- **Raspberry Pi Setup:** https://www.raspberrypi.org/documentation

## License

Same as parent project.

---

**Questions?** Check the logs in `portfolio_log.csv` or add debug output to C++ bot.
