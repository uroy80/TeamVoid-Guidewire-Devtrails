import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { worker, policy, claims as claimsApi, triggers } from '../../api/client';

type Tab = 'dashboard' | 'claims' | 'map' | 'profile';

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-emerald-500/20 text-emerald-400',
  EXPIRED: 'bg-red-500/20 text-red-400',
  PENDING: 'bg-yellow-500/20 text-yellow-400',
};

const CLAIM_STATUS_COLORS: Record<string, string> = {
  CREATED: 'bg-blue-500/20 text-blue-400',
  VALIDATING: 'bg-yellow-500/20 text-yellow-400',
  APPROVED: 'bg-emerald-500/20 text-emerald-400',
  UNDER_REVIEW: 'bg-orange-500/20 text-orange-400',
  REJECTED: 'bg-red-500/20 text-red-400',
  PAID: 'bg-emerald-500/20 text-emerald-300',
};

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MOCK_EARNINGS = [
  { protected: 650, unprotected: 450 },
  { protected: 720, unprotected: 0 },
  { protected: 580, unprotected: 580 },
  { protected: 800, unprotected: 700 },
  { protected: 690, unprotected: 690 },
  { protected: 500, unprotected: 0 },
  { protected: 750, unprotected: 550 },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('dashboard');
  const [me, setMe] = useState<any>(null);
  const [activePolicy, setActivePolicy] = useState<any>(null);
  const [recentClaims, setRecentClaims] = useState<any[]>([]);
  const [weather, setWeather] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [autoRenew, setAutoRenew] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [meRes, policyRes, claimsRes] = await Promise.all([
        worker.getMe(),
        policy.getActive().catch(() => ({ data: null })),
        claimsApi.getClaims().catch(() => ({ data: [] })),
      ]);
      setMe(meRes.data);
      setActivePolicy(policyRes.data);
      setAutoRenew(policyRes.data?.autoRenew || false);
      const allClaims = Array.isArray(claimsRes.data)
        ? claimsRes.data
        : claimsRes.data?.claims || [];
      setRecentClaims(allClaims.slice(0, 5));
    } catch {
      // handled by interceptor
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchWeather = useCallback(async () => {
    try {
      const res = await triggers.getStatus();
      setWeather(res.data);
    } catch {
      // weather fetch is non-critical
    }
  }, []);

  useEffect(() => {
    fetchData();
    fetchWeather();
    const interval = setInterval(fetchWeather, 30_000);
    return () => clearInterval(interval);
  }, [fetchData, fetchWeather]);

  const handleAutoRenewToggle = async () => {
    if (!activePolicy?.id) return;
    try {
      await policy.toggleAutoRenew(activePolicy.id);
      setAutoRenew(!autoRenew);
    } catch {
      // silent
    }
  };

  const maxEarning = Math.max(...MOCK_EARNINGS.map((e) => e.protected));

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
      </div>
    );
  }

  const policyStatus = activePolicy
    ? activePolicy.status || 'ACTIVE'
    : 'EXPIRED';

  return (
    <div className="min-h-screen bg-slate-900 pb-20">
      {/* Main content */}
      {tab === 'dashboard' && (
        <div className="px-6 py-6">
          {/* Greeting */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-xl font-bold text-white">
                Hi {me?.fullName?.split(' ')[0] || 'Worker'} !
              </h1>
              <p className="text-slate-400 text-xs mt-0.5">
                {me?.city} &middot; {me?.platformType}
              </p>
            </div>
            <span
              className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                STATUS_COLORS[policyStatus] || STATUS_COLORS.EXPIRED
              }`}
            >
              {policyStatus}
            </span>
          </div>

          {/* Weather Strip */}
          {weather && (
            <div className="flex gap-3 mb-6 overflow-x-auto pb-1 -mx-6 px-6">
              {weather.temperature != null && (
                <div className="shrink-0 px-4 py-3 rounded-xl bg-white/5 backdrop-blur border border-white/10 min-w-[100px]">
                  <p className="text-[10px] text-slate-500 mb-0.5">Temp</p>
                  <p className="text-white font-bold text-sm">
                    {weather.temperature}&deg;C
                  </p>
                </div>
              )}
              {weather.rainfall != null && (
                <div className="shrink-0 px-4 py-3 rounded-xl bg-white/5 backdrop-blur border border-white/10 min-w-[100px]">
                  <p className="text-[10px] text-slate-500 mb-0.5">Rainfall</p>
                  <p className="text-white font-bold text-sm">
                    {weather.rainfall} mm
                  </p>
                </div>
              )}
              {weather.aqi != null && (
                <div className="shrink-0 px-4 py-3 rounded-xl bg-white/5 backdrop-blur border border-white/10 min-w-[100px]">
                  <p className="text-[10px] text-slate-500 mb-0.5">AQI</p>
                  <p className="text-white font-bold text-sm">{weather.aqi}</p>
                </div>
              )}
              {weather.zone && (
                <div className="shrink-0 px-4 py-3 rounded-xl bg-white/5 backdrop-blur border border-white/10 min-w-[100px]">
                  <p className="text-[10px] text-slate-500 mb-0.5">Zone</p>
                  <p className="text-white font-bold text-sm">{weather.zone}</p>
                </div>
              )}
            </div>
          )}

          {/* Active Policy Card */}
          {activePolicy && (
            <div className="p-5 rounded-2xl bg-white/5 backdrop-blur border border-white/10 mb-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-white font-semibold text-sm">
                  Active Policy
                </h3>
                <span className="text-emerald-400 text-xs font-medium">
                  {activePolicy.tier || activePolicy.planId}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div>
                  <p className="text-[10px] text-slate-500">Coverage</p>
                  <p className="text-white text-sm font-semibold">
                    {activePolicy.coveragePercent || '100'}%
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500">Premium</p>
                  <p className="text-white text-sm font-semibold">
                    &#8377;{activePolicy.weeklyPremium || activePolicy.premium}/wk
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500">Expires</p>
                  <p className="text-white text-sm font-semibold">
                    {activePolicy.expiresAt
                      ? new Date(activePolicy.expiresAt).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                        })
                      : '--'}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between pt-3 border-t border-white/10">
                <span className="text-xs text-slate-400">Auto-renew</span>
                <button
                  onClick={handleAutoRenewToggle}
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    autoRenew ? 'bg-emerald-500' : 'bg-white/20'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow ${
                      autoRenew ? 'translate-x-5' : ''
                    }`}
                  />
                </button>
              </div>
            </div>
          )}

          {/* Recent Claims */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white font-semibold text-sm">Recent Claims</h3>
              <button
                onClick={() => setTab('claims')}
                className="text-emerald-400 text-xs"
              >
                View all
              </button>
            </div>
            {recentClaims.length === 0 ? (
              <div className="p-6 rounded-2xl bg-white/5 border border-white/10 text-center">
                <p className="text-slate-500 text-xs">
                  No claims yet. Your policy will protect you automatically.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {recentClaims.map((claim: any) => (
                  <div
                    key={claim.id || claim.claimNumber}
                    className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10"
                  >
                    <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center text-lg">
                      {claim.disruptionType === 'RAINFALL'
                        ? '\u{1F327}\u{FE0F}'
                        : claim.disruptionType === 'HEATWAVE'
                          ? '\u{1F525}'
                          : claim.disruptionType === 'AQI'
                            ? '\u{1F32B}\u{FE0F}'
                            : '\u{26A0}\u{FE0F}'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">
                        {claim.claimNumber || claim.id}
                      </p>
                      <p className="text-slate-500 text-[10px]">
                        {claim.createdAt
                          ? new Date(claim.createdAt).toLocaleDateString('en-IN')
                          : '--'}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-white text-sm font-semibold">
                        &#8377;{claim.payoutAmount || '0'}
                      </p>
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                          CLAIM_STATUS_COLORS[claim.status] ||
                          'bg-slate-500/20 text-slate-400'
                        }`}
                      >
                        {claim.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Weekly Earnings Chart */}
          <div className="p-5 rounded-2xl bg-white/5 backdrop-blur border border-white/10">
            <h3 className="text-white font-semibold text-sm mb-1">
              Weekly Earnings
            </h3>
            <p className="text-slate-500 text-[10px] mb-4">
              Protected vs unprotected income
            </p>
            <div className="flex items-end gap-2 h-32">
              {MOCK_EARNINGS.map((e, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex flex-col items-center justify-end h-24 gap-0.5">
                    <div
                      className="w-full max-w-[20px] rounded-t bg-emerald-500/70"
                      style={{
                        height: `${(e.protected / maxEarning) * 100}%`,
                      }}
                    />
                    {e.unprotected > 0 && (
                      <div
                        className="w-full max-w-[20px] rounded-t bg-slate-600/70 -mt-0.5"
                        style={{
                          height: `${(e.unprotected / maxEarning) * 100}%`,
                          position: 'absolute',
                        }}
                      />
                    )}
                  </div>
                  <span className="text-[9px] text-slate-500">{DAYS[i]}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-4 mt-3">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm bg-emerald-500/70" />
                <span className="text-[10px] text-slate-400">Protected</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm bg-slate-600/70" />
                <span className="text-[10px] text-slate-400">Unprotected</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delegated tabs */}
      {tab === 'claims' && (
        <div className="px-6 py-6">
          <button onClick={() => navigate('/claims')} className="text-emerald-400 text-sm underline">
            Open Full Claims View
          </button>
        </div>
      )}
      {tab === 'map' && (
        <div className="px-6 py-6 text-center">
          <p className="text-slate-500 text-sm">Coverage map coming soon.</p>
        </div>
      )}
      {tab === 'profile' && (
        <div className="px-6 py-6">
          <button onClick={() => navigate('/profile')} className="text-emerald-400 text-sm underline">
            Open Profile
          </button>
        </div>
      )}

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 inset-x-0 bg-slate-900/95 backdrop-blur border-t border-white/10 px-6 py-2 flex justify-around z-50">
        {(
          [
            { id: 'dashboard' as Tab, label: 'Dashboard', icon: '\u{1F3E0}' },
            { id: 'claims' as Tab, label: 'Claims', icon: '\u{1F4CB}' },
            { id: 'map' as Tab, label: 'Map', icon: '\u{1F5FA}\u{FE0F}' },
            { id: 'profile' as Tab, label: 'Profile', icon: '\u{1F464}' },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => {
              if (t.id === 'claims') navigate('/claims');
              else if (t.id === 'profile') navigate('/profile');
              else setTab(t.id);
            }}
            className={`flex flex-col items-center gap-0.5 py-1 px-3 transition-colors ${
              tab === t.id ? 'text-emerald-400' : 'text-slate-500'
            }`}
          >
            <span className="text-lg">{t.icon}</span>
            <span className="text-[10px] font-medium">{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
