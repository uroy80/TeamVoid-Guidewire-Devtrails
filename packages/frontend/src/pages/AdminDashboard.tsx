import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { GoogleMap, Circle as GCircle, InfoWindow, Marker } from '@react-google-maps/api';
import { analytics, triggers, admin } from '../api/client';
import { useGoogleMaps } from '../hooks/useGoogleMaps';
import { useStore } from '../store/store';
import useEventStream from '../hooks/useEventStream';
import ThemeToggle from '../components/ThemeToggle';
import Logo from '../components/Logo';
import LiveOpsFeed from '../components/LiveOpsFeed';

interface OverviewData {
  activePolicies: number;
  totalClaims: number;
  claimsByStatus: Record<string, number>;
  totalPayouts: number;
  lossRatio: number;
}

interface StatsData {
  total_workers?: number;
  active_policies?: number;
  total_claims?: number;
  total_payouts?: number;
  fraud_detection_rate?: number;
  avg_bas_score?: number;
}


interface AuditEntry {
  id: string;
  entity_type?: string;
  entity_id?: string;
  triggering_event?: string;
  new_state?: string;
  metadata?: string;
  created_at?: string;
}

interface TriggerZone {
  id?: string;
  zone_id?: string;
  name: string;
  city?: string;
}

interface HeatmapZone {
  zone_id: string;
  name: string;
  city: string;
  latitude: number;
  longitude: number;
  workerCount: number;
  riskScore: number;
  activePolicies: number;
  recentClaims: number;
}


// Set at build time by Vite. Empty when the Docker builder didn't receive
// VITE_GOOGLE_MAPS_KEY as a build-arg — we fall back to a list-only view so
// the dashboard still functions without Google Maps.
const HAS_MAPS_KEY = !!((import.meta as { env?: Record<string, string> }).env?.VITE_GOOGLE_MAPS_KEY);

function getHeatmapColor(risk: number): string {
  if (risk < 25) return '#10b981';
  if (risk < 50) return '#eab308';
  if (risk < 75) return '#f97316';
  return '#ef4444';
}

const EVENT_TYPES = [
  'EXTREME_HEAT',
  'HEAVY_RAINFALL',
  'FLOODING',
  'SEVERE_POLLUTION',
  'SOCIAL_DISRUPTION',
] as const;

const SEVERITIES = ['MODERATE', 'SEVERE', 'EXTREME'] as const;



const AUDIT_EVENT_ICONS: Record<string, string> = {
  claim: 'ri-file-list-3-line',
  policy: 'ri-shield-check-line',
  fraud: 'ri-alarm-warning-line',
  trigger: 'ri-flashlight-line',
  worker: 'ri-user-line',
  admin: 'ri-admin-line',
};

