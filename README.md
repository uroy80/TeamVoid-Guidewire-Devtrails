<p align="center">
  <img src="https://img.shields.io/badge/Platform-PWA-purple?style=for-the-badge&logo=pwa&logoColor=white" alt="Platform Badge"/>
  <img src="https://img.shields.io/badge/Hackathon-Guidewire%20DEVTrails%202026-002B5C?style=for-the-badge&logo=hackthebox&logoColor=white" alt="Hackathon Badge"/>
  <img src="https://img.shields.io/badge/Phase%203-Final%20Submission-F26522?style=for-the-badge&logo=target&logoColor=white" alt="Phase Badge"/>
  <img src="https://img.shields.io/badge/Persona-Q--Commerce-00A7E1?style=for-the-badge&logo=uber&logoColor=white" alt="Persona Badge"/>
  <img src="https://img.shields.io/badge/Payments-Razorpay%20LIVE-3395FF?style=for-the-badge&logo=razorpay&logoColor=white" alt="Razorpay Badge"/>
  <img src="https://img.shields.io/badge/Languages-11%20Indian-4CAF50?style=for-the-badge&logo=googletranslate&logoColor=white" alt="Languages Badge"/>
</p>

<p align="center">
  <img src="prototype/logos/gigshield.png" alt="GigShield Logo" width="120" height="120" style="border-radius:20px"/>
</p>

<h1 align="center">GigShield</h1>
<h3 align="center">AI-Powered Parametric Income Protection for India's Q-Commerce Delivery Partners</h3>

<p align="center">
  <i>Shielding 7.7 million gig workers from the income shock of floods, pollution, heat and social disruption — with zero paperwork, in under 10 minutes.</i>
</p>

<p align="center">
  <a href="#the-problem">Problem</a> &middot;
  <a href="#our-solution">Solution</a> &middot;
  <a href="#phase-3-deliverables">Deliverables</a> &middot;
  <a href="#how-it-works">How It Works</a> &middot;
  <a href="#architecture">Architecture</a> &middot;
  <a href="#payment-gateways">Payments</a> &middot;
  <a href="#ai-integration">AI</a> &middot;
  <a href="#multi-language">i18n</a> &middot;
  <a href="#live-ops-war-room">Live Ops</a> &middot;
  <a href="#community-hyperlocal-reports">Community</a> &middot;
  <a href="#adversarial-defense--anti-spoofing-strategy">Anti-Spoofing</a> &middot;
  <a href="#tech-stack">Tech Stack</a>
</p>

<p align="center">
  <a href="https://gigshield.in">
    <img src="https://img.shields.io/badge/Live%20Product-gigshield.in-4CAF50?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Live Product"/>
  </a>
  <a href="https://youtu.be/bx8AVAU_amk">
    <img src="https://img.shields.io/badge/Phase%203%20Video-YouTube-FF0000?style=for-the-badge&logo=youtube&logoColor=white" alt="Demo Video"/>
  </a>
  <a href="https://drive.google.com/drive/folders/11OMzlHfn8ZOcPxxRBEHwB0wbOdRAqKqe?usp=drive_link">
    <img src="https://img.shields.io/badge/Pitch%20Deck-Google%20Drive-4285F4?style=for-the-badge&logo=googledrive&logoColor=white" alt="Pitch Deck"/>
  </a>
  <a href="https://github.com/uroy80/TeamVoid-Guidewire-Devtrails">
    <img src="https://img.shields.io/badge/Source-GitHub-181717?style=for-the-badge&logo=github&logoColor=white" alt="Source"/>
  </a>
</p>

---

## Phase 3 Deliverables

