#!/usr/bin/env python3
"""
ML Model Training
Trains a lightweight Random Forest classifier for stock buy/sell decisions.
Optimized for Raspberry Pi deployment (low memory footprint).
"""

import numpy as np
import pickle
import os
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, roc_auc_score
import joblib
from data_collector import load_dataset

def train_model(dataset_path: str = 'data/training_dataset.pkl',
                model_output_path: str = 'models/stock_classifier.pkl',
                scaler_output_path: str = 'models/feature_scaler.pkl'):
    """
    Train a Random Forest classifier for stock buy/sell decisions.
    
    Hyperparameters optimized for:
    - Raspberry Pi constraints (RAM, CPU)
    - Real-time inference latency
    - Reasonable accuracy
    """
    
    print("=" * 60)
    print("LOADING DATA")
    print("=" * 60)
    
    X, y, feature_cols = load_dataset(dataset_path)
    
    print(f"Dataset shape: {X.shape}")
    print(f"Features: {feature_cols}")
    print(f"Class balance: {np.sum(y)} positive, {len(y) - np.sum(y)} negative")
    
    # Train/test split
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    
    print(f"\nTrain set: {X_train.shape}, Test set: {X_test.shape}")
    
    # Standardize features
    print("\n" + "=" * 60)
    print("PREPROCESSING")
    print("=" * 60)
    
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)
    
    # Train Random Forest (Raspberry Pi optimized)
    print("\n" + "=" * 60)
    print("TRAINING MODEL")
    print("=" * 60)
    
    model = RandomForestClassifier(
        n_estimators=100,           # 100 trees - balance accuracy vs inference time
        max_depth=15,               # Moderate depth to control memory
        min_samples_split=10,       # Minimum samples at node
        min_samples_leaf=5,         # Prevents overfitting
        max_features='sqrt',        # Use sqrt(n_features) for each split
        random_state=42,
        n_jobs=-1,                  # Use all CPU cores
        class_weight='balanced'     # Handle class imbalance
    )
    
    model.fit(X_train_scaled, y_train)
    
    print("✓ Model trained")
    
    # Evaluate
    print("\n" + "=" * 60)
    print("EVALUATION")
    print("=" * 60)
    
    y_train_pred = model.predict(X_train_scaled)
    y_test_pred = model.predict(X_test_scaled)
    
    y_train_proba = model.predict_proba(X_train_scaled)[:, 1]
    y_test_proba = model.predict_proba(X_test_scaled)[:, 1]
    
    print("\nTRAIN SET METRICS:")
    print(f"  Accuracy:  {accuracy_score(y_train, y_train_pred):.4f}")
    print(f"  Precision: {precision_score(y_train, y_train_pred, zero_division=0):.4f}")
    print(f"  Recall:    {recall_score(y_train, y_train_pred, zero_division=0):.4f}")
    print(f"  F1 Score:  {f1_score(y_train, y_train_pred, zero_division=0):.4f}")
    print(f"  ROC-AUC:   {roc_auc_score(y_train, y_train_proba):.4f}")
    
    print("\nTEST SET METRICS:")
    print(f"  Accuracy:  {accuracy_score(y_test, y_test_pred):.4f}")
    print(f"  Precision: {precision_score(y_test, y_test_pred, zero_division=0):.4f}")
    print(f"  Recall:    {recall_score(y_test, y_test_pred, zero_division=0):.4f}")
    print(f"  F1 Score:  {f1_score(y_test, y_test_pred, zero_division=0):.4f}")
    print(f"  ROC-AUC:   {roc_auc_score(y_test, y_test_proba):.4f}")
    
    # Feature importance
    print("\n" + "=" * 60)
    print("TOP 10 IMPORTANT FEATURES")
    print("=" * 60)
    
    feature_importance = model.feature_importances_
    sorted_idx = np.argsort(feature_importance)[::-1]
    
    for i in range(min(10, len(feature_cols))):
        idx = sorted_idx[i]
        print(f"  {i+1}. {feature_cols[idx]}: {feature_importance[idx]:.4f}")
    
    # Save model and scaler
    print("\n" + "=" * 60)
    print("SAVING ARTIFACTS")
    print("=" * 60)
    
    os.makedirs(os.path.dirname(model_output_path), exist_ok=True)
    
    joblib.dump(model, model_output_path)
    print(f"✓ Model saved to {model_output_path}")
    
    joblib.dump(scaler, scaler_output_path)
    print(f"✓ Scaler saved to {scaler_output_path}")
    
    # Save metadata
    metadata = {
        'feature_cols': feature_cols,
        'model_type': 'RandomForestClassifier',
        'n_estimators': model.n_estimators,
        'max_depth': model.max_depth,
        'test_accuracy': accuracy_score(y_test, y_test_pred),
        'test_f1': f1_score(y_test, y_test_pred, zero_division=0),
        'test_roc_auc': roc_auc_score(y_test, y_test_proba)
    }
    
    metadata_path = model_output_path.replace('.pkl', '_metadata.json')
    import json
    with open(metadata_path, 'w') as f:
        json.dump(metadata, f, indent=2)
    print(f"✓ Metadata saved to {metadata_path}")
    
    print("\n" + "=" * 60)
    print("✓ TRAINING COMPLETE")
    print("=" * 60)
    
    return model, scaler, feature_cols

if __name__ == "__main__":
    train_model()
