import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { admin } from '../../api/client';
import ThemeToggle from '../../components/ThemeToggle';

interface AdminClaim {
  id: string;
  claim_number?: string;
  worker_id: string;
  worker_name?: string;
  worker_mobile?: string;
  policy_id?: string;
  policy_tier?: string;
  zone_name?: string;
  status: string;
  disruption_type?: string;
  event_type?: string;
  severity?: string;
  income_loss_payout?: number | string;
  disruption_hours?: number | string;
  fraud_score?: number;
  fraud_check_details?: any;
  created_at?: string;
  resolved_at?: string;
  resolution_reason?: string;
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  PENDING: { bg: 'rgba(59,130,246,0.15)', text: '#60a5fa' },
  UNDER_REVIEW: { bg: 'rgba(234,179,8,0.15)', text: '#eab308' },
  FLAGGED: { bg: 'rgba(249,115,22,0.15)', text: '#f97316' },
  APPROVED: { bg: 'rgba(16,185,129,0.15)', text: '#10b981' },
  REJECTED: { bg: 'rgba(239,68,68,0.15)', text: '#ef4444' },
  PAID: { bg: 'rgba(34,197,94,0.15)', text: '#22c55e' },
};

const STATUS_FILTERS = ['All', 'PENDING', 'UNDER_REVIEW', 'FLAGGED', 'APPROVED', 'REJECTED', 'PAID'];

