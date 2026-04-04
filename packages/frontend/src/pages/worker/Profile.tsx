import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { worker, policy } from '../../api/client';

const RISK_COLORS = [
  { max: 30, label: 'Low', color: 'text-emerald-400', bar: 'bg-emerald-400' },
  { max: 60, label: 'Medium', color: 'text-yellow-400', bar: 'bg-yellow-400' },
  { max: 80, label: 'High', color: 'text-orange-400', bar: 'bg-orange-400' },
  { max: 100, label: 'Very High', color: 'text-red-400', bar: 'bg-red-400' },
];

function getRiskInfo(score: number) {
  return RISK_COLORS.find((r) => score <= r.max) || RISK_COLORS[3];
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-emerald-500/20 text-emerald-400',
  EXPIRED: 'bg-red-500/20 text-red-400',
  CANCELLED: 'bg-slate-500/20 text-slate-400',
};

export default function Profile() {
  const navigate = useNavigate();
  const [me, setMe] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [acknowledging, setAcknowledging] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [meRes, histRes] = await Promise.all([
          worker.getMe(),
          policy.getHistory().catch(() => ({ data: [] })),
        ]);
        setMe(meRes.data);
        const h = Array.isArray(histRes.data)
          ? histRes.data
          : histRes.data?.policies || [];
        setHistory(h);
      } catch {
        // handled by interceptor
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleAcknowledge = async () => {
    setAcknowledging(true);
    try {
      await worker.acknowledgeExclusions();
      setMe((prev: any) => ({ ...prev, exclusionsAcknowledged: true }));
    } catch {
      // silent
    } finally {
      setAcknowledging(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('gs_token');
    navigate('/welcome', { replace: true });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
      </div>
    );
  }

  const riskScore = me?.riskScore || 0;
  const risk = getRiskInfo(riskScore);

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
        <h1 className="text-xl font-bold text-white">Profile</h1>
      </div>

      {/* Avatar & Name */}
      <div className="flex flex-col items-center mb-6">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center text-3xl font-bold text-slate-900 mb-3">
          {me?.fullName?.[0]?.toUpperCase() || 'W'}
        </div>
        <h2 className="text-white font-bold text-lg">{me?.fullName || 'Worker'}</h2>
        <p className="text-slate-400 text-xs">{me?.mobile || ''}</p>
      </div>

      {/* Info Card */}
      <div className="p-5 rounded-2xl bg-white/5 backdrop-blur border border-white/10 mb-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">Platform</span>
            <span className="text-sm text-white font-medium capitalize">
              {me?.platformType || '--'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">City</span>
            <span className="text-sm text-white font-medium">
              {me?.city || '--'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">Zone</span>
            <span className="text-sm text-white font-medium">
              {me?.zone || me?.state || '--'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">Dark Store</span>
            <span className="text-sm text-white font-medium font-mono">
              {me?.platformId || '--'}
            </span>
          </div>
        </div>
      </div>

      {/* Risk Score */}
      <div className="p-4 rounded-2xl bg-white/5 backdrop-blur border border-white/10 mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-slate-400">Risk Score</span>
          <span className={`text-xs font-semibold ${risk.color}`}>
            {risk.label}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex-1 h-3 bg-white/10 rounded-full overflow-hidden">
            <div
              className={`h-full ${risk.bar} rounded-full transition-all duration-700`}
              style={{ width: `${riskScore}%` }}
            />
          </div>
          <span className={`text-lg font-bold ${risk.color}`}>{riskScore}</span>
        </div>
      </div>

      {/* Acknowledge Exclusions */}
      {me && !me.exclusionsAcknowledged && (
        <button
          onClick={handleAcknowledge}
          disabled={acknowledging}
          className="w-full mb-6 py-3 rounded-xl bg-amber-500/20 border border-amber-400/30 text-amber-400 font-semibold text-sm active:scale-[0.98] transition-transform disabled:opacity-50"
        >
          {acknowledging ? 'Acknowledging...' : 'Acknowledge Exclusions'}
        </button>
      )}

      {/* Policy History */}
      <div className="mb-6">
        <h3 className="text-white font-semibold text-sm mb-3">Policy History</h3>
        {history.length === 0 ? (
          <div className="p-6 rounded-2xl bg-white/5 border border-white/10 text-center">
            <p className="text-slate-500 text-xs">No policy history yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {history.map((p: any, i: number) => (
              <div
                key={p.id || i}
                className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">
                    {p.tier || p.planId || 'Policy'}
                  </p>
                  <p className="text-slate-500 text-[10px]">
                    {p.createdAt
                      ? new Date(p.createdAt).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })
                      : '--'}
                    {p.expiresAt
                      ? ` - ${new Date(p.expiresAt).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}`
                      : ''}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-white text-sm font-semibold">
                    &#8377;{p.weeklyPremium || p.premium || '0'}/wk
                  </p>
                  <span
                    className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                      STATUS_COLORS[p.status] || 'bg-slate-500/20 text-slate-400'
                    }`}
                  >
                    {p.status || 'EXPIRED'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Logout */}
      <button
        onClick={handleLogout}
        className="w-full py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 font-semibold text-sm active:scale-[0.98] transition-transform"
      >
        Logout
      </button>
    </div>
  );
}
