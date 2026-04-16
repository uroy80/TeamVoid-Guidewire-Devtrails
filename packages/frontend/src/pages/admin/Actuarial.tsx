import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { admin } from '../../api/client';
import ThemeToggle from '../../components/ThemeToggle';

// ---------------------------------------------------------------------------
// Types — mirror what the Wave 2 actuarial endpoints return. We keep them
// tolerant (optional) so the UI degrades gracefully before the endpoints ship.
// ---------------------------------------------------------------------------
interface ActuarialOverview {
  loss_ratio?: number; // 0..1 or 0..100 — we normalize below
  upr?: number; // Unearned Premium Reserve (INR)
  ibnr?: number; // Incurred But Not Reported (INR)
  policies_in_force?: number;
  solvency?: {
    ear_1in100?: number; // 99.5% VaR
  };
  [key: string]: unknown;
}

interface ZoneRow {
  zone_id?: string;
  zone_name?: string;
  gwp?: number; // Gross Written Premium
  claims_paid?: number;
  loss_ratio?: number;
  claim_count?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

function formatInr(n: number | undefined): string {
  if (n === undefined || n === null || Number.isNaN(n)) return '—';
  return inr.format(n);
}

/** Normalize a loss ratio that might be 0..1 or 0..100 into a 0..100 number. */
function normalizeRatioPct(v: number | undefined): number | null {
  if (v === undefined || v === null || Number.isNaN(v)) return null;
  return v <= 1.5 ? v * 100 : v;
}

function ratioColor(pct: number | null): { text: string; bar: string; label: string } {
  if (pct === null) return { text: 'var(--text-secondary)', bar: 'var(--border)', label: 'n/a' };
  if (pct < 60) return { text: '#10b981', bar: '#10b981', label: 'Healthy' };
  if (pct <= 80) return { text: '#eab308', bar: '#eab308', label: 'Elevated' };
  return { text: '#ef4444', bar: '#ef4444', label: 'Critical' };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
const Actuarial: React.FC = () => {
  const [overview, setOverview] = useState<ActuarialOverview | null>(null);
  const [zones, setZones] = useState<ZoneRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const [ov, byZone] = await Promise.allSettled([
        admin.getActuarialOverview(),
        admin.getActuarialByZone(),
      ]);

      if (ov.status === 'fulfilled') {
        const raw = ov.value.data as
          | ActuarialOverview
          | { overview?: ActuarialOverview }
          | null
          | undefined;
        let next: ActuarialOverview | null = null;
        if (raw && typeof raw === 'object') {
          if ('overview' in raw && raw.overview) {
            next = raw.overview as ActuarialOverview;
          } else {
            next = raw as ActuarialOverview;
          }
        }
        setOverview(next);
      } else {
        const status = (ov.reason as { response?: { status?: number } })?.response?.status;
        if (status === 404) {
          setError('Actuarial endpoints pending — Wave 2 backend not yet deployed.');
        } else {
          setError('Failed to load actuarial overview.');
        }
      }

      if (byZone.status === 'fulfilled') {
        const data = byZone.value.data as ZoneRow[] | { zones?: ZoneRow[] };
        const list = Array.isArray(data)
          ? data
          : data && 'zones' in data && Array.isArray(data.zones)
          ? data.zones
          : [];
        setZones(list);
      }

      setLastFetched(new Date());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const id = window.setInterval(fetchData, 60_000);
    return () => window.clearInterval(id);
  }, [fetchData]);

