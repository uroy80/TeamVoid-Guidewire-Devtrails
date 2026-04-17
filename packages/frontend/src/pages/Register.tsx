import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { GoogleMap, Marker, Circle, InfoWindow } from '@react-google-maps/api';
import { worker, geo, stores } from '../api/client';
import { useStore } from '../store/store';
import { useGoogleMaps } from '../hooks/useGoogleMaps';
import ThemeToggle from '../components/ThemeToggle';
import LocationSearch from '../components/LocationSearch';
import React from 'react';


const PLATFORMS = [
  { id: 'blinkit', name: 'Blinkit', logo: '/logos/blinkit.png', marker: '/logos/blinkit-marker.png', color: '#eab308', bg: 'rgba(234,179,8,0.1)' },
  { id: 'zepto', name: 'Zepto', logo: '/logos/zepto.png', marker: '/logos/zepto-marker.png', color: '#a855f7', bg: 'rgba(168,85,247,0.1)' },
  { id: 'instamart', name: 'Instamart', logo: '/logos/instamart.png', marker: '/logos/instamart-marker.png', color: '#f97316', bg: 'rgba(249,115,22,0.1)' },
];

const TOTAL_STEPS = 5;

interface NearbyStore {
  id: string;
  name: string;
  store_code: string;
  platform: string;
  latitude: number;
  longitude: number;
  city: string;
  locality: string;
  delivery_zone_id: string;
  zone_name: string;
  zone_state: string;
  base_risk: number;
  distance_km: number;
}

const mapContainerStyle = { width: '100%', height: '100%' };

