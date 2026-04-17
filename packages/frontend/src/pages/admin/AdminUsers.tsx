import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { admin } from '../../api/client';
import ThemeToggle from '../../components/ThemeToggle';
import Logo from '../../components/Logo';

interface Worker {
  id: string;
  name: string;
  mobile: string;
  platform: string;
  delivery_zone_id?: string;
  zone_name?: string;
  risk_tier?: string;
  risk_score?: number;
  has_active_policy?: boolean;
  claims_count?: number;
}

interface WorkerDetail {
  id: string;
  name: string;
  mobile: string;
  platform: string;
  zone_name?: string;
  risk_score?: number;
  risk_tier?: string;
  hourly_rate?: number;
  avg_hours_per_day?: number;
  payment_upi?: string;
  policies?: any[];
  claims?: any[];
  created_at?: string;
}

interface LinkedWorker {
  worker_id: string;
  name: string;
  mobile: string;
  platform: string | null;
  created_at: string;
}
interface WorkerLinkage {
  worker_id: string;
  shared_devices: Array<{ fingerprint_hash: string; workers: LinkedWorker[] }>;
  shared_ips: Array<{ ip_address: string; workers: LinkedWorker[]; last_seen: string }>;
  shared_upis: Array<{ payment_upi: string; workers: LinkedWorker[] }>;
  distinct_linked_workers: number;
  penalty: number;
  flags: string[];
}

const PLATFORM_COLORS: Record<string, { bg: string; text: string }> = {
  blinkit: { bg: 'rgba(234,179,8,0.15)', text: '#eab308' },
  zepto: { bg: 'rgba(168,85,247,0.15)', text: '#a855f7' },
  instamart: { bg: 'rgba(249,115,22,0.15)', text: '#f97316' },
};

const RISK_TIER_COLORS: Record<string, { bg: string; text: string }> = {
  LOW: { bg: 'rgba(16,185,129,0.15)', text: '#10b981' },
  MEDIUM: { bg: 'rgba(234,179,8,0.15)', text: '#eab308' },
  HIGH: { bg: 'rgba(249,115,22,0.15)', text: '#f97316' },
  CRITICAL: { bg: 'rgba(239,68,68,0.15)', text: '#ef4444' },
};

