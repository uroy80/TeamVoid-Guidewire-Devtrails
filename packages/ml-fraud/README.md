# GigShield Fraud ML Sidecar

A standalone FastAPI service that hosts a trained **LightGBM** binary classifier for
claim-level fraud prediction, with **SHAP** explanations returned on every call.

It runs as a sidecar next to the Node backend. The backend calls it alongside
(not instead of) the existing BAS rule-based scoring and stores the ML
explanations in the claim record for admin review. If the sidecar is down or
slow, the Node layer falls back to the rule-based score — the existing flow is
never broken.

---

## Why a separate Python service?

* LightGBM + SHAP are Python-native and would be painful to run in Node.
* It keeps the heavy ML dependencies (`lightgbm`, `shap`, `scikit-learn`,
  `numpy`, `pandas`) out of the Node container image.
* The Node service can short-circuit on timeout and carry on.

---

## Layout

```
packages/ml-fraud/
├── app/
│   ├── main.py        # FastAPI app
│   ├── model.py       # Singleton model + SHAP TreeExplainer
│   ├── features.py    # FEATURE_NAMES + request-to-vector mapping
│   └── schema.py      # Pydantic request / response schemas
├── train/
│   ├── generate_synthetic.py   # 20k labelled rows
│   ├── train.py                # Trains + calibrates + persists
│   └── notebook.ipynb          # Same pipeline, with plots
├── models/            # Model + metadata artefacts (gitignored binaries)
├── requirements.txt
├── Dockerfile
└── README.md
```

---

## Training

```bash
cd packages/ml-fraud
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# 1. Generate the synthetic dataset (20,000 labelled rows)
python -m train.generate_synthetic

# 2. Train, calibrate, persist
python -m train.train
```

Artefacts produced in `models/`:

* `synthetic_train.parquet` — labelled dataset
* `fraud_model.joblib` — Platt-calibrated LightGBM classifier
* `model_meta.json` — version, feature order, metrics

---

## Running locally

```bash
cd packages/ml-fraud
uvicorn app.main:app --reload --port 8000
```

Then:

```bash
curl -s http://localhost:8000/health
```

---

## Running in Docker

```bash
# From repo root
docker compose up -d ml-fraud
# or standalone:
docker build -t gigshield-ml-fraud ./packages/ml-fraud
docker run -p 8000:8000 gigshield-ml-fraud
```

---

## API

### `GET /health`

```json
{ "status": "ok", "model_loaded": true, "model_version": "1.0.0" }
```

### `GET /v1/model/info`

Returns the full `model_meta.json` payload (feature names, metrics, etc).

### `POST /v1/fraud/check`

Decisions:

| fraud_probability | tier   | decision  |
|-------------------|--------|-----------|
| `< 0.2`           | LOW    | APPROVE   |
| `0.2 – 0.6`       | MEDIUM | REVIEW    |
| `> 0.6`           | HIGH   | DECLINE   |

Thresholds for `decision` are actually `< 0.3 -> APPROVE`, `< 0.7 -> REVIEW`,
`>= 0.7 -> DECLINE`. **If `context.claim_source == "MANUAL"`, the decision is
forced to `REVIEW` regardless of probability** — manual worker claims always
go to admin review.

#### Example

```bash
curl -sX POST http://localhost:8000/v1/fraud/check \
  -H "Content-Type: application/json" \
  -d '{
    "worker_id": "w-123",
    "claim_id":  "c-456",
    "bas_components": {"tem": 85, "geo": 90, "dev": 88, "net": 92, "beh": 80, "soc": 95},
    "velocity":       {"claims_last_24h": 0, "claims_last_7d": 1,
                        "shared_device_workers": 0, "shared_ip_workers": 1},
    "temporal":       {"hours_since_registration": 720,
                        "minutes_since_disruption": 45,
                        "claim_hour_of_day": 14},
    "context":        {"zone_hazard_score": 60, "worker_trust_score": 82,
                        "payout_amount": 600, "claim_source": "AUTO"}
  }'
```

Response:

```json
{
  "fraud_probability": 0.0412,
  "decision": "APPROVE",
  "tier": "LOW",
  "top_factors": [
    {"feature": "bas_geo", "value": 90.0, "shap_value": -0.412, "direction": "decreases_fraud"},
    {"feature": "worker_trust_score", "value": 82.0, "shap_value": -0.305, "direction": "decreases_fraud"},
    {"feature": "ring_signal", "value": 0.0, "shap_value": -0.188, "direction": "decreases_fraud"},
    {"feature": "claims_last_24h", "value": 0.0, "shap_value": -0.141, "direction": "decreases_fraud"},
    {"feature": "bas_dev", "value": 88.0, "shap_value": -0.097, "direction": "decreases_fraud"}
  ],
  "model_version": "1.0.0",
  "latency_ms": 14.2
}
```

---

## Model metrics (synthetic)

On a representative 15% hold-out the synthetic dataset gives:

* AUC ROC: ~0.98
* PR-AUC: ~0.95
* Precision at 90% recall: ~0.90

These will be regenerated and saved to `model_meta.json` on every training
run — see `metrics.platt_calibrated.test` in that file for the canonical values.

---

## Failure modes

| Scenario                     | Sidecar behaviour                  | Node backend behaviour                            |
|------------------------------|------------------------------------|---------------------------------------------------|
| Sidecar not running          | —                                  | Falls back to rule-based score, `ml_used=false`   |
| Model artefacts missing      | `/health` -> `status=degraded`     | Receives 0.5 probability; still falls back        |
| Sidecar timeout (>500ms)     | —                                  | Falls back to rule-based score, `ml_used=false`   |
| 5xx from sidecar             | Logged, 500 response               | Falls back to rule-based score, `ml_used=false`   |
| Invalid payload (missing BAS)| 422 validation error               | Logs warning, falls back                          |

The golden rule: **the ML sidecar may improve decisions but must never block a
claim from being scored**.
