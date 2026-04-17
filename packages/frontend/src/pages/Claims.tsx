import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { claims as claimsApi } from '../api/client';
import ThemeToggle from '../components/ThemeToggle';
import RequestClaimForm from '../components/RequestClaimForm';
import PayoutTimeline, { type TimelineStatus } from '../components/PayoutTimeline';

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  CREATED: { bg: 'rgba(59, 130, 246, 0.15)', text: '#3b82f6' },
  VALIDATING: { bg: 'rgba(234, 179, 8, 0.15)', text: '#eab308' },
  APPROVED: { bg: 'rgba(16, 185, 129, 0.15)', text: '#10b981' },
  UNDER_REVIEW: { bg: 'rgba(249, 115, 22, 0.15)', text: '#f97316' },
  REJECTED: { bg: 'rgba(239, 68, 68, 0.15)', text: '#ef4444' },
  PAID: { bg: 'rgba(16, 185, 129, 0.15)', text: '#34d399' },
};

const DISRUPTION_ICONS: Record<string, string> = {
  RAINFALL: 'ri-rainy-line',
  HEATWAVE: 'ri-fire-line',
  AQI: 'ri-haze-line',
  FLOOD: 'ri-flood-line',
  CYCLONE: 'ri-tornado-line',
};

// Gateway brand metadata is static — keep it in sync with the backend
// `external/payments/*.mock.ts` classes. Duplicated here (not fetched from
// `/admin/payouts/gateways`) because workers don't have admin auth.
const GATEWAY_META: Record<string, { label: string; color: string; rail: string; icon: string }> = {
  RAZORPAY: { label: 'Razorpay Payouts', color: '#3395FF', rail: 'IMPS', icon: 'ri-bank-card-line' },
  STRIPE:   { label: 'Stripe Connect',   color: '#635BFF', rail: 'Bank Transfer', icon: 'ri-bank-line' },
  UPI:      { label: 'UPI Direct',       color: '#0E7C3A', rail: 'NPCI IMPS', icon: 'ri-qr-code-line' },
};

interface PayoutRow {
  id: string;
  claim_id: string;
  amount: number | string;
  status: TimelineStatus;
  gateway: 'RAZORPAY' | 'STRIPE' | 'UPI' | null;
  transaction_ref: string | null;
  utr_number: string | null;
  fee_amount: number | string | null;
  tax_amount: number | string | null;
  net_amount: number | string | null;
  initiated_at: string | null;
  processing_at: string | null;
  settled_at: string | null;
  failed_at: string | null;
  failure_reason: string | null;
}

// Loading sentinel so we don't re-fetch a claim's payout on every expand.
// 'none' = fetched + 404 (no payout yet), 'loading' = in-flight request.
type PayoutState = PayoutRow | 'none' | 'loading';

