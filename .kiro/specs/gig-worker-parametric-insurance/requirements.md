# Requirements Document

## Introduction

This document defines the requirements for GigShield — an AI-powered parametric insurance platform designed to protect India's Quick Commerce (Q-Commerce) delivery partners against income loss caused by external disruptions. The platform specifically targets delivery workers operating on ultra-fast delivery platforms such as Blinkit and Zepto, who fulfill 10-30 minute delivery windows for groceries and essentials in hyperlocal zones.

Q-Commerce delivery partners are uniquely vulnerable: their earnings depend on continuous availability in tight delivery windows, and even brief environmental or social disruptions can halt operations entirely, causing 20-30% monthly income loss. GigShield provides automated, zero-touch parametric coverage with weekly pricing aligned to gig worker payout cycles.

Coverage is strictly limited to loss of income due to environmental and social disruptions. Health, life, accident, and vehicle repair coverage are explicitly excluded. The platform incorporates AI-driven risk assessment, intelligent fraud detection, parametric event triggers with real-time monitoring, and instant simulated payouts via mock UPI/Razorpay gateways.

## Glossary

- **GigShield_Platform**: The overall parametric insurance web application comprising onboarding, policy management, claims, payouts, and analytics modules
- **Worker_Portal**: The Q-Commerce delivery partner-facing interface for registration, policy management, claim status, and earnings protection dashboard
- **Admin_Portal**: The insurer/administrator-facing interface for risk monitoring, fraud review, loss ratio analytics, and operational management
- **Onboarding_Service**: The module responsible for worker registration, identity verification, and Q-Commerce delivery profile capture
- **Risk_Engine**: The AI/ML module that performs dynamic risk profiling and weekly premium calculation based on worker location, delivery zone, historical disruption data, and environmental forecasts
- **Policy_Service**: The module that manages policy creation, renewal, and lifecycle with weekly pricing periods
- **Trigger_Monitor**: The real-time monitoring service that watches external data sources (weather APIs, pollution indices, government alerts, traffic data) for parametric event thresholds
- **Claims_Engine**: The module that automatically initiates, validates, and processes claims when parametric triggers fire
- **Fraud_Detector**: The AI module that performs anomaly detection, GPS validation, historical weather cross-verification, duplicate claim prevention, and GPS spoofing detection
- **Payout_Service**: The module that processes instant payouts to workers via simulated/mock payment gateways (Razorpay test mode, UPI simulators)
- **Analytics_Dashboard**: The visualization module providing metrics for both workers (earnings protected, active weekly coverage) and admins (loss ratios, predictive analytics, fraud rates)
- **Parametric_Trigger**: A predefined threshold condition on an external data source (e.g., rainfall > 65mm/hr, AQI > 400, temperature > 45°C) that automatically initiates a claim without manual filing
- **Coverage_Period**: A weekly time window (Monday 00:00 to Sunday 23:59 IST) representing one policy cycle
- **Disruption_Event**: An external event (environmental or social) that prevents a Q-Commerce delivery partner from earning income
- **Delivery_Zone**: A hyperlocal geographic area defined by pin code or geo-boundary where a Q-Commerce worker typically operates, typically a 2-5 km radius around a dark store
- **Weekly_Premium**: The insurance premium amount calculated per Coverage_Period based on the worker's risk profile
- **Income_Loss_Payout**: The compensation amount disbursed to a worker when a verified Disruption_Event occurs during an active Coverage_Period
- **Dark_Store**: A micro-warehouse or fulfillment center from which Q-Commerce platforms dispatch deliveries; workers operate within a radius of their assigned dark store
- **Delivery_Window**: The 10-30 minute fulfillment window characteristic of Q-Commerce operations
- **Q-Commerce_Platform**: Ultra-fast delivery platforms such as Blinkit and Zepto that the insured workers operate on

## Requirements

### Requirement 1: Q-Commerce Worker Onboarding

**User Story:** As a Q-Commerce delivery partner, I want to register on the platform quickly using my basic details and delivery profile, so that I can get income protection coverage without complex paperwork.

