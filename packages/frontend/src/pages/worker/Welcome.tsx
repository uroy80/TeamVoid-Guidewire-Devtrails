import { useNavigate } from 'react-router-dom';

const features = [
  {
    emoji: '\u{1F327}\u{FE0F}',
    title: 'Weather Protection',
    desc: 'Automatic coverage when extreme weather disrupts your deliveries.',
  },
  {
    emoji: '\u{26A1}',
    title: 'Instant Payouts',
    desc: 'Claims processed in minutes, not weeks. Money hits your account fast.',
  },
  {
    emoji: '\u{1F4CB}',
    title: 'Zero Paperwork',
    desc: 'No forms, no documents. Everything is verified automatically by AI.',
  },
];

export default function Welcome() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col px-6 py-12">
      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center mb-6 shadow-lg shadow-emerald-500/25">
          <svg
            className="w-9 h-9 text-slate-900"
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

        <h1 className="text-2xl font-bold text-white mb-2">GigShield</h1>
        <p className="text-xl font-semibold text-emerald-400 mb-8 max-w-xs leading-snug">
          Protect Your Income, Automatically
        </p>

        {/* Feature cards */}
        <div className="w-full max-w-sm space-y-4 mb-10">
          {features.map((f) => (
            <div
              key={f.title}
              className="flex items-start gap-4 p-4 rounded-2xl bg-white/5 backdrop-blur border border-white/10"
            >
              <span className="text-3xl shrink-0">{f.emoji}</span>
              <div className="text-left">
                <h3 className="text-white font-semibold text-sm">{f.title}</h3>
                <p className="text-slate-400 text-xs mt-0.5 leading-relaxed">
                  {f.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="w-full max-w-sm mx-auto space-y-3 pb-4">
        <button
          onClick={() => navigate('/login')}
          className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-white font-semibold text-base shadow-lg shadow-emerald-500/25 active:scale-[0.98] transition-transform"
        >
          Get Started
        </button>
        <button
          onClick={() => navigate('/admin/login')}
          className="w-full py-2 text-slate-500 text-xs hover:text-slate-400 transition-colors"
        >
          Admin Login
        </button>
      </div>
    </div>
  );
}
