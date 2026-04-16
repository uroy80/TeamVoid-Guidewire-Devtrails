import { useEffect, useRef, useState } from 'react';

export type StreamEventType =
  | 'TRIGGER_FIRED'
  | 'CLAIM_CREATED'
  | 'FRAUD_CHECKED'
  | 'PAYOUT_SENT'
  | 'WORKER_REGISTERED'
  | 'POLICY_CREATED'
  | 'COMMUNITY_REPORT'
  | string;

export interface StreamEvent {
  type: StreamEventType;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any;
  ts: number;
}

const MAX_EVENTS = 50;
const BACKOFFS = [1000, 2000, 4000, 8000, 16000];

export function useEventStream(token: string | null | undefined) {
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const attemptRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!token) {
      setConnected(false);
      return;
    }

    let cancelled = false;

    const connect = () => {
      if (cancelled) return;
      try {
        const url = `/api/admin/events/stream?token=${encodeURIComponent(token)}`;
        const es = new EventSource(url);
        esRef.current = es;

        es.onopen = () => {
          if (cancelled) return;
          attemptRef.current = 0;
          setConnected(true);
        };

        es.onmessage = (evt) => {
          if (cancelled) return;
          try {
            const raw = JSON.parse(evt.data);
            const parsed: StreamEvent = {
              type: raw.type || raw.event || 'UNKNOWN',
              payload: raw.payload ?? raw.data ?? raw,
              ts: typeof raw.ts === 'number' ? raw.ts : Date.now(),
            };
            setEvents((prev) => {
              const next = [parsed, ...prev];
              return next.length > MAX_EVENTS ? next.slice(0, MAX_EVENTS) : next;
            });
          } catch {
            /* ignore malformed payload */
          }
        };

        es.onerror = () => {
          if (cancelled) return;
          setConnected(false);
          es.close();
          esRef.current = null;
          const delay = BACKOFFS[Math.min(attemptRef.current, BACKOFFS.length - 1)];
          attemptRef.current += 1;
          retryTimerRef.current = setTimeout(connect, delay);
        };
      } catch {
        const delay = BACKOFFS[Math.min(attemptRef.current, BACKOFFS.length - 1)];
        attemptRef.current += 1;
        retryTimerRef.current = setTimeout(connect, delay);
      }
    };

    connect();

    return () => {
      cancelled = true;
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      setConnected(false);
    };
  }, [token]);

  return { events, connected };
}

export default useEventStream;
