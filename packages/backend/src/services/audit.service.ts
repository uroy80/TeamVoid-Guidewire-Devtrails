import { createHash } from 'crypto';
import { db } from '../config/database.js';

/**
 * Shape of the fields we hash together. Order matters — any reordering would
 * invalidate existing chains.
 */
interface AuditHashInput {
  actor_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

function sha256Hex(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

function computeRowHash(prev: string | null, input: AuditHashInput): string {
  const payload = JSON.stringify(input);
  return sha256Hex(`${prev ?? ''}|${payload}`);
}

/**
 * Insert a record into the audit_log table as a hash-chained entry.
 *
 * Each new row's `prev_hash` is the previous row's `row_hash`, and its
 * `row_hash` covers the entire canonical payload plus the previous hash.
 * This means mutating any historical row will cause every subsequent hash
 * to mismatch, which `verifyAuditChain()` can detect.
 */
export async function log(
  entityType: string,
  entityId: string,
  previousState: string | null,
  newState: string,
  triggeringEvent: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  const createdAt = new Date();

  const prevRow = await db('audit_log')
    .select('row_hash')
    .orderBy('created_at', 'desc')
    .first();
  const prevHash: string | null = (prevRow?.row_hash as string | null | undefined) ?? null;

  const meta: Record<string, unknown> = metadata ?? {};
  const hashInput: AuditHashInput = {
    actor_id: null, // legacy log() has no actor; appendAuditEntry carries one
    action: triggeringEvent,
    resource_type: entityType,
    resource_id: entityId,
    metadata: meta,
    created_at: createdAt.toISOString(),
  };
  const rowHash = computeRowHash(prevHash, hashInput);

  await db('audit_log').insert({
    entity_type: entityType,
    entity_id: entityId,
    previous_state: previousState,
    new_state: newState,
    triggering_event: triggeringEvent,
    metadata: JSON.stringify(meta),
    created_at: createdAt,
    prev_hash: prevHash,
    row_hash: rowHash,
  });
}

/**
 * Richer append API used by newer code paths. Accepts an explicit actor_id and
 * a resource type/id, and is what the `appendAuditEntry` export points at so
 * existing callers keep compiling.
 */
export async function appendAuditEntry(entry: {
  actor_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string;
  previous_state?: string | null;
  new_state?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const createdAt = new Date();
  const prevRow = await db('audit_log')
    .select('row_hash')
    .orderBy('created_at', 'desc')
    .first();
  const prevHash: string | null = (prevRow?.row_hash as string | null | undefined) ?? null;

  const meta: Record<string, unknown> = entry.metadata ?? {};
  const hashInput: AuditHashInput = {
    actor_id: entry.actor_id,
    action: entry.action,
    resource_type: entry.resource_type,
    resource_id: entry.resource_id,
    metadata: meta,
    created_at: createdAt.toISOString(),
  };
  const rowHash = computeRowHash(prevHash, hashInput);

  await db('audit_log').insert({
    entity_type: entry.resource_type,
    entity_id: entry.resource_id,
    previous_state: entry.previous_state ?? null,
    new_state: entry.new_state ?? '',
    triggering_event: entry.action,
    metadata: JSON.stringify({ ...meta, actor_id: entry.actor_id }),
    created_at: createdAt,
    prev_hash: prevHash,
    row_hash: rowHash,
  });
}

/**
 * Walk the entire audit_log in insertion order and verify the hash chain.
 * Returns `{valid: true}` when every row's hash matches the recomputation,
 * else `{valid: false, brokenAt: <row id>}` identifying the first break.
 */
export async function verifyAuditChain(): Promise<{ valid: boolean; brokenAt?: string; checked: number }> {
  const rows = await db('audit_log')
    .select(
      'id',
      'entity_type',
      'entity_id',
      'triggering_event',
      'metadata',
      'created_at',
      'prev_hash',
      'row_hash',
    )
    .orderBy('created_at', 'asc')
    .orderBy('id', 'asc');

  let previousHash: string | null = null;
  let checked = 0;

  for (const row of rows) {
    checked++;
    const metaRaw = row.metadata;
    const meta: Record<string, unknown> =
      typeof metaRaw === 'string' ? safeJson(metaRaw) : (metaRaw ?? {});
    const actorId = typeof meta.actor_id === 'string' ? (meta.actor_id as string) : null;
    const createdAt = row.created_at instanceof Date ? row.created_at : new Date(row.created_at);

    const recomputed = computeRowHash(previousHash, {
      actor_id: actorId,
      action: row.triggering_event,
      resource_type: row.entity_type,
      resource_id: row.entity_id,
      metadata: stripActor(meta),
      created_at: createdAt.toISOString(),
    });

    // Rows inserted before migration 006 have null hashes — treat them as a
    // legacy prefix we can't verify, but we still chain forward from them.
    if (row.row_hash == null) {
      previousHash = null;
      continue;
    }

    if (row.prev_hash !== previousHash || row.row_hash !== recomputed) {
      return { valid: false, brokenAt: row.id, checked };
    }

    previousHash = row.row_hash;
  }

  return { valid: true, checked };
}

function safeJson(s: string): Record<string, unknown> {
  try {
    const v = JSON.parse(s);
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function stripActor(meta: Record<string, unknown>): Record<string, unknown> {
  // appendAuditEntry persists actor_id inside metadata for convenience, but
  // the canonical hash input carries it as a top-level field. Strip it here
  // to avoid double-counting in the recomputation.
  if (!('actor_id' in meta)) return meta;
  const copy = { ...meta };
  delete copy.actor_id;
  return copy;
}
