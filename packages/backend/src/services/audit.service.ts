import { db } from '../config/database.js';

/**
 * Insert a record into the audit_log table.
 * Tracks state transitions for any entity in the system.
 */
export async function log(
  entityType: string,
  entityId: string,
  previousState: string | null,
  newState: string,
  triggeringEvent: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  await db('audit_log').insert({
    entity_type: entityType,
    entity_id: entityId,
    previous_state: previousState,
    new_state: newState,
    triggering_event: triggeringEvent,
    metadata: metadata ? JSON.stringify(metadata) : '{}',
    created_at: new Date(),
  });
}
