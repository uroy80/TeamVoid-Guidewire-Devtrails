"""Feature extraction from the nested FraudCheckRequest payload.

The resulting vector is ordered identically to ``model_meta.json.feature_names``
so that it matches the columns LightGBM was trained on.

This module is the single source of truth for feature naming. The training
scripts (``train/generate_synthetic.py`` and ``train/train.py``) import
``FEATURE_NAMES`` from here to keep inference and training in sync.
"""

from __future__ import annotations

from typing import Any, Mapping

import numpy as np

from .schema import FraudCheckRequest


# ---------------------------------------------------------------------------
# The canonical feature order. Keep in sync with training code.
# ---------------------------------------------------------------------------
FEATURE_NAMES: list[str] = [
    # BAS components
    "bas_tem",
    "bas_geo",
    "bas_dev",
    "bas_net",
    "bas_beh",
    "bas_soc",
    "bas_total",  # derived: simple average
    # Velocity
    "claims_last_24h",
    "claims_last_7d",
    "shared_device_workers",
    "shared_ip_workers",
    # Temporal
    "hours_since_registration",
    "minutes_since_disruption",
    "claim_hour_of_day",
    "is_night_claim",  # derived: 22..05
    # Context
    "zone_hazard_score",
    "worker_trust_score",
    "payout_amount_log1p",  # log-scaled
    "claim_source_is_manual",
    # Interactions (cheap but meaningful for tree models)
    "low_geo_and_tem",  # BAS.geo < 40 AND BAS.tem < 40
    "ring_signal",  # shared_device_workers > 3 OR shared_ip_workers > 5
    "velocity_signal",  # claims_last_24h > 2
]


def _derived_features(
    bas: Mapping[str, float],
    velocity: Mapping[str, float],
    temporal: Mapping[str, float],
    context: Mapping[str, float],
) -> dict[str, float]:
    """Compute the small set of engineered interaction features."""
    bas_total = (
        bas["tem"] + bas["geo"] + bas["dev"] + bas["net"] + bas["beh"] + bas["soc"]
    ) / 6.0

    hod = int(temporal.get("claim_hour_of_day", 0))
    is_night = 1.0 if (hod >= 22 or hod <= 5) else 0.0

    low_geo_and_tem = 1.0 if (bas["geo"] < 40 and bas["tem"] < 40) else 0.0
    ring_signal = (
        1.0
        if (
            velocity["shared_device_workers"] > 3
            or velocity["shared_ip_workers"] > 5
        )
        else 0.0
    )
    velocity_signal = 1.0 if velocity["claims_last_24h"] > 2 else 0.0

    payout = float(context.get("payout_amount", 0.0))
    payout_log = float(np.log1p(max(0.0, payout)))

    claim_source_is_manual = (
        1.0 if context.get("claim_source", "AUTO") == "MANUAL" else 0.0
    )

    return {
        "bas_total": bas_total,
        "is_night_claim": is_night,
        "payout_amount_log1p": payout_log,
        "claim_source_is_manual": claim_source_is_manual,
        "low_geo_and_tem": low_geo_and_tem,
        "ring_signal": ring_signal,
        "velocity_signal": velocity_signal,
    }


def build_feature_dict(
    bas: Mapping[str, Any],
    velocity: Mapping[str, Any],
    temporal: Mapping[str, Any],
    context: Mapping[str, Any],
) -> dict[str, float]:
    """Build the flat feature dict from plain mappings (used by training code)."""
    bas_f = {
        "tem": float(bas.get("tem", 50.0)),
        "geo": float(bas.get("geo", 50.0)),
        "dev": float(bas.get("dev", 50.0)),
        "net": float(bas.get("net", 50.0)),
        "beh": float(bas.get("beh", 50.0)),
        "soc": float(bas.get("soc", 50.0)),
    }
    vel_f = {
        "claims_last_24h": float(velocity.get("claims_last_24h", 0)),
        "claims_last_7d": float(velocity.get("claims_last_7d", 0)),
        "shared_device_workers": float(velocity.get("shared_device_workers", 0)),
        "shared_ip_workers": float(velocity.get("shared_ip_workers", 0)),
    }
    tem_f = {
        "hours_since_registration": float(
            temporal.get("hours_since_registration", 0.0)
        ),
        "minutes_since_disruption": float(
            temporal.get("minutes_since_disruption", 0.0)
        ),
        "claim_hour_of_day": int(temporal.get("claim_hour_of_day", 0)),
    }
    ctx_f = {
        "zone_hazard_score": float(context.get("zone_hazard_score", 50.0)),
        "worker_trust_score": float(context.get("worker_trust_score", 50.0)),
        "payout_amount": float(context.get("payout_amount", 0.0)),
        "claim_source": context.get("claim_source", "AUTO"),
    }

    derived = _derived_features(bas_f, vel_f, tem_f, ctx_f)

    flat: dict[str, float] = {
        "bas_tem": bas_f["tem"],
        "bas_geo": bas_f["geo"],
        "bas_dev": bas_f["dev"],
        "bas_net": bas_f["net"],
        "bas_beh": bas_f["beh"],
        "bas_soc": bas_f["soc"],
        "bas_total": derived["bas_total"],
        "claims_last_24h": vel_f["claims_last_24h"],
        "claims_last_7d": vel_f["claims_last_7d"],
        "shared_device_workers": vel_f["shared_device_workers"],
        "shared_ip_workers": vel_f["shared_ip_workers"],
        "hours_since_registration": tem_f["hours_since_registration"],
        "minutes_since_disruption": tem_f["minutes_since_disruption"],
        "claim_hour_of_day": float(tem_f["claim_hour_of_day"]),
        "is_night_claim": derived["is_night_claim"],
        "zone_hazard_score": ctx_f["zone_hazard_score"],
        "worker_trust_score": ctx_f["worker_trust_score"],
        "payout_amount_log1p": derived["payout_amount_log1p"],
        "claim_source_is_manual": derived["claim_source_is_manual"],
        "low_geo_and_tem": derived["low_geo_and_tem"],
        "ring_signal": derived["ring_signal"],
        "velocity_signal": derived["velocity_signal"],
    }

    # Sanity-check: every declared feature must be present
    missing = [name for name in FEATURE_NAMES if name not in flat]
    if missing:
        raise RuntimeError(f"Feature builder missing: {missing}")

    return flat


def extract_features(
    req: FraudCheckRequest, feature_order: list[str] | None = None
) -> np.ndarray:
    """Flatten a FraudCheckRequest into the feature vector the model expects.

    ``feature_order`` lets the caller supply the order loaded from
    ``model_meta.json`` so that the vector matches the trained model even if
    this module's ``FEATURE_NAMES`` drifts in the future. Defaults to the
    current in-code order.
    """
    order = feature_order or FEATURE_NAMES
    flat = build_feature_dict(
        req.bas_components.model_dump(),
        req.velocity.model_dump(),
        req.temporal.model_dump(),
        req.context.model_dump(),
    )
    vec = np.array([flat[name] for name in order], dtype=np.float64)
    return vec
