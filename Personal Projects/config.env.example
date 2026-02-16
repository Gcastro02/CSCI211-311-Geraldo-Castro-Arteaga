# Roth IRA Bot - Configuration for Raspberry Pi
# Source this file before running the bot: source config.env

# ========== Alpha Vantage API ==========
# Get free key at: https://www.alphavantage.co/
# Free tier: 5 requests per minute
export ALPHAVANTAGE_API_KEY="OWJMTJTHU3LCRV1F"

# ========== Bot Parameters ==========
# ML Confidence threshold (0.0-1.0)
# Only buy when model confidence exceeds this
# Recommended: 0.65 (balanced), 0.75 (conservative)
export ML_CONFIDENCE_THRESHOLD="0.65"

# Portfolio risk threshold (0.0-1.0)
# Max allocation to any single stock
# Recommended: 0.25 (25% max per stock)
export RISK_THRESHOLD="0.25"

# ========== Stock Watchlist ==========
# Comma-separated list of tickers to monitor
# These are processed in order, with 15s delay between each
export WATCHLIST="VOO,AAPL,MSFT"

# ========== Raspberry Pi Settings ==========
# Path to ML model (relative or absolute)
export ML_MODEL_PATH="ml_model/models/stock_classifier.pkl"

# Path to trade log
export TRADE_LOG="portfolio_log.csv"

# Enable detailed logging (0=off, 1=on)
export DEBUG_LOG=0

# ========== Systemd Service ==========
# Use with: systemctl start roth-bot.service
# Created by: sudo cp roth-bot.service /etc/systemd/system/
# Enable autostart: sudo systemctl enable roth-bot.service
