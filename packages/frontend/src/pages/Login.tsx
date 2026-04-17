import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { auth } from '../api/client';
import { useStore } from '../store/store';
import ThemeToggle from '../components/ThemeToggle';
import LanguageSwitcher from '../components/LanguageSwitcher';

type Stage = 'register' | 'otp' | 'verifying';

const TOTAL_STEPS = 6;

export default function Login() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const login = useStore((s) => s.login);
  const [stage, setStage] = useState<Stage>('register');
  const [mobile, setMobile] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [otp, setOtp] = useState(['', '', '', '']);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  const currentStep = stage === 'register' ? 1 : 2;

  const handleSendOtp = async () => {
    if (mobile.length !== 10) {
      setError('Enter a valid 10-digit mobile number');
      return;
    }
    if (!agreedToTerms) {
      setError('You must accept the Terms & Conditions to continue');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const { data } = await auth.sendOtp(`+91${mobile}`);
      setStage('otp');
      // In dev mode, backend returns OTP — auto-fill it
      if (data.dev_otp) {
        setOtp(String(data.dev_otp).split('').slice(0, 4));
      }
    } catch (err: any) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const next = [...otp];
    next[index] = value.slice(-1);
    setOtp(next);
    if (value && index < 3) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async () => {
    const code = otp.join('');
    if (code.length !== 4) {
      setError('Enter the 4-digit OTP');
      return;
    }
    setError('');
    setStage('verifying');
    setLoading(true);
    try {
      const { data } = await auth.verifyOtp(`+91${mobile}`, code);
      // Prefer the short-lived access token if the backend returned a refresh
      // pair — falling back to the legacy single-token payload for safety.
      const accessToken: string = data.access_token || data.token;
      // Store token in localStorage FIRST
      localStorage.setItem('gs_token', accessToken);
      if (data.refresh_token) {
        localStorage.setItem('gs_refresh_token', data.refresh_token);
      }
      // Save mobile for registration page
      localStorage.setItem('gs_mobile', `+91${mobile}`);
      // Then update Zustand store
      login(accessToken, data.worker);

      // If worker exists in response, go to dashboard; otherwise register
      if (data.worker) {
        navigate('/dashboard', { replace: true });
      } else {
        navigate('/register', { replace: true });
      }
    } catch (err: any) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Invalid OTP');
      setStage('otp');
    } finally {
      setLoading(false);
    }
  };

  const maskedMobile = mobile.slice(0, 2) + 'XXXXXX' + mobile.slice(8);

  return (
    <div className="min-h-screen flex flex-col px-6 py-8" style={{ background: 'var(--bg-primary)' }}>
      {/* Theme Toggle */}
      <div className="flex justify-end gap-2 mb-2"><LanguageSwitcher /><ThemeToggle /></div>

      {/* Header */}
      <div className="mb-6 slide-up">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          {stage === 'register' ? t('login.title') : t('login.verify')}
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Step {currentStep} of {TOTAL_STEPS} &mdash;{' '}
          {stage === 'register' ? t('login.title') : t('login.otp_label')}
        </p>
      </div>

      {/* Progress bar - 6 steps */}
      <div className="flex gap-1.5 mb-8 slide-up" style={{ animationDelay: '0.1s' }}>
        {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
          <div
            key={i}
            className="h-1.5 flex-1 rounded-full transition-all duration-500"
            style={{
              background: i < currentStep
                ? 'linear-gradient(135deg, #3b82f6 0%, #6366f1 50%, #8b5cf6 100%)'
                : 'var(--bg-secondary)',
            }}
          />
        ))}
      </div>

      {/* Phase 1: Mobile + T&C */}
      {stage === 'register' && (
        <div className="flex-1 fade-in">
          {/* Phone input */}
          <label className="text-xs font-medium mb-2 block" style={{ color: 'var(--text-secondary)' }}>
            {t('login.mobile_label')}
          </label>
          <div className="flex items-center gap-2 mb-6">
            <div className="glass px-4 py-3 text-sm font-semibold shrink-0" style={{ color: 'var(--text-primary)' }}>
              +91
            </div>
            <input
              type="tel"
              inputMode="numeric"
              maxLength={10}
              value={mobile}
              onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))}
              placeholder={t('login.mobile_placeholder')}
              className="input-style flex-1"
            />
          </div>

          {/* Terms & Conditions */}
          <label
            className="glass flex items-start gap-3 p-3 mb-6 cursor-pointer select-none"
            style={{ borderColor: agreedToTerms ? 'var(--accent)' : undefined }}
          >
            <input
              type="checkbox"
              checked={agreedToTerms}
              onChange={(e) => setAgreedToTerms(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-blue-500 shrink-0"
            />
            <span className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              I agree to the{' '}
              <a href="/terms" target="_blank" rel="noreferrer" className="underline" style={{ color: 'var(--accent)' }}>
                Terms & Conditions
              </a>{' '}
              and{' '}
              <a href="/privacy" target="_blank" rel="noreferrer" className="underline" style={{ color: 'var(--accent)' }}>
                Privacy Policy
              </a>
              , and consent to receive OTPs on this number.
            </span>
          </label>

          {/* Submit */}
          <button
            onClick={handleSendOtp}
            disabled={loading || !mobile || !agreedToTerms}
            className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {t('common.loading')}
              </>
            ) : (
              <>
                {t('login.verify')}
                <i className="ri-arrow-right-line" />
              </>
            )}
          </button>
        </div>
      )}

      {/* Phase 2: OTP */}
      {(stage === 'otp' || stage === 'verifying') && (
        <div className="flex-1 fade-in">
          {/* Info card */}
          <div className="glass p-4 flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <i className="ri-message-3-line text-xl text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                {t('login.otp_sent')} +91 {maskedMobile}
              </p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {t('login.otp_label')}
              </p>
            </div>
          </div>

          {/* OTP inputs */}
          <div className="flex gap-3 justify-center mb-8">
            {otp.map((digit, i) => (
              <input
                key={i}
                ref={(el) => { otpRefs.current[i] = el; }}
                type="tel"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleOtpChange(i, e.target.value)}
                onKeyDown={(e) => handleOtpKeyDown(i, e)}
                disabled={stage === 'verifying'}
                className="input-style w-14 h-14 text-center text-xl font-bold"
                autoFocus={i === 0}
              />
            ))}
          </div>

          {/* Verify button */}
          <button
            onClick={handleVerify}
            disabled={loading || otp.join('').length !== 4}
            className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {t('common.loading')}
              </>
            ) : (
              <>
                {t('login.verify')}
                <i className="ri-check-line" />
              </>
            )}
          </button>

          {/* Change number */}
          {stage === 'otp' && (
            <button
              onClick={() => { setStage('register'); setOtp(['', '', '', '']); }}
              className="w-full mt-4 text-sm"
              style={{ color: 'var(--text-secondary)' }}
            >
              {t('login.resend')}
            </button>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="glass p-3 mt-4 flex items-center gap-2">
          <i className="ri-error-warning-line text-red-400" />
          <p className="text-red-400 text-xs">{error}</p>
        </div>
      )}
    </div>
  );
}