| Deliverable | Link | Status |
|---|---|---|
| **Live Product** | [gigshield.in](https://gigshield.in) | Deployed on Hostinger VPS behind Cloudflare SSL |
| **Git Repository** | [uroy80/TeamVoid-Guidewire-Devtrails](https://github.com/uroy80/TeamVoid-Guidewire-Devtrails) | Public, all commits attributed |
| **Pitch Deck** | [Google Drive folder](https://drive.google.com/drive/folders/11OMzlHfn8ZOcPxxRBEHwB0wbOdRAqKqe?usp=drive_link) | HTML + PPTX (Guidewire UI style) |
| **Recorded Video** | [youtu.be/bx8AVAU_amk](https://youtu.be/bx8AVAU_amk) | End-to-end Phase 3 walkthrough |
| **Admin Login** | admin@gigshield.in / admin123 | Full fraud-review + ops panel |
| **Worker Login** | Any Indian mobile number | Real Twilio Verify OTP |

---

## The Problem

> *"Kal 6 ghante kaam nahi kar paya waterlogging ki wajah se. ₹400 ka loss. Hamein kuch nahi milta."*
> *(Yesterday I couldn't work for 6 hours because of waterlogging. Lost ₹400. No one compensates us.)*
> — Delivery partner, Andheri East, Mumbai

India runs on **7.7 million gig workers**. Of those, ~1.2 million ride for Q-Commerce — Blinkit, Zepto, Instamart, BigBasket Now — promising groceries at your door in 10 minutes. Their median monthly income is ₹16,800 and **over 72% of it is earned per completed order**, not per hour logged in.

That fragile per-order economy breaks the moment the environment does:

| Disruption | Typical duration | Income lost (median rider) |
|---|---|---|
| Mumbai monsoon waterlogging | 3–6 hours | ₹320 – ₹640 |
| Delhi AQI ≥ 400 (severe) | 4–8 hours | ₹400 – ₹800 |
| Bengaluru flash storms | 2–4 hours | ₹220 – ₹440 |
| Sudden platform outages | 1–3 hours | ₹120 – ₹320 |

Private insurance never reached this population — no payslips, no ITRs, no stable address, and claim cycles of **42–75 days** that presume a salaried life. Traditional insurers cannot profitably underwrite ₹15/month premiums because a human adjuster *eats the premium in a single phone call*.

> **This is not a claims problem. It is a _parameters_ problem.**

NASA, AQICN and Open-Meteo already publish, in near-real-time, whether a zone is under severe weather or severe pollution. The payout does not need a human — it needs a trigger.

---

## Our Solution

**GigShield** is a parametric insurance platform that automatically detects disruptions and pays workers — without them lifting a finger.

<p align="center">
  <img src="https://img.shields.io/badge/1-Rain%20Detected-2196F3?style=flat-square" alt="Step 1"/>
  <img src="https://img.shields.io/badge/→-grey?style=flat-square" alt="arrow"/>
  <img src="https://img.shields.io/badge/2-Claim%20Auto--Created-FF9800?style=flat-square" alt="Step 2"/>
  <img src="https://img.shields.io/badge/→-grey?style=flat-square" alt="arrow"/>
  <img src="https://img.shields.io/badge/3-BAS%20Fraud%20Check-9C27B0?style=flat-square" alt="Step 3"/>
  <img src="https://img.shields.io/badge/→-grey?style=flat-square" alt="arrow"/>
  <img src="https://img.shields.io/badge/4-Razorpay%20Payout-4CAF50?style=flat-square" alt="Step 4"/>
</p>

<table>
<tr>
<td width="50%">

**What Makes Us Different**

| Feature | Detail |
|---------|--------|
| <img src="https://img.shields.io/badge/-Zero--touch%20claims-4CAF50?style=flat-square&logo=checkmarx&logoColor=white" alt=""/> | No manual filing ever |
| <img src="https://img.shields.io/badge/-<%2010%20min%20payout-2196F3?style=flat-square&logo=lightning&logoColor=white" alt=""/> | Disruption to payout |
| <img src="https://img.shields.io/badge/-Real%20Razorpay%20API-3395FF?style=flat-square&logo=razorpay&logoColor=white" alt=""/> | Genuine `order_XXX` per payout |
| <img src="https://img.shields.io/badge/-11%20Indian%20languages-FF9800?style=flat-square&logo=googletranslate&logoColor=white" alt=""/> | True vernacular UX |
| <img src="https://img.shields.io/badge/-11--signal%20BAS-F44336?style=flat-square&logo=openai&logoColor=white" alt=""/> | Behavioral anti-spoofing |
| <img src="https://img.shields.io/badge/-Live%20Ops%20War%20Room-002B5C?style=flat-square&logo=grafana&logoColor=white" alt=""/> | SSE event stream |
| <img src="https://img.shields.io/badge/-Workers--as--sensors-9C27B0?style=flat-square&logo=leaflet&logoColor=white" alt=""/> | Community reports |

</td>
<td width="50%">

**Coverage Scope**

| Status | Coverage |
|--------|----------|
| <img src="https://img.shields.io/badge/-Covered-4CAF50?style=flat-square" alt="yes"/> | Income loss from heavy rain / floods |
| <img src="https://img.shields.io/badge/-Covered-4CAF50?style=flat-square" alt="yes"/> | Income loss from pollution (AQI > 400) |
| <img src="https://img.shields.io/badge/-Covered-4CAF50?style=flat-square" alt="yes"/> | Income loss from extreme heat (> 45°C) |
| <img src="https://img.shields.io/badge/-Covered-4CAF50?style=flat-square" alt="yes"/> | Income loss from curfews / strikes |
| <img src="https://img.shields.io/badge/-Covered-4CAF50?style=flat-square" alt="yes"/> | Income loss from confirmed community reports |
| <img src="https://img.shields.io/badge/-Not%20Covered-F44336?style=flat-square" alt="no"/> | Health, accidents, vehicle damage, life |

</td>
</tr>
</table>

---

## Live Demo

GigShield is fully deployed and accessible:

| Portal | URL | Description |
|--------|-----|-------------|
| **Main App** | [gigshield.in](https://gigshield.in) | Worker registration, policy purchase, claims, community reports |
| **Admin Panel** | [gigshield.in/admin/login](https://gigshield.in/admin/login) | Live Ops feed, fraud review, user mgmt, AI insights |
| **Anti-Spoofing Demo** | [gigshield.in/demo](https://gigshield.in/demo) | 3 simulation scenarios (legitimate, GPS spoofing, ring fraud) |

**Credentials:**
- Admin: `admin@gigshield.in` / `admin123`
- Worker: any Indian mobile number — real Twilio Verify OTP delivered to your phone

---

## Why Q-Commerce?

We chose **Blinkit / Zepto / Instamart delivery partners** because they're the most vulnerable segment:

<table>
<tr>
<td align="center" width="25%">
<img src="https://img.shields.io/badge/-10--30%20min-2196F3?style=for-the-badge" alt=""/>
<br/><b>Fast Windows</b><br/>
<small>Even 30 min of rain = zero deliveries</small>
</td>
<td align="center" width="25%">
<img src="https://img.shields.io/badge/-2--5%20km-9C27B0?style=for-the-badge" alt=""/>
<br/><b>Hyperlocal</b><br/>
<small>Zone-level precision enables fair triggers</small>
</td>
<td align="center" width="25%">
<img src="https://img.shields.io/badge/-100%25%20Outdoor-FF9800?style=for-the-badge" alt=""/>
<br/><b>Outdoor Work</b><br/>
<small>Zero shelter from weather or AQI</small>
</td>
<td align="center" width="25%">
<img src="https://img.shields.io/badge/-Weekly%20Pay-4CAF50?style=for-the-badge" alt=""/>
<br/><b>Weekly Payouts</b><br/>
<small>Matches our weekly premium cadence</small>
</td>
</tr>
</table>

---

## 5,500+ Real Dark Stores

GigShield uses **real dark-store locations** scraped from Blinkit, Zepto and Swiggy Instamart public coverage data. Stores are seeded into PostgreSQL and selected on a Google Maps interface with platform-specific logo markers.

| Platform | Approximate Coverage |
|----------|----------------------|
| **Zepto** | ~4,900 stores |
| **Blinkit** | ~550 stores |
| **Swiggy Instamart** | ~130 stores |
| **Total** | **~5,580 geo-fenced stores** |

Each store is tagged with city, zone, latitude, longitude, and platform. Workers pick their assigned dark store during registration; our zone inference derives their work area from that selection.

---

## Real Scenarios

<details>
<summary><b>Scenario 1 — Mumbai Monsoon Flooding (parametric, 3-minute payout)</b></summary>

**Worker:** Ravi, Blinkit, Andheri
**Event:** Rainfall > 65 mm/hr, waterlogging for 8 hours

```
12:00 PM  Open-Meteo detects 72 mm/hr rainfall in Andheri
12:00 PM  Trigger Monitor creates Disruption Event
12:01 PM  Claims Engine finds Ravi's active policy
12:01 PM  Auto-claim created (₹320 = 8 hrs × ₹40/hr)
12:01 PM  BAS fraud score = 0.08 (clean)
12:02 PM  Claim approved
12:03 PM  Razorpay Orders API called → order_NlfxZyX0123abc
12:03 PM  ₹320 sent, UTR 420691337245
Worker sees confetti + "🎉 ₹320 received! Waterlogging" toast in their PWA.
```
**Total time: 3 minutes. Zero manual steps.**
</details>

<details>
<summary><b>Scenario 2 — Delhi Extreme Heat</b></summary>

**Worker:** Priya, Zepto, Gurugram
**Event:** Temperature > 45°C, platform restricts deliveries for 6 hours

GigShield detects temperature breach via Open-Meteo → identifies all Gurugram workers with active policies → auto-processes claims → GPT-4.1 generates risk narrative → payouts within minutes.
</details>

<details>
<summary><b>Scenario 3 — Kolkata Bandh (admin-triggered)</b></summary>

**Worker:** Amit, Blinkit, Salt Lake
**Event:** Unplanned curfew, 12-hour delivery halt

Admin triggers Social Disruption event from admin panel → auto-creates claims for all Salt Lake workers → BAS validation → all workers compensated automatically via UPI mock or Razorpay, depending on their VPA suffix.
</details>

<details>
<summary><b>Scenario 4 — Anti-Spoofing Demo: GPS Spoofing Caught</b></summary>

**Attacker:** Fake worker at home, spoofing GPS to flood zone

```
Visit gigshield.in/demo → Select "GPS Spoofing" scenario
BAS engine fires:
  - GPS_JITTER_OUTLIER: accuracy 1 m (impossibly perfect)
  - IMPOSSIBLE_TRAVEL: 15 km in 2 min
  - DEVICE_FINGERPRINT_REUSE: hash matches flagged account
  - ZONE_MISMATCH: claim outside insured zone
BAS composite score = 0.84 → REJECTED
GPT-4.1 drafts narrative: "Claim shows IMPOSSIBLE_TRAVEL of 450 km/h
between pings. Device fingerprint reused from previously flagged
account wr_abc123. Recommend REJECT."
```
</details>

<details>
<summary><b>Scenario 5 — Ring Fraud Detection (the boring attack)</b></summary>

**Attackers:** 5 accounts sharing one device fingerprint

```
Visit gigshield.in/demo → Select "Ring Fraud" scenario
BAS engine fires on the CLUSTER, not the individual:
  - DEVICE_FINGERPRINT_REUSE: 5 workers, 1 fingerprint
  - CLAIM_BURST_RATE: 5 claims in 27 seconds
  - IP_ASN_SHARING: same /24 subnet
  - PATTERN_SIMILARITY: cosine sim 0.97 across trails
All 5 claims → UNDER_REVIEW, cluster surfaced to Fraud Review panel
GPT-4.1 summary: "Coordinated ring fraud — 5 accounts, 1 device, 1 IP.
Recommend account suspension + KYC re-verification."
```
</details>

---

## How It Works

### Worker Journey

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  OTP Login  │───▶│  Select     │───▶│   Choose    │───▶│    Pay      │
│  (Twilio)   │    │  Dark Store │    │  Coverage   │    │  ₹29-199   │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
                   (Google Maps)      (3 Tiers)           (UPI / Razorpay / Stripe)
                                                                  │
┌─────────────┐    ┌─────────────┐    ┌─────────────┐             │
│  Celebration│◀───│   Fraud     │◀───│   Auto      │◀────────────┘
│ 🎉 Toast+UTR│    │ Check (BAS) │    │   Claim     │   [Disruption]
└─────────────┘    └─────────────┘    └─────────────┘
```

### Weekly Cycle

| Day | What Happens |
|-----|--------------|
| **Monday 00:00** | Coverage period starts |
| **Mon-Sun** | Trigger Monitor polls weather/AQI every 15 minutes |
| **[Disruption]** | Auto-claim → BAS fraud check → Razorpay payout (< 10 min) |
| **Sunday 23:59** | Coverage period ends |
| **Next Monday** | Risk recalculated, new premium, auto-renewal |

---

## Architecture

### System Overview (as deployed at gigshield.in)

```
                       Cloudflare (SSL, WAF, DDoS)
                                │
                  ┌─────────────┴─────────────┐
                  │  Hostinger VPS (Ubuntu)   │
                  │  ┌──────────────────────┐ │
                  │  │ Nginx :443 (reverse) │ │
                  │  └──────────┬───────────┘ │
                  │  ┌──────────┴───────────┐ │
                  │  │ gigshield-app        │─┼── api.razorpay.com/v1/orders
                  │  │ Node 20 + Express    │ │── Twilio Verify
                  │  │ (multi-stage Docker) │ │── OpenAI GPT-4.1
                  │  └─┬──────────┬─────────┘ │── AQICN
                  │    │          │           │── Open-Meteo
                  │    ▼          ▼           │── Google Maps JS
                  │  Postgres   Redis         │
                  │  (9 migs)   (cache+SSE)   │
                  └───────────────────────────┘
```

### Detailed System Graph

```mermaid
graph TB
    subgraph Client["Client Layer (React 19 PWA, 11 languages)"]
        WP["Worker Portal"]
        AP["Admin Portal (Live Ops)"]
        DM["Demo Page"]
        CM["Coverage Map"]
        CR["Community Report Modal"]
    end

    subgraph Gateway["Express 4 API"]
        GW["JWT Auth / Zod Validation / Routes"]
        SSE["SSE /api/admin/events/stream"]
    end

    subgraph Core["15 Backend Services"]
        AS["Auth (Twilio OTP + JWT)"]
        WS["Worker"]
        PS["Policy"]
        TM["Trigger Monitor (15 min cron)"]
        CE["Claim"]
        FD["Fraud (BAS)"]
        SP["Anti-Spoofing"]
        PO["Payout Router"]
        SY["Synthetic"]
        AU["Audit Chain"]
        LK["Linkage"]
        AC["Actuarial"]
        RI["Risk"]
        CO["Community"]
        EV["Events Emitter"]
    end

    subgraph AI["AI Layer"]
        GPT["OpenAI GPT-4.1 (Redis-cached)"]
    end

    subgraph Pay["Payment Gateways"]
        RZP["Razorpay Orders API (REAL)"]
        UPI["UPI Mock"]
        STR["Stripe Mock"]
    end

    subgraph External["External APIs"]
        WA["Open-Meteo (Weather)"]
        AQ["AQICN (Air Quality)"]
        TW["Twilio Verify (OTP)"]
        GM["Google Maps API"]
    end

    subgraph Data["Data Layer"]
        DB[("PostgreSQL 16 — 9 migrations")]
        CACHE[("Redis 7 — AI + weather cache")]
    end

    WP & AP & DM & CM & CR --> GW
    AP -.SSE.-> SSE
    GW --> AS & WS & PS & CE & AU & CO & EV
    AS --> TW
    WS --> GM
    PS --> CE
    TM --> CE --> FD --> SP --> PO
    PO --> RZP & UPI & STR
    TM --> WA & AQ
    FD --> GPT
    CO --> TM
    Core --> DB & CACHE
    EV -.events.-> SSE
```

### Claim Flow

```mermaid
sequenceDiagram
    participant OM as Open-Meteo / AQICN / Community
    participant TM as Trigger Monitor
    participant CE as Claim Service
    participant FD as Fraud (BAS)
    participant GPT as GPT-4.1
    participant PO as Payout Router
    participant RZP as Razorpay Orders API
    participant W as Worker PWA
    participant SSE as Live Ops SSE

    loop Every 15 min
        TM->>OM: Poll weather, AQI, unverified community cluster
    end

    OM-->>TM: Threshold breached
    TM->>CE: Create Disruption Event
    CE->>SSE: emit TRIGGER_FIRED
    CE->>FD: Validate claim (11-signal BAS)

    alt BAS < 0.30
        FD-->>CE: Approved
        CE->>SSE: emit CLAIM_CREATED
        CE->>PO: Route by VPA suffix
        PO->>RZP: POST /v1/orders
        RZP-->>PO: order_XXXXXXXXXXXXXX
        PO->>SSE: emit PAYOUT_SENT
        PO->>W: Confetti + "🎉 ₹X received" toast (via polling)
    else BAS >= 0.30
        FD->>GPT: Generate fraud assessment
        GPT-->>FD: Narrative + recommendation
        FD-->>CE: UNDER_REVIEW
        CE->>SSE: emit FRAUD_CHECKED
    end
```

---

## The BAS Engine (Behavioral Anti-Spoofing)

BAS is an 11-signal weighted fusion model. Each signal `f_j(c) ∈ [0, 1]` measures how fraud-like a single dimension of the claim looks.

```
BAS(c) = Σ w_j · f_j(c),     Σ w_j = 1
```

| # | Signal | Weight | What it catches |
|---|---|---|---|
| 1 | `IMPOSSIBLE_TRAVEL` | 0.18 | Haversine distance ÷ Δt > 120 km/h |
| 2 | `DEVICE_FINGERPRINT_REUSE` | 0.15 | Same fingerprint across ≥ 3 worker IDs |
| 3 | `VPA_COLLISION` | 0.12 | Same UPI VPA on ≥ 2 profiles |
| 4 | `CLAIM_BURST_RATE` | 0.10 | > 3 claims in rolling 24 h window |
| 5 | `GPS_JITTER_OUTLIER` | 0.10 | Std-dev of lat/lng anomalous vs. historical |
| 6 | `ZONE_MISMATCH` | 0.09 | Claim location outside policy's insured zones |
| 7 | `TIMESTAMP_ANOMALY` | 0.08 | Client clock skew > 5 min from server UTC |
| 8 | `IP_ASN_SHARING` | 0.07 | ≥ 5 workers on one ASN within 1 h |
| 9 | `NEW_ACCOUNT_VELOCITY` | 0.05 | Account < 72 h old with ≥ 2 claims |
| 10 | `PAYOUT_ACCOUNT_CHURN` | 0.04 | Beneficiary VPA changed in last 7 d |
| 11 | `PATTERN_SIMILARITY` | 0.02 | Cosine similarity to known fraud ring |

**Routing rule:**

```
BAS < 0.30  AND source = AUTO     → APPROVED   (Razorpay fires)
0.30 ≤ BAS < 0.70 OR source=MANUAL → UNDER_REVIEW (GPT-4.1 drafts assessment)
BAS ≥ 0.70                         → REJECTED
```

Manual (worker-submitted) claims *always* route to `UNDER_REVIEW` regardless of score, so a human verifies every non-parametric payout. Hardened ring-fraud detection lives in migration `008_ring_fraud_hardening.ts`.

---

## Parametric Triggers

We monitor **5 automated triggers** — when thresholds are crossed, claims fire automatically:

| # | Trigger | Threshold | Source | Why It Matters |
|---|---------|-----------|--------|----------------|
| 1 | **Extreme Heat** | > 45°C | Open-Meteo | Platforms restrict outdoor work |
| 2 | **Heavy Rain** | > 65 mm/hr | Open-Meteo | Waterlogging stops deliveries |
| 3 | **Flooding** | IMD Alert Level | Open-Meteo + Community | Zones become inaccessible |
| 4 | **Severe Pollution** | AQI > 400 | AQICN | Health advisories issued |
| 5 | **Social Disruption** | Curfew/Strike | Admin Manual Trigger | Complete delivery halt |

**How we ensure accuracy:**
- Cron polls weather + AQI every 15 minutes
- Open-Meteo (free, no API key) for weather
- AQICN for air quality
- Redis cache with 30-min TTL for failover
- Community cluster check runs on every new report
- Every API response logged for audit trail

---

## Payment Gateways

GigShield ships **three payment paths**, routed by the beneficiary's VPA suffix:

```
beneficiary VPA                  gateway chosen
────────────────────────────────────────────────
*@paytm                      →   Razorpay Orders API  (REAL)
*@upi, *@ybl, *@okhdfcbank   →   UPI gateway (mock, Razorpay-compatible shape)
card / anything@stripe       →   Stripe (mock)
*@oksbi, *@ibl               →   UPI gateway (mock)
fallback                     →   Razorpay Orders API  (REAL)
```

### Razorpay — real API, real order IDs

When both `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` are set, the Razorpay gateway fires a genuine:

```
POST https://api.razorpay.com/v1/orders
Authorization: Basic base64(key_id:key_secret)
```

Razorpay returns a real `order_XXXXXXXXXXXXXX` ID which we persist as the payout's `transaction_ref`. A judge can plug that ID into the Razorpay test dashboard and see the order appear — proving we're not faking the integration.

Any failure (network, 401, 429, Razorpay downtime) **silently falls through to the mock path** — so a flaky demo Wi-Fi never kills the show.

**Why Orders API, not Payouts?**
- RazorpayX Payouts requires account activation which test accounts don't get.
- Orders API is available on every Razorpay account from day one.
- A genuine `order_XXX` still satisfies the "prove your integration is real" bar; settlement is modeled out-of-band with a realistic 1.8–3.2 s delay.

Every accepted payout stores the full real Razorpay payload under `gateway_response.raw_response`, plus GigShield-side metadata under a namespaced `_gigshield` key including a clickable `dashboard_url` to the order in Razorpay's dashboard.

---

## AI Integration

### OpenAI GPT-4.1 — three use cases

GigShield uses **OpenAI GPT-4.1** for the intelligence layer — no Python microservice, everything runs in TypeScript/Node.js via the official `openai` SDK.

| Function | File | Purpose | Cache |
|---|---|---|---|
| `generateRiskNarrative(worker, riskScore)` | `external/openai.client.ts` | Human-readable explanation of why a worker's zone is rated Low/Med/High/Critical | Redis, 1 h TTL |
| `generateClaimAssessment(claim, basDetails)` | `external/openai.client.ts` | Admin-facing fraud reasoning with BAS-flag citations | Per-claim |
| `generateFraudSummary(recentClaims)` | `external/openai.client.ts` | Admin dashboard "AI Insights" card summarising recent fraud patterns | Redis, 10 min TTL |

### Risk Engine

Calculates fair premiums using hyperlocal data:

<table>
<tr>
<td width="50%">

**Input Features**
- Delivery zone flood / weather history
- Dark store proximity to risk zones
- Historical AQI patterns
- Strike / curfew frequency
- 7-day Open-Meteo forecast
- Worker's `avg_hours_per_day`
- Community report density

</td>
<td width="50%">

**Output**

| Risk Tier | Score | Premium Impact |
|-----------|-------|----------------|
| Low | 1-25 | Lowest |
| Medium | 26-50 | Moderate |
| High | 51-75 | Higher |
| Critical | 76-100 | Highest |

</td>
</tr>
</table>

---

## Multi-Language

**11 Indian languages**, persisted to `localStorage`, auto-detected from device locale on first load, switchable from a globe icon in every page header.

| Language | Script | Code |
|---|---|---|
| English | Latin | `en` |
| हिन्दी | Devanagari | `hi` |
| தமிழ் | Tamil | `ta` |
| తెలుగు | Telugu | `te` |
| বাংলা | Bengali | `bn` |
| मराठी | Devanagari | `mr` |
| ಕನ್ನಡ | Kannada | `kn` |
| ગુજરાતી | Gujarati | `gu` |
| ਪੰਜਾਬੀ | Gurmukhi | `pa` |
| മലയാളം | Malayalam | `ml` |
| ଓଡ଼ିଆ | Odia | `or` |

Under the hood: `i18next` + `react-i18next` + `i18next-browser-languagedetector`. Locale JSONs live in `packages/frontend/src/i18n/locales/` with ~40 keys each covering Welcome, Login, Dashboard, Profile and all CTAs.

---

## Live Ops War Room

The admin panel streams operational events in real time via **Server-Sent Events**. The feed updates within ~800 ms of any back-end event firing.

**Endpoint:** `GET /api/admin/events/stream` (admin-authenticated)

**Typed events:**
- `TRIGGER_FIRED` — new disruption detected (red chip)
- `CLAIM_CREATED` — auto-claim generated (amber chip)
- `FRAUD_CHECKED` — BAS score computed (orange chip)
- `PAYOUT_SENT` — Razorpay/UPI/Stripe accepted (green chip)
- `WORKER_REGISTERED` — new rider onboarded (blue chip)
- `POLICY_CREATED` — coverage purchased (purple chip)

**Implementation highlights:**
- Node `EventEmitter` singleton in `services/events.service.ts`
- Each service emits at the right moment (e.g. `claim.service.ts` emits `CLAIM_CREATED` inside `processDisruptionEvent`)
- 30-second heartbeat frame keeps the TCP session alive through Cloudflare's idle-connection timeout
- Frontend `hooks/useEventStream.ts` auto-reconnects with exponential backoff
- Animated ticker in `components/LiveOpsFeed.tsx` — new entries slide in from top with a subtle fade
- Live payout counter animates upward whenever `PAYOUT_SENT` arrives

---

## Community Hyperlocal Reports

Weather APIs lag by 15–30 minutes. A rider standing in ankle-deep water **knows** before Open-Meteo does. We turn that into a feedback loop:

1. Worker taps "Report Condition" → picks one of (Heavy Rain / Flood / Extreme Heat / Pollution / Strike) → severity slider → current GPS auto-captured → submit.
2. `community.service.checkCluster()` looks for ≥ 2 other reports within a **2 km radius** and **15 minute window** for the same condition.
3. On cluster detected → a provisional `DisruptionEvent` is created with `source = 'community'` — claims for affected workers begin processing immediately.
4. When Open-Meteo / AQICN later confirms the same event, `boostTrustOnApiConfirm()` awards every original reporter a **+50 Trust Score**.

**Database:** migration `005_community_reports.ts` — `community_reports` table (id, worker_id, lat, lng, condition_type, severity, notes, created_at, verified, disruption_event_id) + `trust_score` column on workers.

**Admin surface:** `GET /api/admin/community/pending` returns unverified clusters for review.

Honest reporting is rewarded; the system gets more accurate over time. *No other team in our cohort ships this.*

---

## Adversarial Defense & Anti-Spoofing Strategy

> **The Threat:** A coordinated syndicate of 500 delivery workers using GPS-spoofing apps to fake locations in red-alert weather zones, triggering mass false payouts while sitting safely at home.

Simple GPS verification is **not enough**. GigShield's anti-spoofing system is **fully implemented** and live.

### 1. Differentiation: Genuine vs. Spoofer

A real worker caught in a disruption leaves a behavioral fingerprint that is extremely hard to forge:

| Signal | Genuine Worker | Spoofer |
|--------|----------------|---------|
| Location history | Continuous trail near dark store | Sudden "teleport" to affected zone |
| Movement pattern | Gradual slowdown as weather worsens | Static or perfect grid movement |
| GPS accuracy | 5-50 m (normal phones) | < 3 m or > 500 m (spoofing artifacts) |
| Device fingerprint | Single consistent device | Shared with other flagged accounts |
| Historical behavior | Regular deliveries in that zone | Never worked there before |
| IP / ASN | Changes with movement | Static home IP |

### 2. Ring Fraud Detection

Fraud rings leave *network-level* patterns that per-individual analysis misses:

| Detection Layer | What We Analyze | Red Flags |
|---|---|---|
| Temporal clustering | Claim submission timestamps | 50+ claims within 2-min window in same zone |
| Device fingerprinting | Browser fingerprints per account | Multiple "workers" sharing one fingerprint |
| IP / ASN sharing | Claim source IPs | ≥ 5 workers on one ASN within 1 h |
| Behavioral similarity | Movement trail cosine similarity | Statistically improbable similarity |
| Geographic impossibility | Claimed locations vs. zone capacity | More claimants than registered workers |

### 3. Tiered Processing — fair to honest workers

| Tier | BAS Score | Action | Worker Experience |
|------|-----------|--------|-------------------|
| Green | < 0.30 | Auto-approve | Instant Razorpay payout + confetti |
| Amber | 0.30 – 0.69 | UNDER_REVIEW | "We're reviewing your claim" |
| Red | ≥ 0.70 | Reject | GPT-4.1 drafts explanation for admin |

**Philosophy:** We'd rather pay 5% of fraudulent claims than deny 1% of legitimate ones. The reputational cost of rejecting a genuine stranded worker is higher than the financial cost of occasional fraud leakage.

---

## Features

### Worker Portal

| Feature | Status | Description |
|---------|--------|-------------|
| **OTP Login** | Live | Twilio Verify — real SMS OTP to any Indian mobile number |
| **11 Indian Languages** | Live | Globe switcher in header, auto-detect + `localStorage` persist |
| **GPS Detection** | Live | Browser geolocation with accuracy tracking |
| **Dark Store Selection** | Live | Google Maps with ~5,580 real stores (platform logos) |
| **Risk Score + Narrative** | Live | GPT-4.1 explains why the zone is rated |
| **3-Tier Coverage** | Live | Basic (40%) / Standard (60%) / Premium (80%) |
| **Real Payment Options** | Live | Razorpay real API / UPI mock / Stripe mock, routed by VPA |
| **PDF Policy** | Live | Generated via jsPDF on-device |
| **Manual Claim** | Live | Worker-initiated → UNDER_REVIEW + admin routing |
| **Community Report** | Live | Report conditions → cluster detection → +50 Trust Score on confirm |
| **Trust Score** | Live | 0-100 score on Profile page with explanation |
| **Live Location Trail** | Live | Real-time GPS on Coverage Map |
| **Payout Celebration** | Live | `canvas-confetti` + `sonner` toast with UTR number |
| **Demo Mode** | Live | Explore without real OTP |

### Admin Portal

| Feature | Status | Description |
|---------|--------|-------------|
| **Live Ops War Room** | Live | SSE feed of all system events with animated ticker |
| **Hero Stats Dashboard** | Live | 8 KPIs: workers, policies, claims, payouts, fraud rate, avg BAS, etc. |
| **AI Insights Card** | Live | GPT-4.1-generated fraud pattern summary (refreshable) |
| **Regional Heatmap** | Live | Google Maps heatmap of claim density by zone |
| **Fraud Review** | Live | 11-signal BAS breakdown + GPT-4.1 assessment per claim |
| **User Management** | Live | View all workers, drill into details, soft-delete |
| **Manual Trigger** | Live | Admin-triggered disruption events |
| **Actuarial Dashboard** | Live | Loss ratios, burn-rate, per-zone actuarial tables |
| **Audit Chain** | Live | Hash-chained audit log (migration 006) |
| **Community Queue** | Live | Unverified community clusters for admin review |

### Platform

| Feature | Status | Description |
|---------|--------|-------------|
| **PWA** | Live | Installable, offline fallback, service worker |
| **Dark/Light Theme** | Live | System-aware theme toggle |
| **Responsive** | Live | Mobile-first, works on all devices |
| **Docker Deployment** | Live | Multi-stage production build on Hostinger + Cloudflare |
| **Error Boundaries** | Live | Friendly fallback UI instead of blank screens |
| **Skeleton Loaders** | Live | Shimmering placeholders during loads |

---

## Data Model

```mermaid
erDiagram
    Worker ||--o{ Policy : purchases
    Worker ||--o{ Claim : has
    Worker ||--o{ LocationPing : "tracked via"
    Worker ||--o{ CommunityReport : submits
    Worker }o--|| Zone : "works in"
    Worker }o--|| Store : "assigned to"
    Store }o--|| Zone : "located in"
    Policy ||--o{ Claim : covers
    Claim ||--o| Payout : triggers
    Claim }o--|| DisruptionEvent : "caused by"
    Claim ||--o| FraudCheck : "validated by"
    CommunityReport }o--o| DisruptionEvent : "may create"
    DisruptionEvent }o--|| Zone : affects
    FraudCheck ||--|| BASScore : "computes"
    Payout ||--|| GatewayResponse : "stores"
```

**Key Entities:**
- **Worker** — profile, risk score, Trust Score, device fingerprint, IP logs, preferred language
- **Policy** — weekly coverage, premium, tier, auto-renew, insured zones
- **Store** — ~5,580 real dark stores with platform, city, zone, coordinates
- **Zone** — delivery zone with city grouping (PostGIS polygons)
- **DisruptionEvent** — type, severity, affected zone, weather/community source
- **Claim** — auto or manual, BAS score, payout amount, status, gateway chosen
- **FraudCheck** — 11-signal BAS breakdown, GPT-4.1 assessment
- **Payout** — full lifecycle (initiated → processing → settled/failed) with UTR, fee, tax, raw gateway response (migration 009)
- **CommunityReport** — lat/lng, condition, severity, verified flag, disruption_event_id
- **LocationPing** — GPS coordinates, accuracy, IP address, timestamp

---

## Tech Stack

<p>
  <img src="https://img.shields.io/badge/React_19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React"/>
  <img src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript"/>
  <img src="https://img.shields.io/badge/Tailwind-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white" alt="Tailwind"/>
  <img src="https://img.shields.io/badge/i18next-26A69A?style=for-the-badge&logo=i18next&logoColor=white" alt="i18next"/>
  <img src="https://img.shields.io/badge/Node.js_20-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js"/>
  <img src="https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white" alt="Express"/>
  <img src="https://img.shields.io/badge/PostgreSQL_16-316192?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL"/>
  <img src="https://img.shields.io/badge/Redis_7-DC382D?style=for-the-badge&logo=redis&logoColor=white" alt="Redis"/>
  <img src="https://img.shields.io/badge/Razorpay-3395FF?style=for-the-badge&logo=razorpay&logoColor=white" alt="Razorpay"/>
  <img src="https://img.shields.io/badge/OpenAI_GPT--4.1-412991?style=for-the-badge&logo=openai&logoColor=white" alt="OpenAI"/>
  <img src="https://img.shields.io/badge/Google_Maps-4285F4?style=for-the-badge&logo=googlemaps&logoColor=white" alt="Google Maps"/>
  <img src="https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker"/>
  <img src="https://img.shields.io/badge/Hostinger-673DE6?style=for-the-badge&logo=hostinger&logoColor=white" alt="Hostinger"/>
  <img src="https://img.shields.io/badge/Cloudflare-F38020?style=for-the-badge&logo=cloudflare&logoColor=white" alt="Cloudflare"/>
</p>

### Frontend — React 19 PWA

| Technology | Role |
|------------|------|
| **React 19** + **TypeScript** | UI framework, strict typing across boundary |
| **Vite** | Dev server + build (instant HMR) |
| **Tailwind CSS v4** | Utility-first styling |
| **Zustand** | Lightweight state (auth, theme, live events) |
| **i18next + react-i18next** | 11-language i18n with browser detection |
| **@react-google-maps/api** | Map UI for store pick + heatmap |
| **sonner** | Toast notifications |
| **canvas-confetti** | Payout celebration |
| **react-countup** | Animated hero stats |
| **jsPDF** | Client-side policy PDF |

### Backend — Node.js 20 + Express 4

| Technology | Role |
|------------|------|
| **Express 4** | HTTP framework with Helmet, CORS, rate-limit |
| **Knex** | Migrations (9) + query builder |
| **PostgreSQL 16** | Primary store (PostGIS zones, 9 migrations) |
| **Redis 7** | Weather + AQI + AI cache (30 min – 1 h TTL); SSE pub-sub |
| **JWT** + **Twilio Verify** | Auth flow |
| **Zod** | Env + input validation |
| **node-cron** | 15-min trigger monitor + community cluster sweep |
| **OpenAI SDK** | GPT-4.1 client in `external/openai.client.ts` |
| **Pino** | Structured logging |

**Key API Routes:**
- `POST /api/auth/request-otp`, `POST /api/auth/verify-otp`
- `GET /api/stores`, `POST /api/policy/purchase`
- `POST /api/claims/request`, `POST /api/community/report`
- `GET /api/public/stats` (unauthenticated hero stats)
- `GET /api/admin/events/stream` (SSE)
- `GET /api/admin/stats`, `GET /api/admin/ai-insights`
- `GET /api/admin/fraud-review`, `GET /api/admin/workers`, `DELETE /api/admin/workers/:id`
- `POST /api/trigger/check` (admin manual disruption)
- `POST /api/demo/simulate` (3 anti-spoofing scenarios)

### Database Migrations (9 total)

```
001_initial_schema.ts            — workers, policies, claims, zones, stores
002_darkstore_realdata.ts        — platform enum, seed prep for 5,580 stores
003_claims_manual.ts             — manual-source claims + UNDER_REVIEW status
004_location_ip.ts               — IP address on every LocationPing
005_community_reports.ts         — community_reports + trust_score column
006_rbac_and_audit_chain.ts      — hash-chained audit log + role-based access
007_refresh_tokens.ts            — JWT refresh flow
008_ring_fraud_hardening.ts      — device fingerprint + ASN indexing for clusters
009_payout_lifecycle.ts          — gateway, UTR, fee, tax, raw response, state machine
```

### External Integrations

| Service | Purpose | Cost | Polling |
|---------|---------|------|---------|
| **Open-Meteo** | Temperature, rainfall, humidity, wind per zone | Free | 15 min |
| **AQICN** | Air Quality Index per city/zone | Free tier | 15 min |
| **Twilio Verify** | SMS OTP | Pay-per-use | On login |
| **Razorpay Orders API** | **Real** payout reference IDs | Test-mode free | On approval |
| **Google Maps API** | Store map, coverage heatmap, location trail | Pay-per-use | On demand |
| **OpenAI GPT-4.1** | Risk narrative, claim assessment, fraud summary | Pay-per-use | On claim / dashboard |

### Deployment

| Layer | Technology |
|-------|------------|
| **Compute** | Hostinger VPS (Ubuntu 22.04) |
| **Container runtime** | Docker + Docker Compose (production profile) |
| **Build** | Multi-stage `Dockerfile` — Vite frontend + tsc backend, final image < 300 MB |
| **Reverse proxy** | Nginx (TLS termination behind Cloudflare, SPA fallback, `/api` upstream) |
| **DNS / CDN / SSL** | Cloudflare (full-strict, WAF + DDoS) |
| **Data** | Postgres 16 + Redis 7 containers with named volumes |
| **Secrets** | `.env` injected via Docker Compose `environment:` block |
| **Zero-downtime deploy** | `docker compose up -d --force-recreate --no-deps app` |

---

## Repository Structure

```
Devtrails/
├── README.md                     # This file
├── docs/
│   └── pitch-deck/               # Phase 3 pitch deck (HTML + PPTX)
├── package.json                  # Monorepo root (npm workspaces)
├── docker-compose.yml            # Dev: PostgreSQL 16 + Redis 7
├── docker-compose.prod.yml       # Production (Hostinger)
├── Dockerfile                    # Multi-stage production build
├── nginx.conf                    # Reverse proxy config
├── .env.example                  # Environment variable template
│
├── prototype/                    # Phase 1 static prototype
│   ├── index.html
│   ├── app.js
│   ├── manifest.json
│   └── sw.js
│
├── packages/
│   ├── shared/                   # @gigshield/shared
│   │   └── src/
│   │       ├── types/            # Worker, Policy, Claim, Fraud, Payout, Zone, Store
│   │       ├── constants/        # Trigger thresholds, coverage tiers, BAS weights
│   │       └── utils/            # Premium calc, geo (haversine, entropy)
│   │
│   ├── backend/                  # Express 4 API server
│   │   └── src/
│   │       ├── config/           # DB, Redis, env (Zod validated)
│   │       ├── db/               # Knex migrations (9) + seeds (4)
│   │       ├── services/         # 15 services (auth, worker, policy, claim, fraud,
│   │       │                     # antispoofing, trigger, payout, synthetic, audit,
│   │       │                     # linkage, actuarial, risk, community, events)
│   │       ├── routes/           # auth, worker, policy, claim, trigger, admin,
│   │       │                     # geo, stores, demo, events, public, community
│   │       ├── external/         # Twilio, Open-Meteo, AQICN, OpenAI,
│   │       │   └── payments/     #   Razorpay (real), UPI (mock), Stripe (mock)
│   │       └── middleware/       # JWT auth, validation, error handler
│   │
│   └── frontend/                 # React 19 PWA
│       └── src/
│           ├── api/              # Axios client with all API namespaces
│           ├── components/       # LiveOpsFeed, HeroStats, LanguageSwitcher,
│           │                     # ReportConditionModal, SendPayoutModal,
│           │                     # CoverageMap, BASBreakdown, ErrorBoundary, Skeleton
│           ├── hooks/            # useEventStream (SSE), useGeolocation, useTheme
│           ├── i18n/             # index.ts + 11 locale JSONs
│           ├── pages/            # Welcome, Login, Register, Dashboard, Claims,
│           │   │                 # Profile, Demo, CoverageSelection
│           │   └── admin/        # AdminLogin, AdminDashboard, AdminUsers,
│           │                     # AdminClaims, FraudReview, Actuarial
│           └── store/            # Zustand state management
```

---

## Quick Start

### Prerequisites

- **Docker** and **Docker Compose**
- **Node.js 20+**
- API keys: Twilio, AQICN, OpenAI, Google Maps, (optional) Razorpay test keys

### Local setup

```bash
# Clone
git clone https://github.com/uroy80/TeamVoid-Guidewire-Devtrails.git
cd TeamVoid-Guidewire-Devtrails

# Start Postgres 16 + Redis 7
docker compose up -d

# Install all workspaces
npm install

# Configure environment
cp .env.example .env
# Edit .env — fill in the keys (see below)

# Build shared package first
npm run build --workspace=packages/shared

# Run 9 migrations + 4 seeds (loads ~5,580 real dark stores)
npm run db:setup

# Run dev servers (two terminals)
npm run dev:backend    # Terminal 1 → http://localhost:3000
npm run dev:frontend   # Terminal 2 → http://localhost:5173
```

### Environment variables

```env
# Database
DATABASE_URL=postgres://gigshield:gigshield_dev@localhost:5432/gigshield

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your_jwt_secret

# Twilio (real OTP)
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
TWILIO_VERIFY_SID=your_verify_service_sid

# AQICN (air quality)
AQICN_API_KEY=your_aqicn_key

# OpenAI (GPT-4.1)
OPENAI_API_KEY=your_openai_key

# Google Maps (frontend)
VITE_GOOGLE_MAPS_KEY=your_google_maps_key

# Razorpay (test mode) — when BOTH set, real Orders API fires
RAZORPAY_KEY_ID=rzp_test_XXXXXXXXXXXXXX
RAZORPAY_KEY_SECRET=XXXXXXXXXXXXXXXXXXXXXXXX

# Admin
ADMIN_EMAIL=admin@gigshield.in
ADMIN_PASSWORD=admin123
```

### Production deploy (Hostinger)

```bash
# On the VPS
cd /root/gigshield
# edit .env or docker-compose.prod.yml environment: block
docker compose -f docker-compose.prod.yml up -d --force-recreate --no-deps app
```

### Phase 1 prototype

```bash
cd prototype
npx http-server -p 8080
open http://localhost:8080
```

---

## Development Roadmap

<table>
<tr>
<th width="33%"><img src="https://img.shields.io/badge/Phase%201-Complete-4CAF50?style=flat-square" alt=""/></th>
<th width="33%"><img src="https://img.shields.io/badge/Phase%202-Complete-4CAF50?style=flat-square" alt=""/></th>
<th width="33%"><img src="https://img.shields.io/badge/Phase%203-Submitted-F26522?style=flat-square" alt=""/></th>
</tr>
<tr>
<td valign="top">

**Ideation & Foundation**
*Mar 4 – Mar 20*

- [x] Persona research
- [x] Requirements doc
- [x] Premium model design
- [x] Trigger identification
- [x] Architecture design
- [x] Tech stack selection
- [x] Prototype (PWA)
- [x] Phase 1 video

</td>
<td valign="top">

**Full Product Build**
*Mar 21 – Apr 4*

- [x] Monorepo (npm workspaces)
- [x] Worker OTP login (Twilio)
- [x] ~5,580 real dark stores
- [x] Google Maps store selection
- [x] Dynamic premium calculation
- [x] 3-tier policy purchase + PDF
- [x] 5 parametric triggers (live)
- [x] BAS fraud detection
- [x] Anti-spoofing demo (3 scenarios)
- [x] GPT-4.1 integration
- [x] Admin dashboard
- [x] Manual trigger + auto-claims
- [x] Coverage map + location trail
- [x] Docker deployment
- [x] Cloudflare SSL + domain setup
- [x] Live at [gigshield.in](https://gigshield.in)

</td>
<td valign="top">

**Scale, Polish & Ship**
*Apr 5 – Apr 18*

- [x] **Real Razorpay Orders API**
- [x] VPA-suffix payment routing
- [x] SSE Live Ops War Room
- [x] Community hyperlocal reports
- [x] Trust Score system
- [x] 11 Indian languages (i18next)
- [x] Worker celebration (confetti + UTR toast)
- [x] Hero stats on Welcome
- [x] Payout lifecycle migration
- [x] Ring-fraud hardening migration
- [x] Hash-chained audit log
- [x] Error boundaries + skeletons
- [x] Phase 3 video
- [x] Phase 3 pitch deck

</td>
</tr>
</table>

---

## Correctness Guarantees

| # | Property | What It Means | Status |
|---|----------|---------------|--------|
| 1 | **No excluded coverage** | Health/accident/vehicle claims always rejected | Enforced |
| 2 | **Parametric integrity** | Every auto-claim backed by verified weather/AQI/community data | Enforced |
| 3 | **No duplicates** | One payout per worker per event per period | Enforced |
| 4 | **Fair pricing** | Same zone + tier + coverage = same premium | Enforced |
| 5 | **Bounded premiums** | Always ₹29-199/week | Enforced |
| 6 | **Bounded payouts** | Never exceeds coverage % of estimated income; ₹100 minimum floor | Enforced |
| 7 | **Fraud threshold** | BAS ≥ 0.30 routes to review; ≥ 0.70 rejects | Enforced |
| 8 | **Hash-chained audit trail** | Every state change logged with SHA-256 chain (mig 006) | Enforced |
| 9 | **IP + ASN logging** | Every location ping records IP + ASN | Enforced |
| 10 | **Device fingerprinting** | Cross-account fingerprint matching for rings | Enforced |
| 11 | **Graceful payment fallback** | Razorpay failure transparently falls to mock; demo never breaks | Enforced |
| 12 | **Manual claims require human** | Worker-submitted claims always `UNDER_REVIEW` regardless of BAS | Enforced |

---

## Platform Choice: PWA

**Progressive Web App** — the best of both worlds:

| Factor | PWA | Native | Plain Web |
|--------|-----|--------|-----------|
| Install to home screen | Yes | Yes | No |
| Offline | Service worker | Yes | No |
| Push notifications | Yes | Yes | No |
| App store required | No | Yes | No |
| Dev speed | Fast | Slow (iOS + Android) | Fast |
| Auto-updates | Instant | Store review | Instant |
| Storage footprint | < 5 MB | 30-80 MB | < 1 MB |

Delivery riders often have entry-level phones with constrained storage. 80 MB APKs hurt. A 2 MB PWA that works offline, installs to the home screen, and auto-updates was a one-way door for us.

---

<p align="center">
  <img src="prototype/logos/gigshield.png" alt="GigShield" width="40" height="40" style="border-radius:8px"/>
  <br/>
  <b>Built for Guidewire DEVTrails 2026 — Phase 3 Final Submission</b><br/>
  <b>Team Void</b><br/>
  <i>Protecting India's gig workers, one disruption at a time.</i>
</p>

<p align="center">
  <a href="https://gigshield.in"><img src="https://img.shields.io/badge/Live-gigshield.in-4CAF50?style=for-the-badge" alt=""/></a>
  <a href="https://youtu.be/bx8AVAU_amk"><img src="https://img.shields.io/badge/Video-YouTube-FF0000?style=for-the-badge" alt=""/></a>
  <a href="https://drive.google.com/drive/folders/11OMzlHfn8ZOcPxxRBEHwB0wbOdRAqKqe?usp=drive_link"><img src="https://img.shields.io/badge/Pitch%20Deck-Drive-4285F4?style=for-the-badge" alt=""/></a>
</p>
