import { useEffect, useMemo, useState } from 'react';
import { admin } from '../api/client';
import PayoutTimeline, { type TimelineStatus } from './PayoutTimeline';

interface GatewayMeta {
  name: 'RAZORPAY' | 'STRIPE' | 'UPI';
  display_name: string;
  brand_color: string;
  payment_method: string;
}

interface PayoutRow {
  id: string;
  claim_id: string;
  amount: number | string;
  status: TimelineStatus;
  gateway: GatewayMeta['name'] | null;
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
  // Admin-only: full raw response from the gateway. Present when the payout
  // was routed through the real Razorpay Orders API (contains an
  // `_gigshield.dashboard_url` link the admin can click to inspect the order
  // on Razorpay's dashboard).
  gateway_response?: {
    id?: string;
    entity?: string;
    _gigshield?: {
      source?: 'razorpay_real_api' | 'razorpay_mock';
      dashboard_url?: string;
    };
  } | null;
}

interface Props {
  claimId: string;
  claimNumber?: string;
  workerName?: string;
  workerUpi?: string;
  grossAmount: number;
  onClose(): void;
  /** Optional live status feed — parent pipes SSE events that match this claim. */
  liveStatus?: TimelineStatus | null;
  /** Optional live payout row from SSE so timestamps update in real time. */
  livePayout?: Partial<PayoutRow> | null;
}

/**
 * Admin "Send Payout" modal.
 *
 * Three modes, chosen by which state is currently set:
 *   - Idle     → show gateway picker + fee preview + "Send ₹X" CTA
 *   - In-flight → show the 3-step timeline animating
 *   - Terminal  → show receipt (SUCCESS) or failure reason (FAILED)
 *
 * Parent is responsible for piping SSE events into `liveStatus/livePayout`.
 * On mount we also poll `GET /admin/claims/:id/payout` once so the modal
 * can re-open a payout that's already in flight and pick up the current
 * state without missing SSE updates that fired before we subscribed.
 */
