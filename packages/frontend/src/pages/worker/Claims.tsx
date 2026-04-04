import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { claims as claimsApi } from '../../api/client';

const STATUS_COLORS: Record<string, string> = {
  CREATED: 'bg-blue-500/20 text-blue-400',
  VALIDATING: 'bg-yellow-500/20 text-yellow-400',
  APPROVED: 'bg-emerald-500/20 text-emerald-400',
  UNDER_REVIEW: 'bg-orange-500/20 text-orange-400',
  REJECTED: 'bg-red-500/20 text-red-400',
  PAID: 'bg-emerald-500/20 text-emerald-300',
};

const DISRUPTION_ICONS: Record<string, string> = {
  RAINFALL: '\u{1F327}\u{FE0F}',
  HEATWAVE: '\u{1F525}',
  AQI: '\u{1F32B}\u{FE0F}',
  FLOOD: '\u{1F30A}',
  CYCLONE: '\u{1F300}',
};

export default function Claims() {
  const navigate = useNavigate();
  const [allClaims, setAllClaims] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await claimsApi.getClaims();
        const data = Array.isArray(res.data)
          ? res.data
          : res.data?.claims || [];
        setAllClaims(data);
      } catch (err: any) {
        setError('Failed to load claims');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 px-6 py-6 pb-20">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate('/dashboard')}
          className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center text-white"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h1 className="text-xl font-bold text-white">Claims</h1>
          <p className="text-slate-400 text-xs">
            {allClaims.length} total claim{allClaims.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {error && (
        <p className="mb-4 text-red-400 text-xs text-center">{error}</p>
      )}

      {/* Empty state */}
      {allClaims.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4 text-3xl">
            &#x1F6E1;&#xFE0F;
          </div>
          <p className="text-white font-medium text-sm mb-1">No claims yet</p>
          <p className="text-slate-500 text-xs max-w-xs">
            Your policy will automatically protect you during disruptions. Claims are
            created and processed without any action needed from you.
          </p>
        </div>
      )}

      {/* Claims list */}
      <div className="space-y-3">
        {allClaims.map((claim: any) => {
          const claimId = claim.id || claim.claimNumber;
          const isExpanded = expandedId === claimId;
          const icon =
            DISRUPTION_ICONS[claim.disruptionType] || '\u{26A0}\u{FE0F}';

          return (
            <div
              key={claimId}
              className="rounded-2xl bg-white/5 backdrop-blur border border-white/10 overflow-hidden transition-all"
            >
              {/* Summary row */}
              <button
                onClick={() => toggleExpand(claimId)}
                className="w-full flex items-center gap-3 p-4 text-left"
              >
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-xl shrink-0">
                  {icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">
                    {claim.claimNumber || claimId}
                  </p>
                  <p className="text-slate-500 text-[10px]">
                    {claim.disruptionType || 'Disruption'} &middot;{' '}
                    {claim.createdAt
                      ? new Date(claim.createdAt).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })
                      : '--'}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-white text-sm font-bold">
                    &#8377;{claim.payoutAmount || '0'}
                  </p>
                  <span
                    className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide ${
                      STATUS_COLORS[claim.status] ||
                      'bg-slate-500/20 text-slate-400'
                    }`}
                  >
                    {claim.status}
                  </span>
                </div>
                <svg
                  className={`w-4 h-4 text-slate-500 shrink-0 transition-transform ${
                    isExpanded ? 'rotate-180' : ''
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>

              {/* Expanded details */}
              {isExpanded && (
                <div className="px-4 pb-4 pt-0 border-t border-white/5">
                  <div className="grid grid-cols-2 gap-3 mt-3">
                    <div className="p-2.5 rounded-lg bg-white/5">
                      <p className="text-[10px] text-slate-500">Disruption Type</p>
                      <p className="text-white text-xs font-medium">
                        {claim.disruptionType || '--'}
                      </p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-white/5">
                      <p className="text-[10px] text-slate-500">Payout</p>
                      <p className="text-white text-xs font-medium">
                        &#8377;{claim.payoutAmount || '0'}
                      </p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-white/5">
                      <p className="text-[10px] text-slate-500">Zone</p>
                      <p className="text-white text-xs font-medium">
                        {claim.zone || '--'}
                      </p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-white/5">
                      <p className="text-[10px] text-slate-500">Duration</p>
                      <p className="text-white text-xs font-medium">
                        {claim.disruptionDays || claim.days || '--'} day(s)
                      </p>
                    </div>
                  </div>

                  {/* Fraud / BAS Score */}
                  {claim.fraudCheck && (
                    <div className="mt-3 p-3 rounded-lg bg-slate-800/80 border border-white/5">
                      <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-2">
                        Fraud Check &mdash; BAS Score
                      </p>
                      <div className="space-y-1.5">
                        {claim.fraudCheck.basScore != null && (
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-slate-400">
                              Overall BAS
                            </span>
                            <span className="text-xs text-white font-semibold">
                              {claim.fraudCheck.basScore}
                            </span>
                          </div>
                        )}
                        {claim.fraudCheck.locationScore != null && (
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-slate-400">
                              Location
                            </span>
                            <span className="text-xs text-white">
                              {claim.fraudCheck.locationScore}
                            </span>
                          </div>
                        )}
                        {claim.fraudCheck.behaviorScore != null && (
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-slate-400">
                              Behavior
                            </span>
                            <span className="text-xs text-white">
                              {claim.fraudCheck.behaviorScore}
                            </span>
                          </div>
                        )}
                        {claim.fraudCheck.weatherCorrelation != null && (
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-slate-400">
                              Weather Correlation
                            </span>
                            <span className="text-xs text-white">
                              {claim.fraudCheck.weatherCorrelation}
                            </span>
                          </div>
                        )}
                        {claim.fraudCheck.verdict && (
                          <div className="flex items-center justify-between pt-1 border-t border-white/5">
                            <span className="text-xs text-slate-400">
                              Verdict
                            </span>
                            <span
                              className={`text-xs font-semibold ${
                                claim.fraudCheck.verdict === 'PASS'
                                  ? 'text-emerald-400'
                                  : 'text-red-400'
                              }`}
                            >
                              {claim.fraudCheck.verdict}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
