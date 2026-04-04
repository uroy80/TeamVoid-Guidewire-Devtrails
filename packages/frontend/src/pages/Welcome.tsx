import { useNavigate } from 'react-router-dom';
import ThemeToggle from '../components/ThemeToggle';

const features = [
  {
    icon: 'ri-cloud-line',
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    title: 'Heavy rain? Get paid instantly',
    desc: 'Automatic payouts when rainfall disrupts your deliveries.',
  },
  {
    icon: 'ri-fire-line',
    color: 'text-orange-400',
    bg: 'bg-orange-500/10',
    title: 'Extreme heat? Covered',
    desc: 'Heatwave protection keeps your income safe.',
  },
  {
    icon: 'ri-forbid-line',
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    title: "Curfew? We got you",
    desc: 'Civil disruption coverage when you can\'t work.',
  },
];

export default function Welcome() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12" style={{ background: 'var(--bg-primary)' }}>
      <div className="flex justify-end mb-4 w-full max-w-sm"><ThemeToggle /></div>

      {/* Logo with glow */}
      <div className="slide-up mb-6">
        <div className="pulse-ring float">
          <img
            src="/logos/gigshield.png"
            alt="GigShield"
            className="w-20 h-20 rounded-2xl"
            style={{ boxShadow: '0 0 40px rgba(59, 130, 246, 0.3)' }}
          />
        </div>
      </div>

      {/* Heading */}
      <div className="text-center mb-8 slide-up" style={{ animationDelay: '0.1s' }}>
        <h1 className="text-3xl font-extrabold mb-1" style={{ color: 'var(--text-primary)' }}>
          Protect Your
        </h1>
        <h1 className="text-3xl font-extrabold text-gradient">
          Income
        </h1>
        <p className="mt-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
          Weather-based income protection for gig delivery workers
        </p>
      </div>

      {/* Feature cards */}
      <div className="w-full max-w-sm space-y-3 mb-6">
        {features.map((f, i) => (
          <div
            key={f.title}
            className="glass p-4 flex items-center gap-4 slide-up card-hover"
            style={{ animationDelay: `${0.2 + i * 0.1}s` }}
          >
            <div className={`w-10 h-10 rounded-xl ${f.bg} flex items-center justify-center`}>
              <i className={`${f.icon} text-xl ${f.color}`} />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                {f.title}
              </h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                {f.desc}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Price card */}
      <div
        className="glass p-4 w-full max-w-sm flex items-center gap-3 mb-8 slide-up"
        style={{ animationDelay: '0.5s' }}
      >
        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
          <i className="ri-money-rupee-circle-line text-xl text-emerald-400" />
        </div>
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Starting at just <span className="text-emerald-400">&#8377;29/week</span>
          </p>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Less than a cup of chai per day
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="w-full max-w-sm space-y-3 slide-up" style={{ animationDelay: '0.6s' }}>
        <button
          onClick={() => navigate('/login')}
          className="btn-primary w-full flex items-center justify-center gap-2 text-base py-3.5"
        >
          Get Started
          <i className="ri-arrow-right-line" />
        </button>

        <button
          onClick={() => navigate('/login')}
          className="glass w-full py-3 text-sm font-medium"
          style={{ color: 'var(--text-secondary)' }}
        >
          Already have an account? <span style={{ color: 'var(--accent)' }}>Login</span>
        </button>

        <button
          onClick={() => navigate('/demo')}
          className="glass w-full py-3 text-sm font-medium flex items-center justify-center gap-2"
          style={{ color: 'var(--accent)' }}
        >
          <i className="ri-play-circle-line" />
          Anti-Spoofing Live Demo
        </button>

        <button
          onClick={() => navigate('/admin/login')}
          className="w-full py-2 text-xs"
          style={{ color: 'var(--text-muted)' }}
        >
          Admin Login
        </button>
      </div>
    </div>
  );
}
