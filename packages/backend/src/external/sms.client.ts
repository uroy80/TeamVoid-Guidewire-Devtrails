import { env } from '../config/env.js';

const TWILIO_BASE = `https://verify.twilio.com/v2/Services/${env.TWILIO_VERIFY_SID}`;

function twilioAuth(): string {
  return 'Basic ' + Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64');
}

/**
 * Send OTP via Twilio Verify with 4-digit custom code length.
 */
export async function sendOtpSMS(mobile: string, _otp?: string): Promise<boolean> {
  const number = mobile.startsWith('+') ? mobile : `+91${mobile.replace(/^\+91/, '')}`;

  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_VERIFY_SID) {
    console.log(`[SMS] No Twilio config. OTP for ${number}: ${_otp || 'N/A'}`);
    return true;
  }

  try {
    const res = await fetch(`${TWILIO_BASE}/Verifications`, {
      method: 'POST',
      headers: {
        'Authorization': twilioAuth(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To: number,
        Channel: 'sms',
      }),
    });

    const data = await res.json() as { status?: string; sid?: string; message?: string };

    if (data.status === 'pending') {
      console.log(`[SMS] Twilio OTP sent to ${number} (sid: ${data.sid})`);
      return true;
    } else {
      console.error(`[SMS] Twilio error:`, data);
      return false;
    }
  } catch (err) {
    console.error('[SMS] Failed to send OTP via Twilio:', err);
    return false;
  }
}

/**
 * Verify OTP via Twilio Verify.
 */
export async function verifyOtpTwilio(mobile: string, code: string): Promise<boolean> {
  const number = mobile.startsWith('+') ? mobile : `+91${mobile.replace(/^\+91/, '')}`;

  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_VERIFY_SID) {
    return false;
  }

  try {
    const res = await fetch(`${TWILIO_BASE}/VerificationCheck`, {
      method: 'POST',
      headers: {
        'Authorization': twilioAuth(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To: number,
        Code: code,
      }),
    });

    const data = await res.json() as { status?: string; valid?: boolean };

    if (data.status === 'approved' && data.valid) {
      console.log(`[SMS] Twilio OTP verified for ${number}`);
      return true;
    }
    console.log(`[SMS] Twilio verification failed for ${number}:`, data.status);
    return false;
  } catch (err) {
    console.error('[SMS] Failed to verify OTP via Twilio:', err);
    return false;
  }
}
