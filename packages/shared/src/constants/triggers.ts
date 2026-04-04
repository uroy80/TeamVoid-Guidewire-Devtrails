import { DisruptionType, Severity } from '../types/claim.js';

export const TRIGGER_THRESHOLDS: Record<DisruptionType, { value: number; unit: string }> = {
  EXTREME_HEAT: { value: 45, unit: '°C' },
  HEAVY_RAINFALL: { value: 65, unit: 'mm/hr' },
  FLOODING: { value: 1, unit: 'alert_level' },
  SEVERE_POLLUTION: { value: 400, unit: 'AQI' },
  SOCIAL_DISRUPTION: { value: 1, unit: 'manual_alert' },
};

export const SEVERITY_DURATION_HOURS: Record<Severity, number> = {
  MODERATE: 4,
  SEVERE: 8,
  EXTREME: 12,
};

export const TRIGGER_POLL_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
export const TRIGGER_DEDUP_WINDOW_HOURS = 4;
export const WEATHER_CACHE_TTL_SECONDS = 1800; // 30 minutes
