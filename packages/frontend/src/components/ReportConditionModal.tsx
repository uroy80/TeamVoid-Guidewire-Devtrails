import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { community } from '../api/client';
import { useGeolocation } from '../hooks/useGeolocation';

type ConditionType = 'RAIN' | 'FLOOD' | 'HEAT' | 'POLLUTION' | 'STRIKE';
type Severity = 'MILD' | 'MODERATE' | 'SEVERE';

interface Props {
  open: boolean;
  onClose: () => void;
}

const CONDITIONS: { type: ConditionType; emoji: string; labelKey: string }[] = [
  { type: 'RAIN', emoji: '🌧️', labelKey: 'report.condition_rain' },
  { type: 'FLOOD', emoji: '🌊', labelKey: 'report.condition_flood' },
  { type: 'HEAT', emoji: '🌡️', labelKey: 'report.condition_heat' },
  { type: 'POLLUTION', emoji: '😷', labelKey: 'report.condition_pollution' },
  { type: 'STRIKE', emoji: '⚠️', labelKey: 'report.condition_strike' },
];

const SEVERITIES: { value: Severity; labelKey: string }[] = [
  { value: 'MILD', labelKey: 'report.severity_mild' },
  { value: 'MODERATE', labelKey: 'report.severity_moderate' },
  { value: 'SEVERE', labelKey: 'report.severity_severe' },
];

export default function ReportConditionModal({ open, onClose }: Props) {
  const { t } = useTranslation();
  const geo = useGeolocation(open);
  const [condition, setCondition] = useState<ConditionType | null>(null);
  const [severity, setSeverity] = useState<Severity>('MODERATE');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose, submitting]);

  useEffect(() => {
    if (!open) {
      setCondition(null);
      setSeverity('MODERATE');
      setNotes('');
      setSubmitting(false);
    }
  }, [open]);

  if (!open) return null;

  const canSubmit = !!condition && geo.lastLat != null && geo.lastLng != null && !submitting;

  const handleSubmit = async () => {
    if (!condition) return;
    if (geo.lastLat == null || geo.lastLng == null) {
      toast.error('Waiting for GPS — please allow location access');
      return;
    }
    setSubmitting(true);
    try {
      const res = await community.submitReport({
        latitude: geo.lastLat,
        longitude: geo.lastLng,
        condition_type: condition,
        severity,
        notes: notes.trim() || undefined,
      });
      if (res?.clustered && res?.cluster_size) {
        toast.success(
          t('report.success_clustered', { n: res.cluster_size, defaultValue: `✨ ${res.cluster_size} workers confirmed — disruption event created!` }),
        );
      } else {
        toast.success(t('report.success_solo', { defaultValue: 'Report submitted. We\'re tracking this area.' }));
      }
      onClose();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string; message?: string } }; message?: string })?.response?.data?.error ||
        (err as { response?: { data?: { error?: string; message?: string } }; message?: string })?.response?.data?.message ||
        (err as { message?: string })?.message ||
        t('common.error_generic');
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div
        className="glass"
        style={{
          padding: 0,
          borderRadius: 20,
          maxWidth: 520,
          width: '92%',
          maxHeight: '90vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
        }}
      >
        {/* Header */}
        <div style={{ padding: '20px 20px 12px', borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                {t('report.title')}
              </h3>
              <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                {t('report.subtitle')}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              aria-label={t('common.close')}
              style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              <i className="ri-close-line text-xl" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>
          {/* Conditions */}
          <div className="grid grid-cols-5 gap-2 mb-6">
            {CONDITIONS.map((c) => {
              const selected = condition === c.type;
              return (
                <button
                  key={c.type}
                  type="button"
                  onClick={() => setCondition(c.type)}
                  className="flex flex-col items-center gap-1 p-2 rounded-xl transition-all"
                  style={{
                    background: selected ? 'var(--accent-light, rgba(59,130,246,0.1))' : 'var(--bg-tertiary, var(--bg-card))',
                    border: `2px solid ${selected ? 'var(--accent)' : 'transparent'}`,
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ fontSize: 28 }}>{c.emoji}</span>
                  <span className="text-[10px] text-center leading-tight" style={{ color: 'var(--text-secondary)' }}>
                    {t(c.labelKey)}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Severity */}
          <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
            {t('report.severity_label', { defaultValue: 'How severe?' })}
          </label>
          <div className="grid grid-cols-3 gap-2 mb-6">
            {SEVERITIES.map((s) => {
              const selected = severity === s.value;
              return (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setSeverity(s.value)}
                  className="py-2 rounded-lg text-sm font-medium transition-all"
                  style={{
                    background: selected ? 'var(--accent)' : 'var(--bg-tertiary, var(--bg-card))',
                    color: selected ? '#fff' : 'var(--text-primary)',
                    border: '1px solid var(--border)',
                    cursor: 'pointer',
                  }}
                >
                  {t(s.labelKey)}
                </button>
              );
            })}
          </div>

          {/* Notes */}
          <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
            Notes
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value.slice(0, 500))}
            placeholder={t('report.notes_placeholder')}
            rows={3}
            className="input-style w-full resize-none"
            style={{
              background: 'var(--bg-tertiary, var(--bg-card))',
              color: 'var(--text-primary)',
              border: '1px solid var(--border)',
              padding: 10,
              borderRadius: 10,
              fontSize: 13,
            }}
          />
          <div className="flex justify-end mt-1">
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              {notes.length} / 500
            </span>
          </div>

          {/* GPS status */}
          <div className="flex items-center gap-2 mt-4 p-3 rounded-lg" style={{ background: 'var(--bg-tertiary, var(--bg-card))' }}>
            <i
              className={geo.lastLat != null ? 'ri-checkbox-circle-line' : 'ri-loader-4-line animate-spin'}
              style={{ color: geo.lastLat != null ? '#10b981' : 'var(--text-muted)' }}
            />
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {geo.lastLat != null
                ? `GPS: ${geo.lastLat.toFixed(4)}, ${geo.lastLng?.toFixed(4)}`
                : geo.error || 'Getting location…'}
            </span>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: 16, borderTop: '1px solid var(--border)', display: 'flex', gap: 12 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium"
            style={{ background: 'var(--bg-tertiary, var(--bg-card))', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex-1 py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            {submitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {t('common.loading')}
              </>
            ) : (
              <>
                <i className="ri-send-plane-line" />
                {t('report.submit')}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