export default function Claims() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [allClaims, setAllClaims] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showRequestForm, setShowRequestForm] = useState(false);
  // Per-claim payout cache. We lazily fetch on first expand so the claims
  // list itself stays snappy (no N+1 GETs up front) but once a worker has
  // expanded a claim the receipt stays populated for the rest of the session.
  const [payouts, setPayouts] = useState<Record<string, PayoutState>>({});

  // Normalize snake_case API response to camelCase for display
  const normalizeClaim = (c: any) => ({
    ...c,
    claimNumber: c.claim_number || c.claimNumber,
    payoutAmount: c.income_loss_payout || c.payoutAmount || '0',
    disruptionType: c.disruption_type || c.event_type || c.disruptionType || '--',
    createdAt: c.created_at || c.createdAt,
    disruptionDays: c.disruption_hours ? Math.ceil(Number(c.disruption_hours) / 8) : c.disruptionDays,
    // fraudCheck/fraudScore are internal signals — intentionally omitted from the worker-facing shape
  });

  const loadClaims = async () => {
    try {
      const res = await claimsApi.getClaims();
      const data = Array.isArray(res.data)
        ? res.data
        : res.data?.claims || [];
      setAllClaims(data.map(normalizeClaim));
    } catch {
      setError('Failed to load claims');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClaims();
  }, []);

  // Auto-open form if URL has ?request=true
  useEffect(() => {
    if (searchParams.get('request') === 'true') {
      setShowRequestForm(true);
      // Remove the param so it doesn't re-trigger
      searchParams.delete('request');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const toggleExpand = (id: string) => {
    const next = expandedId === id ? null : id;
    setExpandedId(next);
    // Lazily fetch the payout the first time a claim opens. 404 is expected
    // for unapproved claims — cache it as 'none' so we don't retry on every
    // collapse/expand cycle.
    if (next && payouts[next] === undefined) {
      setPayouts((prev) => ({ ...prev, [next]: 'loading' }));
      claimsApi
        .getPayout(next)
        .then((res) => {
          const payout = res.data?.payout ?? null;
          setPayouts((prev) => ({ ...prev, [next]: payout ?? 'none' }));
        })
        .catch(() => {
          setPayouts((prev) => ({ ...prev, [next]: 'none' }));
        });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
        <div className="w-10 h-10 border-4 rounded-full animate-spin" style={{ borderColor: 'var(--accent-light)', borderTopColor: 'var(--accent)' }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen px-6 py-6 pb-20" style={{ background: 'var(--bg-primary)' }}>
      {/* Request Claim Form Overlay */}
      {showRequestForm && (
        <RequestClaimForm
          onClose={() => setShowRequestForm(false)}
          onSuccess={() => {
            // Refresh claims list after successful submission
            loadClaims();
          }}
        />
      )}

      {/* Header */}
      <div className="flex items-center gap-3 mb-6 slide-up">
        <button
          onClick={() => navigate('/dashboard')}
          className="glass w-10 h-10 flex items-center justify-center rounded-xl"
        >
          <i className="ri-arrow-left-line text-lg" style={{ color: 'var(--text-primary)' }} />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Claims</h1>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {allClaims.length} total claim{allClaims.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => setShowRequestForm(true)}
          className="glass px-3 py-2 rounded-xl flex items-center gap-1.5"
          style={{ color: 'var(--accent)' }}
        >
          <i className="ri-add-circle-line" />
          <span className="text-xs font-medium">Request</span>
        </button>
        <ThemeToggle />
      </div>

      {error && (
        <div className="glass p-3 mb-4 flex items-center gap-2">
          <i className="ri-error-warning-line text-red-400" />
          <p className="text-red-400 text-xs">{error}</p>
        </div>
      )}

      {/* Empty state */}
      {allClaims.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-20 text-center fade-in">
          <div className="glass w-20 h-20 flex items-center justify-center mb-4">
            <i className="ri-shield-check-line text-4xl" style={{ color: 'var(--text-muted)' }} />
          </div>
          <p className="font-medium text-sm mb-1" style={{ color: 'var(--text-primary)' }}>No claims yet</p>
          <p className="text-xs max-w-xs" style={{ color: 'var(--text-muted)' }}>
            Your policy will automatically protect you during disruptions. Claims are
            created and processed without any action needed from you.
          </p>
        </div>
      )}

      {/* Claims list */}
      <div className="space-y-3">
        {allClaims.map((claim: any, idx: number) => {
          const claimId = claim.id || claim.claimNumber;
          const isExpanded = expandedId === claimId;
          const icon = DISRUPTION_ICONS[claim.disruptionType] || 'ri-alert-line';
          const statusStyle = STATUS_COLORS[claim.status] || { bg: 'rgba(100,116,139,0.15)', text: '#94a3b8' };

          return (
            <div
              key={claimId}
              className="glass overflow-hidden transition-all slide-up card-hover"
              style={{ animationDelay: `${idx * 0.05}s` }}
            >
              {/* Summary row */}
              <button
                onClick={() => toggleExpand(claimId)}
                className="w-full flex items-center gap-3 p-4 text-left"
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--bg-card)' }}>
                  <i className={`${icon} text-xl`} style={{ color: 'var(--accent)' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                    {claim.claimNumber || claimId}
                  </p>
                  <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    {claim.disruptionType || 'Disruption'} &middot;{' '}
                    {claim.createdAt
                      ? new Date(claim.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                      : '--'}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                    &#8377;{claim.payoutAmount || '0'}
                  </p>
                  <span
                    className="inline-block px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide"
                    style={{ background: statusStyle.bg, color: statusStyle.text }}
                  >
                    {claim.status}
                  </span>
                </div>
                <i
                  className={`ri-arrow-down-s-line text-lg shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  style={{ color: 'var(--text-muted)' }}
                />
              </button>

              {/* Expanded details */}
              {isExpanded && (
                <div className="px-4 pb-4 pt-0 fade-in" style={{ borderTop: '1px solid var(--border)' }}>
                  <div className="grid grid-cols-2 gap-3 mt-3">
                    {[
                      { label: 'Disruption Type', value: claim.disruptionType || '--' },
                      { label: 'Payout', value: `\u20B9${claim.payoutAmount || '0'}` },
                      { label: 'Zone', value: claim.zone || '--' },
                      { label: 'Duration', value: `${claim.disruptionDays || claim.days || '--'} day(s)` },
                    ].map((item) => (
                      <div key={item.label} className="p-3 rounded-xl" style={{ background: 'var(--bg-card)' }}>
                        <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{item.label}</p>
                        <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{item.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Payout receipt — only renders once we've actually fetched */}
                  <PayoutReceipt state={payouts[claimId]} />

                  {/* Fraud/BAS analysis is an internal risk signal — hidden from worker view */}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Payout receipt card — renders inside a claim's expanded section.
 *
 * Three display modes:
 *   - null/loading/none → render nothing (keeps the UI quiet for unapproved claims)
 *   - in-flight (INITIATED/PROCESSING/RETRYING) → show the animated timeline
 *   - terminal (SUCCESS/FAILED) → show the gateway-branded receipt with UTR,
 *     transaction ref, fee breakdown, and net amount credited
 *
 * The gateway brand stripe along the top is what makes this feel like a real
 * bank receipt. The UTR is rendered monospace-large because workers recognize
 * UTRs from their bank SMS — seeing the same number here builds trust.
 */
function PayoutReceipt({ state }: { state: PayoutState | undefined }) {
  if (!state || state === 'loading' || state === 'none') return null;

  const payout = state;
  const status = payout.status;
  const inFlight = status === 'INITIATED' || status === 'PROCESSING' || status === 'RETRYING';
  const failed = status === 'FAILED';
  const settled = status === 'SUCCESS';

  const meta = payout.gateway ? GATEWAY_META[payout.gateway] : null;
  const brandColor = meta?.color ?? 'var(--accent)';
  const brandLabel = meta?.label ?? 'Payout';
  const brandIcon = meta?.icon ?? 'ri-send-plane-line';
  const brandRail = meta?.rail ?? '';

  const settledTs = payout.settled_at
    ? new Date(payout.settled_at).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <div
      className="mt-3 rounded-xl overflow-hidden"
      style={{ background: 'var(--bg-card)', border: `1px solid ${brandColor}33` }}
    >
      {/* Brand stripe — the coloured band that makes this look like a bank receipt */}
      <div className="h-1" style={{ background: brandColor }} />

      <div className="p-4">
        {/* Header: gateway + status */}
        <div className="flex items-center gap-2.5 mb-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: `${brandColor}1a` }}
          >
            <i className={`${brandIcon} text-lg`} style={{ color: brandColor }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
              {brandLabel}
            </p>
            <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              {brandRail}
              {settledTs ? ` · ${settledTs}` : ''}
            </p>
          </div>
          {settled && (
            <div
              className="flex items-center gap-1 px-2 py-1 rounded-full"
              style={{ background: 'rgba(16,185,129,0.15)' }}
            >
              <i className="ri-check-double-line text-[11px]" style={{ color: '#10b981' }} />
              <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: '#10b981' }}>
                Settled
              </span>
            </div>
          )}
          {failed && (
            <div
              className="flex items-center gap-1 px-2 py-1 rounded-full"
              style={{ background: 'rgba(239,68,68,0.15)' }}
            >
              <i className="ri-error-warning-line text-[11px]" style={{ color: '#ef4444' }} />
              <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: '#ef4444' }}>
                Failed
              </span>
            </div>
          )}
          {inFlight && (
            <div
              className="flex items-center gap-1 px-2 py-1 rounded-full"
              style={{ background: 'rgba(59,130,246,0.15)' }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full animate-pulse"
                style={{ background: '#3b82f6' }}
              />
              <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: '#3b82f6' }}>
                In progress
              </span>
            </div>
          )}
        </div>

        {/* Timeline always visible — animates for in-flight, frozen for terminal */}
        <div className="mb-3">
          <PayoutTimeline
            status={status}
            initiatedAt={payout.initiated_at}
            processingAt={payout.processing_at}
            settledAt={payout.settled_at}
            failedAt={payout.failed_at}
            failureReason={payout.failure_reason}
            compact
          />
        </div>

        {/* Net amount — big & celebratory when settled */}
        {settled && (
          <div
            className="p-3 rounded-xl text-center mb-3"
            style={{ background: `${brandColor}10` }}
          >
            <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
              Credited to your account
            </p>
            <p className="text-2xl font-bold mt-0.5" style={{ color: brandColor }}>
              &#8377;{Number(payout.net_amount ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </p>
          </div>
        )}

        {/* Receipt rows — UTR, fees, net. Only meaningful once we have values. */}
        {(settled || (payout.utr_number || payout.transaction_ref)) && (
          <div className="space-y-1.5 text-xs">
            {payout.utr_number && (
              <ReceiptRow label="UTR" value={payout.utr_number} mono highlight />
            )}
            {payout.transaction_ref && (
              <ReceiptRow label="Txn ID" value={payout.transaction_ref} mono tiny />
            )}
            <ReceiptRow label="Gross" value={`\u20B9${Number(payout.amount ?? 0).toLocaleString('en-IN')}`} />
            {Number(payout.fee_amount ?? 0) > 0 && (
              <ReceiptRow label="Gateway fee" value={`\u2212 \u20B9${Number(payout.fee_amount ?? 0).toFixed(2)}`} muted />
            )}
            {Number(payout.tax_amount ?? 0) > 0 && (
              <ReceiptRow label="GST (18% on fee)" value={`\u2212 \u20B9${Number(payout.tax_amount ?? 0).toFixed(2)}`} muted />
            )}
          </div>
        )}

        {/* Failure reason — only shows if the gateway gave us one */}
        {failed && payout.failure_reason && (
          <div
            className="mt-3 p-2.5 rounded-lg text-[11px]"
            style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}
          >
            <i className="ri-information-line mr-1" />
            {payout.failure_reason}
          </div>
        )}
      </div>
    </div>
  );
}

function ReceiptRow({
  label,
  value,
  mono,
  tiny,
  muted,
  highlight,
}: {
  label: string;
  value: string;
  mono?: boolean;
  tiny?: boolean;
  muted?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
        {label}
      </span>
      <span
        className={`${mono ? 'font-mono' : ''} ${tiny ? 'text-[10px]' : 'text-xs'} ${highlight ? 'font-semibold' : ''}`}
        style={{ color: muted ? 'var(--text-muted)' : 'var(--text-primary)' }}
      >
        {value}
      </span>
    </div>
  );
}
