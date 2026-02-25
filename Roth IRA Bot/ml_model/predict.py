#!/usr/bin/env python3
"""
Stock ML Model Inference Wrapper
Called by C++ bot to predict buy signals for stocks.
Accepts ticker and current price data via CLI/JSON, returns confidence score.
"""

import sys
import json
import numpy as np
import joblib
import os
from pathlib import Path
from data_collector import create_features, download_historical_data
import pandas as pd

# Paths
SCRIPT_DIR = Path(__file__).parent
MODEL_PATH = SCRIPT_DIR / 'models' / 'stock_classifier.pkl'
SCALER_PATH = SCRIPT_DIR / 'models' / 'feature_scaler.pkl'
METADATA_PATH = SCRIPT_DIR / 'models' / 'stock_classifier_metadata.json'

class StockPredictor:
    """Lightweight inference engine for real-time stock predictions."""
    
    def __init__(self):
        """Load pre-trained model and scaler."""
        if not MODEL_PATH.exists() or not SCALER_PATH.exists():
            raise FileNotFoundError(
                f"Model files not found. Train model first.\n"
                f"Expected: {MODEL_PATH}, {SCALER_PATH}"
            )
        
        self.model = joblib.load(MODEL_PATH)
        self.scaler = joblib.load(SCALER_PATH)
        
        # Load metadata
        if METADATA_PATH.exists():
            import json
            with open(METADATA_PATH) as f:
                self.metadata = json.load(f)
        else:
            self.metadata = {}
        
        self.feature_cols = self.metadata.get('feature_cols', [])
    
    def predict_for_ticker(self, ticker: str, days_back: int = 60) -> dict:
        """
        Predict buy signal for a ticker using latest historical data.
        
        Args:
            ticker: Stock ticker (e.g., "AAPL")
            days_back: Days of history to fetch for feature calculation
        
        Returns:
            {
                'ticker': str,
                'buy_signal': bool,  # True if should buy
                'confidence': float, # 0.0-1.0 confidence score
                'probability': float, # Raw model probability
                'status': 'success' or error message
            }
        """
        try:
            # Download recent data
            df = download_historical_data(ticker, period="3mo", interval="1d")
            
            if df is None or len(df) < 30:
                return {
                    'ticker': ticker,
                    'buy_signal': False,
                    'confidence': 0.0,
                    'probability': 0.0,
                    'status': 'insufficient_data',
                    'latest_price': None,
                    'volatility': None
                }
            
            # Get latest row with all features
            df_clean = df.dropna()
            
            if len(df_clean) == 0:
                return {
                    'ticker': ticker,
                    'buy_signal': False,
                    'confidence': 0.0,
                    'probability': 0.0,
                    'status': 'feature_calculation_failed'
                }
            
            # Extract features for the latest row
            latest_row = df_clean.iloc[-1]
            X_latest = np.array([[latest_row[col] for col in self.feature_cols]])
            
            # Check for NaN or Inf
            if not np.isfinite(X_latest).all():
                return {
                    'ticker': ticker,
                    'buy_signal': False,
                    'confidence': 0.0,
                    'probability': 0.0,
                    'status': 'invalid_features'
                }
            
            # Scale and predict
            X_scaled = self.scaler.transform(X_latest)
            prediction = self.model.predict(X_scaled)[0]
            probability = self.model.predict_proba(X_scaled)[0, 1]
            
            # Confidence score (how confident is the prediction)
            confidence = max(probability, 1 - probability)
            
            return {
                'ticker': ticker,
                'buy_signal': bool(prediction == 1),
                'confidence': float(confidence),
                'probability': float(probability),
                'status': 'success',
                'latest_price': float(latest_row['Close']),
                'volatility': float(latest_row.get('volatility_20', 0))
            }
        
        except Exception as e:
            return {
                'ticker': ticker,
                'buy_signal': False,
                'confidence': 0.0,
                'probability': 0.0,
                'status': f'error: {str(e)}'
            }
    
    def predict_batch(self, tickers: list) -> list:
        """Predict for multiple tickers."""
        results = []
        for ticker in tickers:
            result = self.predict_for_ticker(ticker)
            results.append(result)
        return results

def main():
    """CLI interface for C++ integration."""
    
    if len(sys.argv) < 2:
        print(json.dumps({
            'status': 'error',
            'message': 'Usage: predict.py <ticker> [--batch <ticker1,ticker2,...>]'
        }))
        sys.exit(1)
    
    try:
        predictor = StockPredictor()
        
        # Single ticker prediction
        if sys.argv[1] != '--batch':
            ticker = sys.argv[1].upper()
            result = predictor.predict_for_ticker(ticker)
            print(json.dumps(result))
        
        # Batch prediction
        else:
            if len(sys.argv) < 3:
                print(json.dumps({'status': 'error', 'message': 'No tickers provided'}))
                sys.exit(1)
            
            tickers = sys.argv[2].split(',')
            results = predictor.predict_batch(tickers)
            print(json.dumps(results))
    
    except FileNotFoundError as e:
        print(json.dumps({
            'status': 'error',
            'message': str(e)
        }))
        sys.exit(1)
    except Exception as e:
        print(json.dumps({
            'status': 'error',
            'message': f'Prediction failed: {str(e)}'
        }))
        sys.exit(1)

if __name__ == '__main__':
    main()
