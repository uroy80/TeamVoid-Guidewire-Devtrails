import { useStore } from '../store/store';
import useEventStream, { type StreamEvent } from '../hooks/useEventStream';

const EVENT_COLORS: Record<string, { color: string; bg: string; icon: string }> = {
  TRIGGER_FIRED: { color: '#ef4444', bg: 'rgba(239,68,68,0.12)', icon: 'ri-alarm-warning-line' },
  CLAIM_CREATED: { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', icon: 'ri-file-list-3-line' },
  FRAUD_CHECKED: { color: '#f97316', bg: 'rgba(249,115,22,0.12)', icon: 'ri-shield-cross-line' },
  PAYOUT_SENT: { color: '#10b981', bg: 'rgba(16,185,129,0.12)', icon: 'ri-money-rupee-circle-line' },
  WORKER_REGISTERED: { color: '#3b82f6', bg: 'rgba(59,130,246,0.12)', icon: 'ri-user-add-line' },
  POLICY_CREATED: { color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)', icon: 'ri-shield-check-line' },
  COMMUNITY_REPORT: { color: '#06b6d4', bg: 'rgba(6,182,212,0.12)', icon: 'ri-rainy-line' },
};

function formatRelative(ts: number): string {
  const diffMs = Date.now() - ts;
  const s = Math.max(0, Math.floor(diffMs / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function humanSummary(e: StreamEvent): string {
  const p = e.payload || {};
  switch (e.type) {
    case 'TRIGGER_FIRED':
      return `🚨 ${p.event_type || 'Event'} triggered in zone ${p.zone_id || '?'} (${p.severity || '—'})`;
    case 'CLAIM_CREATED':
      return `📝 Claim ${p.claim_number || ''} created — ₹${p.payout ?? p.amount ?? 0} (${p.source || 'auto'})`;
    case 'PAYOUT_SENT': {
      const id: string = String(p.claim_id || '');
      return `💸 ₹${p.amount ?? 0} sent for claim ${id.substring(0, 8)}`;
    }
    case 'FRAUD_CHECKED':
      return `🔍 Claim ${p.claim_number || ''} scored ${p.fraud_score ?? '?'}/100 → ${p.status || '—'}`;
    case 'WORKER_REGISTERED':
      return `👤 ${p.name || 'Worker'} joined (${p.platform || '—'})`;
    case 'POLICY_CREATED': {
      const wid: string = String(p.worker_id || '');
      return `🛡️ Policy activated for worker ${wid.substring(0, 8)}`;
    }
    case 'COMMUNITY_REPORT':
      return `🌧️ ${p.condition_type || 'Condition'} reported (${p.severity || '—'})`;
    default:
      return `${e.type}`;
  }
}

interface Props {
  className?: string;
  maxItems?: number;
}

export default function LiveOpsFeed({ className = '', maxItems = 15 }: Props) {
  const token = useStore((s) => s.token);
  const { events, connected } = useEventStream(token);
  const visible = events.slice(0, maxItems);

  return (
    <section
      className={`glass rounded-xl p-5 ${className}`}
      style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <i className="ri-pulse-line text-lg" style={{ color: 'var(--accent)' }} />
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Live Ops Feed
          </h3>
        </div>
        {connected ? (
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="text-[10px] font-bold tracking-wider text-emerald-500">LIVE</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className="inline-flex rounded-full h-2 w-2 bg-slate-400" />
            <span className="text-[10px] font-bold tracking-wider" style={{ color: 'var(--text-muted)' }}>
              RECONNECTING…
            </span>
          </div>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="text-xs py-8 text-center" style={{ color: 'var(--text-muted)' }}>
          Waiting for live events…
        </p>
      ) : (
        <ul className="space-y-2">
          {visible.map((e, idx) => {
            const key = `${e.ts}-${idx}`;
            const style = EVENT_COLORS[e.type] || {
              color: 'var(--text-secondary)',
              bg: 'rgba(100,116,139,0.12)',
              icon: 'ri-information-line',
            };
            return (
              <li
                key={key}
                className="flex items-start gap-3 p-2 rounded-lg transition-all duration-300"
                style={{
                  background: 'var(--bg-card, var(--bg-tertiary))',
                  animation: 'slideInFromTop 0.3s ease-out',
                }}
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: style.bg }}
                >
                  <i className={style.icon} style={{ color: style.color, fontSize: 14 }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className="text-xs leading-snug truncate"
                    style={{ color: 'var(--text-primary)' }}
                    title={humanSummary(e)}
                  >
                    {humanSummary(e)}
                  </p>
                  <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    {formatRelative(e.ts)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <style>{`
        @keyframes slideInFromTop {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </section>
  );
}
