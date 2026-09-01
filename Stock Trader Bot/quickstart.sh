#!/bin/bash
# Stock Trader Bot - automated setup and validation

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo "=========================================="
echo "Stock Trader Bot - Quick Start"
echo "=========================================="
echo ""

# Step 1: Check Python
echo "[1/5] Checking Python installation..."
PYTHON_CMD=${PYTHON_BIN:-$(command -v python3 || command -v python)}
if [ -z "$PYTHON_CMD" ]; then
    echo "ERROR: Python 3 not found. Install Python 3.7+."
    exit 1
fi

PYTHON_VERSION=$($PYTHON_CMD --version 2>&1)
echo "✓ $PYTHON_VERSION"
echo ""

# Step 2: Install ML dependencies
echo "[2/5] Installing Python dependencies..."
if ! $PYTHON_CMD -m pip install -q -r ml_model/requirements.txt 2>/dev/null; then
    echo "WARNING: Some dependencies may not be installed."
    echo "Try: pip3 install -r ml_model/requirements.txt"
fi
echo "✓ Dependencies ready"
echo ""

# Step 3: Train model (if not already done)
if [ ! -f "ml_model/models/stock_classifier.pkl" ]; then
    echo "[3/5] Training model (this takes 10-15 minutes)..."
    cd ml_model
    $PYTHON_CMD data_collector.py
    $PYTHON_CMD train_model.py
    cd ..
    echo "✓ Model trained"
else
    echo "[3/5] Model already trained"
    echo "✓ Using existing model"
fi
echo ""

# Step 4: Test predictions
echo "[4/5] Testing model predictions..."
TEST_OUTPUT=$(cd ml_model && $PYTHON_CMD predict.py AAPL 2>/dev/null)
if echo "$TEST_OUTPUT" | grep -q "success"; then
    echo "✓ Prediction successful"
    echo "  Sample output: $(echo $TEST_OUTPUT | head -c 100)..."
else
    echo "⚠ Prediction test failed"
    echo "  Output: $TEST_OUTPUT"
fi
echo ""

# Step 5: Build
echo "[5/5] Building the trader..."
if command -v g++ &> /dev/null; then
    g++ -std=c++17 -Wall -O2 -Iinclude trader.cpp -o trader
    echo "✓ Build complete: ./trader"
else
    echo "WARNING: g++ not found. Install build-essential or clang."
fi
echo ""

echo "=========================================="
echo "✓ SETUP COMPLETE"
echo "=========================================="
echo ""
echo "Next steps:"
echo ""
echo "1. See what it would do, without writing anything:"
echo "   ./trader --dry-run"
echo ""
echo "2. Run it for real:"
echo "   ./trader"
echo ""
echo "3. Review activity:"
echo "   cat portfolio_log.csv"
echo "   cat portfolio_state.json"
echo ""
echo "4. Adjust thresholds:"
echo "   cp config.env.example config.env && \$EDITOR config.env"
echo "   source config.env && ./trader --dry-run"
echo ""
echo "5. Retrain on fresh data:"
echo "   make setup-ml"
echo ""
