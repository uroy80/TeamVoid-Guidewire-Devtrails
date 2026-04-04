import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { worker, policy, claims as claimsApi, triggers, demo } from '../api/client';
import { useTheme } from '../hooks/useTheme';
import { useGeolocation } from '../hooks/useGeolocation';
import CoverageMap from '../components/CoverageMap';
import { generatePolicyPDF } from '../utils/generatePolicyPDF';

type Tab = 'dashboard' | 'claims' | 'map' | 'profile';

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  ACTIVE: { bg: 'rgba(16, 185, 129, 0.15)', text: '#10b981' },
  EXPIRED: { bg: 'rgba(239, 68, 68, 0.15)', text: '#ef4444' },
  PENDING: { bg: 'rgba(234, 179, 8, 0.15)', text: '#eab308' },
};

const CLAIM_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  CREATED: { bg: 'rgba(59, 130, 246, 0.15)', text: '#3b82f6' },
  VALIDATING: { bg: 'rgba(234, 179, 8, 0.15)', text: '#eab308' },
  APPROVED: { bg: 'rgba(16, 185, 129, 0.15)', text: '#10b981' },
  UNDER_REVIEW: { bg: 'rgba(249, 115, 22, 0.15)', text: '#f97316' },
  REJECTED: { bg: 'rgba(239, 68, 68, 0.15)', text: '#ef4444' },
  PAID: { bg: 'rgba(16, 185, 129, 0.15)', text: '#34d399' },
};

const BAS_TIER_COLORS: Record<string, { bg: string; text: string }> = {
  GREEN: { bg: 'rgba(16,185,129,0.15)', text: '#10b981' },
  YELLOW: { bg: 'rgba(234,179,8,0.15)', text: '#eab308' },
  ORANGE: { bg: 'rgba(249,115,22,0.15)', text: '#f97316' },
  RED: { bg: 'rgba(239,68,68,0.15)', text: '#ef4444' },
};

