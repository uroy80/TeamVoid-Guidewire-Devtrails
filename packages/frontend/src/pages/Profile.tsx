import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { worker, policy } from '../api/client';
import { useStore } from '../store/store';
import ThemeToggle from '../components/ThemeToggle';

const RISK_COLORS = [
  { max: 30, label: 'Low', color: '#10b981' },
  { max: 60, label: 'Medium', color: '#eab308' },
  { max: 80, label: 'High', color: '#f97316' },
  { max: 100, label: 'Very High', color: '#ef4444' },
];

function getRiskInfo(score: number) {
  return RISK_COLORS.find((r) => score <= r.max) || RISK_COLORS[3];
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  ACTIVE: { bg: 'rgba(16, 185, 129, 0.15)', text: '#10b981' },
  EXPIRED: { bg: 'rgba(239, 68, 68, 0.15)', text: '#ef4444' },
  CANCELLED: { bg: 'rgba(100, 116, 139, 0.15)', text: '#94a3b8' },
};

const EXCLUSIONS = [
  { icon: 'ri-emotion-sad-line', title: 'Self-Inflicted Disruptions', desc: 'Claims arising from worker\'s own actions, negligence, or voluntary non-availability are not covered.' },
  { icon: 'ri-car-line', title: 'Vehicle / Personal Accidents', desc: 'Injuries, vehicle damage, or personal accidents during delivery are excluded. Separate motor/health insurance is recommended.' },
  { icon: 'ri-virus-line', title: 'Pandemic / Epidemic Events', desc: 'Widespread pandemic lockdowns (e.g., COVID-19) declared at national level are excluded from parametric triggers.' },
  { icon: 'ri-map-pin-time-line', title: 'Outside Coverage Zone', desc: 'Disruptions occurring outside your registered delivery zone or during personal travel are not eligible.' },
  { icon: 'ri-time-line', title: 'Pre-Existing Conditions', desc: 'Events that began before policy activation or during a lapsed coverage period are excluded.' },
  { icon: 'ri-spam-line', title: 'Fraudulent Claims', desc: 'Claims flagged by the BAS (Behavioral Authenticity Score) system as GPS spoofing, ring fraud, or device manipulation will be rejected.' },
];

