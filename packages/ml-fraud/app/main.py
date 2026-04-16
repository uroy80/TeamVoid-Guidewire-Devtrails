"""FastAPI entry-point for the GigShield Fraud ML sidecar.

Endpoints:
    GET  /health              — liveness + model status
    GET  /v1/model/info       — full model_meta.json contents
    POST /v1/fraud/check      — scored decision + SHAP explanations

Logging is structured JSON to stdout so it plays nicely with container log
collectors.
"""

from __future__ import annotations

import json
import logging
import os
import sys
import time
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .features import extract_features
from .model import FraudModel
from .schema import (
    FraudCheckRequest,
    FraudCheckResponse,
    HealthResponse,
    ShapFactor,
)


# ---------------------------------------------------------------------------
# Structured JSON logging to stdout
# ---------------------------------------------------------------------------
class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S"),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


def _configure_logging() -> None:
    level_name = os.getenv("LOG_LEVEL", "info").upper()
    level = getattr(logging, level_name, logging.INFO)
    root = logging.getLogger()
    root.handlers.clear()
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root.addHandler(handler)
    root.setLevel(level)
    # Uvicorn's own loggers — align them with our formatter
    for name in ("uvicorn", "uvicorn.access", "uvicorn.error"):
        lg = logging.getLogger(name)
        lg.handlers.clear()
        lg.addHandler(handler)
        lg.setLevel(level)
        lg.propagate = False


_configure_logging()
log = logging.getLogger("ml-fraud.api")


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(
    title="GigShield Fraud ML Sidecar",
    description=(
        "Trained LightGBM classifier with SHAP explanations. "
        "Called by the Node backend alongside (not instead of) the existing "
        "rule-based fraud scoring."
    ),
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def _warm_model() -> None:
    model = FraudModel.instance()
    log.info(
        "ml-fraud ready loaded=%s version=%s", model.loaded, model.version
    )


# ---------------------------------------------------------------------------
# Scoring helpers
# ---------------------------------------------------------------------------
def _tier_for(prob: float) -> str:
    if prob < 0.2:
        return "LOW"
    if prob < 0.6:
        return "MEDIUM"
    return "HIGH"


def _decision_for(prob: float, claim_source: str) -> str:
    # Manual claims ALWAYS go to admin review, regardless of probability.
    if claim_source == "MANUAL":
        return "REVIEW"
    if prob < 0.3:
        return "APPROVE"
    if prob < 0.7:
        return "REVIEW"
    return "DECLINE"


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    m = FraudModel.instance()
    return HealthResponse(
        status="ok" if m.loaded else "degraded",
        model_loaded=m.loaded,
        model_version=m.version,
    )


@app.get("/v1/model/info")
async def model_info() -> dict[str, Any]:
    m = FraudModel.instance()
    return m.meta


@app.post("/v1/fraud/check", response_model=FraudCheckResponse)
async def fraud_check(req: FraudCheckRequest) -> FraudCheckResponse:
    t0 = time.perf_counter()
    model = FraudModel.instance()
    try:
        feats = extract_features(
            req, feature_order=model.feature_names or None
        )
        proba, factors = model.predict(feats)
    except KeyError as exc:
        raise HTTPException(status_code=422, detail=f"Missing feature: {exc}")
    except Exception as exc:  # noqa: BLE001
        log.exception("scoring failed: %s", exc)
        raise HTTPException(status_code=500, detail="scoring_failed")

    latency_ms = (time.perf_counter() - t0) * 1000.0
    # Cap probability to [0,1] just in case
    proba = float(max(0.0, min(1.0, proba)))

    response = FraudCheckResponse(
        fraud_probability=proba,
        decision=_decision_for(proba, req.context.claim_source),  # type: ignore[arg-type]
        tier=_tier_for(proba),  # type: ignore[arg-type]
        top_factors=factors or [_fallback_factor()],
        model_version=model.version,
        latency_ms=round(latency_ms, 3),
    )

    log.info(
        "fraud_check claim_id=%s worker_id=%s prob=%.4f decision=%s latency_ms=%.1f",
        req.claim_id,
        req.worker_id,
        proba,
        response.decision,
        latency_ms,
    )
    return response


def _fallback_factor() -> ShapFactor:
    """Placeholder when the explainer is unavailable (e.g. untrained model)."""
    return ShapFactor(
        feature="model_unavailable",
        value=0.0,
        shap_value=0.0,
        direction="increases_fraud",
    )