// Reverse geocode to get locality
async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=16&addressdetails=1`);
    const data = await res.json();
    const addr = data.address || {};
    return addr.suburb || addr.neighbourhood || addr.village || addr.town || addr.city_district || addr.city || '';
  } catch {
    return '';
  }
}

export default function Register() {
  const { isLoaded } = useGoogleMaps();
  const navigate = useNavigate();
  const setWorkerStore = useStore((s) => s.setWorker);

  // Safety net: if a returning user somehow lands here (stale bookmark,
  // deep link, Login flow edge case where the mobile lookup missed), skip
  // the registration UI entirely and take them to the dashboard.
  const [checkingExisting, setCheckingExisting] = useState(true);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = localStorage.getItem('gs_token');
      if (!token) {
        if (!cancelled) setCheckingExisting(false);
        return;
      }
      try {
        const { data } = await worker.getMe();
        if (cancelled) return;
        if (data?.id) {
          // Already registered — hydrate the store and bounce to dashboard.
          setWorkerStore(data);
          navigate('/dashboard', { replace: true });
          return;
        }
      } catch {
        // Not registered yet (or token invalid) — fall through to the form.
      }
      if (!cancelled) setCheckingExisting(false);
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Step 1: Location
  const [detecting, setDetecting] = useState(true);
  const [detectedCity, setDetectedCity] = useState('');
  const [locality, setLocality] = useState('');
  const [latitude, setLatitude] = useState(19.076);
  const [longitude, setLongitude] = useState(72.877);
  const [locationSource, setLocationSource] = useState<'gps' | 'ip' | 'manual'>('ip');
  const [showCityPicker, setShowCityPicker] = useState(false);
  const [availableCities, setAvailableCities] = useState<{ city: string; store_count: number }[]>([]);

  // Step 2: Platform
  const [platform, setPlatform] = useState('');

  // Step 3: Store (map)
  const [nearbyStores, setNearbyStores] = useState<NearbyStore[]>([]);
  const [selectedStore, setSelectedStore] = useState<NearbyStore | null>(null);
  const [storesLoading, setStoresLoading] = useState(false);
  const [noStoresFound, setNoStoresFound] = useState(false);
  const [activeStoreInfo, setActiveStoreInfo] = useState<NearbyStore | null>(null);

  // Step 4: Name
  const [name, setName] = useState('');

  // Step 1: Detect location -- try browser GPS first, fallback to IP
  useEffect(() => {
    let cancelled = false;

    async function detect() {
      // Try browser Geolocation API first (exact GPS)
      if ('geolocation' in navigator) {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 8000,
              maximumAge: 0,
            });
          });
          if (cancelled) return;
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          setLatitude(lat);
          setLongitude(lng);
          setLocationSource('gps');

          // Reverse geocode for city + locality
          const localityName = await reverseGeocode(lat, lng);
          if (!cancelled) {
            setLocality(localityName);
            try {
              const { data } = await geo.detect();
              if (!cancelled && data.city) setDetectedCity(data.city);
            } catch { /* use locality as city */ }
            if (!detectedCity && localityName) setDetectedCity(localityName);
          }
          setDetecting(false);
          return;
        } catch {
          // GPS denied or failed -- fall through to IP
        }
      }

      // Fallback: IP-based detection
      try {
        const { data } = await geo.detect();
        if (cancelled) return;
        if (data.detected && data.latitude && data.longitude) {
          setDetectedCity(data.city || '');
          setLatitude(data.latitude);
          setLongitude(data.longitude);
          setLocationSource('ip');
          const loc = await reverseGeocode(data.latitude, data.longitude);
          if (!cancelled) setLocality(loc);
        } else if (data.fallback) {
          setDetectedCity(data.fallback.city);
          setLatitude(data.fallback.latitude);
          setLongitude(data.fallback.longitude);
          setLocationSource('ip');
        }
      } catch {
        if (!cancelled) {
          setDetectedCity('Mumbai');
          setLatitude(19.076);
          setLongitude(72.877);
        }
      } finally {
        if (!cancelled) setDetecting(false);
      }
    }

    detect();
    return () => { cancelled = true; };
  }, []);

  const loadCities = useCallback(async () => {
    try {
      const { data } = await stores.cities();
      setAvailableCities((data.cities || []).filter((c: any) => c.city !== 'Unknown'));
    } catch { /* silent */ }
  }, []);

  const loadNearbyStores = useCallback(async () => {
    if (!platform || !latitude || !longitude) return;
    setStoresLoading(true);
    setNoStoresFound(false);
    setSelectedStore(null);
    try {
      const { data } = await geo.nearbyStores(latitude, longitude, 50, platform);
      const storeList = data.stores || [];
      setNearbyStores(storeList);
      setNoStoresFound(storeList.length === 0);
    } catch {
      setNearbyStores([]);
      setNoStoresFound(true);
    } finally {
      setStoresLoading(false);
    }
  }, [platform, latitude, longitude]);

  useEffect(() => {
    if (step === 3) loadNearbyStores();
  }, [step, loadNearbyStores]);

  const handleCitySelect = async (city: string) => {
    try {
      const { data } = await stores.byCity(city);
      const storeList = Object.values(data.by_platform || {}).flat() as any[];
      if (storeList.length > 0) {
        setLatitude(Number(storeList[0].latitude));
        setLongitude(Number(storeList[0].longitude));
      }
    } catch { /* keep existing */ }
    setDetectedCity(city);
    setLocationSource('manual');
    setShowCityPicker(false);
  };

  const canProceed = () => {
    switch (step) {
      case 1: return !!detectedCity && latitude !== 0;
      case 2: return !!platform;
      case 3: return !!selectedStore;
      case 4: return name.trim().length > 0;
      case 5: return true;
      default: return false;
    }
  };

  const handleNext = () => { if (step < 5) setStep(step + 1); };
  const handleBack = () => { if (step > 1) setStep(step - 1); };

  const handleSubmit = async () => {
    setError('');
    setLoading(true);
    try {
      const token = localStorage.getItem('gs_token');
      let mobile = '';
      if (token) {
        try {
          const payload = JSON.parse(atob(token.split('.')[1]));
          mobile = payload.mobile || '';
        } catch { /* */ }
      }
      if (!mobile) mobile = localStorage.getItem('gs_mobile') || '';

      const { data } = await worker.register({
        name: name.trim(),
        mobile: mobile.startsWith('+') ? mobile : `+91${mobile}`,
        platform,
        latitude,
        longitude,
        dark_store_id: selectedStore?.id,
      });

      // Backend returns { worker, token } -- store the new proper JWT
      const newWorker = data.worker || data;
      const newToken = data.token;
      if (newToken) {
        localStorage.setItem('gs_token', newToken);
        const login = useStore.getState().login;
        login(newToken, newWorker);
      }
      setWorkerStore(newWorker);
      navigate('/coverage', { replace: true });
    } catch (err: any) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const currentPlatform = PLATFORMS.find((p) => p.id === platform);

  // While we're checking whether this is a returning user, show a
  // neutral spinner — prevents the platform picker from flashing before
  // we redirect an already-registered worker to the dashboard.
  if (checkingExisting) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: 'var(--bg-primary)' }}
      >
        <div className="w-10 h-10 border-4 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col px-6 py-8" style={{ background: 'var(--bg-primary)' }}>
      {/* Theme Toggle */}
      <div className="flex justify-end mb-2"><ThemeToggle /></div>

      {/* Header */}
      <div className="mb-4 slide-up">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          {step === 1 && 'Your Location'}
          {step === 2 && 'Select Platform'}
          {step === 3 && 'Select Your Store'}
          {step === 4 && 'Your Name'}
          {step === 5 && 'Confirm & Start'}
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Step {step} of {TOTAL_STEPS}</p>
      </div>

      {/* Progress bar */}
      <div className="flex gap-1.5 mb-6 slide-up" style={{ animationDelay: '0.05s' }}>
        {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
          <div key={i} className="h-1.5 flex-1 rounded-full transition-all duration-500"
            style={{ background: i < step ? 'linear-gradient(135deg, #3b82f6 0%, #6366f1 50%, #8b5cf6 100%)' : 'var(--bg-secondary)' }}
          />
        ))}
      </div>

      {/* Content */}
      <div className="flex-1">

        {/* -- Step 1: Location -- */}
        {step === 1 && (
          <div className="fade-in space-y-4">
            {detecting ? (
              <div className="glass p-8 flex flex-col items-center gap-4">
                <div className="w-14 h-14 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Detecting your exact location...</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Please allow location access for accuracy</p>
              </div>
            ) : (
              <>
                {/* Address search (Google-Places-style, via Nominatim) */}
                <LocationSearch
                  placeholder="Search your address, area, or landmark"
                  onSelect={async (lat, lng, label) => {
                    setLatitude(lat);
                    setLongitude(lng);
                    setLocationSource('manual');
                    // Split the first segment as locality hint; keep city from reverse geocode
                    const firstSegment = label.split(',')[0]?.trim();
                    if (firstSegment) setLocality(firstSegment);
                    try {
                      const city = await reverseGeocode(lat, lng);
                      if (city) setDetectedCity(city);
                    } catch { /* silent */ }
                  }}
                />

                {/* Location card */}
                <div className="glass p-4 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center shrink-0">
                    <i className={`ri-${locationSource === 'gps' ? 'gps' : 'map-pin'}-line text-2xl text-green-400`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                      {locality ? `${locality}, ${detectedCity}` : detectedCity}
                    </p>
                    <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {locationSource === 'gps' ? 'GPS — Exact location' : 'IP-based — Approximate'} • {latitude.toFixed(4)}, {longitude.toFixed(4)}
                    </p>
                  </div>
                  <i className="ri-checkbox-circle-fill text-xl text-green-400 shrink-0" />
                </div>

                {/* Map preview */}
                {isLoaded && (
                <div className="rounded-2xl overflow-hidden border border-white/5" style={{ height: 220 }}>
                  <GoogleMap
                      mapContainerStyle={mapContainerStyle}
                      center={{ lat: latitude, lng: longitude }}
                      zoom={14}
                      options={{
                        disableDefaultUI: true,
                        gestureHandling: 'greedy',
                        styles: [
                          { featureType: 'poi', stylers: [{ visibility: 'off' }] },
                          { featureType: 'transit', stylers: [{ visibility: 'off' }] },
                        ],
                      }}
                    >
                      <Marker
                        position={{ lat: latitude, lng: longitude }}
                        icon={{
                          path: google.maps.SymbolPath.CIRCLE,
                          scale: 8,
                          fillColor: '#3b82f6',
                          fillOpacity: 1,
                          strokeColor: '#ffffff',
                          strokeWeight: 3,
                        }}
                      />
                      <Circle
                        center={{ lat: latitude, lng: longitude }}
                        radius={5000}
                        options={{
                          strokeColor: '#3b82f6',
                          strokeWeight: 1,
                          fillColor: '#3b82f6',
                          fillOpacity: 0.06,
                        }}
                      />
                    </GoogleMap>
                </div>
                )}

                {/* Change location */}
                {!showCityPicker ? (
                  <button onClick={() => { setShowCityPicker(true); loadCities(); }} className="text-sm font-medium flex items-center gap-1.5" style={{ color: 'var(--accent)' }}>
                    <i className="ri-edit-line" /> Not your location? Choose manually
                  </button>
                ) : (
                  <div className="fade-in space-y-3">
                    <label className="text-xs font-medium block" style={{ color: 'var(--text-secondary)' }}>Select Your City</label>
                    {availableCities.length === 0 ? (
                      <div className="flex justify-center py-4">
                        <div className="w-6 h-6 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 gap-2 max-h-[35vh] overflow-y-auto">
                        {availableCities.slice(0, 30).map((c) => {
                          const sel = detectedCity === c.city;
                          return (
                            <button key={c.city} onClick={() => handleCitySelect(c.city)}
                              className="glass py-2.5 px-2 text-center text-xs font-semibold transition-all card-hover"
                              style={{
                                borderColor: sel ? 'var(--accent)' : undefined,
                                borderWidth: sel ? '2px' : undefined,
                                background: sel ? 'var(--accent-light)' : undefined,
                                color: sel ? 'var(--accent)' : 'var(--text-primary)',
                              }}>
                              {c.city}
                              <span className="block text-[10px] font-normal mt-0.5" style={{ color: 'var(--text-muted)' }}>{c.store_count} stores</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* -- Step 2: Platform -- */}
        {step === 2 && (
          <div className="fade-in">
            <label className="text-xs font-medium mb-4 block" style={{ color: 'var(--text-secondary)' }}>
              <i className="ri-riding-line mr-1" /> Which platform do you deliver for?
            </label>
            <div className="grid grid-cols-3 gap-3">
              {PLATFORMS.map((p) => {
                const sel = platform === p.id;
                return (
                  <button key={p.id} onClick={() => setPlatform(p.id)}
                    className="glass flex flex-col items-center gap-3 p-5 transition-all card-hover"
                    style={{
                      borderColor: sel ? p.color : undefined,
                      borderWidth: sel ? '2px' : undefined,
                      background: sel ? p.bg : undefined,
                    }}>
                    <img src={p.logo} alt={p.name} className="w-14 h-14 rounded-xl object-contain" />
                    <span className="text-xs font-bold" style={{ color: sel ? p.color : 'var(--text-primary)' }}>{p.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* -- Step 3: Store Map -- */}
        {step === 3 && (
          <div className="fade-in space-y-3">
            {/* Header bar */}
            <div className="glass p-3 flex items-center gap-3">
              <img src={currentPlatform?.logo} alt="" className="w-6 h-6 rounded-full" />
              <div className="flex-1">
                <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {nearbyStores.length} {currentPlatform?.name} stores near you
                </p>
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  {storesLoading ? 'Searching...' : 'Tap a store on the map to select'}
                </p>
              </div>
              {selectedStore && (
                <span className="px-2 py-1 rounded-full text-[10px] font-bold" style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981' }}>
                  <i className="ri-check-line" /> Selected
                </span>
              )}
            </div>

            {/* Map */}
            {storesLoading ? (
              <div className="flex justify-center py-16">
                <div className="w-10 h-10 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
              </div>
            ) : noStoresFound ? (
              <div className="glass p-8 text-center">
                <i className="ri-store-line text-4xl mb-3" style={{ color: 'var(--text-muted)' }} />
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>No {currentPlatform?.name} stores within 15km</p>
                <button onClick={() => { setStep(1); setShowCityPicker(true); loadCities(); }} className="mt-4 text-sm font-medium" style={{ color: 'var(--accent)' }}>
                  <i className="ri-map-pin-line mr-1" /> Change Location
                </button>
              </div>
            ) : (
              <>
                {isLoaded && (
                <div className="rounded-2xl overflow-hidden border border-white/5" style={{ height: 380 }}>
                  <GoogleMap
                      mapContainerStyle={mapContainerStyle}
                      center={{ lat: latitude, lng: longitude }}
                      zoom={14}
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
                      {/* User location */}
                      <Marker
                        position={{ lat: latitude, lng: longitude }}
                        icon={{
                          path: google.maps.SymbolPath.CIRCLE,
                          scale: 8,
                          fillColor: '#3b82f6',
                          fillOpacity: 1,
                          strokeColor: '#ffffff',
                          strokeWeight: 3,
                        }}
                      />

                      {/* 5km radius */}
                      <Circle
                        center={{ lat: latitude, lng: longitude }}
                        radius={5000}
                        options={{
                          strokeColor: '#3b82f6',
                          strokeWeight: 1,
                          fillColor: '#3b82f6',
                          fillOpacity: 0.04,
                        }}
                      />

                      {/* Store markers with platform logos */}
                      {nearbyStores.map((store) => {
                        const isSelected = selectedStore?.id === store.id;
                        return (
                        <React.Fragment key={store.id}>
                          <Marker
                            position={{ lat: Number(store.latitude), lng: Number(store.longitude) }}
                            icon={{
                              url: currentPlatform?.marker || '',
                              scaledSize: new google.maps.Size(isSelected ? 32 : 22, isSelected ? 32 : 22),
                              anchor: new google.maps.Point(isSelected ? 16 : 11, isSelected ? 16 : 11),
                            }}
                            animation={isSelected ? google.maps.Animation.BOUNCE : undefined}
                            onClick={() => {
                              setSelectedStore(store);
                              setActiveStoreInfo(store);
                            }}
                          />
                          {activeStoreInfo?.id === store.id && (
                            <InfoWindow
                              position={{ lat: Number(store.latitude), lng: Number(store.longitude) }}
                              onCloseClick={() => setActiveStoreInfo(null)}
                            >
                              <div style={{ fontFamily: 'Plus Jakarta Sans', minWidth: 170, padding: '2px 0' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                  <img src={currentPlatform?.logo} alt="" style={{ width: 18, height: 18, borderRadius: '50%' }} />
                                  <strong style={{ fontSize: 13 }}>{store.name}</strong>
                                </div>
                                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 3 }}>
                                  {[store.locality, store.city || detectedCity].filter(Boolean).join(', ') || `Near ${detectedCity}`}
                                </div>
                                <div style={{ fontSize: 12, color: currentPlatform?.color, fontWeight: 700 }}>
                                  {store.distance_km} km away
                                </div>
                                <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                                  Tap to select this store
                                </div>
                              </div>
                            </InfoWindow>
                          )}
                        </React.Fragment>
                        );
                      })}
                    </GoogleMap>
                </div>
                )}

                {/* Selected store card */}
                {selectedStore && (
                  <div className="glass p-4 flex items-center gap-3 slide-up" style={{ borderColor: currentPlatform?.color, borderWidth: 2 }}>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: currentPlatform?.bg }}>
                      <img src={currentPlatform?.logo} alt="" className="w-6 h-6 rounded-full" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>{selectedStore.name}</p>
                      <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                        {[selectedStore.locality, selectedStore.city || detectedCity].filter(Boolean).join(', ')} • {selectedStore.distance_km} km
                      </p>
                    </div>
                    <i className="ri-checkbox-circle-fill text-xl shrink-0" style={{ color: currentPlatform?.color }} />
                  </div>
                )}

                {!selectedStore && (
                  <p className="text-center text-xs py-1" style={{ color: 'var(--text-muted)' }}>
                    <i className="ri-hand-coin-line mr-1" />Tap a <img src={currentPlatform?.logo} alt="" style={{ width: 14, height: 14, display: 'inline', borderRadius: '50%', verticalAlign: 'middle' }} /> marker to select your store
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {/* -- Step 4: Name -- */}
        {step === 4 && (
          <div className="fade-in space-y-6">
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              <i className="ri-user-line mr-1" /> What name should appear on your GigShield policy?
            </p>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Enter your full name"
              className="input-style w-full px-4 py-4 rounded-xl text-lg"
              autoFocus maxLength={100}
            />
          </div>
        )}

        {/* -- Step 5: Confirm -- */}
        {step === 5 && (
          <div className="fade-in space-y-4">
            <div className="glass p-5">
              <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                <i className="ri-shield-check-line mr-2" style={{ color: 'var(--accent)' }} /> Registration Summary
              </h3>
              <div className="space-y-3">
                {[
                  { label: 'Name', value: name, icon: 'ri-user-line' },
                  { label: 'Platform', value: currentPlatform?.name || platform, icon: 'ri-riding-line' },
                  { label: 'Store', value: selectedStore?.name || '-', icon: 'ri-store-2-line' },
                  { label: 'Location', value: `${selectedStore?.locality || locality || ''} ${selectedStore?.city || detectedCity}`.trim(), icon: 'ri-map-pin-line' },
                  { label: 'Distance', value: `${selectedStore?.distance_km || '-'} km`, icon: 'ri-route-line' },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-3 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
                    <i className={`${item.icon} text-base`} style={{ color: 'var(--accent)', width: 20 }} />
                    <span className="text-xs flex-1" style={{ color: 'var(--text-secondary)' }}>{item.label}</span>
                    <span className="text-sm font-medium text-right" style={{ color: 'var(--text-primary)', maxWidth: '60%' }}>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Mini map */}
            {selectedStore && isLoaded && (
              <div className="rounded-2xl overflow-hidden border border-white/5" style={{ height: 140 }}>
                <GoogleMap
                    mapContainerStyle={mapContainerStyle}
                    center={{ lat: Number(selectedStore.latitude), lng: Number(selectedStore.longitude) }}
                    zoom={16}
                    options={{
                      disableDefaultUI: true,
                      gestureHandling: 'none',
                      styles: [
                        { featureType: 'poi', stylers: [{ visibility: 'off' }] },
                        { featureType: 'transit', stylers: [{ visibility: 'off' }] },
                      ],
                    }}
                  >
                    <Marker
                      position={{ lat: Number(selectedStore.latitude), lng: Number(selectedStore.longitude) }}
                      icon={{
                        url: currentPlatform?.marker || '',
                        scaledSize: new google.maps.Size(32, 32),
                        anchor: new google.maps.Point(16, 16),
                      }}
                    />
                    <Marker
                      position={{ lat: latitude, lng: longitude }}
                      icon={{
                        path: google.maps.SymbolPath.CIRCLE,
                        scale: 8,
                        fillColor: '#3b82f6',
                        fillOpacity: 1,
                        strokeColor: '#ffffff',
                        strokeWeight: 3,
                      }}
                    />
                </GoogleMap>
              </div>
            )}

            <div className="glass p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                <i className="ri-sparkling-line text-xl text-purple-400" />
              </div>
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>AI-generated delivery profile</p>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>6 months of synthetic data for personalized risk scoring</p>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="glass p-3 mt-4 flex items-center gap-2">
            <i className="ri-error-warning-line text-red-400" />
            <p className="text-red-400 text-xs">{error}</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex gap-3 pt-6">
        {step > 1 && (
          <button onClick={handleBack} className="glass flex-1 py-3 text-sm font-medium flex items-center justify-center gap-1" style={{ color: 'var(--text-secondary)' }}>
            <i className="ri-arrow-left-line" /> Back
          </button>
        )}
        {step < 5 ? (
          <button onClick={handleNext} disabled={!canProceed()} className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-40">
            Continue <i className="ri-arrow-right-line" />
          </button>
        ) : (
          <button onClick={handleSubmit} disabled={loading} className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-40">
            {loading ? (
              <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Starting...</>
            ) : (
              <><i className="ri-shield-check-line" /> Start Protection</>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
