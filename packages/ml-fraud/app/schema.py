"""Pydantic request/response schemas for the fraud ML sidecar.

Mirrors the BAS signal structure used in
`packages/backend/src/services/antispoofing.service.ts` plus velocity,
temporal, and contextual features the Node side assembles from the DB.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Sub-structures that mirror the Node-side feature groups
# ---------------------------------------------------------------------------


class BASComponents(BaseModel):
    """Behavioural Authenticity Score sub-components (0..100, 100 = trusted)."""

    tem: float = Field(..., ge=0, le=100, description="Temporal / historical behaviour")
    geo: float = Field(..., ge=0, le=100, description="GPS authenticity")
    dev: float = Field(..., ge=0, le=100, description="Device consistency")
    net: float = Field(..., ge=0, le=100, description="Network / IP reputation")
    beh: float = Field(..., ge=0, le=100, description="Movement behaviour entropy")
    soc: float = Field(..., ge=0, le=100, description="Social / ring-fraud absence")


class VelocityFeatures(BaseModel):
    """Claim-velocity features computed from recent DB state."""

    claims_last_24h: int = Field(0, ge=0)
    claims_last_7d: int = Field(0, ge=0)
    shared_device_workers: int = Field(
        0, ge=0, description="# other workers seen on the same device fingerprint"
    )
    shared_ip_workers: int = Field(
        0, ge=0, description="# other workers seen on the same IP in last 24h"
    )


class TemporalFeatures(BaseModel):
    """Time-based features derived from event + worker timestamps."""

    hours_since_registration: float = Field(0.0, ge=0)
    minutes_since_disruption: float = Field(0.0, ge=0)
    claim_hour_of_day: int = Field(0, ge=0, le=23)


class ContextFeatures(BaseModel):
    """Contextual scoring signals attached to the claim."""

    zone_hazard_score: float = Field(50.0, ge=0, le=100)
    worker_trust_score: float = Field(50.0, ge=0, le=100)
    payout_amount: float = Field(0.0, ge=0)
    claim_source: Literal["AUTO", "MANUAL"] = "AUTO"


# ---------------------------------------------------------------------------
# Top-level request / response models
# ---------------------------------------------------------------------------


class FraudCheckRequest(BaseModel):
    worker_id: str
    claim_id: str
    bas_components: BASComponents
    velocity: VelocityFeatures
    temporal: TemporalFeatures
    context: ContextFeatures


class ShapFactor(BaseModel):
    """One row of SHAP explanation for the top contributing features."""

    feature: str
    value: float = Field(..., description="Raw feature value that was fed to the model")
    shap_value: float = Field(
        ..., description="Signed SHAP contribution (positive => pushes toward fraud)"
    )
    direction: Literal["increases_fraud", "decreases_fraud"] = "increases_fraud"


class FraudCheckResponse(BaseModel):
    fraud_probability: float = Field(..., ge=0, le=1)
    decision: Literal["APPROVE", "REVIEW", "DECLINE"]
    tier: Literal["LOW", "MEDIUM", "HIGH"]
    top_factors: list[ShapFactor]
    model_version: str
    latency_ms: float


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    model_loaded: bool
    model_version: str