#### Acceptance Criteria

1. WHEN a worker initiates registration, THE Onboarding_Service SHALL present a streamlined registration form requesting: name, mobile number, Q-Commerce_Platform (Blinkit or Zepto), assigned Dark_Store location, primary Delivery_Zone (pin code), and average weekly delivery count.
2. WHEN a worker submits a valid registration form, THE Onboarding_Service SHALL send an OTP to the provided mobile number for verification.
3. WHEN a worker provides a valid OTP, THE Onboarding_Service SHALL create a verified worker profile and redirect the worker to the Worker_Portal.
4. IF a worker submits an invalid or expired OTP, THEN THE Onboarding_Service SHALL display an error message and allow up to 3 retry attempts.
5. IF a worker submits a registration form with missing required fields, THEN THE Onboarding_Service SHALL highlight the missing fields and display specific validation messages.
6. THE Onboarding_Service SHALL complete the entire registration flow within 5 steps or fewer.
7. THE Onboarding_Service SHALL present the coverage exclusions (health, life, accident, vehicle repair) to the worker during registration and require explicit acknowledgment before proceeding.

### Requirement 2: AI-Powered Risk Profiling

**User Story:** As the platform, I want to assess each Q-Commerce worker's risk profile using AI/ML models, so that premiums are fair and reflect actual disruption exposure in their hyperlocal delivery zone.

#### Acceptance Criteria

1. WHEN a worker completes onboarding, THE Risk_Engine SHALL generate an initial risk profile within 10 seconds using the worker's Delivery_Zone, Dark_Store location, Q-Commerce_Platform, and historical disruption data for that zone.
2. THE Risk_Engine SHALL incorporate the following hyper-local data sources for risk scoring: historical weather patterns (past 2 years), AQI trends, flood zone mapping, historical strike/curfew frequency, and traffic disruption patterns for the worker's Delivery_Zone.
3. THE Risk_Engine SHALL assign a risk score on a scale of 1 to 100, where 1 represents minimal disruption risk and 100 represents extreme disruption risk.
4. WHEN a new Coverage_Period begins, THE Risk_Engine SHALL recalculate the risk score incorporating the latest 7-day forecast data, recent disruption events, and seasonal risk patterns.
5. THE Risk_Engine SHALL classify workers into one of four risk tiers: Low (1-25), Medium (26-50), High (51-75), and Critical (76-100).
6. THE Risk_Engine SHALL weight Q-Commerce-specific factors including: dark store proximity to flood-prone areas, zone-level delivery halt frequency, and average disruption duration in the Delivery_Zone.

### Requirement 3: Dynamic Weekly Premium Calculation

**User Story:** As a Q-Commerce delivery partner, I want to see a fair weekly premium based on my actual risk exposure, so that I pay only for the protection I need.

#### Acceptance Criteria

1. WHEN the Risk_Engine produces a risk score for a worker, THE Policy_Service SHALL calculate a Weekly_Premium amount in Indian Rupees based on the risk tier, the worker's average weekly earnings estimate, and the selected coverage level.
2. THE Policy_Service SHALL offer three coverage levels: Basic (covers up to 40% of estimated weekly income loss), Standard (covers up to 60%), and Premium (covers up to 80%).
3. THE Policy_Service SHALL price Weekly_Premium within the range of ₹29 to ₹199 to remain affordable for Q-Commerce delivery partners.
4. WHEN a worker's risk score changes at the start of a new Coverage_Period, THE Policy_Service SHALL recalculate the Weekly_Premium and notify the worker at least 24 hours before the new period begins.
5. THE Policy_Service SHALL display a transparent premium breakdown showing: base rate, risk adjustment factor, coverage level multiplier, and final Weekly_Premium.

### Requirement 4: Policy Creation and Management

**User Story:** As a Q-Commerce delivery partner, I want to purchase and manage my weekly income protection policy easily, so that I always have active coverage when I need it.

#### Acceptance Criteria