export default function SendPayoutModal({
  claimId,
  claimNumber,
  workerName,
  workerUpi,
  grossAmount,
  onClose,
  liveStatus,
  livePayout,
}: Props) {
  const [gateways, setGateways] = useState<GatewayMeta[]>([]);
  const [selectedGateway, setSelectedGateway] = useState<GatewayMeta['name'] | 'AUTO'>('AUTO');
  const [payout, setPayout] = useState<PayoutRow | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load gateway metadata once so the picker shows brand colors
  useEffect(() => {
    (async () => {
      try {
        const res = await admin.getPayoutGateways();
        setGateways(res.data.gateways);
      } catch {
        // If this fails the user can still trigger with AUTO — non-fatal.
      }
    })();
  }, []);

  // Pick up an existing in-flight payout for this claim (if any)
  useEffect(() => {
    (async () => {
      try {
        const res = await admin.getClaimPayout(claimId);
        if (res.data.payout) setPayout(res.data.payout);
      } catch {
        // 404 = no payout yet, totally fine
      }
    })();
  }, [claimId]);

  // Merge SSE updates into local state so the timeline animates live
  useEffect(() => {
    if (!livePayout) return;
    setPayout((prev) => ({ ...(prev ?? {}), ...(livePayout as PayoutRow) } as PayoutRow));
  }, [livePayout]);

  const effectiveStatus: TimelineStatus | null = liveStatus ?? payout?.status ?? null;
  const terminal = effectiveStatus === 'SUCCESS' || effectiveStatus === 'FAILED';
  const inFlight = effectiveStatus === 'INITIATED' || effectiveStatus === 'PROCESSING' || effectiveStatus === 'RETRYING';
  const idle = !effectiveStatus;

  // Predict the fee breakdown the user will see when they confirm. These
  // match the mock gateway rates (kept in sync with razorpay.mock.ts etc.)
  const preview = useMemo(() => {
    const rates: Record<GatewayMeta['name'], { fee: number; flat: number }> = {
      RAZORPAY: { fee: 0.0025, flat: 0 },
      STRIPE:   { fee: 0.005,  flat: 2 },
      UPI:      { fee: 0,      flat: 0 },
    };
    const pick: GatewayMeta['name'] =
      selectedGateway === 'AUTO' ? autoSelect(workerUpi) : selectedGateway;
    const rate = rates[pick];
    const fee = Math.round((grossAmount * rate.fee + rate.flat) * 100) / 100;
    const gst = Math.round(fee * 0.18 * 100) / 100;
    const net = Math.max(0, Math.round((grossAmount - fee - gst) * 100) / 100);
    return { pick, fee, gst, net };
  }, [grossAmount, selectedGateway, workerUpi]);

  const handleSend = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await admin.sendPayout(claimId, selectedGateway === 'AUTO' ? undefined : selectedGateway);
      setPayout(res.data.payout);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Failed to initiate payout');
    } finally {
      setSubmitting(false);
    }
  };

  const activeGatewayMeta = gateways.find((g) => g.name === (payout?.gateway ?? preview.pick));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="glass rounded-2xl p-6 max-w-lg w-full max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start gap-3 mb-5">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background: activeGatewayMeta ? `${activeGatewayMeta.brand_color}22` : 'rgba(16,185,129,0.15)',
            }}
          >
            <i className="ri-send-plane-fill text-2xl" style={{ color: activeGatewayMeta?.brand_color ?? '#10b981' }} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>
              {terminal && effectiveStatus === 'SUCCESS' ? 'Payout settled' : terminal && effectiveStatus === 'FAILED' ? 'Payout failed' : inFlight ? 'Payout in progress' : 'Send payout'}
            </h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              {claimNumber ? `Claim ${claimNumber}` : `Claim ${claimId.slice(0, 8)}`}
              {workerName ? ` · ${workerName}` : ''}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/5">
            <i className="ri-close-line text-lg" style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>

        {/* Destination */}
        <div className="mb-5 p-3 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between text-xs mb-2">
            <span style={{ color: 'var(--text-muted)' }}>Destination VPA</span>
            <span className="font-mono" style={{ color: 'var(--text-primary)' }}>{workerUpi ?? '—'}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span style={{ color: 'var(--text-muted)' }}>Gross amount</span>
            <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
              &#8377;{grossAmount.toLocaleString('en-IN')}
            </span>
          </div>
        </div>

        {/* Timeline (always visible once in-flight) */}
        {(inFlight || terminal || payout) && (
          <div className="mb-5 p-4 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <PayoutTimeline
              status={effectiveStatus}
              initiatedAt={payout?.initiated_at}
              processingAt={payout?.processing_at}
              settledAt={payout?.settled_at}
              failedAt={payout?.failed_at}
              failureReason={payout?.failure_reason ?? undefined}
            />
          </div>
        )}

        {/* Gateway picker (idle only) */}
        {idle && (
          <>
            <label className="text-xs font-medium block mb-2" style={{ color: 'var(--text-secondary)' }}>
              Gateway
            </label>
            <div className="grid grid-cols-4 gap-2 mb-4">
              {[{ name: 'AUTO' as const, display_name: 'Auto', brand_color: '#64748b', payment_method: '—' }, ...gateways].map((g) => (
                <button
                  key={g.name}
                  type="button"
                  onClick={() => setSelectedGateway(g.name as any)}
                  className="p-2 rounded-xl text-center transition-all"
                  style={{
                    border: `2px solid ${selectedGateway === g.name ? g.brand_color : 'var(--border)'}`,
                    background: selectedGateway === g.name ? `${g.brand_color}15` : 'var(--bg-card)',
                  }}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: g.brand_color }}>
                    {g.name === 'AUTO' ? 'Auto' : g.name}
                  </p>
                  <p className="text-[9px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    {g.name === 'AUTO' ? 'by VPA suffix' : g.display_name}
                  </p>
                </button>
              ))}
            </div>

            {/* Fee preview */}
            <div className="p-3 rounded-xl mb-5 text-xs" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <p className="mb-2" style={{ color: 'var(--text-muted)' }}>
                Will route via <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{preview.pick}</span>
              </p>
              <div className="space-y-1">
                <Row label="Gross" value={`₹${grossAmount.toLocaleString('en-IN')}`} />
                <Row label="Gateway fee" value={`− ₹${preview.fee.toFixed(2)}`} />
                <Row label="GST (18% on fee)" value={`− ₹${preview.gst.toFixed(2)}`} />
                <div className="h-px my-1" style={{ background: 'var(--border)' }} />
                <Row label="Worker receives" value={`₹${preview.net.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`} strong />
              </div>
            </div>
          </>
        )}

        {/* Receipt (success only) */}
        {terminal && effectiveStatus === 'SUCCESS' && payout && (() => {
          // A transaction_ref starting with `order_` is a real Razorpay Order
          // id we got back from api.razorpay.com — the admin can verify it in
          // the Razorpay test dashboard. Also check the namespaced metadata
          // we stash in gateway_response so a mock-with-the-same-prefix never
          // masquerades as real.
          const meta = payout.gateway_response?._gigshield;
          const isRealRazorpay = meta?.source === 'razorpay_real_api';
          const dashboardUrl =
            meta?.dashboard_url ??
            (isRealRazorpay && payout.transaction_ref
              ? `https://dashboard.razorpay.com/app/orders/${payout.transaction_ref}`
              : null);
          return (
            <div className="p-3 rounded-xl mb-5 text-xs" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between mb-1">
                <span style={{ color: 'var(--text-muted)' }}>Gateway</span>
                <div className="flex items-center gap-1.5">
                  <span style={{ color: 'var(--text-secondary)' }}>{payout.gateway ?? '—'}</span>
                  {isRealRazorpay && (
                    <span
                      className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide"
                      style={{ background: 'rgba(51, 149, 255, 0.18)', color: '#3395FF' }}
                      title="Order was created via a live call to api.razorpay.com"
                    >
                      Real API
                    </span>
                  )}
                </div>
              </div>
              {payout.utr_number && <Row label="UTR" value={payout.utr_number} mono />}
              {payout.transaction_ref && <Row label="Txn ID" value={payout.transaction_ref} mono tiny />}
              <Row label="Fee" value={`₹${Number(payout.fee_amount ?? 0).toFixed(2)}`} />
              <Row label="GST" value={`₹${Number(payout.tax_amount ?? 0).toFixed(2)}`} />
              <div className="h-px my-1" style={{ background: 'var(--border)' }} />
              <Row label="Net credited" value={`₹${Number(payout.net_amount ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`} strong />
              {dashboardUrl && (
                <a
                  href={dashboardUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-3 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold transition-colors"
                  style={{ background: 'rgba(51, 149, 255, 0.12)', color: '#3395FF' }}
                >
                  <i className="ri-external-link-line" />
                  View in Razorpay Dashboard
                </a>
              )}
            </div>
          );
        })()}

        {error && (
          <div className="mb-4 p-3 rounded-lg text-xs" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
            {error}
          </div>
        )}

        {/* Actions */}
        {idle ? (
          <div className="flex gap-2">
            <button
              onClick={handleSend}
              disabled={submitting}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-50"
              style={{ background: activeGatewayMeta?.brand_color ?? '#10b981' }}
            >
              {submitting ? 'Sending…' : `Send ₹${preview.net.toLocaleString('en-IN', { maximumFractionDigits: 2 })} now`}
            </button>
            <button
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2.5 rounded-xl text-sm"
              style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={onClose}
            className="w-full px-4 py-2.5 rounded-xl text-sm font-medium"
            style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
          >
            {terminal ? 'Close' : 'Close (payout continues in background)'}
          </button>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, strong, mono, tiny }: { label: string; value: string; strong?: boolean; mono?: boolean; tiny?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span
        className={`${mono ? 'font-mono' : ''} ${strong ? 'font-semibold' : ''} ${tiny ? 'text-[10px]' : ''}`}
        style={{ color: strong ? 'var(--text-primary)' : 'var(--text-secondary)' }}
      >
        {value}
      </span>
    </div>
  );
}

function autoSelect(upiId?: string): 'RAZORPAY' | 'STRIPE' | 'UPI' {
  if (!upiId) return 'STRIPE';
  const v = upiId.toLowerCase();
  if (v.endsWith('@upi') || v.endsWith('@npci')) return 'UPI';
  if (v.endsWith('@paytm') || v.endsWith('@ptsbi') || v.endsWith('@okhdfc') ||
      v.endsWith('@okicici') || v.endsWith('@okaxis') || v.endsWith('@oksbi') ||
      v.endsWith('@ybl') || v.endsWith('@ibl')) return 'RAZORPAY';
  return 'STRIPE';
}
