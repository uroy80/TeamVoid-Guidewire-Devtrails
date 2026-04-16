import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { db } from '../config/database.js';

export type WorkerRole =
  | 'WORKER'
  | 'ADMIN'
  | 'CLAIMS_ANALYST'
  | 'UNDERWRITER'
  | 'FRAUD_OPS'
  | 'COMPLIANCE'
  | 'READ_ONLY';

export interface WorkerLike {
  id: string;
  role?: WorkerRole;
  [key: string]: unknown;
}

export interface AuthRequest extends Request {
  workerId?: string;
  isAdmin?: boolean;
  worker?: WorkerLike;
}

// JWT payload shape
interface TokenPayload {
  workerId: string;
  isAdmin?: boolean;
  role?: WorkerRole;
}

/**
 * JWT authentication middleware.
 * Extracts Bearer token from Authorization header, verifies it,
 * and attaches workerId to the request object.
 */
export function authenticate(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or malformed Authorization header' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as TokenPayload;
    req.workerId = payload.workerId;
    req.isAdmin = payload.isAdmin ?? false;
    // Stash a minimal worker shape so requireRole can read it cheaply; we'll
    // hydrate from the DB if needed.
    if (payload.role) {
      req.worker = { id: payload.workerId, role: payload.role };
    } else if (payload.isAdmin) {
      req.worker = { id: payload.workerId, role: 'ADMIN' };
    }
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      res.status(401).json({ error: 'Token expired' });
      return;
    }
    if (err instanceof jwt.JsonWebTokenError) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }
    res.status(500).json({ error: 'Authentication failed' });
  }
}

/**
 * Alias for backward compatibility with existing code that uses requireAuth.
 */
export const requireAuth = authenticate;

/**
 * Role-based authorization middleware factory. Usage:
 *   router.use(requireAuth, requireRole('ADMIN', 'COMPLIANCE'))
 *
 * If the JWT doesn't carry a role we lazily hydrate from the DB. A request
 * only pays this DB cost once per middleware chain.
 */
export function requireRole(...allowedRoles: WorkerRole[]) {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.workerId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    let role: WorkerRole | undefined = req.worker?.role;

    if (!role) {
      // Hardcoded admin login uses workerId='admin' which is not a UUID — skip DB.
      if (req.workerId === 'admin' || req.isAdmin) {
        role = 'ADMIN';
        req.worker = { id: req.workerId, role };
      } else {
        try {
          const row = await db('workers')
            .select('id', 'role')
            .where({ id: req.workerId })
            .first();
          if (row?.role) {
            role = row.role as WorkerRole;
            req.worker = { id: req.workerId, role };
          }
        } catch {
          // fall through — we'll 403 below
        }
      }
    }

    if (!role || !allowedRoles.includes(role)) {
      res.status(403).json({ error: 'Insufficient privileges for this resource' });
      return;
    }

    next();
  };
}

/**
 * Admin authorization middleware.
 * Kept as a thin alias over requireRole('ADMIN') so old code keeps working.
 */
export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  // Fast path: legacy admin JWTs carry `isAdmin` but may not carry role.
  if (req.isAdmin) {
    if (!req.worker) req.worker = { id: req.workerId ?? 'admin', role: 'ADMIN' };
    next();
    return;
  }
  void requireRole('ADMIN')(req, res, next);
}
