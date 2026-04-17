import { useMemo } from 'react';

export type TimelineStatus = 'INITIATED' | 'PROCESSING' | 'SUCCESS' | 'FAILED' | 'RETRYING';

export interface PayoutTimelineProps {
  status: TimelineStatus | null;
  initiatedAt?: string | Date | null;
  processingAt?: string | Date | null;
  settledAt?: string | Date | null;
  failedAt?: string | Date | null;
  failureReason?: string | null;
  compact?: boolean;
}

interface Step {
  key: 'INITIATED' | 'PROCESSING' | 'SUCCESS';
  label: string;
  icon: string;
  ts?: Date | null;
}

/**
 * Animated 3-step progress strip that mirrors the backend payout state machine.
 *
 *   ● Initiated  ──  ● Processing  ──  ● Settled
 *
 * Each dot lights up when the corresponding timestamp is present; the
 * connector between two dots pulses while the flow is in-flight between
 * those states, and solidifies once the next step completes. If the payout
 * terminates in FAILED, the remaining steps render muted and the failure
 * reason appears below.
 */
export default function PayoutTimeline({
  status,
  initiatedAt,
  processingAt,
  settledAt,
  failedAt,
  failureReason,
  compact = false,
}: PayoutTimelineProps) {
  const steps: Step[] = useMemo(
    () => [
      { key: 'INITIATED',  label: 'Initiated',  icon: 'ri-send-plane-2-line', ts: initiatedAt ? new Date(initiatedAt) : null },
      { key: 'PROCESSING', label: 'Processing', icon: 'ri-exchange-funds-line', ts: processingAt ? new Date(processingAt) : null },
      { key: 'SUCCESS',    label: 'Settled',    icon: 'ri-checkbox-circle-line', ts: settledAt ? new Date(settledAt) : null },
    ],
    [initiatedAt, processingAt, settledAt],
  );

  const failed = status === 'FAILED';
  const retrying = status === 'RETRYING';

  // Which step is currently active? Highest index where either:
  //  - status matches the step key, OR
  //  - the timestamp for that step has been filled in already.
  const activeIdx = useMemo(() => {
    if (failed) return -1;
    let idx = -1;
    for (let i = 0; i < steps.length; i++) {
      if (steps[i].ts) idx = i;
      if (status === steps[i].key) idx = Math.max(idx, i);
    }
    return idx;
  }, [steps, status, failed]);

  const fmtTs = (d: Date | null | undefined) => {
    if (!d) return '';
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div className="w-full">
      <div className={`flex items-center ${compact ? 'gap-1' : 'gap-2'}`}>
        {steps.map((step, i) => {
          const reached = activeIdx >= i && !failed;
          const isCurrent = activeIdx === i && status !== 'SUCCESS' && !failed;
          const isFailedStep = failed && i === (activeIdx < 0 ? 0 : activeIdx);
          const dotBg = isFailedStep
            ? '#ef4444'
            : reached
              ? '#10b981'
              : 'var(--bg-secondary)';
          const dotColor = isFailedStep
            ? '#fff'
            : reached
              ? '#fff'
              : 'var(--text-muted)';
          const ringAnim = isCurrent ? 'animate-pulse' : '';

          return (
            <div key={step.key} className="flex-1 flex items-center">
              <div className="flex flex-col items-center gap-1 flex-1">
                <div
                  className={`relative rounded-full flex items-center justify-center ${ringAnim}`}
                  style={{
                    width: compact ? 26 : 36,
                    height: compact ? 26 : 36,
                    background: dotBg,
                    boxShadow: reached ? '0 0 0 3px rgba(16,185,129,0.18)' : 'none',
                    border: reached ? 'none' : '2px solid var(--border)',
                  }}
                >
                  <i className={`${isFailedStep ? 'ri-close-line' : step.icon} ${compact ? 'text-xs' : 'text-sm'}`} style={{ color: dotColor }} />
                </div>
                <div className="text-center">
                  <p className={`font-medium ${compact ? 'text-[9px]' : 'text-[10px]'}`} style={{ color: reached ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                    {step.label}
                  </p>
                  {!compact && step.ts && (
                    <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
                      {fmtTs(step.ts)}
                    </p>
                  )}
                </div>
              </div>
              {i < steps.length - 1 && (
                <div
                  className="flex-1 h-[2px] mx-1 rounded-full relative overflow-hidden"
                  style={{ background: activeIdx > i && !failed ? '#10b981' : 'var(--border)' }}
                >
                  {activeIdx === i && !failed && status !== 'SUCCESS' && (
                    <div
                      className="absolute inset-0"
                      style={{
                        background: 'linear-gradient(90deg, transparent, #10b981, transparent)',
                        animation: 'timeline-shimmer 1.4s linear infinite',
                      }}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {retrying && (
        <p className="mt-2 text-[10px] text-center" style={{ color: '#f59e0b' }}>
          <i className="ri-restart-line mr-1" />
          Gateway retrying after transient failure…
        </p>
      )}

      {failed && (
        <div className="mt-2 p-2 rounded-lg text-[10px] text-center" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
          <i className="ri-error-warning-line mr-1" />
          {failureReason ?? 'Payout failed after retries.'} &middot; {fmtTs(failedAt ? new Date(failedAt) : null)}
        </div>
      )}

      <style>{`
        @keyframes timeline-shimmer {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}
