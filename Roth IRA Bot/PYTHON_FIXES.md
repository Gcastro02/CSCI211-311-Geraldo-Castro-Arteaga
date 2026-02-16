# Python Files - Issues Fixed

## Summary

All Python files have been tested and fixed. The ML pipeline now runs end-to-end without errors.

---

## Issues Found & Fixed

### 1. **Missing Python Dependencies** 
**Status:** ✅ FIXED

**Problem:**
- Required packages (pandas, scikit-learn, joblib, yfinance) were not installed
- Caused ImportError when running any Python scripts

**Solution:**
- Installed all packages via pip: `pip install pandas scikit-learn joblib yfinance requests`
- Packages now available in virtual environment

**Verification:**
```bash
/home/gcastro/CSCI211/.venv/bin/python -c "import pandas, sklearn, joblib, yfinance; print('All imports OK')"
```

---

### 2. **Multi-level Column Names in DataFrame** 
**Status:** ✅ FIXED  
**File:** `ml_model/data_collector.py`

**Problem:**
```
ERROR: Cannot set a DataFrame with multiple columns to the single column close_vs_sma20
```

**Root Cause:**
- When `yfinance.download()` downloads a single ticker, it returns a DataFrame with multi-level columns (ticker names)
- Example: `df['Close']` returns a DataFrame with ticker as level, not a Series
- This caused operations like `df['close_vs_sma20'] = (df['Close'] - df['sma_20']) / df['sma_20']` to fail

**Solution in `download_historical_data()` function (lines 112-141):**
```python
# Flatten multi-level columns if they exist (when downloading single ticker)
if isinstance(df.columns, pd.MultiIndex):
    df.columns = df.columns.droplevel(1)
```

**Verification:**
```bash
cd ml_model && python3 data_collector.py
# Now downloads and processes successfully
```

---

### 3. **DataFrame Column Type Issue in `create_labels()`**
**Status:** ✅ FIXED  
**File:** `ml_model/data_collector.py`

**Problem:**
- Similar multi-level column issue in label creation function
- `df['Close'].shift(-lookforward) / df['Close']` would fail if `df['Close']` was a DataFrame

**Solution (lines 149-157):**
```python
def create_labels(df: pd.DataFrame, lookforward: int = 5, gain_threshold: float = 0.02) -> np.ndarray:
    close_prices = df['Close']
    if isinstance(close_prices, pd.DataFrame):
        close_prices = close_prices.iloc[:, 0]  # Get first column if still a DataFrame
    
    future_returns = close_prices.shift(-lookforward) / close_prices - 1
    labels = (future_returns >= gain_threshold).astype(int).values
    return labels
```

---

### 4. **Hardcoded Paths with `ml_model/` Prefix**
**Status:** ✅ FIXED  
**File:** `ml_model/train_model.py`

**Problem:**
```
FileNotFoundError: [Errno 2] No such file or directory: 'ml_model/data/training_dataset.pkl'
```

**Root Cause:**
- Default function arguments had `ml_model/` prefix
- When running from within the `ml_model/` directory, the path becomes `ml_model/ml_model/data/training_dataset.pkl`
- Causes training script to fail

**Solution (lines 18-20):**
```python
# Changed from:
def train_model(dataset_path: str = 'ml_model/data/training_dataset.pkl',
                model_output_path: str = 'ml_model/models/stock_classifier.pkl',
                scaler_output_path: str = 'ml_model/models/feature_scaler.pkl'):

# To:
def train_model(dataset_path: str = 'data/training_dataset.pkl',
                model_output_path: str = 'models/stock_classifier.pkl',
                scaler_output_path: str = 'models/feature_scaler.pkl'):
```

---

## Test Results

### ✅ Data Collection
```
Processing VOO...
  Downloaded 1256 rows
  Features calculated: 25 columns
✓ Success
```

### ✅ Dataset Preparation
```
Final dataset: X shape (6180, 14), y shape (6180,)
Class distribution: 1832 buys (29.6%), 4348 non-buys (70.4%)
✓ Success
```

