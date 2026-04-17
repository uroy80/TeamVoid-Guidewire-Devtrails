import { useEffect, useState, useCallback } from 'react';
import { GoogleMap, Marker, Circle, Polyline, InfoWindow } from '@react-google-maps/api';
import { geo, worker, triggers } from '../api/client';
import { useGoogleMaps } from '../hooks/useGoogleMaps';
import React from 'react';

const PLATFORM_ICONS: Record<string, { ico: string; png: string; marker: string; color: string }> = {
  blinkit: { ico: '/logos/blinkit.ico', png: '/logos/blinkit.png', marker: '/logos/blinkit-marker.png', color: '#eab308' },
  zepto: { ico: '/logos/zepto.ico', png: '/logos/zepto.png', marker: '/logos/zepto-marker.png', color: '#a855f7' },
  instamart: { ico: '/logos/instamart.ico', png: '/logos/instamart.png', marker: '/logos/instamart-marker.png', color: '#f97316' },
};

const mapContainerStyle = { width: '100%', height: '100%' };

interface Props {
  me: any;
  mapTile: string;
}

interface NearbyStore {
  id: string;
  name: string;
  platform: string;
  latitude: number;
  longitude: number;
  city: string;
  locality: string;
  distance_km: number;
}

interface TrailPoint {
  latitude: number;
  longitude: number;
  recorded_at: string;
  accuracy_meters?: number;
}

interface DisruptionEvent {
  id: string;
  event_type: string;
  severity: string;
  latitude?: number;
  longitude?: number;
  zone_name?: string;
}

// Detect whether a Google Maps API key was baked in at build time. When the
// bundle ships without one (misconfigured Dockerfile build-arg, expired key,
// restricted referrer), the Maps SDK will emit "This page can't load Google
// Maps correctly" and we want to surface a cleaner fallback instead.
const HAS_MAPS_KEY = !!((import.meta as { env?: Record<string, string> }).env?.VITE_GOOGLE_MAPS_KEY);

