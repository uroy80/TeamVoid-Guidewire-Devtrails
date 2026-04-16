"""Singleton model loader + SHAP-backed predictor.

Loads the joblib-serialised LightGBM booster (optionally wrapped in a
``CalibratedClassifierCV``) and the ``model_meta.json`` written by
``train/train.py``. The explainer uses ``shap.TreeExplainer`` which lightgbm
supports natively.

If the model file is missing we fall back to a conservative dummy predictor
that always returns 0.5 so the sidecar can still boot for wiring tests —
the caller is expected to treat this as a "degraded" model and fall back to
rules anyway.
"""

from __future__ import annotations

import json
import logging
import threading
from pathlib import Path
from typing import Any

import joblib
import numpy as np

from .schema import ShapFactor

try:  # pragma: no cover — only imported when available
    import shap  # type: ignore
except ImportError:  # pragma: no cover
    shap = None  # noqa: N816

log = logging.getLogger("ml-fraud.model")

_MODEL_DIR = Path(__file__).resolve().parent.parent / "models"
_MODEL_PATH = _MODEL_DIR / "fraud_model.joblib"
_META_PATH = _MODEL_DIR / "model_meta.json"

_DEFAULT_META: dict[str, Any] = {
    "version": "0.0.0-untrained",
    "trained_at": None,
    "feature_names": [],
    "metrics": {},
}


class FraudModel:
    """Thread-safe singleton wrapping the trained booster + explainer."""

    _instance: "FraudModel | None" = None
    _lock = threading.Lock()

    def __init__(self) -> None:
        self._model: Any | None = None
        self._booster: Any | None = None  # raw LightGBM booster for SHAP
        self._meta: dict[str, Any] = dict(_DEFAULT_META)
        self._explainer: Any | None = None
        self._loaded: bool = False

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------
    @classmethod
    def instance(cls) -> "FraudModel":
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
                    cls._instance._load()
        return cls._instance

    def _load(self) -> None:
        if _MODEL_PATH.exists() and _META_PATH.exists():
            try:
                self._model = joblib.load(_MODEL_PATH)
                with _META_PATH.open("r", encoding="utf-8") as fh:
                    self._meta = json.load(fh)
                self._booster = self._extract_booster(self._model)
                if shap is not None and self._booster is not None:
                    self._explainer = shap.TreeExplainer(self._booster)
                self._loaded = True
                log.info(
                    "Loaded fraud model v=%s with %d features",
                    self._meta.get("version"),
                    len(self._meta.get("feature_names", [])),
                )
            except Exception as exc:  # noqa: BLE001
                log.exception("Failed to load fraud model: %s", exc)
                self._loaded = False
        else:
            log.warning(
                "Model artefacts not found (%s / %s) — serving degraded predictions",
                _MODEL_PATH,
                _META_PATH,
            )
            self._loaded = False

    @staticmethod
    def _extract_booster(model: Any) -> Any | None:
        """Return the underlying LightGBM Booster for SHAP, or None."""
        # CalibratedClassifierCV wraps an estimator; unwrap to get booster
        try:
            if hasattr(model, "calibrated_classifiers_"):
                base = model.calibrated_classifiers_[0].estimator
            elif hasattr(model, "estimator"):
                base = model.estimator
            else:
                base = model
            if hasattr(base, "booster_"):
                return base.booster_
            if hasattr(base, "_Booster"):
                return base._Booster
            return base
        except Exception:  # noqa: BLE001
            return None

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    @property
    def loaded(self) -> bool:
        return self._loaded

    @property
    def version(self) -> str:
        return str(self._meta.get("version", "0.0.0-untrained"))

    @property
    def feature_names(self) -> list[str]:
        return list(self._meta.get("feature_names", []))

    @property
    def meta(self) -> dict[str, Any]:
        return dict(self._meta)

    def predict(self, features: np.ndarray) -> tuple[float, list[ShapFactor]]:
        """Return (fraud_probability, top-5 SHAP factors by |value|)."""
        if not self._loaded or self._model is None:
            return 0.5, []

        X = features.reshape(1, -1)

        # Probability of class 1 (fraud)
        if hasattr(self._model, "predict_proba"):
            proba = float(self._model.predict_proba(X)[0, 1])
        else:
            # raw booster — returns probability directly for binary
            proba = float(np.asarray(self._model.predict(X)).ravel()[0])

        # SHAP explanations on the raw booster (fast, exact for trees)
        factors: list[ShapFactor] = []
        if self._explainer is not None:
            try:
                shap_values = self._explainer.shap_values(X)
                # For binary LightGBM, shap returns an array of shape (n, n_feat)
                # or a list [class0, class1]. Normalise to 1-D for class 1.
                if isinstance(shap_values, list):
                    sv = np.asarray(shap_values[1]).ravel()
                else:
                    arr = np.asarray(shap_values)
                    sv = arr[0] if arr.ndim == 2 else arr.ravel()

                names = self.feature_names or [f"f{i}" for i in range(len(sv))]
                order = np.argsort(np.abs(sv))[::-1][:5]
                for idx in order:
                    v = float(features[idx])
                    s = float(sv[idx])
                    factors.append(
                        ShapFactor(
                            feature=names[idx],
                            value=v,
                            shap_value=s,
                            direction=(
                                "increases_fraud" if s >= 0 else "decreases_fraud"
                            ),
                        )
                    )
            except Exception as exc:  # noqa: BLE001
                log.warning("SHAP explanation failed: %s", exc)
                factors = []

        return proba, factors
