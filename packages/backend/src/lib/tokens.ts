import { createHash, randomBytes, randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import { db } from '../config/database.js';
import { env } from '../config/env.js';
import { AppError } from '../middleware/errorHandler.js';
import type { WorkerRole } from '../middleware/auth.js';

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;        // 15 min
const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 3600; // 30 days

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number;
  refreshTokenExpiresIn: number;
}

interface AccessPayload {
  workerId: string;
  isAdmin?: boolean;
  role?: WorkerRole;
}

function sha256Hex(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

function generateOpaqueRefreshToken(): string {
  // 256 bits of entropy rendered as URL-safe base64.
  return randomBytes(32).toString('base64url');
}

function signAccessToken(payload: AccessPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL_SECONDS });
}

/**
 * Issue a fresh access + refresh pair for a login.
 * A new `family_id` is created for this session; subsequent rotations reuse it.
 */
export async function issueTokens(
  workerId: string,
  isAdmin: boolean,
  role?: WorkerRole,
): Promise<TokenPair> {
  const familyId = randomUUID();
  return issueIntoFamily(workerId, isAdmin, role, familyId);
}

async function issueIntoFamily(
  workerId: string,
  isAdmin: boolean,
  role: WorkerRole | undefined,
  familyId: string,
): Promise<TokenPair> {
  const accessPayload: AccessPayload = { workerId };
  if (isAdmin) accessPayload.isAdmin = true;
  if (role) accessPayload.role = role;

  const accessToken = signAccessToken(accessPayload);
  const refreshToken = generateOpaqueRefreshToken();
  const refreshHash = sha256Hex(refreshToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + REFRESH_TOKEN_TTL_SECONDS * 1000);

  await db('refresh_tokens').insert({
    worker_id: isValidUuid(workerId) ? workerId : null,
    family_id: familyId,
    token_hash: refreshHash,
    issued_at: now,
    expires_at: expiresAt,
    revoked_at: null,
  });

  return {
    accessToken,
    refreshToken,
    accessTokenExpiresIn: ACCESS_TOKEN_TTL_SECONDS,
    refreshTokenExpiresIn: REFRESH_TOKEN_TTL_SECONDS,
  };
}

/**
 * Rotate a refresh token: validates it, revokes the presented one, and
 * issues a new access+refresh pair in the same family.
 *
 * Reuse detection: if the presented token exists but is already revoked,
 * we assume it was stolen and revoke the entire family, forcing re-login.
 */
export async function rotateRefresh(refreshToken: string): Promise<TokenPair> {
  if (!refreshToken || typeof refreshToken !== 'string') {
    throw new AppError('Refresh token is required', 400);
  }

  const hash = sha256Hex(refreshToken);
  const row = await db('refresh_tokens').where({ token_hash: hash }).first();

  if (!row) {
    throw new AppError('Invalid refresh token', 401);
  }

  const now = new Date();
  const expiresAt = row.expires_at instanceof Date ? row.expires_at : new Date(row.expires_at);
  if (expiresAt.getTime() <= now.getTime()) {
    throw new AppError('Refresh token expired', 401);
  }

  if (row.revoked_at != null) {
    // Token was already rotated — treat this as reuse and revoke the chain.
    await db('refresh_tokens')
      .where({ family_id: row.family_id })
      .whereNull('revoked_at')
      .update({ revoked_at: now });
    throw new AppError('Refresh token reuse detected — session revoked', 401);
  }

  // Mark the presented token as revoked (rotated).
  await db('refresh_tokens').where({ id: row.id }).update({ revoked_at: now });

  // Look up current worker role/admin flag to embed in the new access token.
  const workerId: string = row.worker_id ?? 'admin';
  let isAdmin = false;
  let role: WorkerRole | undefined;
  if (isValidUuid(workerId)) {
    const w = await db('workers').select('role').where({ id: workerId }).first();
    if (w?.role) {
      role = w.role as WorkerRole;
      if (role === 'ADMIN') isAdmin = true;
    }
  } else if (workerId === 'admin') {
    isAdmin = true;
    role = 'ADMIN';
  }

  return issueIntoFamily(workerId, isAdmin, role, row.family_id);
}

/**
 * Revoke a single refresh token (user-initiated logout).
 * Best-effort: if the token is unknown we silently succeed, same as most IdPs.
 */
export async function revokeRefresh(refreshToken: string): Promise<void> {
  if (!refreshToken || typeof refreshToken !== 'string') return;
  const hash = sha256Hex(refreshToken);
  await db('refresh_tokens')
    .where({ token_hash: hash })
    .whereNull('revoked_at')
    .update({ revoked_at: new Date() });
}

function isValidUuid(v: string): boolean {
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(v);
}
