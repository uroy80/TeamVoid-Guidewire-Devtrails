import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { demo } from '../api/client';
import ThemeToggle from '../components/ThemeToggle';
import Logo from '../components/Logo';

interface BASBreakdown {
  gps_authenticity: number;
  movement_entropy: number;
  device_consistency: number;
  historical_behavior: number;
  ring_fraud_absence: number;
  weather_correlation: number;
  total: number;
  tier: string;
  flags: string[];
}

interface SimResult {
  scenario: string;
  worker: { id: string; name: string };
  zone: string;
  event?: { id: string; type: string };
  claim?: { id: string; number: string; status?: string; payout?: string };
  fraud?: {
    claimId: string;
    fraud_score: number;
    status: string;
    tier: 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED';
    details: {
      bas_score: number;
      bas_breakdown: BASBreakdown;
      flags: string[];
      tier: string;
    };
  };
  payout?: { status: string; amount: string };
  flags?: string[];
  message?: string;
  error?: string;
}

const SCENARIOS = [
  {
    id: 'legitimate_claim',
    title: 'Legitimate Claim',
    icon: 'ri-shield-check-line',
    color: '#10b981',
    bg: 'rgba(16, 185, 129, 0.1)',
    description: 'Worker with consistent GPS history files a claim during heavy rainfall. BAS validates genuine behavior pattern.',
    expect: 'GREEN BAS, Auto-Approved, Payout Disbursed',
  },
  {
    id: 'gps_spoofing',
    title: 'GPS Spoofing Attack',
    icon: 'ri-spy-line',
    color: '#ef4444',
    bg: 'rgba(239, 68, 68, 0.1)',
    description: 'Attacker teleports 750km in minutes using a spoofing app. BAS detects impossible travel and flags the claim.',
    expect: 'RED BAS, IMPOSSIBLE_TRAVEL, Under Review',
  },
  {
    id: 'ring_fraud',
    title: 'Ring Fraud Detection',
    icon: 'ri-group-line',
    color: '#f59e0b',
    bg: 'rgba(245, 158, 11, 0.1)',
    description: 'Coordinated fraud ring uses shared device fingerprint across workers. BAS identifies the common device pattern.',
    expect: 'Shared Device Flagged, Claims Under Scrutiny',
  },
];

const TIER_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  GREEN: { bg: 'rgba(16, 185, 129, 0.15)', text: '#10b981', border: 'rgba(16, 185, 129, 0.3)' },
  YELLOW: { bg: 'rgba(245, 158, 11, 0.15)', text: '#f59e0b', border: 'rgba(245, 158, 11, 0.3)' },
  ORANGE: { bg: 'rgba(249, 115, 22, 0.15)', text: '#f97316', border: 'rgba(249, 115, 22, 0.3)' },
  RED: { bg: 'rgba(239, 68, 68, 0.15)', text: '#ef4444', border: 'rgba(239, 68, 68, 0.3)' },
};

const BAS_LABELS: { key: keyof BASBreakdown; label: string; weight: string }[] = [
  { key: 'gps_authenticity', label: 'GPS Authenticity', weight: '30%' },
  { key: 'movement_entropy', label: 'Movement Entropy', weight: '15%' },
  { key: 'device_consistency', label: 'Device Consistency', weight: '15%' },
  { key: 'historical_behavior', label: 'Historical Behavior', weight: '20%' },
  { key: 'ring_fraud_absence', label: 'Ring Fraud Absence', weight: '10%' },
  { key: 'weather_correlation', label: 'Weather Correlation', weight: '10%' },
];

function ScoreBar({ value, color }: { value: number; color: string }) {
  return (
    <div style={{ width: '100%', height: 8, borderRadius: 4, background: 'var(--bg-tertiary)', overflow: 'hidden' }}>
      <div
        style={{
          width: `${value}%`,
          height: '100%',
          borderRadius: 4,
          background: color,
          transition: 'width 0.8s ease-out',
        }}
      />
    </div>
  );
}

function BASGauge({ score, tier }: { score: number; tier: string }) {
  const tc = TIER_COLORS[tier] || TIER_COLORS.GREEN;
  const circumference = 2 * Math.PI * 45;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div style={{ position: 'relative', width: 120, height: 120, margin: '0 auto' }}>
      <svg viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="50" cy="50" r="45" fill="none" stroke="var(--border-color)" strokeWidth="6" />
        <circle
          cx="50" cy="50" r="45" fill="none"
          stroke={tc.text}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1s ease-out' }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontSize: 28, fontWeight: 800, color: tc.text }}>{score}</span>
        <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', marginTop: -2 }}>/ 100</span>
      </div>
    </div>
  );
}