export default function Profile() {
  const navigate = useNavigate();
  const logout = useStore((s) => s.logout);
  const [me, setMe] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [acknowledging, setAcknowledging] = useState(false);
  const [showExclusions, setShowExclusions] = useState(false);

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


  const handleLogout = () => {
    logout();
    navigate('/welcome', { replace: true });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
        <div className="w-10 h-10 border-4 rounded-full animate-spin" style={{ borderColor: 'var(--accent-light)', borderTopColor: 'var(--accent)' }} />
      </div>
    );
  }

  const riskScore = me?.risk_score || 0;
  const risk = getRiskInfo(riskScore);

  return (
    <div className="min-h-screen px-6 py-6 pb-20" style={{ background: 'var(--bg-primary)' }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6 slide-up">
        <button
          onClick={() => navigate('/dashboard')}
          className="glass w-10 h-10 flex items-center justify-center rounded-xl"
        >
          <i className="ri-arrow-left-line text-lg" style={{ color: 'var(--text-primary)' }} />
        </button>
        <h1 className="flex-1 text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Profile</h1>
        <ThemeToggle />
      </div>

      {/* Avatar & Name */}
      <div className="flex flex-col items-center mb-6 slide-up" style={{ animationDelay: '0.05s' }}>
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center text-3xl font-bold mb-3"
          style={{
            background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
            color: 'white',
          }}
        >
          {me?.name?.[0]?.toUpperCase() || 'W'}
        </div>
        <h2 className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>{me?.name || 'Worker'}</h2>
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{me?.mobile || ''}</p>
      </div>

      {/* Info Card */}
      <div className="glass p-5 mb-6 slide-up" style={{ animationDelay: '0.1s' }}>
        <div className="space-y-3">
          {[
            { icon: 'ri-truck-line', label: 'Platform', value: me?.platform || '--' },
            { icon: 'ri-money-rupee-circle-line', label: 'Hourly Rate', value: me?.hourly_rate ? `₹${Math.round(me.hourly_rate)}` : '--' },
            { icon: 'ri-time-line', label: 'Avg Hours/Day', value: me?.avg_hours_per_day || '--' },
            { icon: 'ri-star-line', label: 'Rating', value: me?.platform_rating ? `${me.platform_rating}★` : '--' },
          ].map((item) => (
            <div key={item.label} className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2">
                <i className={`${item.icon} text-sm`} style={{ color: 'var(--accent)' }} />
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{item.label}</span>
              </div>
              <span className="text-sm font-medium capitalize" style={{ color: 'var(--text-primary)' }}>
                {item.value}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Risk Score */}
      <div className="glass p-5 mb-6 slide-up" style={{ animationDelay: '0.15s' }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <i className="ri-pulse-line" style={{ color: risk.color }} />
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Risk Score</span>
          </div>
          <span className="text-xs font-semibold" style={{ color: risk.color }}>
            {risk.label}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ background: 'var(--bg-card)' }}>
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${riskScore}%`, background: risk.color }}
            />
          </div>
          <span className="text-lg font-bold" style={{ color: risk.color }}>{riskScore}</span>
        </div>
      </div>

      {/* Exclusions Section */}
      <div className="glass mb-6 slide-up" style={{ animationDelay: '0.15s', overflow: 'hidden' }}>
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{
              background: me?.exclusions_acknowledged ? 'rgba(16,185,129,0.1)' : 'rgba(234,179,8,0.1)'
            }}>
              <i className={me?.exclusions_acknowledged ? 'ri-checkbox-circle-line' : 'ri-error-warning-line'} style={{
                fontSize: 20, color: me?.exclusions_acknowledged ? '#10b981' : '#eab308'
              }} />
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Policy Exclusions</p>
              <p className="text-[10px]" style={{ color: me?.exclusions_acknowledged ? '#10b981' : '#eab308' }}>
                {me?.exclusions_acknowledged ? 'Acknowledged' : 'Action required — please review'}
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowExclusions(true)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{ background: 'var(--bg-secondary)', color: 'var(--accent)', border: '1px solid var(--border)' }}
          >
            {me?.exclusions_acknowledged ? 'View' : 'Review'}
          </button>
        </div>
      </div>

      {/* Exclusions Modal */}
      {showExclusions && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
          <div className="glass" style={{ padding: 0, borderRadius: 20, maxWidth: 440, width: '90%', maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <div style={{ padding: '20px 20px 12px', borderBottom: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.1)' }}>
                    <i className="ri-shield-cross-line" style={{ color: '#ef4444', fontSize: 18 }} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>Policy Exclusions</h3>
                    <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>What is NOT covered by GigShield</p>
                  </div>
                </div>
                <button onClick={() => setShowExclusions(false)} style={{ color: 'var(--text-muted)', fontSize: 20, background: 'none', border: 'none', cursor: 'pointer' }}>
                  <i className="ri-close-line" />
                </button>
              </div>
            </div>

            {/* Exclusion List */}
            <div style={{ padding: '12px 20px', overflowY: 'auto', flex: 1 }}>
              {EXCLUSIONS.map((ex, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, padding: '12px 0', borderBottom: i < EXCLUSIONS.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(239,68,68,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <i className={ex.icon} style={{ color: '#ef4444', fontSize: 14 }} />
                  </div>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{ex.title}</p>
                    <p style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{ex.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)' }}>
              {me?.exclusions_acknowledged ? (
                <div className="flex items-center justify-center gap-2 py-2" style={{ color: '#10b981', fontSize: 13, fontWeight: 600 }}>
                  <i className="ri-checkbox-circle-fill" /> Exclusions Acknowledged
                </div>
              ) : (
                <button
                  onClick={async () => {
                    setAcknowledging(true);
                    try {
                      await worker.acknowledgeExclusions();
                      setMe((prev: any) => ({ ...prev, exclusions_acknowledged: true }));
                    } catch { /* */ }
                    finally { setAcknowledging(false); }
                  }}
                  disabled={acknowledging}
                  className="btn-primary w-full py-3 text-sm flex items-center justify-center gap-2"
                >
                  {acknowledging ? (
                    <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Acknowledging...</>
                  ) : (
                    <><i className="ri-check-double-line" /> I have read and acknowledge these exclusions</>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Policy History */}
      <div className="mb-6 slide-up" style={{ animationDelay: '0.2s' }}>
        <h3 className="font-semibold text-sm mb-3" style={{ color: 'var(--text-primary)' }}>
          <i className="ri-history-line mr-1.5" style={{ color: 'var(--accent)' }} />
          Policy History
        </h3>
        {history.length === 0 ? (
          <div className="glass p-6 text-center">
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No policy history yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {history.map((p: any, i: number) => {
              const statusStyle = STATUS_COLORS[p.status] || { bg: 'rgba(100,116,139,0.15)', text: '#94a3b8' };
              return (
                <div key={p.id || i} className="glass flex items-center gap-3 p-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate capitalize" style={{ color: 'var(--text-primary)' }}>
                      {p.coverage_level || p.tier || 'Policy'} &middot; {p.policy_number || ''}
                    </p>
                    <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      {p.created_at
                        ? new Date(p.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                        : '--'}
                      {p.coverage_period_end
                        ? ` - ${new Date(p.coverage_period_end).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
                        : ''}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                      &#8377;{p.weekly_premium || '0'}/wk
                    </p>
                    <span
                      className="inline-block px-2 py-0.5 rounded-full text-[9px] font-bold uppercase"
                      style={{ background: statusStyle.bg, color: statusStyle.text }}
                    >
                      {p.status || 'EXPIRED'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Logout */}
      <button
        onClick={handleLogout}
        className="glass w-full py-3 text-sm font-semibold flex items-center justify-center gap-2 transition-all slide-up"
        style={{ borderColor: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', animationDelay: '0.25s' }}
      >
        <i className="ri-logout-box-r-line" />
        Logout
      </button>
    </div>
  );
}
