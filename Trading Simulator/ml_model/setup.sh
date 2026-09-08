#!/bin/bash
# Setup script for ML model training pipeline

set -e

echo "================================"
echo "Stock ML Model - Setup Script"
echo "================================"

# Check Python version
PYTHON_CMD=$(command -v python3 || command -v python)
if [ -z "$PYTHON_CMD" ]; then
    echo "ERROR: Python not found. Please install Python 3.7+"
    exit 1
fi

echo "Using Python: $PYTHON_CMD"
$PYTHON_CMD --version

# Install dependencies
echo ""
echo "Installing dependencies..."
$PYTHON_CMD -m pip install --upgrade pip
$PYTHON_CMD -m pip install -r requirements.txt

echo ""
echo "================================"
echo "Collecting training data..."
echo "================================"
echo "This may take several minutes..."
$PYTHON_CMD data_collector.py

echo ""
echo "================================"
echo "Training ML model..."
echo "================================"
$PYTHON_CMD train_model.py

echo ""
echo "================================"
echo "✓ SETUP COMPLETE"
echo "================================"
echo ""
echo "Model files saved to: models/"
echo "  - stock_classifier.pkl (trained model)"
echo "  - feature_scaler.pkl (feature normalization)"
echo "  - stock_classifier_metadata.json (model metadata)"
echo ""
echo "To test the model:"
echo "  python3 predict.py AAPL"
echo "  python3 predict.py --batch VOO,MSFT,NVDA"
echo ""
echo "To integrate with C++ bot, call:"
echo "  python3 ml_model/predict.py <TICKER>"
echo ""