const NAV_ITEMS: { id: Tab; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'ri-dashboard-line' },
  { id: 'claims', label: 'Claims', icon: 'ri-file-list-3-line' },
  { id: 'map', label: 'Map', icon: 'ri-map-pin-line' },
  { id: 'profile', label: 'Profile', icon: 'ri-user-line' },
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
  const [demoMode, setDemoMode] = useState(false);
  const [demoResults, setDemoResults] = useState<Record<string, any>>({});
  const [demoLoading, setDemoLoading] = useState<Record<string, boolean>>({});
  const { isDark, toggle, mapTile } = useTheme();
  const hasActivePolicy = !!activePolicy;
  const geoState = useGeolocation(hasActivePolicy);

  // fetchData is now inlined in the useEffect below

  const fetchWeather = useCallback(async (zoneId?: string) => {
    try {
      const res = await triggers.getStatus();
      const zones = res.data?.zones || [];
      const myZone = zones.find((z: any) => z.zone_id === zoneId) || zones[0];
      if (myZone) {
        setWeather({
          temperature: myZone.weather?.temp,
          rainfall: myZone.weather?.rainfall_1h,
          aqi: myZone.aqi?.aqi,
          zone: myZone.name,
          city: myZone.city,
        });
      }
    } catch {
      // weather fetch is non-critical
    }
  }, []);

  // Track zone ID in a ref so weather polling uses the latest value
  const zoneIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [meRes, policyRes, claimsRes] = await Promise.all([
          worker.getMe(),
          policy.getActive().catch(() => ({ data: { policy: null } })),
          claimsApi.getClaims().catch(() => ({ data: [] })),
        ]);
        if (!mounted) return;
        setMe(meRes.data);
        zoneIdRef.current = meRes.data?.delivery_zone_id;
        const pol = policyRes.data?.policy ?? null;
        setActivePolicy(pol);
        setAutoRenew(pol?.auto_renew || false);
        const allClaims = Array.isArray(claimsRes.data) ? claimsRes.data : claimsRes.data?.claims || [];
        setRecentClaims(allClaims.slice(0, 5));
        // Now fetch weather with the correct zone
        fetchWeather(meRes.data?.delivery_zone_id);
      } catch { /* */ } finally {
        if (mounted) setLoading(false);
      }
    })();
    // Weather polling every 30s
    const interval = setInterval(() => {
      if (mounted) fetchWeather(zoneIdRef.current);
    }, 30_000);
    return () => { mounted = false; clearInterval(interval); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAutoRenewToggle = async () => {
    if (!activePolicy?.id) return;
    try {
      await policy.toggleAutoRenew(activePolicy.id);
      setAutoRenew(!autoRenew);
    } catch {
      // silent
    }
  };

  const DEMO_SCENARIOS = [
    { id: 'legitimate', label: 'Legitimate Claim', icon: 'ri-shield-check-line' },
    { id: 'gps_spoofing', label: 'GPS Spoofing', icon: 'ri-map-pin-line' },
    { id: 'ring_fraud', label: 'Ring Fraud', icon: 'ri-group-line' },
  ];

  const DEMO_TIER_COLORS: Record<string, { bg: string; text: string }> = {
    GREEN: { bg: 'rgba(16,185,129,0.15)', text: '#10b981' },
    YELLOW: { bg: 'rgba(234,179,8,0.15)', text: '#eab308' },
    ORANGE: { bg: 'rgba(249,115,22,0.15)', text: '#f97316' },
    RED: { bg: 'rgba(239,68,68,0.15)', text: '#ef4444' },
  };

  const runDemoScenario = async (scenarioId: string) => {
    setDemoLoading((prev) => ({ ...prev, [scenarioId]: true }));
    try {
      const res = await demo.simulate(scenarioId);
      setDemoResults((prev) => ({ ...prev, [scenarioId]: res.data }));
    } catch (err: any) {
      setDemoResults((prev) => ({ ...prev, [scenarioId]: { error: err.response?.data?.error || 'Failed' } }));
    } finally {
      setDemoLoading((prev) => ({ ...prev, [scenarioId]: false }));
    }
  };

  const runAllDemos = async () => {
    for (const s of DEMO_SCENARIOS) {
      await runDemoScenario(s.id);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
        <div className="w-10 h-10 border-4 rounded-full animate-spin" style={{ borderColor: 'var(--accent-light)', borderTopColor: 'var(--accent)' }} />
      </div>
    );
  }

  const policyStatus = activePolicy ? (activePolicy.status || 'ACTIVE') : 'NO POLICY';
  const statusStyle = activePolicy ? (STATUS_COLORS[policyStatus] || STATUS_COLORS.ACTIVE) : { bg: 'rgba(234,179,8,0.15)', text: '#eab308' };

  return (
    <div className="min-h-screen pb-24" style={{ background: 'var(--bg-primary)' }}>
      {tab === 'dashboard' && (
        <div className="px-6 py-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6 slide-up">
            <div>
              <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                Hi, {(me?.name || 'Worker').split(' ')[0]} <span className="text-xl">&#128075;</span>
              </h1>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                {weather?.city || 'Loading...'} &middot; {me?.platform}
              </p>
              {geoState.isTracking && (
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
                    Live {geoState.inZone ? '• In Zone' : geoState.distanceKm ? `• ${geoState.distanceKm}km` : ''}
                  </span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setDemoMode(!demoMode)}
                className="glass w-10 h-10 flex items-center justify-center rounded-xl"
                style={{ borderColor: demoMode ? 'var(--accent)' : 'transparent', borderWidth: 2 }}
                title="Demo"
              >
                <i className="ri-flask-line text-lg" style={{ color: demoMode ? 'var(--accent)' : 'var(--text-secondary)' }} />
              </button>
              <button
                onClick={toggle}
                className="glass w-10 h-10 flex items-center justify-center rounded-xl"
              >
                <i className={`${isDark ? 'ri-sun-line' : 'ri-moon-line'} text-lg`} style={{ color: 'var(--text-secondary)' }} />
              </button>
              <span
                className="px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
                style={{ background: statusStyle.bg, color: statusStyle.text }}
              >
                {policyStatus}
              </span>
            </div>
          </div>

          {/* Demo Mode Panel */}
          {demoMode && (
            <div className="glass p-4 mb-6 slide-up" style={{ borderColor: 'var(--accent)', borderWidth: 1 }}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <i className="ri-flask-line text-lg" style={{ color: 'var(--accent)' }} />
                  <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Demo Mode</h3>
                </div>
                <button
                  onClick={runAllDemos}
                  className="btn-primary px-3 py-1.5 text-[11px] flex items-center gap-1"
                >
                  <i className="ri-play-circle-line" /> Run All
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {DEMO_SCENARIOS.map((scenario) => {
                  const res = demoResults[scenario.id];
                  const isLoading = demoLoading[scenario.id];
                  const tier = res?.fraud_check?.tier || res?.tier;
                  const basScore = res?.fraud_check?.bas_score ?? res?.bas_score;
                  const tierStyle = tier ? DEMO_TIER_COLORS[tier] : null;

                  return (
                    <div key={scenario.id} className="glass p-3" style={{ background: 'var(--bg-card)' }}>
                      <div className="flex items-center gap-1 mb-2">
                        <i className={`${scenario.icon} text-xs`} style={{ color: 'var(--accent)' }} />
                        <span className="text-[10px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                          {scenario.label}
                        </span>
                      </div>
                      {isLoading ? (
                        <div className="flex items-center justify-center py-2">
                          <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--accent-light)', borderTopColor: 'var(--accent)' }} />
                        </div>
                      ) : res ? (
                        <div className="space-y-1">
                          {res.error ? (
                            <p className="text-[10px] text-red-400">{res.error}</p>
                          ) : (
                            <>
                              {basScore != null && (
                                <p className="text-lg font-bold" style={{ color: tierStyle?.text || 'var(--text-primary)' }}>
                                  {basScore}
                                </p>
                              )}
                              {tier && tierStyle && (
                                <span
                                  className="inline-block px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase"
                                  style={{ background: tierStyle.bg, color: tierStyle.text }}
                                >
                                  {tier}
                                </span>
                              )}
                              <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
                                {res.status || res.claim?.status || '--'}
                              </p>
                            </>
                          )}
                        </div>
                      ) : (
                        <button
                          onClick={() => runDemoScenario(scenario.id)}
                          className="w-full py-1.5 rounded-lg text-[10px] font-medium flex items-center justify-center gap-1"
                          style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}
                        >
                          <i className="ri-play-line" /> Run
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Weather Strip */}
          {weather && (
            <div className="flex gap-3 mb-6 overflow-x-auto pb-1 -mx-6 px-6 slide-up" style={{ animationDelay: '0.1s' }}>
              {weather.temperature != null && (
                <div className="glass shrink-0 px-4 py-3 min-w-[110px]">
                  <div className="flex items-center gap-1.5 mb-1">
                    <i className="ri-temp-hot-line text-sm text-orange-400" />
                    <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Temperature</span>
                  </div>
                  <p className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>{weather.temperature}&deg;C</p>
                </div>
              )}
              {weather.rainfall != null && (
                <div className="glass shrink-0 px-4 py-3 min-w-[110px]">
                  <div className="flex items-center gap-1.5 mb-1">
                    <i className="ri-rainy-line text-sm text-blue-400" />
                    <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Rainfall</span>
                  </div>
                  <p className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>{weather.rainfall} mm</p>
                </div>
              )}
              {weather.aqi != null && (
                <div className="glass shrink-0 px-4 py-3 min-w-[110px]">
                  <div className="flex items-center gap-1.5 mb-1">
                    <i className="ri-haze-line text-sm text-purple-400" />
                    <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>AQI</span>
                  </div>
                  <p className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>{weather.aqi}</p>
                </div>
              )}
              {weather.zone && (
                <div className="glass shrink-0 px-4 py-3 min-w-[110px]">
                  <div className="flex items-center gap-1.5 mb-1">
                    <i className="ri-map-pin-line text-sm text-emerald-400" />
                    <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Zone</span>
                  </div>
                  <p className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>{weather.zone}</p>
                </div>
              )}
            </div>
          )}

          {/* Policy Section */}
          {activePolicy ? (
            <div className="glass p-5 mb-6 slide-up" style={{ animationDelay: '0.15s' }}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <i className="ri-shield-check-line text-lg" style={{ color: 'var(--success)' }} />
                  <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Active Policy</h3>
                </div>
                <span className="px-2 py-1 rounded-full text-[10px] font-bold capitalize" style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981' }}>
                  {activePolicy.coverage_level} &middot; {activePolicy.policy_number}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="p-3 rounded-xl" style={{ background: 'var(--bg-card)' }}>
                  <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Coverage</p>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {activePolicy.coverage_level === 'basic' ? '50' : activePolicy.coverage_level === 'standard' ? '75' : '100'}%
                  </p>
                </div>
                <div className="p-3 rounded-xl" style={{ background: 'var(--bg-card)' }}>
                  <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Premium</p>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    &#8377;{Number(activePolicy.weekly_premium).toFixed(0)}/wk
                  </p>
                </div>
                <div className="p-3 rounded-xl" style={{ background: 'var(--bg-card)' }}>
                  <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Expires</p>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {activePolicy.coverage_period_end
                      ? new Date(activePolicy.coverage_period_end).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                      : '--'}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between pt-3" style={{ borderTop: '1px solid var(--border)' }}>
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Auto-renew</span>
                <button
                  onClick={handleAutoRenewToggle}
                  className="relative w-11 h-6 rounded-full transition-colors"
                  style={{ background: autoRenew ? 'var(--success)' : 'var(--bg-card)' }}
                >
                  <span
                    className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow"
                    style={{ transform: autoRenew ? 'translateX(20px)' : 'translateX(0)' }}
                  />
                </button>
              </div>
              {/* Download Policy */}
              <button
                onClick={async () => {
                  if (!activePolicy || !me) return;
                  const tierMap: Record<string, string> = { basic: 'Basic', standard: 'Standard', premium: 'Premium' };
                  const riskLabels = [{ max: 30, l: 'Low' }, { max: 60, l: 'Medium' }, { max: 80, l: 'High' }, { max: 100, l: 'Very High' }];
                  const riskLabel = riskLabels.find(r => (me.risk_score || 0) <= r.max)?.l || 'Medium';
                  const bd = typeof activePolicy.premium_breakdown === 'string' ? JSON.parse(activePolicy.premium_breakdown) : (activePolicy.premium_breakdown || {});
                  const coveragePctMap: Record<string, number> = { basic: 50, standard: 75, premium: 100 };
                  await generatePolicyPDF({
                    policyNumber: activePolicy.policy_number,
                    workerName: me.name,
                    workerMobile: me.mobile,
                    workerPlatform: me.platform,
                    riskScore: me.risk_score || 0,
                    riskLabel,
                    tierLabel: tierMap[activePolicy.coverage_level] || 'Standard',
                    premium: Number(activePolicy.weekly_premium),
                    coveragePct: coveragePctMap[activePolicy.coverage_level] || 75,
                    dailyPayout: Math.round(Number(me.hourly_rate || 100) * Number(me.avg_hours_per_day || 8) * ((coveragePctMap[activePolicy.coverage_level] || 75) / 100)),
                    maxDays: activePolicy.coverage_level === 'basic' ? 3 : activePolicy.coverage_level === 'standard' ? 5 : 7,
                    formulaPremium: `Rs.${bd.basePremium || 35} x ${bd.riskFactor || 1} x ${bd.coverageMultiplier || 1}`,
                    formulaPayout: `${me.avg_hours_per_day || 8}hrs x Rs.${Math.round(me.hourly_rate || 100)}/hr x ${coveragePctMap[activePolicy.coverage_level] || 75}%`,
                    riskFactor: bd.riskFactor || 1,
                    startDate: new Date(activePolicy.coverage_period_start).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }),
                    endDate: new Date(activePolicy.coverage_period_end).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }),
                    transactionRef: activePolicy.payment_transaction_ref || 'N/A',
                    upi: me.payment_upi || `${me.mobile}@upi`,
                    paymentDate: new Date(activePolicy.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }),
                  });
                }}
                className="w-full mt-3 py-2.5 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 transition-all"
                style={{ background: 'var(--bg-card)', color: 'var(--accent)', border: '1px solid var(--border)' }}
              >
                <i className="ri-file-pdf-2-line" /> Download Policy Copy
              </button>
              <button
                onClick={() => navigate('/claims?request=true')}
                className="w-full mt-2 py-2.5 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5"
                style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}
              >
                <i className="ri-add-circle-line" /> Request a Claim
              </button>
            </div>
          ) : (
            <div className="glass p-5 mb-6 slide-up text-center" style={{ animationDelay: '0.15s' }}>
              <div className="w-14 h-14 rounded-full mx-auto mb-3 flex items-center justify-center" style={{ background: 'var(--accent-light)' }}>
                <i className="ri-shield-line text-2xl" style={{ color: 'var(--accent)' }} />
              </div>
              <h3 className="font-semibold text-sm mb-1" style={{ color: 'var(--text-primary)' }}>No Active Policy</h3>
              <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
                Get covered against weather disruptions, extreme heat, floods, and more.
              </p>
              <button
                onClick={() => navigate('/coverage')}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                <i className="ri-shield-star-line" /> Get Coverage Now
              </button>
            </div>
          )}

          {/* Recent Claims */}
          <div className="mb-6 slide-up" style={{ animationDelay: '0.2s' }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                <i className="ri-file-list-3-line mr-1.5" style={{ color: 'var(--accent)' }} />
                Recent Claims
              </h3>
              <button onClick={() => navigate('/claims')} className="text-xs" style={{ color: 'var(--accent)' }}>
                View all
              </button>
            </div>
            {recentClaims.length === 0 ? (
              <div className="glass p-6 text-center">
                <i className="ri-shield-check-line text-3xl mb-2" style={{ color: 'var(--text-muted)' }} />
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  No claims yet. Your policy will protect you automatically.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {recentClaims.map((claim: any) => {
                  const claimStatus = CLAIM_STATUS_COLORS[claim.status] || { bg: 'rgba(100,116,139,0.15)', text: '#94a3b8' };
                  // Parse BAS tier from fraud_check_details
                  let basTier: string | null = null;
                  let basScore: number | null = null;
                  try {
                    const fcd = typeof claim.fraud_check_details === 'string'
                      ? JSON.parse(claim.fraud_check_details)
                      : claim.fraud_check_details;
                    if (fcd) {
                      basTier = fcd.tier || null;
                      basScore = fcd.bas_score ?? null;
                    }
                  } catch { /* ignore */ }
                  const tierStyle = basTier ? (BAS_TIER_COLORS[basTier] || null) : null;

                  return (
                    <div key={claim.id} className="glass flex items-center gap-3 p-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--bg-card)' }}>
                        <i className="ri-rainy-line text-lg" style={{ color: 'var(--accent)' }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                          {claim.claim_number}
                        </p>
                        <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                          {claim.created_at ? new Date(claim.created_at).toLocaleDateString('en-IN') : '--'}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                          &#8377;{claim.income_loss_payout || '0'}
                        </p>
                        <div className="flex items-center justify-end gap-1">
                          <span
                            className="inline-block px-2 py-0.5 rounded-full text-[9px] font-bold uppercase"
                            style={{ background: claimStatus.bg, color: claimStatus.text }}
                          >
                            {claim.status}
                          </span>
                          {tierStyle && basTier && (
                            <span
                              className="inline-block px-1.5 py-0.5 rounded-full text-[8px] font-bold uppercase"
                              style={{ background: tierStyle.bg, color: tierStyle.text }}
                              title={basScore != null ? `BAS: ${basScore}` : ''}
                            >
                              {basTier}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delegated tabs */}
      {tab === 'claims' && (
        <div className="px-6 py-6 text-center">
          <button onClick={() => navigate('/claims')} className="btn-primary">
            <i className="ri-file-list-3-line mr-2" />Open Full Claims View
          </button>
        </div>
      )}
      {tab === 'map' && <CoverageMap me={me} mapTile={mapTile} />}
      {tab === 'profile' && (
        <div className="px-6 py-6 text-center">
          <button onClick={() => navigate('/profile')} className="btn-primary">
            <i className="ri-user-line mr-2" />Open Profile
          </button>
        </div>
      )}

      {/* Bottom Navigation */}
      <nav
        className="fixed bottom-0 inset-x-0 backdrop-blur-lg px-6 py-2 flex justify-around z-50"
        style={{
          background: 'var(--nav-bg)',
          borderTop: '1px solid var(--border)',
        }}
      >
        {NAV_ITEMS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => {
                if (t.id === 'claims') navigate('/claims');
                else if (t.id === 'profile') navigate('/profile');
                else setTab(t.id);
              }}
              className="flex flex-col items-center gap-0.5 py-1 px-3 transition-colors"
            >
              <i className={`${t.icon} text-xl`} style={{ color: active ? 'var(--accent)' : 'var(--text-muted)' }} />
              <span className="text-[10px] font-medium" style={{ color: active ? 'var(--accent)' : 'var(--text-muted)' }}>
                {t.label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