export default function AdminClaims() {
  const [claims, setClaims] = useState<AdminClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('All');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminClaim | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [action, setAction] = useState<{ id: string; type: 'approve' | 'reject' } | null>(null);
  const [reason, setReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const loadClaims = useCallback(async () => {
    setLoading(true);
    try {
      const params = statusFilter === 'All' ? {} : { status: statusFilter };
      const res = await admin.listClaims(params);
      setClaims(res.data?.claims || []);
    } catch {
      showToast('Failed to load claims', 'error');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, showToast]);

  useEffect(() => {
    loadClaims();
  }, [loadClaims]);

  const handleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    setExpandedId(id);
    setDetailLoading(true);
    try {
      const res = await admin.getClaim(id);
      setDetail(res.data?.claim || res.data);
    } catch {
      showToast('Failed to load claim details', 'error');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleAction = async () => {
    if (!action) return;
    setActionLoading(true);
    try {
      if (action.type === 'approve') {
        await admin.approveClaim(action.id, reason || undefined);
        showToast('Claim approved', 'success');
      } else {
        await admin.rejectClaim(action.id, reason || undefined);
        showToast('Claim rejected', 'success');
      }
      setAction(null);
      setReason('');
      setExpandedId(null);
      setDetail(null);
      await loadClaims();
    } catch (err: any) {
      showToast(err?.response?.data?.error || `Failed to ${action.type}`, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const fmtMoney = (v: any): string => {
    const n = Number(v);
    if (!isFinite(n)) return '—';
    return `Rs. ${Math.round(n).toLocaleString('en-IN')}`;
  };

  const fmtDate = (v: any): string => {
    if (!v) return '—';
    try {
      return new Date(v).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
    } catch {
      return String(v);
    }
  };

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-primary)' }}>
      {/* Toast */}
      {toast && (
        <div
          className="fixed top-4 right-4 z-50 px-5 py-3 rounded-lg border shadow-lg"
          style={
            toast.type === 'success'
              ? { background: 'rgba(16,185,129,0.15)', borderColor: 'rgba(16,185,129,0.4)', color: '#10b981' }
              : { background: 'rgba(239,68,68,0.15)', borderColor: 'rgba(239,68,68,0.4)', color: '#ef4444' }
          }
        >
          {toast.message}
        </div>
      )}

      {/* Approve / Reject modal */}
      {action && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="glass rounded-xl p-6 max-w-md w-full">
            <div className="flex items-start gap-3 mb-4">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{
                  background: action.type === 'approve' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                }}
              >
                <i
                  className={`${action.type === 'approve' ? 'ri-check-double-line' : 'ri-close-circle-line'} text-xl`}
                  style={{ color: action.type === 'approve' ? '#10b981' : '#ef4444' }}
                />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {action.type === 'approve' ? 'Approve claim' : 'Reject claim'}
                </h3>
                <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                  {action.type === 'approve'
                    ? 'This will move the claim to APPROVED and trigger the payout pipeline.'
                    : 'This will mark the claim as REJECTED. The worker will be notified.'}
                </p>
              </div>
            </div>

            <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>
              Reason (optional, shown to worker)
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="input-style w-full mb-4"
              placeholder={action.type === 'approve' ? 'e.g. Disruption verified via BMD radar' : 'e.g. Event not covered under this tier'}
            />

            <div className="flex items-center gap-3">
              <button
                onClick={handleAction}
                disabled={actionLoading}
                className={`flex-1 px-4 py-2 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                  action.type === 'approve'
                    ? 'bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-600/30'
                    : 'bg-red-600 hover:bg-red-500 disabled:bg-red-600/30'
                }`}
              >
                {actionLoading && (
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                )}
                {action.type === 'approve' ? 'Confirm approval' : 'Confirm rejection'}
              </button>
              <button
                onClick={() => { setAction(null); setReason(''); }}
                disabled={actionLoading}
                className="flex-1 px-4 py-2 rounded-lg text-sm"
                style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="glass sticky top-0 z-40" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/admin" className="hover:opacity-80" style={{ color: 'var(--text-secondary)' }}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <img src="/logos/gigshield.png" alt="GigShield" className="w-9 h-9 rounded-lg" />
            <div>
              <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Claims Management</h1>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Review, approve, and reject worker claims</p>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {/* Status filter */}
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={{
                background: statusFilter === s ? 'var(--accent)' : 'var(--bg-secondary)',
                color: statusFilter === s ? '#fff' : 'var(--text-secondary)',
              }}
            >
              {s.replace('_', ' ')}
            </button>
          ))}
        </div>

        {/* Loading */}
        {loading ? (
          <div className="py-12 text-center">
            <svg className="animate-spin h-8 w-8 text-indigo-400 mx-auto" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-sm mt-3" style={{ color: 'var(--text-secondary)' }}>Loading claims...</p>
          </div>
        ) : claims.length === 0 ? (
          <div className="glass p-12 text-center">
            <i className="ri-inbox-line text-4xl" style={{ color: 'var(--text-muted)' }} />
            <p className="mt-3 text-sm" style={{ color: 'var(--text-secondary)' }}>No claims matching this filter</p>
          </div>
        ) : (
          <div className="glass rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead style={{ background: 'var(--bg-secondary)' }}>
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Claim #</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Worker</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Event</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Payout</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>BAS</th>
                  <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {claims.map((c) => {
                  const isExpanded = expandedId === c.id;
                  const sc = STATUS_COLORS[c.status] || { bg: 'var(--bg-secondary)', text: 'var(--text-secondary)' };
                  const basScore =
                    c.fraud_score ??
                    (typeof c.fraud_check_details === 'string'
                      ? (() => { try { return JSON.parse(c.fraud_check_details).bas_score; } catch { return null; } })()
                      : c.fraud_check_details?.bas_score);
                  const canAct = ['PENDING', 'UNDER_REVIEW', 'FLAGGED'].includes(c.status);
                  return (
                    <>
                      <tr key={c.id} style={{ borderTop: '1px solid var(--border)' }}>
                        <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--text-primary)' }}>
                          {c.claim_number || c.id.slice(0, 8)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium" style={{ color: 'var(--text-primary)' }}>{c.worker_name || '—'}</div>
                          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{c.worker_mobile || '—'}</div>
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
                          {c.disruption_type || c.event_type || '—'}
                          {c.severity ? ` · ${c.severity}` : ''}
                        </td>
                        <td className="px-4 py-3 text-right font-mono" style={{ color: 'var(--text-primary)' }}>
                          {fmtMoney(c.income_loss_payout)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>
                          {basScore != null ? `${basScore}/100` : '—'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider"
                            style={{ background: sc.bg, color: sc.text }}
                          >
                            {c.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleExpand(c.id)}
                              className="px-3 py-1 bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 rounded-lg text-xs font-medium hover:bg-indigo-600/30"
                            >
                              {isExpanded ? 'Hide' : 'View'}
                            </button>
                            {canAct && (
                              <>
                                <button
                                  onClick={() => setAction({ id: c.id, type: 'approve' })}
                                  className="px-3 py-1 bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 rounded-lg text-xs font-medium hover:bg-emerald-600/30"
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={() => setAction({ id: c.id, type: 'reject' })}
                                  className="px-3 py-1 bg-red-600/20 border border-red-500/30 text-red-400 rounded-lg text-xs font-medium hover:bg-red-600/30"
                                >
                                  Reject
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr style={{ borderTop: '1px solid var(--border)' }}>
                          <td colSpan={7} className="px-4 py-4" style={{ background: 'var(--bg-secondary)' }}>
                            {detailLoading || !detail ? (
                              <div className="py-4 text-center">
                                <svg className="animate-spin h-6 w-6 text-indigo-400 mx-auto" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                              </div>
                            ) : (
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                                {[
                                  { k: 'Policy tier', v: detail.policy_tier || '—' },
                                  { k: 'Zone', v: detail.zone_name || '—' },
                                  { k: 'Severity', v: detail.severity || '—' },
                                  { k: 'Disruption hours', v: detail.disruption_hours ?? '—' },
                                  { k: 'Created', v: fmtDate(detail.created_at) },
                                  { k: 'Resolved', v: fmtDate(detail.resolved_at) },
                                  { k: 'Resolution reason', v: detail.resolution_reason || '—' },
                                ].map(({ k, v }) => (
                                  <div key={k} className="p-3 rounded-lg" style={{ background: 'var(--bg-card)' }}>
                                    <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{k}</p>
                                    <p className="mt-0.5" style={{ color: 'var(--text-primary)' }}>{String(v)}</p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
