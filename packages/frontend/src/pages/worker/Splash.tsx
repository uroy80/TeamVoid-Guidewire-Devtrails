import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Splash() {
  const navigate = useNavigate();
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setFadeOut(true);
      setTimeout(() => {
        const token = localStorage.getItem('gs_token');
        navigate(token ? '/dashboard' : '/welcome', { replace: true });
      }, 400);
    }, 2000);
    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div
      className={`min-h-screen bg-slate-900 flex flex-col items-center justify-center px-6 transition-opacity duration-400 ${
        fadeOut ? 'opacity-0' : 'opacity-100'
      }`}
    >
      {/* Logo */}
      <div className="relative mb-8">
        <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center shadow-lg shadow-emerald-500/25">
          <svg
            className="w-14 h-14 text-slate-900"
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
        <div className="absolute -inset-4 bg-emerald-400/20 rounded-3xl blur-xl -z-10" />
      </div>

      {/* Brand */}
      <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">
        GigShield
      </h1>
      <p className="text-sm text-slate-400 text-center max-w-xs leading-relaxed">
        AI-Powered Parametric Insurance for Gig Workers
      </p>

      {/* Spinner */}
      <div className="mt-12">
        <div className="w-8 h-8 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
      </div>
    </div>
  );
}
