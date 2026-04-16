"""Train the LightGBM fraud classifier on the synthetic dataset.

Usage:
    python -m train.generate_synthetic    # creates models/synthetic_train.parquet
    python -m train.train                 # writes models/fraud_model.joblib
                                          #        models/model_meta.json

What this does:
    1. Reads the parquet written by ``generate_synthetic.py``.
    2. Splits into train/val/test using the ``split`` column.
    3. Trains LightGBM (binary + AUC) with early stopping on the val set.
    4. Wraps the booster in a ``CalibratedClassifierCV(cv="prefit")`` using
       Platt scaling so probabilities are well-calibrated.
    5. Reports AUC, PR-AUC, precision at 90% recall, confusion matrix @ 0.5.
    6. Persists ``fraud_model.joblib`` and ``model_meta.json``.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import joblib
import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import (
    auc,
    average_precision_score,
    confusion_matrix,
    precision_recall_curve,
    roc_auc_score,
)

try:
    from app.features import FEATURE_NAMES
except ImportError:  # pragma: no cover
    import sys

    sys.path.append(str(Path(__file__).resolve().parent.parent))
    from app.features import FEATURE_NAMES  # type: ignore


MODELS_DIR = Path(__file__).resolve().parent.parent / "models"
DATA_PATH = MODELS_DIR / "synthetic_train.parquet"
MODEL_PATH = MODELS_DIR / "fraud_model.joblib"
META_PATH = MODELS_DIR / "model_meta.json"

MODEL_VERSION = "1.0.0"


# ---------------------------------------------------------------------------
# Metrics helpers
# ---------------------------------------------------------------------------
def _precision_at_recall(
    y_true: np.ndarray, y_score: np.ndarray, recall_target: float = 0.90
) -> float:
    precision, recall, _ = precision_recall_curve(y_true, y_score)
    # recall is decreasing; find largest recall >= target
    mask = recall >= recall_target
    if not mask.any():
        return 0.0
    return float(precision[mask].max())


def _evaluate(
    name: str, y_true: np.ndarray, y_score: np.ndarray
) -> dict[str, Any]:
    auc_roc = float(roc_auc_score(y_true, y_score))
    pr_auc = float(average_precision_score(y_true, y_score))
    p_at_r90 = _precision_at_recall(y_true, y_score, 0.90)
    y_pred = (y_score >= 0.5).astype(int)
    cm = confusion_matrix(y_true, y_pred).tolist()
    print(
        f"[{name}]  AUC={auc_roc:.4f}  PR-AUC={pr_auc:.4f}  "
        f"P@R90={p_at_r90:.4f}"
    )
    print(f"          confusion@0.5 (rows=true, cols=pred): {cm}")
    return {
        "auc": auc_roc,
        "pr_auc": pr_auc,
        "precision_at_recall_90": p_at_r90,
        "confusion_matrix_at_0_5": cm,
    }


# ---------------------------------------------------------------------------
# Training
# ---------------------------------------------------------------------------
def train() -> dict[str, Any]:
    if not DATA_PATH.exists():
        raise FileNotFoundError(
            f"{DATA_PATH} not found — run `python -m train.generate_synthetic` first."
        )

    df = pd.read_parquet(DATA_PATH)
    missing = [c for c in FEATURE_NAMES if c not in df.columns]
    if missing:
        raise RuntimeError(
            f"Dataset is missing expected feature columns: {missing}"
        )

    train_df = df[df["split"] == "train"]
    val_df = df[df["split"] == "val"]
    test_df = df[df["split"] == "test"]

    X_train, y_train = train_df[FEATURE_NAMES].values, train_df["label"].values
    X_val, y_val = val_df[FEATURE_NAMES].values, val_df["label"].values
    X_test, y_test = test_df[FEATURE_NAMES].values, test_df["label"].values

    print(
        f"[train] sizes  train={len(X_train)}  val={len(X_val)}  test={len(X_test)}"
    )
    print(f"[train] features ({len(FEATURE_NAMES)}): {FEATURE_NAMES}")

    params: dict[str, Any] = {
        "objective": "binary",
        "metric": "auc",
        "learning_rate": 0.05,
        "num_leaves": 31,
        "min_data_in_leaf": 100,
        "feature_fraction": 0.8,
        "bagging_fraction": 0.8,
        "bagging_freq": 5,
        "verbose": -1,
        "seed": 42,
    }

    # --- 1. LightGBM sklearn classifier (so predict_proba works) -----------
    clf = lgb.LGBMClassifier(
        **params,
        n_estimators=500,
    )
    clf.fit(
        X_train,
        y_train,
        eval_set=[(X_val, y_val)],
        eval_metric="auc",
        callbacks=[lgb.early_stopping(stopping_rounds=30), lgb.log_evaluation(50)],
    )

    # --- 2. Raw-booster metrics (pre-calibration) --------------------------
    raw_val = clf.predict_proba(X_val)[:, 1]
    raw_test = clf.predict_proba(X_test)[:, 1]
    raw_metrics = {
        "val": _evaluate("raw-val", y_val, raw_val),
        "test": _evaluate("raw-test", y_test, raw_test),
    }

    # --- 3. Platt-scale on validation set (cv='prefit') --------------------
    calibrated = CalibratedClassifierCV(estimator=clf, method="sigmoid", cv="prefit")
    calibrated.fit(X_val, y_val)

    cal_val = calibrated.predict_proba(X_val)[:, 1]
    cal_test = calibrated.predict_proba(X_test)[:, 1]
    cal_metrics = {
        "val": _evaluate("cal-val", y_val, cal_val),
        "test": _evaluate("cal-test", y_test, cal_test),
    }

    # --- 4. Persist --------------------------------------------------------
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(calibrated, MODEL_PATH)
    print(f"[train] wrote model -> {MODEL_PATH}")

    meta = {
        "version": MODEL_VERSION,
        "trained_at": datetime.now(tz=timezone.utc).isoformat(),
        "feature_names": FEATURE_NAMES,
        "params": params,
        "metrics": {
            "raw_lightgbm": raw_metrics,
            "platt_calibrated": cal_metrics,
        },
        "n_train": int(len(X_train)),
        "n_val": int(len(X_val)),
        "n_test": int(len(X_test)),
    }
    with META_PATH.open("w", encoding="utf-8") as fh:
        json.dump(meta, fh, indent=2)
    print(f"[train] wrote meta  -> {META_PATH}")

    return meta


if __name__ == "__main__":
    train()
