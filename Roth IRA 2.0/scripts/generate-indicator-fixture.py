#!/usr/bin/env python3
"""
Regenerate indicator-fixture.json from the Stock Trader Bot's original Python
feature pipeline, so scripts/verify-indicators.ts has a reference to check the
TypeScript port against.

Needs pandas + numpy, and the sibling "Stock Trader Bot" project on disk:
    python scripts/generate-indicator-fixture.py
"""

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
PROJECT_ROOT = HERE.parent
BOT_ML_DIR = PROJECT_ROOT.parent / "Stock Trader Bot" / "ml_model"
FIXTURE_PATH = HERE / "indicator-fixture.json"

if not BOT_ML_DIR.exists():
    sys.exit(f"Could not find the bot's ml_model directory at {BOT_ML_DIR}")

sys.path.insert(0, str(BOT_ML_DIR))
from data_collector import create_features  # noqa: E402

# Deterministic synthetic OHLCV: a random walk with drift, seeded so the fixture
# is reproducible. Real market data would make the fixture depend on the network
# and on whatever the market did that day.
N_BARS = 220
rng = np.random.default_rng(42)

close = 100 * np.exp(np.cumsum(rng.normal(0.0004, 0.015, N_BARS)))
open_ = close * (1 + rng.normal(0, 0.004, N_BARS))
high = np.maximum(open_, close) * (1 + np.abs(rng.normal(0, 0.005, N_BARS)))
low = np.minimum(open_, close) * (1 - np.abs(rng.normal(0, 0.005, N_BARS)))
volume = rng.integers(1_000_000, 9_000_000, N_BARS).astype(float)

frame = pd.DataFrame({"Open": open_, "High": high, "Low": low, "Close": close, "Volume": volume})
features = create_features(frame)
final_bar = features.iloc[-1]

bars = [
    {
        "date": f"2025-01-{i:03d}",
        "price": close[i],
        "open": open_[i],
        "high": high[i],
        "low": low[i],
        "close": close[i],
        "volume": volume[i],
    }
    for i in range(N_BARS)
]

FEATURE_NAMES = [
    "return_5d", "return_10d", "return_20d",
    "volume_change", "volume_ma_ratio",
    "rsi_14", "macd", "macd_signal", "macd_hist",
    "bb_position", "close_vs_sma20", "hl_range",
    "volatility_20", "overnight_gap",
    "sma_5", "sma_20", "bb_upper", "bb_lower",
]

expected = {
    name: (None if pd.isna(final_bar[name]) else float(final_bar[name]))
    for name in FEATURE_NAMES
}

FIXTURE_PATH.write_text(json.dumps({"bars": bars, "expected": expected}))
print(f"Wrote {FIXTURE_PATH} ({N_BARS} bars, {len(FEATURE_NAMES)} reference values)")