function ResultCard({ result }: { result: SimResult }) {
  const fraud = result.fraud;
  if (!fraud) {
    return (
      <div className="slide-up" style={{ padding: 16, textAlign: 'center', color: 'var(--text-secondary)' }}>
        No claim was created. Worker may not have an active policy.
      </div>
    );
  }

  const tier = fraud.tier;
  const tc = TIER_COLORS[tier] || TIER_COLORS.GREEN;
  const bas = fraud.details?.bas_breakdown;
  const flags = fraud.details?.flags || [];

  return (
    <div className="slide-up" style={{ marginTop: 16 }}>
      {/* Divider */}
      <div style={{ height: 1, background: 'var(--border-color)', margin: '0 -16px 16px' }} />

      {/* BAS Gauge */}
      <BASGauge score={fraud.details?.bas_score ?? 0} tier={tier} />

      {/* Tier Badge */}
      <div style={{ textAlign: 'center', marginTop: 8, marginBottom: 16 }}>
        <span style={{
          display: 'inline-block', padding: '4px 16px', borderRadius: 20, fontSize: 12, fontWeight: 700,
          background: tc.bg, color: tc.text, border: `1px solid ${tc.border}`, letterSpacing: 1,
        }}>
          {tier}
        </span>
      </div>

      {/* Score Breakdown */}
      {bas && (
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            BAS Breakdown
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {BAS_LABELS.map(({ key, label, weight }) => {
              const val = Number(bas[key]) || 0;
              const barColor = val >= 80 ? '#10b981' : val >= 50 ? '#f59e0b' : '#ef4444';
              return (
                <div key={key}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{label} <span style={{ opacity: 0.5 }}>({weight})</span></span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: barColor }}>{val}</span>
                  </div>
                  <ScoreBar value={val} color={barColor} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Claim Info */}
      <div className="card-solid" style={{ padding: 12, borderRadius: 10, marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Claim</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
            {result.claim?.number || 'N/A'}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Status</span>
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
            background: tc.bg, color: tc.text,
          }}>
            {fraud.status}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Fraud Score</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: tc.text }}>
            {fraud.fraud_score}/100
          </span>
        </div>
        {result.payout && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Payout</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#10b981' }}>
              &#8377;{Number(result.payout.amount).toLocaleString()}
            </span>
          </div>
        )}
      </div>

      {/* Flags */}
      {flags.length > 0 && (
        <div>
          <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Flags ({flags.length})
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {flags.map((flag, i) => (
              <span
                key={i}
                style={{
                  fontSize: 10, padding: '3px 8px', borderRadius: 6, fontWeight: 600, fontFamily: 'monospace',
                  background: flag.includes('IMPOSSIBLE') ? 'rgba(239, 68, 68, 0.15)' : flag.includes('NEW_DEVICE') ? 'rgba(245, 158, 11, 0.15)' : 'rgba(100, 116, 139, 0.15)',
                  color: flag.includes('IMPOSSIBLE') ? '#ef4444' : flag.includes('NEW_DEVICE') ? '#f59e0b' : 'var(--text-secondary)',
                }}
              >
                {flag.length > 35 ? flag.slice(0, 35) + '...' : flag}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Demo() {
  const navigate = useNavigate();
  const [results, setResults] = useState<Record<string, SimResult | null>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [runningAll, setRunningAll] = useState(false);

  const runScenario = async (scenarioId: string) => {
    setLoading((prev) => ({ ...prev, [scenarioId]: true }));
    setResults((prev) => ({ ...prev, [scenarioId]: null }));
    try {
      const res = await demo.simulate(scenarioId);
      setResults((prev) => ({ ...prev, [scenarioId]: res.data }));
    } catch (err: any) {
      setResults((prev) => ({ ...prev, [scenarioId]: { error: err.response?.data?.error || err.message } as any }));
    } finally {
      setLoading((prev) => ({ ...prev, [scenarioId]: false }));
    }
  };

  const runAll = async () => {
    setRunningAll(true);
    // Run sequentially to avoid race conditions on same worker
    for (const s of SCENARIOS) {
      await runScenario(s.id);
    }
    setRunningAll(false);
  };

  return (
    <div className="min-h-screen px-4 py-8" style={{ background: 'var(--bg-primary)' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-2 slide-up">
          <button
            onClick={() => navigate('/welcome')}
            style={{ color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}
          >
            <i className="ri-arrow-left-line" /> Back
          </button>
          <ThemeToggle />
        </div>

        {/* Title */}
        <div className="text-center mb-8 slide-up" style={{ animationDelay: '0.1s' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 8 }}>
            <Logo style={{ width: 40, height: 40, borderRadius: 10 }} />
            <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
              Anti-Spoofing <span className="text-gradient">Demo</span>
            </h1>
          </div>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', maxWidth: 600, margin: '0 auto', lineHeight: 1.6 }}>
            Watch the 6-component <strong style={{ color: 'var(--text-primary)' }}>Behavioral Authenticity Score (BAS)</strong> detect
            GPS spoofing, ring fraud, and validate legitimate claims in real-time.
          </p>
        </div>

        {/* Run All Button */}
        <div className="text-center mb-8 slide-up" style={{ animationDelay: '0.2s' }}>
          <button
            onClick={runAll}
            disabled={runningAll}
            className="btn-primary"
            style={{ padding: '12px 32px', fontSize: 15, gap: 8, display: 'inline-flex', alignItems: 'center' }}
          >
            {runningAll ? (
              <>
                <div style={{ width: 16, height: 16, border: '2px solid white', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
                Running Scenarios...
              </>
            ) : (
              <>
                <i className="ri-play-circle-line" style={{ fontSize: 18 }} />
                Run All 3 Scenarios
              </>
            )}
          </button>
        </div>

        {/* Scenario Cards Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
          {SCENARIOS.map((s, i) => (
            <div
              key={s.id}
              className="glass slide-up"
              style={{ animationDelay: `${0.3 + i * 0.1}s`, padding: 20, borderRadius: 16 }}
            >
              {/* Scenario Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 12, background: s.bg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <i className={s.icon} style={{ fontSize: 22, color: s.color }} />
                </div>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{s.title}</h3>
                </div>
              </div>

              {/* Description */}
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 8 }}>
                {s.description}
              </p>

              {/* Expected */}
              <div style={{
                fontSize: 11, padding: '6px 10px', borderRadius: 8, marginBottom: 14,
                background: s.bg, color: s.color, fontWeight: 600,
              }}>
                Expected: {s.expect}
              </div>

              {/* Run Button */}
              <button
                onClick={() => runScenario(s.id)}
                disabled={loading[s.id] || runningAll}
                className="btn-primary"
                style={{
                  width: '100%', padding: '10px 0', fontSize: 13, display: 'flex',
                  alignItems: 'center', justifyContent: 'center', gap: 8,
                  opacity: loading[s.id] || runningAll ? 0.6 : 1,
                }}
              >
                {loading[s.id] ? (
                  <>
                    <div style={{ width: 14, height: 14, border: '2px solid white', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
                    Simulating...
                  </>
                ) : (
                  <>
                    <i className="ri-play-line" />
                    Run Simulation
                  </>
                )}
              </button>

              {/* Results */}
              {results[s.id] && !results[s.id]!.error && (
                <ResultCard result={results[s.id]!} />
              )}
              {results[s.id]?.error && (
                <div className="slide-up" style={{
                  marginTop: 16, padding: 12, borderRadius: 10,
                  background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)',
                  fontSize: 12, color: '#ef4444',
                }}>
                  Error: {results[s.id]!.error}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* How It Works */}
        <div className="glass slide-up" style={{ animationDelay: '0.6s', padding: 24, borderRadius: 16, marginTop: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>
            <i className="ri-information-line" style={{ color: 'var(--accent)' }} /> How BAS Works
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            {BAS_LABELS.map(({ label, weight, key }) => (
              <div key={key} className="card-solid" style={{ padding: 12, borderRadius: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                  {label}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  Weight: <strong>{weight}</strong> &mdash;{' '}
                  {key === 'gps_authenticity' && 'Detects impossible travel, spoofed coordinates, and zone boundary violations'}
                  {key === 'movement_entropy' && 'Analyzes Shannon entropy of GPS direction patterns for naturalness'}
                  {key === 'device_consistency' && 'Tracks device fingerprints and flags shared devices across workers'}
                  {key === 'historical_behavior' && 'Compares current claim patterns to 30-day behavioral baseline'}
                  {key === 'ring_fraud_absence' && 'Detects coordinated fraud rings via shared device signatures'}
                  {key === 'weather_correlation' && 'Validates disruption events against real weather API data'}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center slide-up" style={{ animationDelay: '0.7s', marginTop: 20, paddingBottom: 20 }}>
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            GigShield &mdash; AI-Powered Parametric Insurance for Q-Commerce Workers
          </p>
        </div>
      </div>
    </div>
  );
}