### ✅ Model Training
```
TEST SET METRICS:
  Accuracy:  0.6950
  Precision: 0.4808
  Recall:    0.3770
  F1 Score:  0.4227
  ROC-AUC:   0.6573

✓ Model trained and saved successfully
✓ Scaler saved successfully
✓ Metadata saved successfully
```

### ✅ Single Prediction
```
python3 predict.py AAPL
{"ticker": "AAPL", "buy_signal": true, "confidence": 0.504, 
 "probability": 0.504, "status": "success", 
 "latest_price": 255.78, "volatility": 0.021}

✓ Success
```

### ✅ Batch Predictions
```
python3 predict.py --batch VOO,AAPL,MSFT
[{"ticker": "VOO", "buy_signal": false, "confidence": 0.763, ...},
 {"ticker": "AAPL", "buy_signal": true, "confidence": 0.504, ...},
 {"ticker": "MSFT", "buy_signal": false, "confidence": 0.623, ...}]

✓ Success
```

### ✅ C++ Compilation
```
g++ -std=c++17 -Wall -O2 Roth-IRA-ML.cpp -o Roth-IRA-ML-test -lcurl
# No errors, binary created successfully

✓ Success
```

---

## Files Modified

| File | Changes | Lines |
|------|---------|-------|
| `ml_model/data_collector.py` | Added multi-level column flattening + Series type check | 3 additions, 2 modifications |
| `ml_model/train_model.py` | Fixed default path prefixes | 1 modification |

---

## Files Verified (No Changes Needed)

| File | Status |
|------|--------|
| `ml_model/predict.py` | ✅ Works correctly |
| `ml_model/requirements.txt` | ✅ All packages installed |
| `ml_model/setup.sh` | ✅ Ready to use |
| `Roth-IRA-ML.cpp` | ✅ Compiles successfully |
| `Makefile-ML` | ✅ Build targets work |
| `quickstart.sh` | ✅ Executable |

---

## How to Verify All Fixes

```bash
cd ~/CSCI211/CSCI211-311-Geraldo-Castro-Arteaga/Personal\ Projects

# Test 1: Data collection
cd ml_model
/home/gcastro/CSCI211/.venv/bin/python << 'EOF'
from data_collector import download_historical_data
df = download_historical_data("AAPL", period="1y")
print(f"✓ Downloaded {len(df)} rows with {len(df.columns)} features")
EOF

# Test 2: Prepare dataset
/home/gcastro/CSCI211/.venv/bin/python << 'EOF'
from data_collector import prepare_dataset
X, y, cols = prepare_dataset(['VOO', 'AAPL'], lookforward=5)
print(f"✓ Dataset: X={X.shape}, y={y.shape}")
EOF

# Test 3: Train model
timeout 300 /home/gcastro/CSCI211/.venv/bin/python train_model.py

# Test 4: Make predictions
/home/gcastro/CSCI211/.venv/bin/python predict.py AAPL
/home/gcastro/CSCI211/.venv/bin/python predict.py --batch VOO,AAPL,MSFT

# Test 5: Compile C++ bot
cd ..
g++ -std=c++17 -Wall -O2 Roth-IRA-ML.cpp -o Roth-IRA-ML -lcurl
ls -lah Roth-IRA-ML
```

---

## Next Steps

All Python files are now fully functional. You can:

1. **Run quickstart.sh** to automate setup
2. **Run the bot** manually: `./Roth-IRA-ML`
3. **Deploy to Raspberry Pi** using RASPBERRY_PI_GUIDE.md
4. **Monitor trades** in portfolio_log.csv

---

## Environment Configuration

The workspace has been configured with:
- **Python Environment:** Virtual Environment (venv)
- **Python Version:** 3.10.12
- **Location:** `/home/gcastro/CSCI211/.venv/`
- **All packages installed** in the virtual environment

To use the configured environment:
```bash
/home/gcastro/CSCI211/.venv/bin/python <script.py>
```

Or activate it:
```bash
source /home/gcastro/CSCI211/.venv/bin/activate
python script.py
```

---

**Status:** ✅ All issues resolved. System ready for use.
