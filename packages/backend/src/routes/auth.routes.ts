import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import * as authService from '../services/auth.service.js';
import * as workerService from '../services/worker.service.js';

const router = Router();

// --- Schemas ---

const sendOtpSchema = z.object({
  mobile: z.string().min(10).max(15).regex(/^\+?\d{10,15}$/, 'Invalid mobile number format'),
});

const verifyOtpSchema = z.object({
  mobile: z.string().min(10).max(15).regex(/^\+?\d{10,15}$/, 'Invalid mobile number format'),
  otp: z.string().min(4).max(6, 'OTP must be 4-6 digits'),
});

const refreshSchema = z.object({
  token: z.string().min(1, 'Token is required'),
});

const refreshTokenSchema = z.object({
  refresh_token: z.string().min(1, 'refresh_token is required'),
});

const adminLoginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password is required'),
});

// --- Routes ---

/**
 * POST /send-otp
 * Send OTP to a mobile number for authentication.
 */
router.post('/send-otp', validate(sendOtpSchema), async (req: Request, res: Response) => {
  try {
    const { mobile } = req.body;
    const result = await authService.sendOtp(mobile);
    res.json(result);
  } catch (err) {
    const error = err as Error & { statusCode?: number };
    res.status(error.statusCode ?? 500).json({ error: error.message });
  }
});

/**
 * POST /verify-otp
 * Verify OTP and return JWT token with worker data.
 */
router.post('/verify-otp', validate(verifyOtpSchema), async (req: Request, res: Response) => {
  try {
    const { mobile, otp } = req.body;
    const { token } = await authService.verifyOtp(mobile, otp);

    // Look up worker to include in response (try with and without +91)
    const normalizedMobile = mobile.replace(/^\+91/, '');
    const worker = await workerService.getByMobile(mobile) ?? await workerService.getByMobile(normalizedMobile);

    res.json({
      token,
      worker: worker ?? null,
    });
  } catch (err) {
    const error = err as Error & { statusCode?: number };
    res.status(error.statusCode ?? 500).json({ error: error.message });
  }
});

/**
 * POST /refresh
 * Refresh an existing JWT token.
 */
router.post('/refresh', validate(refreshSchema), async (req: Request, res: Response) => {
  try {
    const { token } = req.body;
    const result = authService.refreshToken(token);
    res.json(result);
  } catch (err) {
    const error = err as Error & { statusCode?: number };
    res.status(error.statusCode ?? 500).json({ error: error.message });
  }
});

/**
 * POST /admin/login
 * Hardcoded admin login for development/MVP.
 */
router.post('/admin/login', validate(adminLoginSchema), async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@gigshield.in';
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

    if (email !== ADMIN_EMAIL || password !== ADMIN_PASSWORD) {
      res.status(401).json({ error: 'Invalid admin credentials' });
      return;
    }

    const token = authService.generateToken('admin', true);

    res.json({
      token,
      admin: {
        email: ADMIN_EMAIL,
        role: 'admin',
      },
    });
  } catch (err) {
    const error = err as Error & { statusCode?: number };
    res.status(error.statusCode ?? 500).json({ error: error.message });
  }
});

/**
 * POST /refresh-token
 * Exchange a refresh token for a new access + refresh pair.
 * Detects token reuse and revokes the entire session family on abuse.
 */
router.post('/refresh-token', validate(refreshTokenSchema), async (req: Request, res: Response) => {
  try {
    const { refresh_token } = req.body;
    const pair = await authService.rotateRefresh(refresh_token);
    res.json({
      access_token: pair.accessToken,
      refresh_token: pair.refreshToken,
      access_token_expires_in: pair.accessTokenExpiresIn,
      refresh_token_expires_in: pair.refreshTokenExpiresIn,
    });
  } catch (err) {
    const error = err as Error & { statusCode?: number };
    res.status(error.statusCode ?? 401).json({ error: error.message });
  }
});

/**
 * POST /logout
 * Revoke the presented refresh token. Idempotent.
 */
router.post('/logout', validate(refreshTokenSchema), async (req: Request, res: Response) => {
  try {
    const { refresh_token } = req.body;
    await authService.revokeRefresh(refresh_token);
    res.json({ success: true });
  } catch (err) {
    const error = err as Error & { statusCode?: number };
    res.status(error.statusCode ?? 500).json({ error: error.message });
  }
});

export default router;
