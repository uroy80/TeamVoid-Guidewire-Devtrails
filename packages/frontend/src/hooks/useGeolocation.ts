import { useEffect, useRef, useState, useCallback } from 'react';
import { worker } from '../api/client';

function generateFingerprint(): string {
  const raw = [
    navigator.userAgent,
    screen.width,
    screen.height,
    new Date().getTimezoneOffset(),
    navigator.language,
    navigator.platform || '',
  ].join('|');
  // Simple hash (not crypto, but consistent)
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const chr = raw.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return `fp-${Math.abs(hash).toString(36)}`;
}

interface GeoState {
  isTracking: boolean;
  lastPing: Date | null;
  lastLat: number | null;
  lastLng: number | null;
  inZone: boolean | null;
  distanceKm: number | null;
  error: string | null;
  fingerprint: string;
}

export function useGeolocation(enabled: boolean) {
  const [state, setState] = useState<GeoState>({
    isTracking: false,
    lastPing: null,
    lastLat: null,
    lastLng: null,
    inZone: null,
    distanceKm: null,
    error: null,
    fingerprint: generateFingerprint(),
  });

  const watchIdRef = useRef<number | null>(null);
  const lastSentRef = useRef<number>(0);
  const PING_INTERVAL = 5 * 60 * 1000; // 5 minutes

  const sendPing = useCallback(async (lat: number, lng: number, accuracy: number) => {
    const now = Date.now();
    if (now - lastSentRef.current < PING_INTERVAL) return; // throttle
    lastSentRef.current = now;

    try {
      const res = await worker.submitLocation({
        latitude: lat,
        longitude: lng,
        accuracy,
        source: 'GPS',
        device_fingerprint: state.fingerprint,
      });
      setState(prev => ({
        ...prev,
        isTracking: true,
        lastPing: new Date(),
        lastLat: lat,
        lastLng: lng,
        inZone: res.data?.in_zone ?? null,
        distanceKm: res.data?.distance_km ?? null,
        error: null,
      }));
    } catch (err) {
      setState(prev => ({ ...prev, error: 'Failed to send location' }));
    }
  }, [state.fingerprint]);

  useEffect(() => {
    if (!enabled || !('geolocation' in navigator)) {
      setState(prev => ({ ...prev, isTracking: false }));
      return;
    }

    // Send initial ping immediately
    navigator.geolocation.getCurrentPosition(
      (pos) => sendPing(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy),
      () => setState(prev => ({ ...prev, error: 'Location permission denied' })),
      { enableHighAccuracy: true, timeout: 10000 }
    );

    // Watch for changes
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => sendPing(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy),
      () => {},
      { enableHighAccuracy: true, maximumAge: PING_INTERVAL }
    );

    // Also send periodic pings even if position hasn't changed
    const interval = setInterval(() => {
      navigator.geolocation.getCurrentPosition(
        (pos) => sendPing(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy),
        () => {},
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }, PING_INTERVAL);

    setState(prev => ({ ...prev, isTracking: true }));

    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      clearInterval(interval);
      setState(prev => ({ ...prev, isTracking: false }));
    };
  }, [enabled, sendPing]);

  return state;
}

export { generateFingerprint };
