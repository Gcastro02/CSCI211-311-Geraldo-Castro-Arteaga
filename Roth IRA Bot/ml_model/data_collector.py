#!/usr/bin/env python3
"""
Data Collector for Stock ML Model
Downloads historical OHLCV data, calculates technical indicators, 
and prepares training/inference datasets using a manual watchlist.
"""

import yfinance as yf
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import os
import pickle
from typing import Tuple, List

# --- WATCHLIST LOGIC ---

def get_watchlist(file_path="../watchlist.txt") -> List[str]:
    """
    Reads tickers from the manual watchlist file.
    Checks both the parent directory (standard for your structure)
    and the current directory as a fallback.
    """
    # Check parent directory (if run from inside ml_model/)
    # then check current directory (if run from project root)
    target_path = file_path
    if not os.path.exists(target_path):
        target_path = "watchlist.txt"
        
    if not os.path.exists(target_path):
        print(f"Warning: {file_path} not found. Using default internal list.")
        return ['VOO', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'SPY', 'QQQ', 'IWM']
    
    with open(target_path, 'r') as f:
        # Clean the input: remove whitespace/newlines and force uppercase
        tickers = [line.strip().upper() for line in f if line.strip()]
    
    return tickers

# --- TECHNICAL INDICATORS ---

def calculate_rsi(prices: pd.Series, period: int = 14) -> pd.Series:
    """Relative Strength Index"""
    delta = prices.diff()
    gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
    rs = gain / loss
    rsi = 100 - (100 / (1 + rs))
    return rsi

def calculate_macd(prices: pd.Series) -> Tuple[pd.Series, pd.Series, pd.Series]:
    """MACD (Moving Average Convergence Divergence)"""
    exp1 = prices.ewm(span=12, adjust=False).mean()
    exp2 = prices.ewm(span=26, adjust=False).mean()
    macd = exp1 - exp2
    signal = macd.ewm(span=9, adjust=False).mean()
    histogram = macd - signal
    return macd, signal, histogram

def calculate_bollinger_bands(prices: pd.Series, period: int = 20) -> Tuple[pd.Series, pd.Series, pd.Series]:
    """Bollinger Bands"""
    sma = prices.rolling(window=period).mean()
    std = prices.rolling(window=period).std()
    upper_band = sma + (std * 2)
    lower_band = sma - (std * 2)
    return upper_band, sma, lower_band

def create_features(df: pd.DataFrame) -> pd.DataFrame:
    """Create technical and statistical features from OHLCV data."""
    df = df.copy()
    
    # Returns and momentum
    df['return_5d'] = df['Close'].pct_change(5)
    df['return_10d'] = df['Close'].pct_change(10)
    df['return_20d'] = df['Close'].pct_change(20)
    
    # Volume metrics
    df['volume_change'] = df['Volume'].pct_change()
    df['volume_ma_ratio'] = df['Volume'] / df['Volume'].rolling(20).mean()
    
    # RSI
    df['rsi_14'] = calculate_rsi(df['Close'], 14)
    
    # MACD
    df['macd'], df['macd_signal'], df['macd_hist'] = calculate_macd(df['Close'])
    
    # Bollinger Bands
    upper, middle, lower = calculate_bollinger_bands(df['Close'], 20)
    df['bb_upper'] = upper
    df['bb_middle'] = middle
    df['bb_lower'] = lower
    df['bb_position'] = (df['Close'] - lower) / (upper - lower)  # 0-1 normalized
    
    # Moving averages
    df['sma_5'] = df['Close'].rolling(5).mean()
    df['sma_10'] = df['Close'].rolling(10).mean()
    df['sma_20'] = df['Close'].rolling(20).mean()
    
    # Price momentum relative to MAs
    df['close_vs_sma20'] = (df['Close'] - df['sma_20']) / df['sma_20']
    
    # High-Low range
    df['hl_range'] = (df['High'] - df['Low']) / df['Close']
    
    # Volatility
    df['volatility_20'] = df['Close'].pct_change().rolling(20).std()
    
    # Overnight gap
    df['overnight_gap'] = (df['Open'] - df['Close'].shift(1)) / df['Close'].shift(1)
    
    return df

def download_historical_data(ticker: str, period: str = "5y", interval: str = "1d") -> pd.DataFrame:
    """Download historical OHLCV data and calculate features."""
    try:
        df = yf.download(ticker, period=period, interval=interval, progress=False)
        
        if df.empty:
            return None
        
        # Flatten multi-level columns if they exist
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.droplevel(1)
        
        df = create_features(df)
        return df
    
    except Exception:
        return None

def create_labels(df: pd.DataFrame, lookforward: int = 5, gain_threshold: float = 0.02) -> np.ndarray:
    """Create binary labels based on future price performance."""
    close_prices = df['Close']
    if isinstance(close_prices, pd.DataFrame):
        close_prices = close_prices.iloc[:, 0]
    
    future_returns = close_prices.shift(-lookforward) / close_prices - 1
    labels = (future_returns >= gain_threshold).astype(int).values
    return labels

def prepare_dataset(tickers: List[str], lookforward: int = 5) -> Tuple[np.ndarray, np.ndarray, List[str]]:
    """Prepare training dataset from multiple tickers."""
    X_list = []
    y_list = []
    
    feature_cols = [
        'return_5d', 'return_10d', 'return_20d',
        'volume_change', 'volume_ma_ratio',
        'rsi_14', 'macd', 'macd_signal', 'macd_hist',
        'bb_position', 'close_vs_sma20', 'hl_range',
        'volatility_20', 'overnight_gap'
    ]
    
    for ticker in tickers:
        print(f"Processing {ticker}...")
        df = download_historical_data(ticker, period="5y")
        
        if df is None or len(df) < 50:
            continue
        
        df_clean = df.dropna()
        
        if len(df_clean) < 50:
            print(f"  Insufficient clean data for {ticker}")
            continue
        
        X = df_clean[feature_cols].values
        y = create_labels(df_clean, lookforward=lookforward)
        
        # Trim labels to match features
        y = y[:len(X)]
        
        X_list.append(X)
        y_list.append(y)
    
    if not X_list:
        print("Error: No data collected for any tickers.")
        return np.array([]), np.array([]), feature_cols

    X_all = np.vstack(X_list)
    y_all = np.concatenate(y_list)
    
    valid_mask = np.isfinite(X_all).all(axis=1)
    X_all = X_all[valid_mask]
    y_all = y_all[valid_mask]
    
    print(f"\nFinal dataset: X shape {X_all.shape}, y shape {y_all.shape}")
    print(f"Class distribution: {np.sum(y_all)} buys, {len(y_all) - np.sum(y_all)} non-buys")
    
    return X_all, y_all, feature_cols

def save_dataset(X: np.ndarray, y: np.ndarray, feature_cols: List[str], filepath: str):
    """Save dataset and metadata."""
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    with open(filepath, 'wb') as f:
        pickle.dump({'X': X, 'y': y, 'feature_cols': feature_cols}, f)
    print(f"Saved dataset to {filepath}")

# --- EXECUTION ---

if __name__ == "__main__":
    # Load tickers from manual watchlist file
    tickers = get_watchlist()
    print(f"Starting analysis for {len(tickers)} tickers from watchlist.")
    
    X, y, feature_cols = prepare_dataset(tickers, lookforward=5)
    
    if X.size > 0:
        dataset_path = 'ml_model/data/training_dataset.pkl'
        save_dataset(X, y, feature_cols, dataset_path)
        print(f"\n✓ Dataset ready for training!")