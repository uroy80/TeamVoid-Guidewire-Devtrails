import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { claims as claimsApi } from '../api/client';
import ThemeToggle from '../components/ThemeToggle';
import RequestClaimForm from '../components/RequestClaimForm';

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

export default function Claims() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [allClaims, setAllClaims] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showRequestForm, setShowRequestForm] = useState(false);

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
    setExpandedId(expandedId === id ? null : id);
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