const AdminDashboard: React.FC = () => {
  const { isLoaded, loadError } = useGoogleMaps();
  const mapBroken = !HAS_MAPS_KEY || !!loadError;
  const token = useStore((s) => s.token);
  const { events, connected } = useEventStream(token);

  // Compute "Total Payouts Today" from event stream
  const payoutsToday = useMemo(() => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const startMs = startOfDay.getTime();
    let sum = 0;
    for (const e of events) {
      if (e.type === 'PAYOUT_SENT' && e.ts >= startMs) {
        const amt = Number(e.payload?.amount ?? 0);
        if (!Number.isNaN(amt)) sum += amt;
      }
    }
    return sum;
  }, [events]);
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [zones, setZones] = useState<TriggerZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [resetting, setResetting] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [aiInsights, setAiInsights] = useState<string | null>(null);
  const [aiInsightsLoading, setAiInsightsLoading] = useState(false);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [heatmapZones, setHeatmapZones] = useState<HeatmapZone[]>([]);
  const [activeHeatmapZone, setActiveHeatmapZone] = useState<HeatmapZone | null>(null);

  // Manual trigger form
  const [selectedZone, setSelectedZone] = useState('');
  const [eventType, setEventType] = useState<string>(EVENT_TYPES[0]);
  const [severity, setSeverity] = useState<string>(SEVERITIES[0]);
  const [durationHours, setDurationHours] = useState(1);
  const [creating, setCreating] = useState(false);
  const [checking, setChecking] = useState(false);

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const fetchAIInsights = useCallback(async () => {
    setAiInsightsLoading(true);
    try {
      const res = await admin.getAIInsights();
      setAiInsights(res.data?.summary || res.data?.insights || JSON.stringify(res.data));
    } catch {
      setAiInsights('Failed to load AI insights.');
    } finally {
      setAiInsightsLoading(false);
    }
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [overviewRes, statusRes, statsRes, auditRes, heatmapRes] = await Promise.all([
          analytics.getAdminOverview(),
          triggers.getStatus(),
          admin.getStats().catch(() => ({ data: null })),
          admin.getAuditLog({ limit: 10 }).catch(() => ({ data: [] })),
          admin.getHeatmap().catch(() => ({ data: null })),
        ]);
        setOverview(overviewRes.data);
        if (statsRes.data) setStats(statsRes.data);
        const zoneList = statusRes.data?.zones || statusRes.data?.activeZones || [];
        setZones(zoneList);
        if (zoneList.length > 0) setSelectedZone(zoneList[0].zone_id || zoneList[0].id || '');
        setAuditLog(Array.isArray(auditRes.data) ? auditRes.data : auditRes.data?.logs || auditRes.data?.entries || []);
        if (heatmapRes.data) {
          const rawZones = heatmapRes.data?.zones || heatmapRes.data || [];
          const mapped = (Array.isArray(rawZones) ? rawZones : []).map((z: any) => ({
            zone_id: z.zone_id || z.id || z.zone_name,
            name: z.zone_name || z.name || 'Unknown',
            city: z.city || '',
            latitude: Number(z.latitude) || 0,
            longitude: Number(z.longitude) || 0,
            workerCount: Number(z.worker_count) || 0,
            riskScore: Number(z.base_risk) || 30,
            activePolicies: Number(z.active_policies) || 0,
            recentClaims: Number(z.total_claims) || 0,
          })).filter((z: any) => z.latitude !== 0 && z.longitude !== 0);
          setHeatmapZones(mapped);
        }
      } catch (err) {
        showToast('Failed to load dashboard data', 'error');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
    fetchAIInsights();
  }, [showToast, fetchAIInsights]);

  const handleCreateEvent = async () => {
    if (!selectedZone) return;
    setCreating(true);
    try {
      const { data } = await triggers.createManual({
        zone_id: selectedZone,
        event_type: eventType,
        severity,
        duration_hours: Number(durationHours),
      });
      const claimCount = data?.claims_created || 0;
      showToast(`Disruption event created. ${claimCount} claim(s) auto-generated for affected workers.`, 'success');
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to create event', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleForceCheck = async () => {
    setChecking(true);
    try {
      await triggers.checkNow();
      showToast('Trigger check completed successfully', 'success');
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Trigger check failed', 'error');
    } finally {
      setChecking(false);
    }
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
        <div className="flex flex-col items-center gap-3">
          <svg className="animate-spin h-8 w-8" style={{ color: 'var(--accent)' }} viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loading dashboard...</p>
        </div>
      </div>
    );
  }

  // Use stats if available, fallback to overview
  const totalWorkers = stats?.total_workers ?? '--';
  const activePolicies = stats?.active_policies ?? overview?.activePolicies ?? '--';
  const totalClaims = stats?.total_claims ?? overview?.totalClaims ?? '--';
  const totalPayouts = stats?.total_payouts ?? overview?.totalPayouts ?? 0;
  const fraudDetectionRate = stats?.fraud_detection_rate ?? '--';
  const avgBasScore = stats?.avg_bas_score ?? '--';
  const totalPremiums = (overview as any)?.total_premiums ?? 0;
  const lossRatio = (overview as any)?.loss_ratio_pct ?? (totalPremiums > 0 ? ((Number(totalPayouts) / totalPremiums) * 100).toFixed(1) : '--');

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
      <header className="glass border-b sticky top-0 z-40" style={{ borderColor: 'var(--border)' }}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo className="w-9 h-9 rounded-lg" />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>GigShield Admin</h1>
                {connected ? (
                  <div className="flex items-center gap-1">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                    </span>
                    <span className="text-[9px] font-bold tracking-wider text-emerald-500">LIVE</span>
                  </div>
                ) : (
                  <span className="text-[9px] font-bold tracking-wider" style={{ color: 'var(--text-muted)' }}>
                    OFFLINE
                  </span>
                )}
              </div>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Dashboard Overview</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link
              to="/admin/fraud"
              className="px-4 py-2 bg-amber-600/20 border border-amber-500/30 text-amber-400 rounded-lg text-sm font-medium hover:bg-amber-600/30 transition-colors"
            >
              Fraud Review
            </Link>
            <button
              onClick={() => setShowResetConfirm(true)}
              className="px-3 py-2 rounded-lg text-sm font-medium hover:opacity-80 transition-colors flex items-center gap-1.5"
              style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}
            >
              <i className="ri-refresh-line" /> Reset
            </button>
            <button
              onClick={() => {
                localStorage.removeItem('gs_token');
                localStorage.removeItem('gs_is_admin');
                window.location.href = '/admin/login';
              }}
              className="px-4 py-2 rounded-lg text-sm hover:opacity-80 transition-colors"
              style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
          <div className="glass" style={{ padding: 32, borderRadius: 20, maxWidth: 420, width: '90%', textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(239,68,68,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <i className="ri-error-warning-line" style={{ fontSize: 28, color: '#ef4444' }} />
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Reset All Data?</h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 24 }}>
              This will permanently delete <strong>all workers, policies, claims, payouts, location logs, and audit records</strong>. Only zone and store data will be preserved. This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium"
                style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setResetting(true);
                  try {
                    await admin.resetAll();
                    showToast('All data has been reset successfully.', 'success');
                    setShowResetConfirm(false);
                    setTimeout(() => window.location.reload(), 1500);
                  } catch (err: any) {
                    showToast(err.response?.data?.error || 'Reset failed', 'error');
                  } finally {
                    setResetting(false);
                  }
                }}
                disabled={resetting}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2"
                style={{ background: '#ef4444', color: '#fff', opacity: resetting ? 0.6 : 1 }}
              >
                {resetting ? (
                  <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Resetting...</>
                ) : (
                  <><i className="ri-delete-bin-line" /> Yes, Reset Everything</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Live Ops Row: feed + today's payouts counter */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <LiveOpsFeed />
          </div>
          <div
            className="rounded-xl p-5 flex flex-col justify-between"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.15)' }}>
                  <i className="ri-money-rupee-circle-line text-lg" style={{ color: '#10b981' }} />
                </div>
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Total Payouts Today</span>
              </div>
              {connected && (
                <div className="flex items-center gap-1">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                  </span>
                </div>
              )}
            </div>
            <p
              className="mt-4 text-4xl font-bold transition-all duration-500"
              style={{ color: 'var(--text-primary)' }}
            >
              {formatCurrency(payoutsToday)}
            </p>
            <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              Updates live from payout events
            </p>
          </div>
        </section>

        {/* Enhanced Stats Grid - 2 rows of 3 */}
        <section>
          <h2 className="text-sm font-medium uppercase tracking-wider mb-4" style={{ color: 'var(--text-secondary)' }}>Overview</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Workers */}
            <div className="glass rounded-xl p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-blue-600/20 flex items-center justify-center">
                  <i className="ri-group-line text-lg text-blue-400" />
                </div>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Total Workers</p>
              </div>
              <p className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>{typeof totalWorkers === 'number' ? totalWorkers.toLocaleString('en-IN') : totalWorkers}</p>
            </div>

            {/* Active Policies */}
            <div className="glass rounded-xl p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-600/20 flex items-center justify-center">
                  <i className="ri-shield-check-line text-lg text-emerald-400" />
                </div>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Active Policies</p>
              </div>
              <p className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>{typeof activePolicies === 'number' ? activePolicies.toLocaleString('en-IN') : activePolicies}</p>
            </div>

            {/* Total Claims */}
            <div className="glass rounded-xl p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-purple-600/20 flex items-center justify-center">
                  <i className="ri-file-list-3-line text-lg text-purple-400" />
                </div>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Total Claims</p>
              </div>
              <p className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>{typeof totalClaims === 'number' ? totalClaims.toLocaleString('en-IN') : totalClaims}</p>
            </div>

            {/* Total Payouts */}
            <div className="glass rounded-xl p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-600/20 flex items-center justify-center">
                  <i className="ri-money-rupee-circle-line text-lg text-emerald-400" />
                </div>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Total Payouts</p>
              </div>
              <p className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>{typeof totalPayouts === 'number' ? formatCurrency(totalPayouts) : totalPayouts}</p>
            </div>

            {/* Fraud Detection Rate */}
            <div className="glass rounded-xl p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-red-600/20 flex items-center justify-center">
                  <i className="ri-alarm-warning-line text-lg text-red-400" />
                </div>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Fraud Detection Rate</p>
              </div>
              <p className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>{typeof fraudDetectionRate === 'number' ? `${fraudDetectionRate.toFixed(1)}%` : `${fraudDetectionRate}%`}</p>
            </div>

            {/* Avg BAS Score */}
            <div className="glass rounded-xl p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-blue-600/20 flex items-center justify-center">
                  <i className="ri-bar-chart-grouped-line text-lg text-blue-400" />
                </div>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Avg BAS Score</p>
              </div>
              <p className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>{typeof avgBasScore === 'number' ? avgBasScore.toFixed(1) : avgBasScore}</p>
            </div>

            {/* Total Premiums */}
            <div className="glass rounded-xl p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-indigo-600/20 flex items-center justify-center">
                  <i className="ri-coins-line text-lg text-indigo-400" />
                </div>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Total Premiums</p>
              </div>
              <p className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>{formatCurrency(Number(totalPremiums))}</p>
            </div>

            {/* Loss Ratio */}
            <div className="glass rounded-xl p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{
                  background: Number(lossRatio) > 100 ? 'rgba(239,68,68,0.15)' : Number(lossRatio) > 60 ? 'rgba(245,158,11,0.15)' : 'rgba(16,185,129,0.15)'
                }}>
                  <i className="ri-scales-3-line text-lg" style={{
                    color: Number(lossRatio) > 100 ? '#ef4444' : Number(lossRatio) > 60 ? '#f59e0b' : '#10b981'
                  }} />
                </div>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loss Ratio</p>
              </div>
              <p className="text-3xl font-bold" style={{
                color: Number(lossRatio) > 100 ? '#ef4444' : Number(lossRatio) > 60 ? '#f59e0b' : '#10b981'
              }}>
                {typeof lossRatio === 'number' ? `${lossRatio.toFixed(1)}%` : `${lossRatio}%`}
              </p>
              <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>Payouts / Premiums collected</p>
            </div>
          </div>
        </section>

        {/* AI Insights Card */}
        <section className="glass rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-600/20 flex items-center justify-center">
                <i className="ri-robot-line text-lg text-purple-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Neural Threat Intelligence</h2>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>RAG-Enhanced Adversarial Intelligence Engine</p>
              </div>
            </div>
            <button
              onClick={fetchAIInsights}
              disabled={aiInsightsLoading}
              className="px-4 py-2 bg-purple-600/20 border border-purple-500/30 text-purple-400 rounded-lg text-sm font-medium hover:bg-purple-600/30 disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {aiInsightsLoading ? (
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <i className="ri-refresh-line" />
              )}
              Refresh
            </button>
          </div>
          <div className="card-solid rounded-lg p-4">
            {aiInsightsLoading ? (
              <div className="flex items-center gap-2 py-4">
                <svg className="animate-spin h-5 w-5 text-purple-400" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Generating AI insights...</span>
              </div>
            ) : (() => {
              const raw = aiInsights || '';
              const bullets = raw
                .split(/\r?\n|(?<=\.)\s+(?=[A-Z0-9])/)
                .map((s) => s.trim().replace(/^[-*\u2022]\s*/, ''))
                .filter((s) => s.length > 0);
              if (bullets.length === 0) {
                return (
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No insights available.</p>
                );
              }
              return (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, paddingLeft: 16, lineHeight: 1.6 }}>
                  {bullets.map((b, i) => (
                    <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 6 }}>
                      <i className="ri-arrow-right-s-line" style={{ color: '#a78bfa', fontSize: 16, marginTop: 1, flexShrink: 0 }} />
                      <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{b}</span>
                    </li>
                  ))}
                </ul>
              );
            })()}
          </div>
        </section>

        {/* Regional Heatmap — Map + Sidebar */}
        <section className="glass" style={{ borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ padding: '20px 24px 12px' }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'rgba(239, 68, 68, 0.15)' }}>
                <i className="ri-map-2-line text-lg" style={{ color: '#ef4444' }} />
              </div>
              <div>
                <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Regional Coverage Heatmap</h2>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{heatmapZones.length} active zones &middot; {heatmapZones.reduce((s, z) => s + z.workerCount, 0)} workers</p>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', height: 480 }}>
            {/* Map (left) */}
            <div style={{ flex: 1, position: 'relative' }}>
              {mapBroken ? (
                <div style={{
                  width: '100%', height: '100%', display: 'flex',
                  flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  padding: 24, textAlign: 'center', background: 'var(--bg-secondary)',
                }}>
                  <i className="ri-map-2-line" style={{ fontSize: 40, color: 'var(--text-muted)', marginBottom: 12 }} />
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    Regional map unavailable
                  </p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)', maxWidth: 320 }}>
                    {loadError
                      ? 'Google Maps failed to load. Zone data is still live in the sidebar.'
                      : 'Map credentials missing in this build. Zone data remains live in the sidebar.'}
                  </p>
                  <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                    {[
                      { label: 'Low', color: '#10b981' },
                      { label: 'Moderate', color: '#eab308' },
                      { label: 'High', color: '#f97316' },
                      { label: 'Critical', color: '#ef4444' },
                    ].map((r) => (
                      <span
                        key={r.label}
                        style={{
                          fontSize: 10, padding: '2px 8px', borderRadius: 999,
                          background: r.color + '22', color: r.color, fontWeight: 600,
                        }}
                      >
                        {heatmapZones.filter((z) => getHeatmapColor(z.riskScore) === r.color).length} {r.label}
                      </span>
                    ))}
                  </div>
                </div>
              ) : isLoaded ? (
                <GoogleMap
                  mapContainerStyle={{ width: '100%', height: '100%' }}
                  center={{ lat: 20.5, lng: 78.9 }}
                  zoom={5}
                  options={{
                    disableDefaultUI: true,
                    zoomControl: true,
                    gestureHandling: 'greedy',
                    styles: [
                      { elementType: 'geometry', stylers: [{ color: '#f5f5f5' }] },
                      { elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
                      { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c9d6e3' }] },
                      { featureType: 'road', stylers: [{ visibility: 'simplified' }] },
                      { featureType: 'poi', stylers: [{ visibility: 'off' }] },
                      { featureType: 'transit', stylers: [{ visibility: 'off' }] },
                    ],
                  }}
                >
                  {heatmapZones.filter(z => z.workerCount > 0).map((zone) => {
                    const color = getHeatmapColor(zone.riskScore);
                    const isActive = activeHeatmapZone?.zone_id === zone.zone_id;
                    return (
                      <React.Fragment key={zone.zone_id}>
                        {/* Glow circle */}
                        <GCircle
                          center={{ lat: zone.latitude, lng: zone.longitude }}
                          radius={Math.max(25000, zone.workerCount * 15000)}
                          options={{
                            strokeColor: color,
                            strokeWeight: isActive ? 3 : 1.5,
                            strokeOpacity: isActive ? 1 : 0.6,
                            fillColor: color,
                            fillOpacity: isActive ? 0.4 : 0.2,
                            clickable: true,
                          }}
                          onClick={() => setActiveHeatmapZone(zone)}
                        />
                        {/* Center dot */}
                        <Marker
                          position={{ lat: zone.latitude, lng: zone.longitude }}
                          icon={{
                            path: google.maps.SymbolPath.CIRCLE,
                            scale: isActive ? 10 : 7,
                            fillColor: color,
                            fillOpacity: 1,
                            strokeColor: '#fff',
                            strokeWeight: 2,
                          }}
                          onClick={() => setActiveHeatmapZone(zone)}
                        />
                        {isActive && (
                          <InfoWindow
                            position={{ lat: zone.latitude, lng: zone.longitude }}
                            onCloseClick={() => setActiveHeatmapZone(null)}
                          >
                            <div style={{ fontFamily: 'system-ui', minWidth: 180, padding: 4 }}>
                              <div style={{ fontSize: 15, fontWeight: 700 }}>{zone.name}</div>
                              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>{zone.city}</div>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', fontSize: 12 }}>
                                <div><span style={{ color: '#94a3b8' }}>Workers</span><br /><strong>{zone.workerCount}</strong></div>
                                <div><span style={{ color: '#94a3b8' }}>Risk</span><br /><strong style={{ color }}>{zone.riskScore}/100</strong></div>
                                <div><span style={{ color: '#94a3b8' }}>Policies</span><br /><strong>{zone.activePolicies}</strong></div>
                                <div><span style={{ color: '#94a3b8' }}>Claims</span><br /><strong>{zone.recentClaims}</strong></div>
                              </div>
                            </div>
                          </InfoWindow>
                        )}
                      </React.Fragment>
                    );
                  })}
                </GoogleMap>
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                </div>
              )}
            </div>

            {/* Sidebar (right) — scrollable zone list */}
            <div style={{
              width: 260, borderLeft: '1px solid var(--border)',
              overflowY: 'auto', background: 'var(--bg-secondary)',
            }}>
              <div style={{ padding: '12px 14px 8px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Active Zones
              </div>
              {heatmapZones
                .filter(z => z.workerCount > 0)
                .sort((a, b) => b.workerCount - a.workerCount)
                .map((zone) => {
                  const color = getHeatmapColor(zone.riskScore);
                  const isActive = activeHeatmapZone?.zone_id === zone.zone_id;
                  return (
                    <div
                      key={zone.zone_id}
                      onClick={() => setActiveHeatmapZone(isActive ? null : zone)}
                      style={{
                        padding: '10px 14px',
                        cursor: 'pointer',
                        borderBottom: '1px solid var(--border)',
                        background: isActive ? 'var(--bg-card)' : 'transparent',
                        transition: 'background 0.15s',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {zone.name}
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{zone.city}</div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{zone.workerCount}</div>
                          <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>workers</div>
                        </div>
                      </div>
                      {isActive && (
                        <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 11 }}>
                          <span style={{ color: 'var(--text-muted)' }}>Risk: <strong style={{ color }}>{zone.riskScore}</strong></span>
                          <span style={{ color: 'var(--text-muted)' }}>Policies: <strong>{zone.activePolicies}</strong></span>
                          <span style={{ color: 'var(--text-muted)' }}>Claims: <strong>{zone.recentClaims}</strong></span>
                        </div>
                      )}
                    </div>
                  );
                })}
              {/* Legend at bottom */}
              <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase' }}>Risk Level</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {[
                    { label: 'Low', color: '#10b981' },
                    { label: 'Med', color: '#eab308' },
                    { label: 'High', color: '#f97316' },
                    { label: 'Crit', color: '#ef4444' },
                  ].map(({ label, color }) => (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
                      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Navigation Cards */}
        <section>
          <h2 className="text-sm font-medium uppercase tracking-wider mb-4" style={{ color: 'var(--text-secondary)' }}>Quick Navigation</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Link
              to="/admin/fraud"
              className="glass card-hover rounded-xl p-5 hover:border-red-500/30 transition-colors group"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-lg bg-red-600/20 flex items-center justify-center">
                  <i className="ri-shield-cross-line text-lg text-red-400" />
                </div>
                <h3 className="font-semibold group-hover:text-red-400 transition-colors" style={{ color: 'var(--text-primary)' }}>Fraud Review</h3>
              </div>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Review flagged claims and BAS scores</p>
            </Link>
            <Link
              to="/admin/actuarial"
              className="glass card-hover rounded-xl p-5 hover:border-emerald-500/30 transition-colors group"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-lg bg-emerald-600/20 flex items-center justify-center">
                  <i className="ri-line-chart-line text-lg text-emerald-400" />
                </div>
                <h3 className="font-semibold group-hover:text-emerald-400 transition-colors" style={{ color: 'var(--text-primary)' }}>Actuarial</h3>
              </div>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Loss ratios, reserves, and solvency</p>
            </Link>
            <Link
              to="/admin/users"
              className="glass card-hover rounded-xl p-5 hover:border-blue-500/30 transition-colors group"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-lg bg-blue-600/20 flex items-center justify-center">
                  <i className="ri-group-line text-lg text-blue-400" />
                </div>
                <h3 className="font-semibold group-hover:text-blue-400 transition-colors" style={{ color: 'var(--text-primary)' }}>User Management</h3>
              </div>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Manage workers, profiles, and risk tiers</p>
            </Link>
            <Link
              to="/admin/claims"
              className="glass card-hover rounded-xl p-5 hover:border-amber-500/30 transition-colors group"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-lg bg-amber-600/20 flex items-center justify-center">
                  <i className="ri-file-list-3-line text-lg text-amber-400" />
                </div>
                <h3 className="font-semibold group-hover:text-amber-400 transition-colors" style={{ color: 'var(--text-primary)' }}>Claims</h3>
              </div>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Approve, reject, and review all claims</p>
            </Link>
            <a
              href="#audit"
              onClick={(e) => { e.preventDefault(); document.getElementById('recent-activity')?.scrollIntoView({ behavior: 'smooth' }); }}
              className="glass card-hover rounded-xl p-5 hover:border-slate-500/30 transition-colors group cursor-pointer"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-lg bg-slate-600/20 flex items-center justify-center">
                  <i className="ri-history-line text-lg" style={{ color: 'var(--text-secondary)' }} />
                </div>
                <h3 className="font-semibold group-hover:text-slate-300 transition-colors" style={{ color: 'var(--text-primary)' }}>Audit Log</h3>
              </div>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>View system activity and event history</p>
            </a>
          </div>
        </section>

        {/* Manual Trigger Section */}
        <section className="glass rounded-xl p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Manual Trigger</h2>
              <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>Create a disruption event manually or force a trigger check</p>
            </div>
            <button
              onClick={handleForceCheck}
              disabled={checking}
              className="px-4 py-2 bg-cyan-600/20 border border-cyan-500/30 text-cyan-400 rounded-lg text-sm font-medium hover:bg-cyan-600/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {checking ? (
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <i className="ri-refresh-line" />
              )}
              Force Trigger Check
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Zone */}
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-primary)' }}>Zone</label>
              <select
                value={selectedZone}
                onChange={(e) => setSelectedZone(e.target.value)}
                className="input-style w-full"
              >
                {zones.length === 0 && <option value="">No zones available</option>}
                {(() => {
                  // Group zones by city
                  const grouped: Record<string, TriggerZone[]> = {};
                  for (const z of zones) {
                    const city = z.city || 'Other';
                    if (!grouped[city]) grouped[city] = [];
                    grouped[city].push(z);
                  }
                  // Sort cities: known cities first, then "Central" ones, then "Other"
                  const sortedCities = Object.keys(grouped).sort((a, b) => {
                    if (a === 'Other') return 1;
                    if (b === 'Other') return -1;
                    const aHasCentral = a.includes('Central');
                    const bHasCentral = b.includes('Central');
                    if (aHasCentral && !bHasCentral) return 1;
                    if (!aHasCentral && bHasCentral) return -1;
                    return a.localeCompare(b);
                  });
                  return sortedCities.map(city => (
                    <optgroup key={city} label={`— ${city}`}>
                      {grouped[city].map(z => (
                        <option key={z.zone_id || z.id} value={z.zone_id || z.id}>
                          {z.name}
                        </option>
                      ))}
                    </optgroup>
                  ));
                })()}
              </select>
            </div>

            {/* Event Type */}
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-primary)' }}>Event Type</label>
              <select
                value={eventType}
                onChange={(e) => setEventType(e.target.value)}
                className="input-style w-full"
              >
                {EVENT_TYPES.map((t) => (
                  <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>

            {/* Severity */}
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-primary)' }}>Severity</label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
                className="input-style w-full"
              >
                {SEVERITIES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            {/* Duration */}
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-primary)' }}>Duration (hours)</label>
              <input
                type="number"
                min={1}
                max={72}
                value={durationHours}
                onChange={(e) => setDurationHours(Number(e.target.value))}
                className="input-style w-full"
              />
            </div>

            {/* Button */}
            <div className="flex items-end">
              <button
                onClick={handleCreateEvent}
                disabled={creating || !selectedZone}
                className="btn-primary w-full py-2.5 rounded-lg text-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creating ? (
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <i className="ri-flashlight-line" />
                )}
                Create Event
              </button>
            </div>
          </div>
        </section>

        {/* Recent Activity Feed */}
        {auditLog.length > 0 && (
          <section id="recent-activity">
            <h2 className="text-sm font-medium uppercase tracking-wider mb-4" style={{ color: 'var(--text-secondary)' }}>Recent Activity</h2>
            <div className="glass rounded-xl p-5">
              <div className="space-y-4">
                {auditLog.map((entry, idx) => {
                  const entityType = (entry.entity_type || '').toLowerCase();
                  const trigger = entry.triggering_event || '';
                  let meta: any = {};
                  try { meta = typeof entry.metadata === 'string' ? JSON.parse(entry.metadata) : entry.metadata || {}; } catch { /* */ }
                  let state: any = {};
                  try { state = typeof entry.new_state === 'string' ? JSON.parse(entry.new_state) : entry.new_state || {}; } catch { /* */ }

                  // Build human-readable description
                  let description = '';
                  let icon = 'ri-information-line';
                  let iconBg = 'rgba(100,116,139,0.15)';
                  let iconColor = '#94a3b8';

                  if (trigger === 'FRAUD_CHECK_COMPLETED') {
                    const tier = state.tier || meta.tier || 'UNKNOWN';
                    const score = state.fraud_score ?? meta.fraudScore ?? '?';
                    const flagCount = (meta.flags || []).length;
                    description = `Fraud check completed — Score: ${score}/100, Tier: ${tier}${flagCount > 0 ? `, ${flagCount} flag(s) raised` : ''}`;
                    icon = 'ri-shield-cross-line';
                    iconBg = tier === 'RED' ? 'rgba(239,68,68,0.15)' : tier === 'ORANGE' ? 'rgba(249,115,22,0.15)' : 'rgba(234,179,8,0.15)';
                    iconColor = tier === 'RED' ? '#ef4444' : tier === 'ORANGE' ? '#f97316' : '#eab308';
                  } else if (trigger === 'CLAIM_APPROVED') {
                    description = `Claim approved by admin`;
                    if (meta.reason) description += ` — "${meta.reason}"`;
                    icon = 'ri-check-double-line';
                    iconBg = 'rgba(16,185,129,0.15)';
                    iconColor = '#10b981';
                  } else if (trigger === 'CLAIM_REJECTED') {
                    description = `Claim rejected by admin`;
                    if (meta.reason) description += ` — "${meta.reason}"`;
                    icon = 'ri-close-circle-line';
                    iconBg = 'rgba(239,68,68,0.15)';
                    iconColor = '#ef4444';
                  } else if (trigger === 'POLICY_CREATED') {
                    description = `New policy activated — ${state.coverage_level || 'standard'} tier, ₹${state.premium || '?'}/week`;
                    icon = 'ri-shield-check-line';
                    iconBg = 'rgba(16,185,129,0.15)';
                    iconColor = '#10b981';
                  } else if (trigger === 'PAYOUT_DISBURSED') {
                    description = `Payout disbursed — ₹${meta.amount || '?'} via ${meta.upiId || 'UPI'}`;
                    icon = 'ri-money-rupee-circle-line';
                    iconBg = 'rgba(16,185,129,0.15)';
                    iconColor = '#10b981';
                  } else if (trigger === 'AUTO_RENEW_TOGGLED') {
                    description = `Auto-renew ${state.auto_renew ? 'enabled' : 'disabled'} for policy`;
                    icon = 'ri-refresh-line';
                    iconBg = 'rgba(59,130,246,0.15)';
                    iconColor = '#3b82f6';
                  } else {
                    description = `${trigger.replace(/_/g, ' ').toLowerCase() || entityType} event on ${entityType}`;
                    icon = AUDIT_EVENT_ICONS[entityType] || 'ri-information-line';
                  }

                  return (
                    <div key={entry.id || idx} className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: iconBg }}>
                        <i className={icon} style={{ color: iconColor, fontSize: 14 }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm" style={{ color: 'var(--text-primary)', lineHeight: 1.5 }}>
                          {description}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}>
                            {entityType.toUpperCase()}
                          </span>
                          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                            {entry.created_at
                              ? new Date(entry.created_at).toLocaleString('en-IN', {
                                  day: 'numeric',
                                  month: 'short',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : '--'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
};

export default AdminDashboard;