1. WHEN a worker selects a coverage level and confirms purchase, THE Policy_Service SHALL create an active policy for the upcoming Coverage_Period and generate a unique policy ID.
2. WHEN a worker has an active policy, THE Worker_Portal SHALL display the policy status, coverage level, Coverage_Period dates, and payout eligibility criteria.
3. WHEN a Coverage_Period ends and the worker has auto-renewal enabled, THE Policy_Service SHALL automatically create a new policy for the next Coverage_Period using the recalculated Weekly_Premium.
4. WHEN a worker disables auto-renewal, THE Policy_Service SHALL allow the current Coverage_Period to complete without creating a new policy.
5. IF a worker's payment for a new Coverage_Period fails, THEN THE Policy_Service SHALL retry payment once after 4 hours and notify the worker of the failure.
6. THE Policy_Service SHALL maintain a complete policy history accessible to the worker through the Worker_Portal.

### Requirement 5: Parametric Trigger Monitoring

**User Story:** As the platform, I want to continuously monitor external data sources for disruption events affecting Q-Commerce operations, so that claims are triggered automatically without worker intervention.

#### Acceptance Criteria

1. THE Trigger_Monitor SHALL poll external data sources (weather API, AQI API, traffic data, government alert feeds) at intervals no longer than 15 minutes.
2. THE Trigger_Monitor SHALL evaluate the following parametric triggers against predefined thresholds:
   - Extreme Heat: Temperature exceeds 45°C in the worker's Delivery_Zone
   - Heavy Rainfall: Rainfall exceeds 65mm/hour in the worker's Delivery_Zone
   - Flooding: Flood alert issued for the worker's Delivery_Zone by IMD or equivalent source
   - Severe Pollution: AQI exceeds 400 (Severe+ category) in the worker's Delivery_Zone
   - Social Disruption: Government-issued curfew, strike alert, or zone closure notification affecting the worker's Delivery_Zone
3. WHEN a data source reading crosses a defined threshold for a Delivery_Zone, THE Trigger_Monitor SHALL create a Disruption_Event record with: event type, severity level, affected Delivery_Zone, affected Dark_Store references, timestamp, duration estimate, and source data reference.
4. WHEN a Disruption_Event is created, THE Trigger_Monitor SHALL notify the Claims_Engine within 60 seconds.
5. IF an external data source becomes unavailable, THEN THE Trigger_Monitor SHALL log the outage, switch to the next available backup source, and alert the Admin_Portal.

### Requirement 6: Automated Zero-Touch Claims Processing

**User Story:** As a Q-Commerce delivery partner, I want claims to be filed and processed automatically when a disruption event occurs, so that I receive payouts without manual paperwork.

#### Acceptance Criteria

1. WHEN the Claims_Engine receives a Disruption_Event notification, THE Claims_Engine SHALL identify all workers with active policies in the affected Delivery_Zone within 2 minutes.
2. WHEN an affected worker with an active policy is identified, THE Claims_Engine SHALL automatically create a claim record linked to the Disruption_Event and the worker's policy.
3. THE Claims_Engine SHALL calculate the Income_Loss_Payout based on: the disruption duration (in hours), the worker's estimated hourly earnings derived from their average weekly delivery count and platform-specific per-delivery earnings, and the policy coverage level percentage.
4. WHEN a claim is created, THE Claims_Engine SHALL submit the claim to the Fraud_Detector for validation before approving payout.
5. WHEN the Fraud_Detector approves a claim, THE Claims_Engine SHALL mark the claim as approved and forward the claim to the Payout_Service within 5 minutes.
6. IF the Fraud_Detector flags a claim as suspicious, THEN THE Claims_Engine SHALL place the claim in a review queue accessible through the Admin_Portal and notify the worker that the claim is under review.
7. THE Claims_Engine SHALL send real-time status updates to the worker through the Worker_Portal for each claim state transition: created, validating, approved, paid, or under review.

### Requirement 7: Intelligent Fraud Detection

**User Story:** As an insurer, I want AI-powered fraud detection to identify suspicious claims including GPS spoofing and fake weather claims, so that the platform remains financially sustainable and fair for all workers.

#### Acceptance Criteria

