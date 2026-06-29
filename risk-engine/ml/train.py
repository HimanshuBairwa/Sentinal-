import os
import json
import lightgbm as lgb
import numpy as np
from datetime import datetime
from sklearn.model_selection import train_test_split
from app.domain.features import Features

def generate_dummy_data(n_samples=10000):
    """Generate synthetic data for training."""
    n_features = len(Features.FEATURE_NAMES)
    
    # 90% normal (class 0), 10% fraud (class 1)
    X_normal = np.random.normal(loc=0.2, scale=0.1, size=(int(n_samples * 0.9), n_features))
    X_fraud = np.random.normal(loc=0.8, scale=0.2, size=(int(n_samples * 0.1), n_features))
    
    X = np.vstack([X_normal, X_fraud])
    y = np.hstack([np.zeros(len(X_normal)), np.ones(len(X_fraud))])
    
    # Clip to valid ranges roughly
    X = np.clip(X, 0, None)
    
    return X, y

def train_model():
    print("Generating synthetic data...")
    X, y = generate_dummy_data()
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    
    print("Training LightGBM Booster...")
    train_data = lgb.Dataset(X_train, label=y_train, feature_name=Features.FEATURE_NAMES)
    test_data = lgb.Dataset(X_test, label=y_test, feature_name=Features.FEATURE_NAMES, reference=train_data)
    
    params = {
        'objective': 'binary',
        'metric': 'auc',
        'boosting_type': 'gbdt',
        'num_leaves': 31,
        'learning_rate': 0.05,
        'feature_fraction': 0.9,
        'verbose': -1
    }
    
    callbacks = [lgb.early_stopping(stopping_rounds=20), lgb.log_evaluation(period=10)]
    
    booster = lgb.train(
        params,
        train_data,
        num_boost_round=200,
        valid_sets=[test_data],
        callbacks=callbacks
    )
    
    print(f"Best iteration: {booster.best_iteration}")
    
    # Save model
    version = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    os.makedirs(f"/models/{version}", exist_ok=True)
    model_path = f"/models/{version}/model.lgb"
    
    booster.save_model(model_path)
    
    # Save feature names
    with open(f"/models/{version}/feature_names.json", "w") as f:
        json.dump(Features.FEATURE_NAMES, f)
        
    print(f"Model saved to {model_path}")
    
    # Symlink current
    current_link = "/models/current"
    if os.path.exists(current_link) or os.path.islink(current_link):
        os.remove(current_link)
    os.symlink(f"/models/{version}", current_link)
    
    print(f"Symlinked {current_link} -> /models/{version}")
    
    # Hit reload endpoint if running
    try:
        import httpx
        httpx.post("http://localhost:8082/api/v1/rules/reload")
        # In a real system, there would be a dedicated /model/reload endpoint.
        print("Notified Risk Engine of new model (via rules reload, as a placeholder).")
    except Exception:
        pass

if __name__ == "__main__":
    # If running outside container where /models isn't writable, override to local dir
    if not os.path.exists("/models"):
        os.makedirs("./local_models", exist_ok=True)
        # Hack to overwrite paths just for local testing without root
        def save_local():
            pass
        # Actually I will just rely on the Docker container to run this.
    train_model()
