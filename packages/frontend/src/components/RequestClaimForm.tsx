import { useState, useEffect } from 'react';
import { claims } from '../api/client';

const DISRUPTION_TYPES = [
  { value: 'EXTREME_HEAT', label: 'Extreme Heat', icon: 'ri-fire-line' },
  { value: 'HEAVY_RAINFALL', label: 'Heavy Rainfall', icon: 'ri-rainy-line' },
  { value: 'FLOODING', label: 'Flooding', icon: 'ri-flood-line' },
  { value: 'SEVERE_POLLUTION', label: 'Severe Pollution', icon: 'ri-haze-line' },
  { value: 'SOCIAL_DISRUPTION', label: 'Social Disruption', icon: 'ri-alarm-warning-line' },
];

const TIER_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  GREEN: { bg: 'rgba(16,185,129,0.15)', text: '#10b981', label: 'Trusted' },
  YELLOW: { bg: 'rgba(234,179,8,0.15)', text: '#eab308', label: 'Caution' },
  ORANGE: { bg: 'rgba(249,115,22,0.15)', text: '#f97316', label: 'Suspicious' },
  RED: { bg: 'rgba(239,68,68,0.15)', text: '#ef4444', label: 'Flagged' },
};

function generateFingerprint(): string {
  const raw = [
    navigator.userAgent,
    screen.width,
    screen.height,
    new Date().getTimezoneOffset(),
    navigator.language,
    (navigator as any).platform || '',
  ].join('|');
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const chr = raw.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return `fp-${Math.abs(hash).toString(36)}`;
}

interface Props {
  onClose: () => void;
  onSuccess?: () => void;
}