1. WHEN a claim is submitted for validation, THE Fraud_Detector SHALL perform the following checks within 30 seconds: GPS location validation, duplicate claim detection, weather data cross-verification against historical records, and anomaly scoring.
2. THE Fraud_Detector SHALL verify that the worker's last known GPS location (from Q-Commerce_Platform data or device location) is within or near the affected Delivery_Zone at the time of the Disruption_Event.
3. THE Fraud_Detector SHALL check for duplicate claims by comparing the worker ID, Disruption_Event type, and Coverage_Period against existing claims, and reject exact duplicates.
4. THE Fraud_Detector SHALL cross-verify the Disruption_Event data against at least two independent data sources to confirm the event occurred.
5. THE Fraud_Detector SHALL assign a fraud risk score from 0 to 100 for each claim, where claims scoring above 70 are flagged for manual review.
6. WHEN a claim is flagged for manual review, THE Fraud_Detector SHALL provide the Admin_Portal with a detailed explanation of the flagged anomalies including the specific checks that failed.
7. THE Fraud_Detector SHALL detect GPS spoofing attempts by analyzing location data patterns for impossible travel speeds, location jumps exceeding 10 km within 5 minutes, or coordinates outside the registered Delivery_Zone.
8. THE Fraud_Detector SHALL compare claimed weather conditions against historical weather data from multiple sources to detect fake weather claims where reported conditions do not match recorded data.

### Requirement 8: Instant Payout Processing

**User Story:** As a Q-Commerce delivery partner, I want to receive my payout instantly after a claim is approved, so that I can cover my expenses during the disruption period.

#### Acceptance Criteria

1. WHEN the Payout_Service receives an approved claim, THE Payout_Service SHALL initiate a payout to the worker's registered payment method within 2 minutes.
2. THE Payout_Service SHALL support payout via UPI simulated through a mock payment gateway (Razorpay test mode or UPI simulator).
3. WHEN a payout is successfully processed, THE Payout_Service SHALL update the claim status to "paid" and send a confirmation notification to the worker with the payout amount and transaction reference.
4. IF a payout transaction fails, THEN THE Payout_Service SHALL retry the transaction up to 3 times with exponential backoff (2 min, 4 min, 8 min intervals) and notify the Admin_Portal if all retries fail.
5. THE Payout_Service SHALL maintain a complete transaction ledger recording: claim ID, worker ID, payout amount, payment method, transaction status, and timestamp.

### Requirement 9: Worker Dashboard

**User Story:** As a Q-Commerce delivery partner, I want a clear dashboard showing my coverage status and earnings protection, so that I can understand the value of my insurance at a glance.

#### Acceptance Criteria

1. THE Worker_Portal SHALL display a dashboard containing: active policy status, current Coverage_Period dates, total earnings protected to date, pending claims count, recent payout history, and active weekly coverage amount.
2. WHEN a Disruption_Event affects the worker's Delivery_Zone, THE Worker_Portal SHALL display an alert banner with the event type, severity, affected Dark_Store, and expected impact duration.
3. THE Worker_Portal SHALL display a weekly summary showing: number of disruption events, total hours of disruption, total payout received, and premium paid for the current Coverage_Period.
4. THE Worker_Portal SHALL display the worker's current risk score and risk tier with a visual indicator (color-coded: green for Low, yellow for Medium, orange for High, red for Critical).
5. WHEN a worker navigates to the claims section, THE Worker_Portal SHALL display a chronological list of all claims with status, event type, payout amount, and processing timestamps.

### Requirement 10: Admin and Insurer Dashboard

**User Story:** As an insurer/administrator, I want a comprehensive analytics dashboard with predictive capabilities, so that I can monitor platform health, loss ratios, fraud patterns, and forecast upcoming risk.

#### Acceptance Criteria

