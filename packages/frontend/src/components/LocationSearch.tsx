import { useEffect, useRef, useState } from 'react';

interface NominatimResult {
  place_id: number;
  lat: string;
  lon: string;
  display_name: string;
  type?: string;
}

interface LocationSearchProps {
  onSelect: (lat: number, lng: number, label: string) => void;
  placeholder?: string;
}

/**
 * Google-Places-style address search backed by the free OpenStreetMap
 * Nominatim autocomplete endpoint. Debounces input by 300ms and restricts
 * results to India (countrycodes=in), returning up to 5 suggestions.
 */
export default function LocationSearch({ onSelect, placeholder }: LocationSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // Debounced fetch
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setResults([]);
      setLoading(false);
      return;
    }

    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoading(true);
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=5&countrycodes=in&q=${encodeURIComponent(q)}`;
        const res = await fetch(url, {
          signal: ctrl.signal,
          headers: { 'User-Agent': 'GigShield/1.0' },
        });
        if (!res.ok) throw new Error('Search failed');
        const data: NominatimResult[] = await res.json();
        setResults(Array.isArray(data) ? data.slice(0, 5) : []);
        setOpen(true);
      } catch {
        /* silent — keep prior results */
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  const handleSelect = (r: NominatimResult) => {
    const lat = parseFloat(r.lat);
    const lng = parseFloat(r.lon);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      onSelect(lat, lng, r.display_name);
      setQuery(r.display_name);
      setOpen(false);
    }
  };

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <i
          className="ri-search-line"
          style={{
            position: 'absolute',
            left: 12,
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--text-muted)',
            fontSize: 16,
            pointerEvents: 'none',
          }}
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => { if (results.length > 0) setOpen(true); }}
          placeholder={placeholder || 'Search area, locality, or address'}
          className="input-style w-full"
          style={{ paddingLeft: 36 }}
        />
        {loading && (
          <div
            style={{
              position: 'absolute',
              right: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 14,
              height: 14,
              border: '2px solid var(--border)',
              borderTopColor: 'var(--accent)',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }}
          />
        )}
      </div>

      {open && results.length > 0 && (
        <div
          className="glass"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            zIndex: 50,
            padding: 4,
            maxHeight: 260,
            overflowY: 'auto',
          }}
        >
          {results.map((r) => (
            <button
              key={r.place_id}
              type="button"
              onClick={() => handleSelect(r)}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '8px 10px',
                borderRadius: 8,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                color: 'var(--text-primary)',
                fontSize: 12,
                lineHeight: 1.4,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-card)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <i className="ri-map-pin-2-line" style={{ color: 'var(--accent)', fontSize: 14, marginTop: 2, flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{r.display_name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
