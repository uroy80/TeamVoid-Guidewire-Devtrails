import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { analytics, admin } from '../api/client';
import ThemeToggle from '../components/ThemeToggle';
import Logo from '../components/Logo';

interface FraudSummary {
  flaggedClaims: number;
  gpsSpoofAttempts: number;
  basTierDistribution: Record<string, number>;
}



interface FlaggedClaim {
  id: string;
  claim_number: string;
  worker_name: string;
  worker_mobile?: string;
  worker_platform?: string;
  event_type?: string;
  event_severity?: string;
  zone_name?: string;
  disruption_hours?: number;
  income_loss_payout: number;
  fraud_score: number;
  fraud_check_details?: any;
  flags?: string[];
}

const BAS_COMPONENTS_META: { key: string; label: string; weight: string }[] = [
  { key: 'gps_authenticity', label: 'GPS Authenticity', weight: '30%' },
  { key: 'movement_entropy', label: 'Movement Entropy', weight: '15%' },
  { key: 'device_consistency', label: 'Device Consistency', weight: '15%' },
  { key: 'historical_behavior', label: 'Historical Behavior', weight: '20%' },
  { key: 'ring_fraud_absence', label: 'Ring Fraud Absence', weight: '10%' },
  { key: 'weather_correlation', label: 'Weather Correlation', weight: '10%' },
];

const TIER_COLORS: Record<string, string> = {
  GREEN: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  YELLOW: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  ORANGE: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  RED: 'bg-red-500/20 text-red-400 border-red-500/30',
};