1. THE Admin_Portal SHALL display a real-time overview dashboard containing: total active policies, total claims (approved, pending, rejected), aggregate payout amount, aggregate premium collected, and overall loss ratio.
2. THE Admin_Portal SHALL display predictive analytics showing: forecasted disruption events for the next 7 days by Delivery_Zone, estimated claim volume, and projected payout liability.
3. THE Admin_Portal SHALL display fraud analytics showing: total flagged claims, fraud detection rate, false positive rate, GPS spoofing attempts detected, and a list of claims pending manual review.
4. WHEN an administrator selects a flagged claim for review, THE Admin_Portal SHALL display the full claim details, fraud score breakdown, anomaly explanations, and options to approve or reject the claim.
5. THE Admin_Portal SHALL provide zone-level analytics showing disruption frequency, average payout per worker, risk distribution by Delivery_Zone, and dark store impact analysis.
6. THE Admin_Portal SHALL display a loss ratio trend chart over the past 12 Coverage_Periods with the ability to filter by Delivery_Zone and disruption type.

### Requirement 11: External Data Integration

**User Story:** As the platform, I want to integrate with external weather, pollution, traffic, and alert data sources, so that parametric triggers are based on reliable real-time data.

#### Acceptance Criteria

1. THE GigShield_Platform SHALL integrate with at least one weather API (OpenWeatherMap free tier or mock) to retrieve temperature, rainfall, and flood alert data for configured Delivery_Zones.
2. THE GigShield_Platform SHALL integrate with at least one air quality API (CPCB, AQICN, or mock) to retrieve AQI readings for configured Delivery_Zones.
3. THE GigShield_Platform SHALL integrate with a traffic data source (mock acceptable) to retrieve traffic disruption and road closure data for configured Delivery_Zones.
4. THE GigShield_Platform SHALL support mock API endpoints for social disruption alerts (curfews, strikes, zone closures) to simulate government alert feeds.
5. WHEN an external API returns an error response, THE GigShield_Platform SHALL log the error with the API name, endpoint, error code, and timestamp.
6. THE GigShield_Platform SHALL cache the most recent successful API response for each data source and use cached data if the live source is unavailable for up to 30 minutes.

### Requirement 12: Payment Integration

**User Story:** As a Q-Commerce delivery partner, I want to pay my weekly premium and receive payouts through familiar payment methods, so that the process is convenient and matches how I already get paid.

#### Acceptance Criteria

1. THE GigShield_Platform SHALL integrate with a mock payment gateway (Razorpay test mode or UPI simulator) for both premium collection and payout disbursement.
2. WHEN a worker initiates a premium payment, THE GigShield_Platform SHALL generate a UPI payment request and confirm the transaction status within 30 seconds (simulated).
3. WHEN a payment is confirmed, THE GigShield_Platform SHALL update the policy status to active for the corresponding Coverage_Period.
4. THE GigShield_Platform SHALL maintain a financial ledger recording all premium payments and payout disbursements with: worker ID, amount, direction (inflow/outflow), timestamp, and transaction reference.

### Requirement 13: Coverage Exclusion Enforcement

**User Story:** As the platform, I want to strictly enforce coverage exclusions, so that the platform remains compliant with its parametric income-loss-only model.

#### Acceptance Criteria

1. THE Claims_Engine SHALL reject any claim that references health conditions, bodily injury, accidents, vehicle damage, or vehicle repair as the cause of income loss.
2. THE Policy_Service SHALL display a clear coverage scope statement during policy purchase specifying that coverage applies only to income loss from environmental and social disruptions.
3. THE Claims_Engine SHALL validate that every claim is linked to a verified Disruption_Event of type environmental or social before processing.

### Requirement 14: Data Persistence and Audit Trail

**User Story:** As an insurer, I want all platform transactions and decisions to be recorded with an audit trail, so that operations are transparent and auditable.

#### Acceptance Criteria

1. THE GigShield_Platform SHALL persist all worker profiles, policies, claims, payouts, and fraud assessments in a database.
2. THE GigShield_Platform SHALL record an audit log entry for every state change in a policy, claim, or payout, including: entity ID, previous state, new state, timestamp, and triggering event.
3. WHEN an administrator queries the audit log, THE Admin_Portal SHALL return results filtered by entity type, date range, and worker ID.
