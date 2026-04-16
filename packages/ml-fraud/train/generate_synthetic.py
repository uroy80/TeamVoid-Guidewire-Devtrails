"""Generate 20,000 labeled synthetic fraud-detection samples.

Cohorts:
    70% legit (label=0)        — BAS centered 80-95, low velocity, high trust
    20% suspicious (label=1)   — 1-2 BAS components < 40, moderate velocity
    10% fraud rings (label=1)  — shared_device > 3 OR shared_ip > 5, low BAS.geo

Realistic correlations are injected so tree models pick up interactions:
    * impossible_travel      -> low BAS.geo AND low BAS.tem
    * device_swap            -> low BAS.dev AND high shared_device_workers
    * ring_fraud             -> shared_device, shared_ip, claims_last_24h all up

Output:
    packages/ml-fraud/models/synthetic_train.parquet
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import pandas as pd

# Allow `python -m train.generate_synthetic` from the package root AND
# `python generate_synthetic.py` from inside the train directory.
try:
    from app.features import FEATURE_NAMES, build_feature_dict
except ImportError:  # pragma: no cover
    import sys

    sys.path.append(str(Path(__file__).resolve().parent.parent))
    from app.features import FEATURE_NAMES, build_feature_dict  # type: ignore


MODELS_DIR = Path(__file__).resolve().parent.parent / "models"
OUT_PATH = MODELS_DIR / "synthetic_train.parquet"

RNG = np.random.default_rng(42)


# ---------------------------------------------------------------------------
# Cohort samplers
# ---------------------------------------------------------------------------
def _sample_legit(n: int, rng: np.random.Generator) -> pd.DataFrame:
    """Healthy gig-worker baseline."""
    bas = rng.normal(loc=88, scale=5, size=(n, 6)).clip(60, 100)
    claims_24h = rng.poisson(lam=0.2, size=n).clip(0, 3)
    claims_7d = claims_24h + rng.poisson(lam=0.6, size=n).clip(0, 5)
    shared_dev = rng.poisson(lam=0.3, size=n).clip(0, 3)
    shared_ip = rng.poisson(lam=0.5, size=n).clip(0, 4)
    hours_reg = rng.uniform(24 * 30, 24 * 365, size=n)  # 1 month to 1 year
    mins_dis = rng.uniform(10, 24 * 60, size=n)
    hod = rng.integers(7, 22, size=n)
    zone_hazard = rng.normal(50, 15, size=n).clip(10, 90)
    worker_trust = rng.normal(80, 10, size=n).clip(50, 100)
    payout = rng.normal(500, 150, size=n).clip(50, 2000)
    claim_source = rng.choice(["AUTO", "MANUAL"], size=n, p=[0.85, 0.15])

    return _assemble(
        n, bas, claims_24h, claims_7d, shared_dev, shared_ip,
        hours_reg, mins_dis, hod, zone_hazard, worker_trust, payout,
        claim_source, label=0,
    )


def _sample_suspicious(n: int, rng: np.random.Generator) -> pd.DataFrame:
    """1-2 BAS components dip, moderate velocity spike. Label=1."""
    bas = rng.normal(loc=75, scale=10, size=(n, 6)).clip(20, 100)

    # Pick 1-2 random components per row and drop them below 40
    num_dips = rng.integers(1, 3, size=n)
    for i in range(n):
        idxs = rng.choice(6, size=int(num_dips[i]), replace=False)
        bas[i, idxs] = rng.uniform(10, 40, size=len(idxs))

    # Impossible-travel correlation: when geo is low, pull tem down too
    low_geo = bas[:, 1] < 40
    bas[low_geo, 0] = np.minimum(bas[low_geo, 0], rng.uniform(15, 45, size=low_geo.sum()))

    # Device-swap correlation: when dev is low, push shared_device_workers up
    shared_dev = rng.poisson(lam=1.0, size=n).clip(0, 4)
    low_dev = bas[:, 2] < 40
    shared_dev[low_dev] = rng.integers(2, 5, size=low_dev.sum())

    claims_24h = rng.poisson(lam=1.2, size=n).clip(0, 5)
    claims_7d = claims_24h + rng.poisson(lam=2.0, size=n).clip(0, 8)
    shared_ip = rng.poisson(lam=1.2, size=n).clip(0, 6)
    hours_reg = rng.uniform(6, 24 * 60, size=n)
    mins_dis = rng.uniform(1, 120, size=n)
    hod = rng.integers(0, 24, size=n)
    zone_hazard = rng.normal(55, 20, size=n).clip(5, 95)
    worker_trust = rng.normal(55, 15, size=n).clip(10, 90)
    payout = rng.normal(900, 300, size=n).clip(100, 3000)
    claim_source = rng.choice(["AUTO", "MANUAL"], size=n, p=[0.7, 0.3])

    return _assemble(
        n, bas, claims_24h, claims_7d, shared_dev, shared_ip,
        hours_reg, mins_dis, hod, zone_hazard, worker_trust, payout,
        claim_source, label=1,
    )


def _sample_ring(n: int, rng: np.random.Generator) -> pd.DataFrame:
    """Fraud-ring cluster. Label=1."""
    bas = rng.normal(loc=55, scale=12, size=(n, 6)).clip(0, 95)
    # Low BAS.geo
    bas[:, 1] = rng.uniform(5, 35, size=n)

    shared_dev = rng.integers(3, 10, size=n)
    shared_ip = rng.integers(5, 20, size=n)
    claims_24h = rng.integers(3, 8, size=n)
    claims_7d = claims_24h + rng.integers(2, 15, size=n)

    hours_reg = rng.uniform(1, 24 * 14, size=n)  # fresh signups
    mins_dis = rng.uniform(1, 60, size=n)         # fast claims
    hod = rng.integers(0, 24, size=n)
    zone_hazard = rng.normal(60, 20, size=n).clip(10, 100)
    worker_trust = rng.normal(30, 15, size=n).clip(0, 80)
    payout = rng.normal(1200, 400, size=n).clip(200, 5000)
    claim_source = rng.choice(["AUTO", "MANUAL"], size=n, p=[0.6, 0.4])

    return _assemble(
        n, bas, claims_24h, claims_7d, shared_dev, shared_ip,
        hours_reg, mins_dis, hod, zone_hazard, worker_trust, payout,
        claim_source, label=1,
    )


def _assemble(
    n: int,
    bas: np.ndarray,
    claims_24h: np.ndarray,
    claims_7d: np.ndarray,
    shared_dev: np.ndarray,
    shared_ip: np.ndarray,
    hours_reg: np.ndarray,
    mins_dis: np.ndarray,
    hod: np.ndarray,
    zone_hazard: np.ndarray,
    worker_trust: np.ndarray,
    payout: np.ndarray,
    claim_source: np.ndarray,
    label: int,
) -> pd.DataFrame:
    rows = []
    for i in range(n):
        bas_d = {
            "tem": float(bas[i, 0]),
            "geo": float(bas[i, 1]),
            "dev": float(bas[i, 2]),
            "net": float(bas[i, 3]),
            "beh": float(bas[i, 4]),
            "soc": float(bas[i, 5]),
        }
        vel_d = {
            "claims_last_24h": int(claims_24h[i]),
            "claims_last_7d": int(claims_7d[i]),
            "shared_device_workers": int(shared_dev[i]),
            "shared_ip_workers": int(shared_ip[i]),
        }
        tem_d = {
            "hours_since_registration": float(hours_reg[i]),
            "minutes_since_disruption": float(mins_dis[i]),
            "claim_hour_of_day": int(hod[i]),
        }
        ctx_d = {
            "zone_hazard_score": float(zone_hazard[i]),
            "worker_trust_score": float(worker_trust[i]),
            "payout_amount": float(payout[i]),
            "claim_source": str(claim_source[i]),
        }
        flat = build_feature_dict(bas_d, vel_d, tem_d, ctx_d)
        flat["label"] = label
        rows.append(flat)
    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# Train/val/test split helper
# ---------------------------------------------------------------------------
def _stratified_split(
    df: pd.DataFrame,
    rng: np.random.Generator,
    train: float = 0.70,
    val: float = 0.15,
) -> pd.Series:
    """Return a Series of 'train' | 'val' | 'test' per row, stratified by label."""
    split = pd.Series(index=df.index, dtype=object)
    for lbl, idx in df.groupby("label").groups.items():
        order = rng.permutation(list(idx))
        n = len(order)
        n_train = int(n * train)
        n_val = int(n * val)
        split.loc[order[:n_train]] = "train"
        split.loc[order[n_train : n_train + n_val]] = "val"
        split.loc[order[n_train + n_val :]] = "test"
    return split


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def main(total: int = 20_000, out_path: Path = OUT_PATH) -> Path:
    rng = np.random.default_rng(42)
    n_legit = int(total * 0.70)
    n_susp = int(total * 0.20)
    n_ring = total - n_legit - n_susp  # ~10%

    frames = [
        _sample_legit(n_legit, rng),
        _sample_suspicious(n_susp, rng),
        _sample_ring(n_ring, rng),
    ]
    df = pd.concat(frames, ignore_index=True).sample(frac=1.0, random_state=42).reset_index(drop=True)

    df["split"] = _stratified_split(df, rng)

    # Ensure the feature columns are in canonical order (+ label + split)
    cols = FEATURE_NAMES + ["label", "split"]
    df = df[cols]

    out_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(out_path, index=False)

    counts = df["label"].value_counts().to_dict()
    split_counts = df["split"].value_counts().to_dict()
    print(f"[generate_synthetic] wrote {len(df)} rows -> {out_path}")
    print(f"                     class counts: {counts}")
    print(f"                     split counts: {split_counts}")
    return out_path


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--total", type=int, default=20_000)
    parser.add_argument("--out", type=Path, default=OUT_PATH)
    args = parser.parse_args()
    main(total=args.total, out_path=args.out)
