import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../../api/client';
import { useStore } from '../../store/store';
import ThemeToggle from '../../components/ThemeToggle';
import Logo from '../../components/Logo';

const AdminLogin: React.FC = () => {
  const navigate = useNavigate();
  const login = useStore((s) => s.login);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { data } = await auth.adminLogin(email, password);
      login(data.token, undefined, true);
      navigate('/admin');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12" style={{ background: 'var(--bg-primary)' }}>
      <div className="w-full max-w-sm">
        <div className="flex justify-end mb-4"><ThemeToggle /></div>

        {/* Logo */}
        <div className="text-center mb-8 slide-up">
          <div className="pulse-ring float inline-block">
            <Logo className="w-16 h-16 rounded-2xl" style={{ boxShadow: '0 0 40px rgba(99, 102, 241, 0.3)' }} />
          </div>
          <h1 className="text-2xl font-extrabold mt-4" style={{ color: 'var(--text-primary)' }}>
            GigShield <span className="text-gradient">Admin</span>
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Sign in to access the dashboard</p>
        </div>

        {/* Card */}
        <div className="glass p-8 slide-up" style={{ animationDelay: '0.1s' }}>
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '10px 14px', color: '#ef4444', fontSize: 13 }}>
                {error}
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@gigshield.in"
                className="input-style w-full"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="input-style w-full"
              />
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2 py-3">
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  <i className="ri-shield-keyhole-line" />
                  Sign In
                </>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs mt-6 slide-up" style={{ animationDelay: '0.2s', color: 'var(--text-muted)' }}>
          GigShield Admin Panel &middot; Authorized personnel only
        </p>
      </div>
    </div>
  );
};

export default AdminLogin;