export default function RequestClaimForm({ onClose, onSuccess }: Props) {
  const [disruptionType, setDisruptionType] = useState('');
  const [description, setDescription] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [gpsLoading, setGpsLoading] = useState(true);
  const [gpsError, setGpsError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  // Auto-detect GPS on mount
  useEffect(() => {
    if (!navigator.geolocation) {
      setGpsError('Geolocation not supported');
      setGpsLoading(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude);
        setLongitude(pos.coords.longitude);
        setGpsLoading(false);
      },
      (err) => {
        setGpsError(err.message);
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }, []);

  const handleSubmit = async () => {
    if (!disruptionType) { setError('Please select a disruption type'); return; }
    if (description.trim().length < 10) { setError('Description must be at least 10 characters'); return; }
    if (latitude == null || longitude == null) { setError('GPS location is required'); return; }

    setError('');
    setSubmitting(true);

    try {
      const res = await claims.requestClaim({
        disruption_type: disruptionType,
        description: description.trim(),
        latitude,
        longitude,
        device_fingerprint: generateFingerprint(),
      });
      setResult(res.data);
      onSuccess?.();
    } catch (err: any) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Failed to submit claim');
    } finally {
      setSubmitting(false);
    }
  };

  const tierInfo = result?.fraud_check?.tier
    ? TIER_COLORS[result.fraud_check.tier]
    : result?.tier
      ? TIER_COLORS[result.tier]
      : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div
        className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-6"
        style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--accent-light)' }}>
              <i className="ri-add-circle-line text-xl" style={{ color: 'var(--accent)' }} />
            </div>
            <div>
              <h2 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>Request a Claim</h2>
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Report a disruption affecting your work</p>
            </div>
          </div>
          <button onClick={onClose} className="glass w-8 h-8 rounded-full flex items-center justify-center">
            <i className="ri-close-line" style={{ color: 'var(--text-secondary)' }} />
          </button>
        </div>

        {result ? (
          /* Result display */
          <div className="space-y-4 fade-in">
            <div className="glass p-5 text-center">
              <div className="w-16 h-16 mx-auto rounded-full flex items-center justify-center mb-3"
                style={{ background: 'rgba(234,179,8,0.15)' }}>
                <i className="ri-time-line text-3xl" style={{ color: '#eab308' }} />
              </div>
              <h3 className="font-bold text-sm mb-1" style={{ color: 'var(--text-primary)' }}>
                Claim Submitted for Admin Review
              </h3>
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                Your claim has been submitted for admin review
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="glass p-3">
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Claim Number</p>
                <p className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
                  {result.claim_number || result.claim?.claim_number || '--'}
                </p>
              </div>
              <div className="glass p-3">
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Status</p>
                <span
                  className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase mt-0.5"
                  style={{ background: 'rgba(234,179,8,0.15)', color: '#eab308' }}
                >
                  UNDER_REVIEW
                </span>
              </div>
              <div className="glass p-3">
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>BAS Score</p>
                <p className="text-xs font-bold" style={{ color: tierInfo?.text || 'var(--text-primary)' }}>
                  {result.fraud_check?.bas_score ?? result.bas_score ?? '--'}
                </p>
              </div>
              <div className="glass p-3">
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Tier</p>
                {tierInfo ? (
                  <span
                    className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase mt-0.5"
                    style={{ background: tierInfo.bg, color: tierInfo.text }}
                  >
                    {result.fraud_check?.tier || result.tier} - {tierInfo.label}
                  </span>
                ) : (
                  <p className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>--</p>
                )}
              </div>
            </div>

            <button onClick={onClose} className="btn-primary w-full flex items-center justify-center gap-2">
              <i className="ri-check-line" /> Done
            </button>
          </div>
        ) : (
          /* Form */
          <div className="space-y-4">
            {/* Disruption Type */}
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider mb-2 block" style={{ color: 'var(--text-muted)' }}>
                Disruption Type
              </label>
              <div className="grid grid-cols-2 gap-2">
                {DISRUPTION_TYPES.map((dt) => (
                  <button
                    key={dt.value}
                    onClick={() => setDisruptionType(dt.value)}
                    className="glass p-3 flex items-center gap-2 transition-all"
                    style={{
                      borderColor: disruptionType === dt.value ? 'var(--accent)' : 'transparent',
                      borderWidth: 2,
                      background: disruptionType === dt.value ? 'var(--accent-light)' : undefined,
                    }}
                  >
                    <i className={`${dt.icon} text-lg`} style={{ color: disruptionType === dt.value ? 'var(--accent)' : 'var(--text-muted)' }} />
                    <span className="text-[11px] font-medium" style={{ color: 'var(--text-primary)' }}>{dt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider mb-2 block" style={{ color: 'var(--text-muted)' }}>
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the disruption affecting your deliveries..."
                rows={3}
                className="w-full glass px-4 py-3 text-xs rounded-xl resize-none focus:outline-none"
                style={{ color: 'var(--text-primary)', background: 'var(--bg-card)' }}
              />
              <p className="text-[9px] mt-1" style={{ color: description.length < 10 ? 'var(--text-muted)' : 'var(--success)' }}>
                {description.length}/10 min characters
              </p>
            </div>

            {/* GPS Location */}
            <div className="glass p-3">
              <div className="flex items-center gap-2">
                <i className={`ri-map-pin-line text-lg ${gpsLoading ? 'animate-pulse' : ''}`}
                  style={{ color: gpsError ? '#ef4444' : '#22c55e' }} />
                <div className="flex-1">
                  <p className="text-[10px] font-semibold" style={{ color: 'var(--text-muted)' }}>GPS Location</p>
                  {gpsLoading ? (
                    <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Detecting location...</p>
                  ) : gpsError ? (
                    <p className="text-[11px] text-red-400">{gpsError}</p>
                  ) : (
                    <p className="text-[11px] font-mono" style={{ color: 'var(--text-primary)' }}>
                      {latitude?.toFixed(5)}, {longitude?.toFixed(5)}
                    </p>
                  )}
                </div>
                {!gpsLoading && !gpsError && (
                  <i className="ri-checkbox-circle-fill text-green-400" />
                )}
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="glass p-3 flex items-center gap-2">
                <i className="ri-error-warning-line text-red-400" />
                <p className="text-red-400 text-xs">{error}</p>
              </div>
            )}

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={submitting || !disruptionType || description.trim().length < 10 || latitude == null}
              className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <i className="ri-shield-check-line" /> Submit Claim
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
