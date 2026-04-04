import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, worker } from '../../api/client';

type Stage = 'phone' | 'otp' | 'verifying';

export default function Login() {
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>('phone');
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState(['', '', '', '']);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleSendOtp = async () => {
    if (mobile.length !== 10) {
      setError('Enter a valid 10-digit mobile number');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await auth.sendOtp(`+91${mobile}`);
      setStage('otp');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to send OTP');
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
      localStorage.setItem('gs_token', data.token);

      // Check if worker profile exists
      try {
        await worker.getMe();
        navigate('/dashboard', { replace: true });
      } catch {
        navigate('/register', { replace: true });
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Invalid OTP');
      setStage('otp');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center px-6">
      {/* Header */}
      <div className="mb-10 text-center">
        <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-500/25">
          <svg
            className="w-8 h-8 text-slate-900"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
            />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-white">Welcome Back</h1>
        <p className="text-slate-400 text-sm mt-1">Sign in with your mobile number</p>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm p-6 rounded-2xl bg-white/5 backdrop-blur border border-white/10">
        {/* Phone input */}
        {(stage === 'phone' || stage === 'otp' || stage === 'verifying') && (
          <div className="mb-5">
            <label className="text-xs text-slate-400 mb-1.5 block">
              Mobile Number
            </label>
            <div className="flex items-center gap-2">
              <span className="text-white text-sm font-medium bg-white/10 px-3 py-2.5 rounded-lg shrink-0">
                +91
              </span>
              <input
                type="tel"
                inputMode="numeric"
                maxLength={10}
                value={mobile}
                onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))}
                disabled={stage !== 'phone'}
                placeholder="Enter 10-digit number"
                className="flex-1 bg-white/10 text-white px-4 py-2.5 rounded-lg text-sm placeholder-slate-500 outline-none focus:ring-2 focus:ring-emerald-400/50 disabled:opacity-50 transition"
              />
            </div>
          </div>
        )}

        {/* Send OTP button */}
        {stage === 'phone' && (
          <button
            onClick={handleSendOtp}
            disabled={loading}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-white font-semibold text-sm shadow-lg shadow-emerald-500/25 disabled:opacity-50 active:scale-[0.98] transition-transform"
          >
            {loading ? 'Sending...' : 'Send OTP'}
          </button>
        )}

        {/* OTP input */}
        {(stage === 'otp' || stage === 'verifying') && (
          <>
            <label className="text-xs text-slate-400 mb-2 block">
              Enter OTP sent to +91 {mobile}
            </label>
            <div className="flex gap-3 justify-center mb-5">
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
                  className="w-12 h-14 text-center text-xl font-bold text-white bg-white/10 rounded-lg outline-none focus:ring-2 focus:ring-emerald-400/50 disabled:opacity-50 transition"
                />
              ))}
            </div>
            <button
              onClick={handleVerify}
              disabled={loading}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-white font-semibold text-sm shadow-lg shadow-emerald-500/25 disabled:opacity-50 active:scale-[0.98] transition-transform"
            >
              {loading ? 'Verifying...' : 'Verify OTP'}
            </button>
            {stage === 'otp' && (
              <button
                onClick={() => { setStage('phone'); setOtp(['', '', '', '']); }}
                className="w-full mt-3 text-slate-500 text-xs hover:text-slate-400 transition-colors"
              >
                Change number
              </button>
            )}
          </>
        )}

        {/* Error */}
        {error && (
          <p className="mt-4 text-red-400 text-xs text-center">{error}</p>
        )}
      </div>
    </div>
  );
}
