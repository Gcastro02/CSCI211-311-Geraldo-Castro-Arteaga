#!/bin/bash
# Quick Start Guide for ML Finance Bot
# Automated setup and validation

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo "=========================================="
echo "Roth IRA ML Bot - Quick Start"
echo "=========================================="
echo ""

# Step 1: Check Python
echo "[1/5] Checking Python installation..."
PYTHON_CMD=$(command -v python3 || command -v python)
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
    echo "[3/5] Training ML model (this takes 10-15 minutes)..."
    cd ml_model
    $PYTHON_CMD data_collector.py
    $PYTHON_CMD train_model.py
    cd ..
    echo "✓ Model trained"
else
    echo "[3/5] ML model already trained"
    echo "✓ Using existing model"
fi
echo ""

# Step 4: Test ML predictions
echo "[4/5] Testing ML predictions..."
TEST_OUTPUT=$(cd ml_model && $PYTHON_CMD predict.py AAPL 2>/dev/null)
if echo "$TEST_OUTPUT" | grep -q "success"; then
    echo "✓ ML prediction successful"
    echo "  Sample output: $(echo $TEST_OUTPUT | head -c 100)..."
else
    echo "⚠ ML prediction test failed"
    echo "  Output: $TEST_OUTPUT"
fi
echo ""

# Step 5: Build C++ bot
echo "[5/5] Building C++ bot..."
if command -v g++ &> /dev/null; then
    g++ -std=c++17 -Wall -O2 Roth-IRA-ML.cpp -o Roth-IRA-ML -lcurl
    echo "✓ Build complete: ./Roth-IRA-ML"
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
echo "1. Run the bot:"
echo "   ./Roth-IRA-ML"
echo ""
echo "2. View trades:"
echo "   cat portfolio_log.csv"
echo ""
echo "3. Configure (optional):"
echo "   export ALPHAVANTAGE_API_KEY=your_key_here"
echo "   ./Roth-IRA-ML"
echo ""
echo "4. Retrain model with new data:"
echo "   cd ml_model && bash setup.sh"
echo ""
