import { useEffect, useState } from 'react';
import CountUp from 'react-countup';
import { publicApi } from '../api/client';

interface StatsResponse {
  total_workers?: number;
  zones_covered?: number;
  total_payouts?: number;
  last_payout_ago_seconds?: number | null;
}

function formatAgo(seconds: number | null | undefined): string {
  if (seconds == null) return '—';
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${Math.floor(seconds)}s ago`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr${h > 1 ? 's' : ''} ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d > 1 ? 's' : ''} ago`;
}

export default function HeroStats() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [prev, setPrev] = useState<StatsResponse | null>(null);

  useEffect(() => {
    let mounted = true;
    const fetchStats = async () => {
      try {
        const data = await publicApi.getStats();
        if (!mounted) return;
        setPrev(stats);
        setStats(data);
      } catch {
        /* non-critical */
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetchStats();
    const id = setInterval(fetchStats, 30_000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading && !stats) {
    return (
      <section className="w-full max-w-5xl mx-auto my-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl p-5 animate-pulse"
              style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                minHeight: 110,
              }}
            >
              <div className="h-3 w-24 rounded mb-3" style={{ background: 'var(--bg-tertiary, var(--bg-card))' }} />
              <div className="h-7 w-20 rounded" style={{ background: 'var(--bg-tertiary, var(--bg-card))' }} />
            </div>
          ))}
        </div>
      </section>
    );
  }

  const workers = stats?.total_workers ?? 0;
  const zones = stats?.zones_covered ?? 0;
  const paid = stats?.total_payouts ?? 0;
  const lastPayoutText = formatAgo(stats?.last_payout_ago_seconds ?? null);

  return (
    <section className="w-full max-w-5xl mx-auto my-6 relative">
      <div className="flex items-center justify-end mb-2">
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="text-[10px] font-bold tracking-wider text-emerald-500">LIVE</span>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Workers Protected" icon="ri-group-line" color="#3b82f6">
          <CountUp
            end={workers}
            start={prev?.total_workers ?? 0}
            duration={2}
            separator=","
          />
        </StatCard>
        <StatCard label="Zones Covered" icon="ri-map-pin-line" color="#8b5cf6">
          <CountUp
            end={zones}
            start={prev?.zones_covered ?? 0}
            duration={2}
            separator=","
          />
        </StatCard>
        <StatCard label="Total Paid" icon="ri-money-rupee-circle-line" color="#10b981">
          <CountUp
            end={paid}
            start={prev?.total_payouts ?? 0}
            duration={2}
            separator=","
            prefix="₹"
          />
        </StatCard>
        <StatCard label="Last Payout" icon="ri-time-line" color="#f59e0b">
          <span className="text-lg md:text-xl">{lastPayoutText}</span>
        </StatCard>
      </div>
    </section>
  );
}

function StatCard({
  label,
  icon,
  color,
  children,
}: {
  label: string;
  icon: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-xl p-5 transition-transform"
      style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: `${color}1F` }}
        >
          <i className={icon} style={{ color, fontSize: 14 }} />
        </div>
        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          {label}
        </span>
      </div>
      <div className="text-2xl md:text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
        {children}
      </div>
    </div>
  );
}
