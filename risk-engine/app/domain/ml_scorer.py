import os
import time
import threading
import logging
import numpy as np
import lightgbm as lgb
import shap
from typing import Tuple, List, Dict, Optional
from app.domain.features import Features
from app.metrics.metrics import ML_INFERENCE_LATENCY, MODEL_LOADED

logger = logging.getLogger(__name__)

class LightGBMScorer:
    def __init__(self):
        self.model: Optional[lgb.Booster] = None
        self.explainer: Optional[shap.TreeExplainer] = None
        self.feature_names: List[str] = Features.FEATURE_NAMES
        self._lock = threading.RLock()
        self.model_version: str = "none"
        self.model_loaded: bool = False
        MODEL_LOADED.set(0)

    def load_model(self, model_path: str):
        """Load model from file. Runs warm-up after load."""
        if not os.path.exists(model_path):
            logger.warning(f"Model not found at {model_path}. Running in rules-only mode.")
            self.model_loaded = False
            MODEL_LOADED.set(0)
            return

        try:
            model = lgb.Booster(model_file=model_path)
            explainer = shap.TreeExplainer(model)
            
            # Warm up: run 100 inferences before going live
            dummy = np.zeros((100, len(self.feature_names)), dtype=np.float32)
            for _ in range(100):
                model.predict(dummy)
                
            with self._lock:
                self.model = model
                self.explainer = explainer
                self.model_version = os.path.basename(os.path.dirname(model_path)) if os.path.dirname(model_path) else "v1"
                self.model_loaded = True
                MODEL_LOADED.set(1)
                
            logger.info(f"Model loaded successfully: {self.model_version}")
        except Exception as e:
            logger.error(f"Failed to load model from {model_path}: {e}")
            self.model_loaded = False
            MODEL_LOADED.set(0)

    def score(self, features: np.ndarray, explain: bool = True) -> Tuple[float, Optional[List[Dict]]]:
        """
        Returns (score_0_to_100, shap_top5_or_none)
        Thread-safe via RLock.
        If model not loaded: returns (50.0, None) — fail open
        """
        if not self.model_loaded or self.model is None:
            return 50.0, None

        with self._lock:
            start = time.perf_counter()
            prob = float(self.model.predict(features.reshape(1, -1))[0])
            inference_ms = (time.perf_counter() - start) * 1000
            ML_INFERENCE_LATENCY.observe(inference_ms / 1000.0)

            shap_top5 = None
            if explain and self.explainer is not None:
                # TreeExplainer expects 2D array, returns list of arrays for multiclass or single array for regression/binary
                sv = self.explainer.shap_values(features.reshape(1, -1))
                if isinstance(sv, list):
                    sv = sv[1] # Use class 1 for binary classification if list
                sv = sv[0]
                
                pairs = sorted(
                    zip(self.feature_names, sv.tolist()),
                    key=lambda x: abs(x[1]),
                    reverse=True
                )[:5]
                shap_top5 = [
                    {"feature": f, "contribution": round(v, 4)}
                    for f, v in pairs
                ]

        return round(prob * 100, 2), shap_top5

    def hot_reload(self, model_path: str):
        """Zero-downtime model swap via atomic pointer swap."""
        self.load_model(model_path)

# Singleton
_scorer = LightGBMScorer()

def get_ml_scorer() -> LightGBMScorer:
    return _scorer