  // ----- Derived values -----
  const lossRatioPct = useMemo(
    () => normalizeRatioPct(overview?.loss_ratio),
    [overview?.loss_ratio]
  );
  const lrColor = ratioColor(lossRatioPct);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      {/* Header */}
      <header
        style={{
          borderBottom: '1px solid var(--border)',
          padding: '16px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--bg-secondary)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Link
            to="/admin"
            style={{ color: 'var(--text-secondary)', fontSize: 14, textDecoration: 'none' }}
          >
            <i className="ri-arrow-left-line" /> Back to admin
          </Link>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Actuarial Overview</h1>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>
              Loss ratios, reserves, and solvency — refreshes every 60s
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {lastFetched && (
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Updated {lastFetched.toLocaleTimeString()}
            </span>
          )}
          <ThemeToggle />
        </div>
      </header>

      <main style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>
        {error && (
          <div
            style={{
              padding: 12,
              borderRadius: 8,
              border: '1px solid rgba(234,179,8,0.3)',
              background: 'rgba(234,179,8,0.1)',
              color: '#eab308',
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        {/* Big-number cards */}
        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 16,
          }}
        >
          <Card
            label="Loss Ratio"
            value={lossRatioPct === null ? '—' : `${lossRatioPct.toFixed(1)}%`}
            valueColor={lrColor.text}
            sub={lrColor.label}
            loading={loading}
          />
          <Card
            label="Unearned Premium Reserve"
            value={formatInr(overview?.upr)}
            sub="Reserve for in-force policies"
            loading={loading}
          />
          <Card
            label="IBNR"
            value={formatInr(overview?.ibnr)}
            sub="Incurred but not reported"
            loading={loading}
          />
          <Card
            label="Policies in Force"
            value={
              overview?.policies_in_force === undefined
                ? '—'
                : overview.policies_in_force.toLocaleString('en-IN')
            }
            sub="Active coverage"
            loading={loading}
          />
        </section>

        {/* Per-zone table */}
        <section
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: 20,
          }}
        >
          <h2 style={{ fontSize: 16, fontWeight: 600, marginTop: 0, marginBottom: 12 }}>
            Loss Ratio by Zone
          </h2>
          {loading && zones.length === 0 ? (
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Loading…</div>
          ) : zones.length === 0 ? (
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
              No zone data available yet.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: 13,
                }}
              >
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                    <Th>Zone</Th>
                    <Th align="right">GWP</Th>
                    <Th align="right">Claims Paid</Th>
                    <Th>Loss Ratio</Th>
                    <Th align="right">Claim Count</Th>
                  </tr>
                </thead>
                <tbody>
                  {zones.map((z, idx) => {
                    const pct = normalizeRatioPct(z.loss_ratio);
                    const colors = ratioColor(pct);
                    return (
                      <tr
                        key={z.zone_id ?? z.zone_name ?? idx}
                        style={{ borderBottom: '1px solid var(--border)' }}
                      >
                        <Td>{z.zone_name ?? z.zone_id ?? '—'}</Td>
                        <Td align="right">{formatInr(z.gwp)}</Td>
                        <Td align="right">{formatInr(z.claims_paid)}</Td>
                        <Td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 180 }}>
                            <div
                              style={{
                                flex: 1,
                                height: 8,
                                borderRadius: 4,
                                background: 'var(--border)',
                                overflow: 'hidden',
                              }}
                            >
                              <div
                                style={{
                                  width: `${Math.min(100, pct ?? 0)}%`,
                                  height: '100%',
                                  background: colors.bar,
                                  transition: 'width 400ms ease',
                                }}
                              />
                            </div>
                            <span style={{ color: colors.text, fontWeight: 600, fontSize: 12, minWidth: 52, textAlign: 'right' }}>
                              {pct === null ? '—' : `${pct.toFixed(1)}%`}
                            </span>
                          </div>
                        </Td>
                        <Td align="right">
                          {z.claim_count === undefined ? '—' : z.claim_count.toLocaleString('en-IN')}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Solvency card */}
        <section
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="ri-shield-check-line" style={{ color: 'var(--accent)' }} />
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Solvency (99.5% VaR)</h2>
          </div>
          <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--text-primary)' }}>
            {formatInr(overview?.solvency?.ear_1in100)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Monte Carlo estimate over 1000 simulations.
          </div>
        </section>
      </main>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Local presentational helpers
// ---------------------------------------------------------------------------
interface CardProps {
  label: string;
  value: string;
  valueColor?: string;
  sub?: string;
  loading?: boolean;
}

const Card: React.FC<CardProps> = ({ label, value, valueColor, sub, loading }) => (
  <div
    style={{
      background: 'var(--bg-secondary)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: 20,
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
    }}
  >
    <div
      style={{
        fontSize: 11,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        color: 'var(--text-secondary)',
      }}
    >
      {label}
    </div>
    <div
      style={{
        fontSize: 28,
        fontWeight: 700,
        color: valueColor ?? 'var(--text-primary)',
      }}
    >
      {loading ? '…' : value}
    </div>
    {sub && (
      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{sub}</div>
    )}
  </div>
);

const Th: React.FC<React.PropsWithChildren<{ align?: 'left' | 'right' }>> = ({
  children,
  align,
}) => (
  <th
    style={{
      padding: '10px 8px',
      fontSize: 11,
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      color: 'var(--text-secondary)',
      fontWeight: 600,
      textAlign: align ?? 'left',
    }}
  >
    {children}
  </th>
);

const Td: React.FC<React.PropsWithChildren<{ align?: 'left' | 'right' }>> = ({
  children,
  align,
}) => (
  <td
    style={{
      padding: '10px 8px',
      color: 'var(--text-primary)',
      textAlign: align ?? 'left',
    }}
  >
    {children}
  </td>
);

export default Actuarial;
