export interface LocationLog {
  id: string;
  worker_id: string;
  latitude: number;
  longitude: number;
  accuracy_meters: number;
  source: 'GPS' | 'NETWORK' | 'IP';
  device_fingerprint: string | null;
  recorded_at: Date;
}

export interface DeviceFingerprint {
  id: string;
  worker_id: string;
  fingerprint_hash: string;
  user_agent: string;
  screen_resolution: string;
  timezone_offset: number;
  language: string;
  first_seen_at: Date;
  last_seen_at: Date;
}

export interface BASBreakdown {
  gps_authenticity: number;
  movement_entropy: number;
  device_consistency: number;
  historical_behavior: number;
  ring_fraud_absence: number;
  weather_correlation: number;
  total: number;
  tier: 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED';
  flags: string[];
}

export interface AntispoofingResult {
  impossible_travel_detected: boolean;
  location_continuity_cv: number;
  movement_entropy_score: number;
  device_is_known: boolean;
  multiple_workers_on_device: boolean;
  ring_fraud_signals: string[];
}