export default function CoverageMap({ me, mapTile: _mapTile }: Props) {
  const { isLoaded, loadError } = useGoogleMaps();
  const [stores, setStores] = useState<NearbyStore[]>([]);
  const [loading, setLoading] = useState(true);
  const [trail, setTrail] = useState<TrailPoint[]>([]);
  const [disruptions, setDisruptions] = useState<DisruptionEvent[]>([]);
  // Single InfoWindow state — avoids flash from mounting multiple InfoWindows
  const [infoWindow, setInfoWindow] = useState<{
    position: { lat: number; lng: number };
    content: React.ReactNode;
  } | null>(null);

  const lat = me?.latitude || me?.lat || 19.076;
  const lng = me?.longitude || me?.lng || 72.877;

  useEffect(() => {
    (async () => {
      try {
        const storeRes = await geo.nearbyStores(lat, lng, 50);
        setStores(storeRes.data?.stores || []);
      } catch { /* silent */ }
      finally { setLoading(false); }
    })();
  }, [lat, lng]);

  // Try to get lat/lng from worker's dark store
  useEffect(() => {
    if (stores.length > 0) return;
    if (!me?.dark_store_id) return;
    (async () => {
      try {
        const res = await geo.nearbyStores(lat, lng, 50, me.platform);
        setStores(res.data?.stores || []);
      } catch { /* silent */ }
    })();
  }, [me, lat, lng, stores.length]);

  // Fetch location trail
  useEffect(() => {
    (async () => {
      try {
        const res = await worker.getLocationTrail();
        const points = res.data?.trail || res.data || [];
        setTrail(Array.isArray(points) ? points : []);
      } catch { /* silent */ }
    })();
  }, []);

  // Fetch disruption events
  useEffect(() => {
    (async () => {
      try {
        const res = await triggers.getStatus();
        const zones = res.data?.zones || [];
        const events: DisruptionEvent[] = [];
        for (const zone of zones) {
          if (zone.active_events && Array.isArray(zone.active_events)) {
            for (const ev of zone.active_events) {
              events.push({
                id: ev.id || zone.zone_id,
                event_type: ev.event_type || ev.type,
                severity: ev.severity || 'MODERATE',
                latitude: Number(zone.latitude) || Number(zone.lat),
                longitude: Number(zone.longitude) || Number(zone.lng),
                zone_name: zone.name,
              });
            }
          }
          if (zone.disruption_active || zone.has_disruption) {
            events.push({
              id: zone.zone_id,
              event_type: zone.disruption_type || 'UNKNOWN',
              severity: zone.severity || 'MODERATE',
              latitude: Number(zone.latitude) || Number(zone.lat),
              longitude: Number(zone.longitude) || Number(zone.lng),
              zone_name: zone.name,
            });
          }
        }
        setDisruptions(events);
      } catch { /* silent */ }
    })();
  }, []);

  const onMapLoad = useCallback((_map: google.maps.Map) => {
    // Map loaded - no additional setup needed
  }, []);

  // Graceful fallback when Google Maps can't initialise — either the build
  // shipped without a key, or Google rejected it (referrer, billing, quota).
  // Rather than showing Google's generic red banner we render a stat card so
  // the rest of the Dashboard remains usable during the demo.
  if (!HAS_MAPS_KEY || loadError) {
    return (
      <div className="px-6 py-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
              <i className="ri-map-pin-line mr-1.5" style={{ color: 'var(--accent)' }} />
              Coverage Zone
            </h3>
            <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {stores.length} dark stores nearby
            </p>
          </div>
        </div>
        <div
          className="rounded-2xl border border-white/10 p-6 flex flex-col items-center justify-center text-center"
          style={{ height: 240, background: 'var(--bg-secondary)' }}
        >
          <i className="ri-map-2-line text-3xl mb-2" style={{ color: 'var(--text-muted)' }} />
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Map view temporarily unavailable
          </p>
          <p className="text-xs mt-1 max-w-xs" style={{ color: 'var(--text-muted)' }}>
            {loadError
              ? 'Google Maps failed to load. Your coverage and stores list below are still live.'
              : 'Map credentials are being configured. Your coverage data is unaffected.'}
          </p>
        </div>
        {/* Store count by platform still works without the map */}
        <div className="flex gap-2 mt-3">
          {['blinkit', 'zepto', 'instamart'].map((p) => {
            const count = stores.filter((s) => s.platform === p).length;
            if (!count) return null;
            return (
              <div key={p} className="glass flex items-center gap-2 px-3 py-2 flex-1">
                <img src={PLATFORM_ICONS[p]?.ico} className="w-5 h-5 rounded-full" alt="" />
                <div>
                  <p className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>{count}</p>
                  <p className="text-[9px] capitalize" style={{ color: 'var(--text-muted)' }}>{p}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (!isLoaded || loading) {
    return (
      <div className="px-6 py-6 flex justify-center">
        <div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  // Get center from worker's store or first nearby store
  const workerStore = stores.find((s) => s.id === me?.dark_store_id);
  const centerLat = workerStore ? Number(workerStore.latitude) : (stores[0] ? Number(stores[0].latitude) : lat);
  const centerLng = workerStore ? Number(workerStore.longitude) : (stores[0] ? Number(stores[0].longitude) : lng);

  // Location trail polyline path for Google Maps
  const trailPath = trail.map((p) => ({ lat: Number(p.latitude), lng: Number(p.longitude) }));

  // Live worker position from me prop
  const hasLivePos = me?.lastLat != null && me?.lastLng != null;
  const liveLat = Number(me?.lastLat);
  const liveLng = Number(me?.lastLng);

  // Disruption radius based on severity
  const severityRadius: Record<string, number> = {
    MINOR: 1000,
    MODERATE: 2000,
    SEVERE: 3500,
    EXTREME: 5000,
  };

  return (
    <div className="px-6 py-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
            <i className="ri-map-pin-line mr-1.5" style={{ color: 'var(--accent)' }} />
            Coverage Zone
          </h3>
          <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {stores.length} dark stores nearby
          </p>
        </div>
        {/* Legend */}
        <div className="flex items-center gap-2">
          {Object.entries(PLATFORM_ICONS).map(([platform, { ico }]) => (
            <div key={platform} className="flex items-center gap-1">
              <img src={ico} className="w-3.5 h-3.5 rounded-full" alt="" />
              <span className="text-[9px] capitalize" style={{ color: 'var(--text-muted)' }}>{platform}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Map */}
      <div className="rounded-2xl overflow-hidden border border-white/10" style={{ height: 400 }}>
        <GoogleMap
            mapContainerStyle={mapContainerStyle}
            center={{ lat: centerLat, lng: centerLng }}
            zoom={14}
            onLoad={onMapLoad}
            options={{
              disableDefaultUI: true,
              zoomControl: true,
              gestureHandling: 'greedy',
              styles: [
                { featureType: 'poi', stylers: [{ visibility: 'off' }] },
                { featureType: 'transit', stylers: [{ visibility: 'off' }] },
              ],
            }}
          >
            {/* Coverage radius */}
            <Circle
              center={{ lat: centerLat, lng: centerLng }}
              radius={5000}
              options={{ strokeColor: '#3b82f6', strokeWeight: 1, strokeOpacity: 0.6, fillColor: '#3b82f6', fillOpacity: 0.05 }}
            />

            {/* User location marker */}
            <Marker
              position={{ lat: centerLat, lng: centerLng }}
              icon={{ path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: '#3b82f6', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 }}
              onClick={() => setInfoWindow({
                position: { lat: centerLat, lng: centerLng },
                content: <div><strong>Your Store</strong><br /><span style={{ fontSize: 11, color: '#64748b' }}>{workerStore?.name || 'Your location'}</span></div>
              })}
            />

            {/* Trail */}
            {trailPath.length > 1 && (
              <Polyline path={trailPath} options={{ strokeColor: '#3b82f6', strokeWeight: 3, strokeOpacity: 0.7 }} />
            )}
            {trail.map((point, idx) => (
              <Marker
                key={`trail-${idx}`}
                position={{ lat: Number(point.latitude), lng: Number(point.longitude) }}
                icon={{ path: google.maps.SymbolPath.CIRCLE, scale: 4, fillColor: '#60a5fa', fillOpacity: 0.8, strokeColor: '#3b82f6', strokeWeight: 1 }}
                onClick={() => setInfoWindow({
                  position: { lat: Number(point.latitude), lng: Number(point.longitude) },
                  content: <div><strong>Location #{idx + 1}</strong><br /><span style={{ color: '#64748b', fontSize: 11 }}>{point.recorded_at ? new Date(point.recorded_at).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }) : '--'}</span></div>
                })}
              />
            ))}

            {/* Disruptions */}
            {disruptions.map((ev, idx) => {
              if (!ev.latitude || !ev.longitude) return null;
              return (
                <Circle
                  key={`disruption-${idx}`}
                  center={{ lat: ev.latitude, lng: ev.longitude }}
                  radius={severityRadius[ev.severity] || 2000}
                  options={{ strokeColor: '#ef4444', strokeWeight: 2, fillColor: '#ef4444', fillOpacity: 0.15 }}
                  onClick={() => setInfoWindow({
                    position: { lat: ev.latitude!, lng: ev.longitude! },
                    content: <div><strong style={{ color: '#ef4444' }}>{ev.event_type?.replace(/_/g, ' ')}</strong><br /><span style={{ color: '#64748b' }}>Severity: {ev.severity}</span>{ev.zone_name && <><br />{ev.zone_name}</>}</div>
                  })}
                />
              );
            })}

            {/* Live position */}
            {hasLivePos && (
              <Marker
                position={{ lat: liveLat, lng: liveLng }}
                icon={{ path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: '#22c55e', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 }}
                onClick={() => setInfoWindow({
                  position: { lat: liveLat, lng: liveLng },
                  content: <div><strong style={{ color: '#22c55e' }}>Live Location</strong><br /><span style={{ fontSize: 10, color: '#64748b' }}>{liveLat.toFixed(4)}, {liveLng.toFixed(4)}</span></div>
                })}
              />
            )}

            {/* Dark stores */}
            {stores.map((store) => (
              <Marker
                key={store.id}
                position={{ lat: Number(store.latitude), lng: Number(store.longitude) }}
                icon={{
                  url: PLATFORM_ICONS[store.platform]?.marker || PLATFORM_ICONS.blinkit.marker,
                  scaledSize: new google.maps.Size(24, 24),
                  anchor: new google.maps.Point(12, 12),
                }}
                onClick={() => setInfoWindow({
                  position: { lat: Number(store.latitude), lng: Number(store.longitude) },
                  content: (
                    <div style={{ minWidth: 140 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <img src={PLATFORM_ICONS[store.platform]?.marker} alt="" style={{ width: 18, height: 18, borderRadius: 4 }} />
                        <strong style={{ fontSize: 13 }}>{store.name}</strong>
                      </div>
                      {store.locality && <div style={{ fontSize: 11, color: '#64748b' }}>{store.locality}{store.city ? `, ${store.city}` : ''}</div>}
                      <div style={{ fontSize: 12, color: PLATFORM_ICONS[store.platform]?.color, fontWeight: 700, marginTop: 2 }}>{store.distance_km} km away</div>
                    </div>
                  ),
                })}
              />
            ))}

            {/* Single shared InfoWindow */}
            {infoWindow && (
              <InfoWindow
                position={infoWindow.position}
                onCloseClick={() => setInfoWindow(null)}
              >
                <div style={{ fontFamily: 'system-ui, sans-serif', padding: 2 }}>
                  {infoWindow.content}
                </div>
              </InfoWindow>
            )}
        </GoogleMap>
      </div>

      {/* Store count by platform */}
      <div className="flex gap-2 mt-3">
        {['blinkit', 'zepto', 'instamart'].map((p) => {
          const count = stores.filter((s) => s.platform === p).length;
          if (!count) return null;
          return (
            <div key={p} className="glass flex items-center gap-2 px-3 py-2 flex-1">
              <img src={PLATFORM_ICONS[p]?.ico} className="w-5 h-5 rounded-full" alt="" />
              <div>
                <p className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>{count}</p>
                <p className="text-[9px] capitalize" style={{ color: 'var(--text-muted)' }}>{p}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