const AdminUsers: React.FC = () => {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [platformFilter, setPlatformFilter] = useState('All');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [workerDetail, setWorkerDetail] = useState<WorkerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [aiRisk, setAiRisk] = useState<string | null>(null);
  const [aiRiskLoading, setAiRiskLoading] = useState(false);
  const [linkage, setLinkage] = useState<WorkerLinkage | null>(null);
  const [linkageLoading, setLinkageLoading] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deletePreview, setDeletePreview] = useState<{
    worker: { id: string; name: string; mobile_number: string };
    counts: Record<string, number>;
    total: number;
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    const fetchWorkers = async () => {
      try {
        const res = await admin.getWorkers();
        setWorkers(res.data?.workers || res.data || []);
      } catch {
        showToast('Failed to load workers', 'error');
      } finally {
        setLoading(false);
      }
    };
    fetchWorkers();
  }, [showToast]);

  const handleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setWorkerDetail(null);
      setAiRisk(null);
      setLinkage(null);
      return;
    }
    setExpandedId(id);
    setWorkerDetail(null);
    setAiRisk(null);
    setLinkage(null);
    setDetailLoading(true);
    try {
      const res = await admin.getWorkerDetail(id);
      setWorkerDetail(res.data?.worker || res.data);
    } catch {
      showToast('Failed to load worker details', 'error');
    } finally {
      setDetailLoading(false);
    }
    // Kick off AI narrative and linkage graph in parallel — each has its
    // own loading state so the panel renders progressively.
    setAiRiskLoading(true);
    setLinkageLoading(true);
    admin
      .getWorkerAIRisk(id)
      .then((res) => setAiRisk(res.data?.narrative || res.data?.risk_narrative || JSON.stringify(res.data)))
      .catch(() => setAiRisk('Failed to load AI risk assessment.'))
      .finally(() => setAiRiskLoading(false));
    admin
      .getWorkerLinkage(id)
      .then((res) => setLinkage(res.data?.linkage ?? null))
      .catch(() => setLinkage(null))
      .finally(() => setLinkageLoading(false));
  };

  const openDeleteConfirm = async (id: string) => {
    setDeleteConfirmId(id);
    setDeleteConfirmText('');
    setDeletePreview(null);
    setPreviewLoading(true);
    try {
      const res = await admin.getWorkerDeletePreview(id);
      setDeletePreview(res.data);
    } catch {
      showToast('Failed to load delete preview', 'error');
      setDeleteConfirmId(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!deletePreview) return;
    const expected = deletePreview.worker.name.trim();
    if (deleteConfirmText.trim() !== expected) {
      showToast(`Type the worker's name exactly: "${expected}"`, 'error');
      return;
    }
    setDeleting(true);
    try {
      const res = await admin.deleteWorker(id);
      setWorkers((prev) => prev.filter((w) => w.id !== id));
      setDeleteConfirmId(null);
      setDeletePreview(null);
      setDeleteConfirmText('');
      setExpandedId(null);
      const total = Object.values(res.data?.deleted ?? {}).reduce(
        (a: number, b) => a + Number(b || 0),
        0,
      );
      showToast(`Worker hard-deleted — ${total} rows removed across all tables`, 'success');
    } catch {
      showToast('Failed to delete worker', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const filtered = workers.filter((w) => {
    const matchesSearch =
      !search ||
      w.name?.toLowerCase().includes(search.toLowerCase()) ||
      w.mobile?.includes(search);
    const matchesPlatform =
      platformFilter === 'All' || w.platform?.toLowerCase() === platformFilter.toLowerCase();
    return matchesSearch && matchesPlatform;
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
        <div className="flex flex-col items-center gap-3">
          <svg className="animate-spin h-8 w-8 text-indigo-400" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loading users...</p>
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

      {/* Delete Confirmation Modal — cascade-aware */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="glass rounded-xl p-6 max-w-md w-full" style={{ border: '1px solid rgba(239,68,68,0.4)' }}>
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(239,68,68,0.15)' }}>
                <i className="ri-alert-line text-xl text-red-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-red-400">Permanent deletion</h3>
                <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                  This will hard-delete the worker and all associated records. This action cannot be undone.
                </p>
              </div>
            </div>

            {previewLoading || !deletePreview ? (
              <div className="py-6 text-center">
                <svg className="animate-spin h-6 w-6 text-red-400 mx-auto" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <p className="text-xs mt-3" style={{ color: 'var(--text-secondary)' }}>Loading impact preview...</p>
              </div>
            ) : (
              <>
                {/* Worker identity */}
                <div className="rounded-lg p-3 mb-4" style={{ background: 'var(--bg-secondary)' }}>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Deleting</p>
                  <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                    {deletePreview.worker.name || '(no name)'}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {deletePreview.worker.mobile_number}
                  </p>
                </div>

                {/* Cascade impact */}
                <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                  Rows that will also be deleted
                </p>
                <div className="rounded-lg p-3 mb-4 grid grid-cols-2 gap-2 text-xs" style={{ background: 'var(--bg-secondary)' }}>
                  {Object.entries(deletePreview.counts).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between">
                      <span style={{ color: 'var(--text-secondary)' }}>{k.replace(/_/g, ' ')}</span>
                      <span className={`font-mono font-semibold ${v > 0 ? 'text-red-400' : ''}`} style={v === 0 ? { color: 'var(--text-muted)' } : undefined}>
                        {v}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] mb-4" style={{ color: 'var(--text-muted)' }}>
                  Total dependent rows: <span className="font-mono font-semibold text-red-400">{deletePreview.total}</span>
                </p>

                {/* Name-typing confirmation */}
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                  Type the worker's name to confirm: <span className="font-mono text-red-400">{deletePreview.worker.name || '(no name)'}</span>
                </label>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="Type name here"
                  className="input-style w-full mb-4"
                  autoFocus
                />

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleDelete(deleteConfirmId)}
                    disabled={deleting || deleteConfirmText.trim() !== (deletePreview.worker.name || '').trim()}
                    className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-500 disabled:bg-red-600/30 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    {deleting && (
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    )}
                    Permanently delete
                  </button>
                  <button
                    onClick={() => { setDeleteConfirmId(null); setDeletePreview(null); setDeleteConfirmText(''); }}
                    disabled={deleting}
                    className="flex-1 px-4 py-2 rounded-lg text-sm transition-colors"
                    style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
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
              <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>User Management</h1>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Manage gig workers and their profiles</p>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {/* Search and Filter */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or mobile..."
              className="input-style w-full pl-10"
            />
          </div>
          <select
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value)}
            className="input-style"
          >
            <option value="All">All Platforms</option>
            <option value="blinkit">Blinkit</option>
            <option value="zepto">Zepto</option>
            <option value="instamart">Instamart</option>
          </select>
        </div>

        {/* Workers Table */}
        <div className="glass rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Name</th>
                  <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Mobile</th>
                  <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Platform</th>
                  <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Zone</th>
                  <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Risk Tier</th>
                  <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Active Policy</th>
                  <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Claims</th>
                  <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center" style={{ color: 'var(--text-muted)' }}>No workers found</td>
                  </tr>
                ) : (
                  filtered.map((w) => {
                    const platformStyle = PLATFORM_COLORS[w.platform?.toLowerCase()] || { bg: 'rgba(100,116,139,0.15)', text: '#94a3b8' };
                    const riskStyle = RISK_TIER_COLORS[w.risk_tier || ''] || { bg: 'rgba(100,116,139,0.15)', text: '#94a3b8' };
                    const isExpanded = expandedId === w.id;

                    return (
                      <React.Fragment key={w.id}>
                        <tr className="transition-colors" style={{ borderBottom: '1px solid var(--border)' }}>
                          <td className="px-4 py-3 font-medium" style={{ color: 'var(--text-primary)' }}>{w.name}</td>
                          <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>{w.mobile}</td>
                          <td className="px-4 py-3">
                            <span
                              className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold capitalize"
                              style={{ background: platformStyle.bg, color: platformStyle.text }}
                            >
                              {w.platform}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-secondary)' }}>{w.zone_name || w.delivery_zone_id || '--'}</td>
                          <td className="px-4 py-3">
                            <span
                              className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold"
                              style={{ background: riskStyle.bg, color: riskStyle.text }}
                            >
                              {w.risk_tier || '--'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs">
                            {w.has_active_policy ? (
                              <span className="text-emerald-400 font-medium">Yes</span>
                            ) : (
                              <span style={{ color: 'var(--text-muted)' }}>No</span>
                            )}
                          </td>
                          <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{w.claims_count ?? '--'}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleExpand(w.id)}
                                className="px-3 py-1 bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 rounded-lg text-xs font-medium hover:bg-indigo-600/30 transition-colors"
                              >
                                {isExpanded ? 'Hide' : 'View'}
                              </button>
                              <button
                                onClick={() => openDeleteConfirm(w.id)}
                                className="px-3 py-1 bg-red-600/20 border border-red-500/30 text-red-400 rounded-lg text-xs font-medium hover:bg-red-600/30 transition-colors"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={8} className="px-4 py-4 card-solid">
                              {detailLoading ? (
                                <div className="flex items-center justify-center py-6">
                                  <svg className="animate-spin h-6 w-6 text-indigo-400" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                  </svg>
                                </div>
                              ) : workerDetail ? (
                                <div className="space-y-4 slide-up">
                                  {/* Worker Profile */}
                                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <div className="glass rounded-lg p-3">
                                      <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Hourly Rate</p>
                                      <p className="font-medium" style={{ color: 'var(--text-primary)' }}>&#8377;{workerDetail.hourly_rate || '--'}/hr</p>
                                    </div>
                                    <div className="glass rounded-lg p-3">
                                      <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Avg Hours/Day</p>
                                      <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{workerDetail.avg_hours_per_day || '--'}</p>
                                    </div>
                                    <div className="glass rounded-lg p-3">
                                      <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>UPI</p>
                                      <p className="font-medium text-xs font-mono" style={{ color: 'var(--text-primary)' }}>{workerDetail.payment_upi || '--'}</p>
                                    </div>
                                  </div>

                                  {/* Policy History */}
                                  {workerDetail.policies && workerDetail.policies.length > 0 && (
                                    <div>
                                      <p className="text-xs font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--text-secondary)' }}>Policy History</p>
                                      <div className="space-y-1">
                                        {workerDetail.policies.map((p: any, idx: number) => (
                                          <div key={idx} className="glass rounded-lg p-2 flex items-center justify-between">
                                            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{p.policy_number || `Policy ${idx + 1}`}</span>
                                            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{p.coverage_level} - {p.status}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {/* Recent Claims */}
                                  {workerDetail.claims && workerDetail.claims.length > 0 && (
                                    <div>
                                      <p className="text-xs font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--text-secondary)' }}>Recent Claims</p>
                                      <div className="space-y-1">
                                        {workerDetail.claims.map((c: any, idx: number) => {
                                          const fraudScore = c.fraud_score ?? c.bas_score ?? null;
                                          return (
                                            <div key={idx} className="glass rounded-lg p-2 flex items-center justify-between">
                                              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{c.claim_number || `Claim ${idx + 1}`}</span>
                                              <div className="flex items-center gap-2">
                                                {fraudScore != null && (
                                                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>BAS: {fraudScore}</span>
                                                )}
                                                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{c.status}</span>
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}

                                  {/* AI Risk Narrative */}
                                  <div>
                                    <p className="text-xs font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--text-secondary)' }}>
                                      <i className="ri-robot-line mr-1" />
                                      AI Risk Narrative
                                    </p>
                                    <div className="glass rounded-lg p-3" style={{ borderColor: 'var(--border)' }}>
                                      {aiRiskLoading ? (
                                        <div className="flex items-center gap-2 py-2">
                                          <svg className="animate-spin h-4 w-4 text-indigo-400" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                          </svg>
                                          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Generating AI risk assessment...</span>
                                        </div>
                                      ) : (
                                        <p className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text-secondary)' }}>{aiRisk || 'No AI risk data available.'}</p>
                                      )}
                                    </div>
                                  </div>

                                  {/* Ring-Fraud Linkage Graph */}
                                  <div>
                                    <p className="text-xs font-medium uppercase tracking-wider mb-2 flex items-center justify-between" style={{ color: 'var(--text-secondary)' }}>
                                      <span>
                                        <i className="ri-node-tree mr-1" />
                                        Ring-Fraud Linkage
                                      </span>
                                      {linkage && linkage.distinct_linked_workers > 0 && (
                                        <span
                                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                                          style={{
                                            background: linkage.distinct_linked_workers >= 5 ? 'rgba(239,68,68,0.15)' : 'rgba(249,115,22,0.15)',
                                            color: linkage.distinct_linked_workers >= 5 ? '#ef4444' : '#f97316',
                                          }}
                                        >
                                          +{linkage.penalty} fraud penalty · {linkage.distinct_linked_workers} linked
                                        </span>
                                      )}
                                    </p>
                                    <div className="glass rounded-lg p-3 space-y-3" style={{ borderColor: 'var(--border)' }}>
                                      {linkageLoading ? (
                                        <div className="flex items-center gap-2 py-2">
                                          <svg className="animate-spin h-4 w-4 text-indigo-400" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                          </svg>
                                          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Computing linkage graph...</span>
                                        </div>
                                      ) : !linkage || linkage.distinct_linked_workers === 0 ? (
                                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                          <i className="ri-check-line mr-1 text-emerald-400" />
                                          No shared devices, IPs, or UPI handles. This account is isolated.
                                        </p>
                                      ) : (
                                        <>
                                          {linkage.shared_upis.length > 0 && (
                                            <div>
                                              <p className="text-[10px] uppercase font-semibold mb-1 text-red-400">
                                                Shared UPI · highest-severity signal
                                              </p>
                                              {linkage.shared_upis.map((u) => (
                                                <div key={u.payment_upi} className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                                                  <span className="font-mono text-red-400">{u.payment_upi}</span>{' '}
                                                  → also used by{' '}
                                                  {u.workers.map((w, i) => (
                                                    <React.Fragment key={w.worker_id}>
                                                      {i > 0 && ', '}
                                                      <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                                                        {w.name}
                                                      </span>{' '}
                                                      <span style={{ color: 'var(--text-muted)' }}>({w.mobile})</span>
                                                    </React.Fragment>
                                                  ))}
                                                </div>
                                              ))}
                                            </div>
                                          )}

                                          {linkage.shared_devices.length > 0 && (
                                            <div>
                                              <p className="text-[10px] uppercase font-semibold mb-1 text-orange-400">Shared device fingerprint</p>
                                              {linkage.shared_devices.map((d) => (
                                                <div key={d.fingerprint_hash} className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                                                  <span className="font-mono text-orange-400">{d.fingerprint_hash.slice(0, 12)}…</span>{' '}
                                                  → {d.workers.length} other worker{d.workers.length === 1 ? '' : 's'}:{' '}
                                                  {d.workers.map((w, i) => (
                                                    <React.Fragment key={w.worker_id}>
                                                      {i > 0 && ', '}
                                                      <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                                                        {w.name}
                                                      </span>
                                                    </React.Fragment>
                                                  ))}
                                                </div>
                                              ))}
                                            </div>
                                          )}

                                          {linkage.shared_ips.length > 0 && (
                                            <div>
                                              <p className="text-[10px] uppercase font-semibold mb-1 text-amber-400">Shared IP (last 7 days)</p>
                                              {linkage.shared_ips.slice(0, 5).map((i) => (
                                                <div key={i.ip_address} className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                                                  <span className="font-mono text-amber-400">{i.ip_address}</span>{' '}
                                                  → {i.workers.length} other worker{i.workers.length === 1 ? '' : 's'}
                                                </div>
                                              ))}
                                            </div>
                                          )}
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <p className="text-sm text-center py-4" style={{ color: 'var(--text-muted)' }}>No details available</p>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
};

export default AdminUsers;
