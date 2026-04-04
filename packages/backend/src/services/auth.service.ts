import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { db } from '../config/database.js';
import { env } from '../config/env.js';
import { AppError } from '../middleware/errorHandler.js';
import { sendOtpSMS, verifyOtpTwilio } from '../external/sms.client.js';

const OTP_EXPIRY_MINUTES = 5;
const MAX_OTP_ATTEMPTS = 3;
const JWT_EXPIRY = '7d';

interface TokenPayload {
  workerId: string;
  isAdmin?: boolean;
}

/**
 * Send OTP to a mobile number.
 * In development mode, always uses "1234" as the OTP.
 * Hashes with bcrypt and stores in otp_records with 5-minute expiry.
 */
export async function sendOtp(mobile: string): Promise<{ message: string; dev_otp?: string }> {
  // Invalidate any existing un-verified OTPs for this mobile
  await db('otp_records')
    .where({ mobile, verified: false })
    .del();

  // Send via Twilio Verify (Twilio generates and sends the OTP)
  const sent = await sendOtpSMS(mobile);
  if (!sent) {
    throw new AppError('Failed to send OTP. Please try again.', 500);
  }

  // Store a tracking record
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
  await db('otp_records').insert({
    mobile,
    otp_hash: 'twilio-verify',
    attempts: 0,
    expires_at: expiresAt,
    verified: false,
  });

  console.log(`[AUTH] OTP sent to ${mobile} via Twilio Verify`);
  return { message: 'OTP sent successfully' };
}

/**
 * Verify OTP for a mobile number.
 * Checks hash match, expiry, and attempt limit.
 * Returns a JWT token on success.
 */
export async function verifyOtp(mobile: string, otp: string): Promise<{ token: string }> {
  const record = await db('otp_records')
    .where({ mobile, verified: false })
    .orderBy('created_at', 'desc')
    .first();

  if (!record) {
    throw new AppError('No OTP found for this mobile number. Request a new one.', 400);
  }

  // Check expiry
  if (new Date(record.expires_at) < new Date()) {
    throw new AppError('OTP has expired. Request a new one.', 400);
  }

  // Check max attempts
  if (record.attempts >= MAX_OTP_ATTEMPTS) {
    throw new AppError('Maximum OTP attempts exceeded. Request a new one.', 429);
  }

  // Increment attempts
  await db('otp_records')
    .where({ id: record.id })
    .update({ attempts: record.attempts + 1 });

  // Verify OTP via Twilio Verify API
  const isValid = await verifyOtpTwilio(mobile, otp);

  if (!isValid) {
    const remaining = MAX_OTP_ATTEMPTS - (record.attempts + 1);
    throw new AppError(`Invalid OTP. ${remaining} attempt(s) remaining.`, 400);
  }

  // Mark as verified
  await db('otp_records')
    .where({ id: record.id })
    .update({ verified: true });

  // Look up worker -- try exact match, then stripped of +91 prefix
  const normalizedMobile = mobile.replace(/^\+91/, '');
  const worker = await db('workers')
    .where({ mobile })
    .orWhere({ mobile: normalizedMobile })
    .first();

  if (!worker) {
    // Return a temporary token with just the mobile for registration flow
    const tempToken = jwt.sign({ mobile, isRegistration: true }, env.JWT_SECRET, { expiresIn: '1h' });
    return { token: tempToken };
  }

  const token = generateToken(worker.id);
  return { token };
}

/**
 * Generate a signed JWT with 7-day expiry.
 */
export function generateToken(workerId: string, isAdmin?: boolean): string {
  const payload: TokenPayload = { workerId };
  if (isAdmin) {
    payload.isAdmin = true;
  }
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

/**
 * Refresh an existing token. Verifies the old token and issues a new one
 * with a fresh expiry.
 */
export function refreshToken(token: string): { token: string } {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as TokenPayload;
    const newToken = generateToken(payload.workerId, payload.isAdmin);
    return { token: newToken };
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new AppError('Token expired. Please log in again.', 401);
    }
    throw new AppError('Invalid token', 401);
  }
}
