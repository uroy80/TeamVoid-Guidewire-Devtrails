import { EventEmitter } from 'events';

/**
 * Typed real-time event bus for the admin "War Room" live feed.
 *
 * All services emit into this singleton. The SSE route (`events.routes.ts`)
 * subscribes to these events and streams them to any connected admin clients.
 *
 * Events are fire-and-forget. Emitting an event should NEVER throw even if
 * nobody is listening, so the rest of the business logic is unaffected.
 */

export type EventType =
  | 'TRIGGER_FIRED'       // Weather threshold breached, disruption event created
  | 'CLAIM_CREATED'       // Claim auto-generated OR manually requested
  | 'FRAUD_CHECKED'       // BAS scoring completed on a claim
  | 'PAYOUT_INITIATED'    // Admin kicked off a payout — gateway call starting
  | 'PAYOUT_PROCESSING'   // Gateway accepted; waiting on bank-side settlement
  | 'PAYOUT_SENT'         // Money settled on beneficiary UPI / bank account
  | 'PAYOUT_FAILED'       // Terminal failure after retries
  | 'WORKER_REGISTERED'   // New worker signed up
  | 'POLICY_CREATED'      // Worker purchased a policy
  | 'COMMUNITY_REPORT';   // Hyperlocal condition report from a worker

export interface EventPayload {
  type: EventType;
  ts: string; // ISO timestamp
  data: Record<string, unknown>;
}

class TypedEventBus extends EventEmitter {
  emitEvent(type: EventType, data: Record<string, unknown>) {
    const payload: EventPayload = {
      type,
      ts: new Date().toISOString(),
      data,
    };
    try {
      this.emit('event', payload);
    } catch {
      // swallow — event emission must never break business logic
    }
  }
}

// Allow many subscribers without Node's default-10 warning
const bus = new TypedEventBus();
bus.setMaxListeners(100);

export const events = bus;