const FraudReview: React.FC = () => {
  const [summary, setSummary] = useState<FraudSummary | null>(null);
  const [queue, setQueue] = useState<FlaggedClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [aiAssessments, setAiAssessments] = useState<Record<string, string>>({});
  const [aiAssessmentLoading, setAiAssessmentLoading] = useState<Record<string, boolean>>({});
  const [expandedClaimId, setExpandedClaimId] = useState<string | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const [fraudRes, queueRes] = await Promise.all([
        analytics.getAdminFraud(),
        admin.getReviewQueue(),
      ]);
      setSummary(fraudRes.data);
      setQueue(queueRes.data?.claims || queueRes.data || []);
    } catch (err) {
      showToast('Failed to load fraud data', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleApprove = async (id: string) => {
    setResolvingId(id);
    try {
      await admin.resolveClaim(id, { approved: true });
      setQueue((prev) => prev.filter((c) => c.id !== id));
      showToast('Claim approved successfully', 'success');
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to approve claim', 'error');
    } finally {
      setResolvingId(null);
    }
  };

  const handleReject = async (id: string) => {
    if (!rejectReason.trim()) return;
    setResolvingId(id);
    try {
      await admin.resolveClaim(id, { approved: false, reason: rejectReason });
      setQueue((prev) => prev.filter((c) => c.id !== id));
      setRejectingId(null);
      setRejectReason('');
      showToast('Claim rejected', 'success');
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to reject claim', 'error');
    } finally {
      setResolvingId(null);
    }
  };

  const toggleAiAssessment = async (claimId: string) => {
    if (expandedClaimId === claimId) {
      setExpandedClaimId(null);
      return;
    }
    setExpandedClaimId(claimId);
    if (!aiAssessments[claimId]) {
      setAiAssessmentLoading((prev) => ({ ...prev, [claimId]: true }));
      try {
        const res = await admin.getClaimAIAssessment(claimId);
        setAiAssessments((prev) => ({
          ...prev,
          [claimId]: res.data?.assessment || res.data?.narrative || JSON.stringify(res.data),
        }));
      } catch {
        setAiAssessments((prev) => ({ ...prev, [claimId]: 'Failed to load AI assessment.' }));
      } finally {
        setAiAssessmentLoading((prev) => ({ ...prev, [claimId]: false }));
      }
    }
  };

  const fraudScoreColor = (score: number) => {
    if (score >= 75) return 'bg-red-500';
    if (score >= 50) return 'bg-orange-500';
    if (score >= 25) return 'bg-yellow-500';
    return 'bg-emerald-500';
  };

  const fraudScoreTextColor = (score: number) => {
    if (score >= 75) return 'text-red-400';
    if (score >= 50) return 'text-orange-400';
    if (score >= 25) return 'text-yellow-400';
    return 'text-emerald-400';
  };

  const componentScoreColor = (score: number) => {
    if (score >= 80) return 'bg-emerald-500';
    if (score >= 60) return 'bg-yellow-500';
    if (score >= 40) return 'bg-orange-500';
    return 'bg-red-500';
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
        <div className="flex flex-col items-center gap-3">
          <svg className="animate-spin h-8 w-8 text-indigo-400" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loading fraud review...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-primary)' }}>
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-lg border shadow-lg transition-all ${
          toast.type === 'success'
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
            : 'bg-red-500/10 border-red-500/30 text-red-400'
        }`}>
          {toast.message}
        </div>
      )}

      {/* Header */}
      <header className="glass sticky top-0 z-40" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/admin" className="hover:opacity-80 transition-colors" style={{ color: 'var(--text-secondary)' }}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <Logo className="w-9 h-9 rounded-lg" />
            <div>
              <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Fraud Review</h1>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Neural Risk Assessment Engine powered by RAG pipeline</p>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Fraud Analytics Summary */}
        <section>
          <h2 className="text-sm font-medium uppercase tracking-wider mb-4" style={{ color: 'var(--text-secondary)' }}>Fraud Analytics</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Flagged Claims */}
            <div className="glass rounded-xl p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-amber-600/20 flex items-center justify-center">
                  <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
                  </svg>
                </div>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Flagged Claims</p>
              </div>
              <p className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>{summary?.flaggedClaims ?? '---'}</p>
            </div>

            {/* GPS Spoof Attempts */}
            <div className="glass rounded-xl p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-red-600/20 flex items-center justify-center">
                  <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>GPS Spoof Attempts</p>
              </div>
              <p className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>{summary?.gpsSpoofAttempts ?? '---'}</p>
            </div>

            {/* BAS Tier Distribution */}
            <div className="glass rounded-xl p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-indigo-600/20 flex items-center justify-center">
                  <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>BAS Tier Distribution</p>
              </div>
              <div className="flex flex-wrap gap-2 mt-1">
                {summary?.basTierDistribution
                  ? Object.entries(summary.basTierDistribution).map(([tier, count]) => (
                      <span
                        key={tier}
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
                          TIER_COLORS[tier] || 'bg-slate-500/20 text-slate-400 border-slate-500/30'
                        }`}
                      >
                        {tier}
                        <span className="bg-white/10 rounded-full px-1.5 py-0.5 text-[10px]">{count}</span>
                      </span>
                    ))
                  : <span className="text-sm" style={{ color: 'var(--text-muted)' }}>No data</span>
                }
              </div>
            </div>
          </div>
        </section>

        {/* Review Queue */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
              Review Queue ({queue.length})
            </h2>
          </div>

          {queue.length === 0 ? (
            <div className="glass rounded-xl p-12 text-center">
              <svg className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p style={{ color: 'var(--text-secondary)' }}>No flagged claims in the review queue</p>
            </div>
          ) : (
            <div className="space-y-4">
              {queue.map((claim) => {
                // Parse fraud_check_details JSONB
                const fraudDetails = typeof claim.fraud_check_details === 'string'
                  ? JSON.parse(claim.fraud_check_details)
                  : claim.fraud_check_details || {};
                const basBreakdown = fraudDetails.bas_breakdown || fraudDetails;
                const fraudFlags: string[] = fraudDetails.flags || claim.flags || [];

                // Build BAS component rows from snake_case fields
                const basComponents = BAS_COMPONENTS_META.map((meta) => ({
                  name: meta.label,
                  score: Number(basBreakdown[meta.key]) || 0,
                  weight: meta.weight,
                }));

                return (
                <div
                  key={claim.id}
                  className="glass rounded-xl p-6"
                >
                  {/* Claim Header */}
                  <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-5">
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>{claim.claim_number}</h3>
                        <span className="px-2 py-0.5 rounded text-xs" style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                          {claim.event_type?.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{claim.worker_name}</p>
                      <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>Payout: {formatCurrency(claim.income_loss_payout)}</p>
                    </div>

                    {/* Fraud Score */}
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Fraud Score</p>
                        <p className={`text-2xl font-bold ${fraudScoreTextColor(claim.fraud_score)}`}>
                          {claim.fraud_score}
                        </p>
                      </div>
                      <div className="w-24 h-3 rounded-full overflow-hidden" style={{ background: 'var(--bg-secondary)' }}>
                        <div
                          className={`h-full rounded-full transition-all ${fraudScoreColor(claim.fraud_score)}`}
                          style={{ width: `${claim.fraud_score}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* BAS Breakdown */}
                  <div className="mb-5">
                    <p className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: 'var(--text-secondary)' }}>
                      BAS Breakdown {basBreakdown.total != null && <span className="ml-2 text-indigo-400">(Total: {basBreakdown.total})</span>}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {basComponents.map((component, idx) => (
                          <div key={idx} className="card-solid rounded-lg p-3">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{component.name}</span>
                              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>({component.weight})</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-secondary)' }}>
                                <div
                                  className={`h-full rounded-full ${componentScoreColor(component.score)}`}
                                  style={{ width: `${component.score}%` }}
                                />
                              </div>
                              <span className="text-xs font-medium w-8 text-right" style={{ color: 'var(--text-secondary)' }}>{component.score}</span>
                            </div>
                          </div>
                      ))}
                    </div>
                  </div>

                  {/* AI Assessment */}
                  <div className="mb-5">
                    <button
                      onClick={() => toggleAiAssessment(claim.id)}
                      className="flex items-center gap-2 text-xs font-medium text-purple-400 hover:text-purple-300 transition-colors mb-3 uppercase tracking-wider"
                    >
                      <i className="ri-robot-line" />
                      AI Assessment
                      <i className={`ri-arrow-${expandedClaimId === claim.id ? 'up' : 'down'}-s-line`} />
                    </button>
                    {expandedClaimId === claim.id && (
                      <div className="card-solid border border-purple-500/20 rounded-lg p-4">
                        {aiAssessmentLoading[claim.id] ? (
                          <div className="flex items-center gap-2 py-2">
                            <svg className="animate-spin h-4 w-4 text-purple-400" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Generating AI assessment...</span>
                          </div>
                        ) : (
                          <p className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text-secondary)' }}>
                            {aiAssessments[claim.id] || 'No assessment available.'}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Flags */}
                  {fraudFlags.length > 0 && (
                    <div className="mb-5">
                      <p className="text-xs font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--text-secondary)' }}>Flags</p>
                      <div className="flex flex-wrap gap-2">
                        {fraudFlags.map((flag, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg text-xs font-medium"
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                            </svg>
                            {flag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-3 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
                    {rejectingId === claim.id ? (
                      <div className="flex items-center gap-3 flex-1">
                        <input
                          type="text"
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          placeholder="Enter rejection reason..."
                          className="input-style flex-1"
                          autoFocus
                        />
                        <button
                          onClick={() => handleReject(claim.id)}
                          disabled={!rejectReason.trim() || resolvingId === claim.id}
                          className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:bg-red-600/50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
                        >
                          Confirm Reject
                        </button>
                        <button
                          onClick={() => { setRejectingId(null); setRejectReason(''); }}
                          className="px-4 py-2 rounded-lg text-sm transition-colors"
                          style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => handleApprove(claim.id)}
                          disabled={resolvingId === claim.id}
                          className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-600/50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                        >
                          {resolvingId === claim.id ? (
                            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                          Approve
                        </button>
                        <button
                          onClick={() => setRejectingId(claim.id)}
                          disabled={resolvingId === claim.id}
                          className="px-5 py-2 bg-red-600/20 border border-red-500/30 text-red-400 hover:bg-red-600/30 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default FraudReview;
