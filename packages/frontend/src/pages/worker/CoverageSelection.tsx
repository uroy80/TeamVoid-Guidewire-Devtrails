import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { policy, worker } from '../../api/client';

interface Plan {
  id: string;
  tier: string;
  weeklyPremium: number;
  dailyPayout: number;
  coveragePercent: number;
  maxDays: number;
  formula: string;
}

const TIER_COLORS: Record<string, string> = {
  Basic: 'from-slate-400 to-slate-500',
  Standard: 'from-emerald-400 to-cyan-500',
  Premium: 'from-amber-400 to-orange-500',
};

const RISK_COLORS = [
  { max: 30, label: 'Low', color: 'text-emerald-400', bar: 'bg-emerald-400' },
  { max: 60, label: 'Medium', color: 'text-yellow-400', bar: 'bg-yellow-400' },
  { max: 80, label: 'High', color: 'text-orange-400', bar: 'bg-orange-400' },
  { max: 100, label: 'Very High', color: 'text-red-400', bar: 'bg-red-400' },
];

function getRiskInfo(score: number) {
  return RISK_COLORS.find((r) => score <= r.max) || RISK_COLORS[3];
}

export default function CoverageSelection() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [riskScore, setRiskScore] = useState<number>(0);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const [plansRes, meRes] = await Promise.all([
          policy.getPlans(),
          worker.getMe(),
        ]);
        setPlans(plansRes.data.plans || plansRes.data);
        setRiskScore(meRes.data.riskScore || 45);
      } catch (err: any) {
        setError('Failed to load plans');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleSelect = async (plan: Plan) => {
    setSubmitting(true);
    setError('');
    try {
      await policy.createPolicy({
        coverage_level: plan.id,
        payment_upi: '',
      });
      navigate('/dashboard', { replace: true });
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create policy');
    } finally {
      setSubmitting(false);
    }
  };

  const risk = getRiskInfo(riskScore);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 px-6 py-8 pb-20">
      <h1 className="text-xl font-bold text-white mb-1">Choose Your Coverage</h1>
      <p className="text-slate-400 text-sm mb-6">
        Select a plan based on your risk profile.
      </p>

      {/* Risk Score Meter */}
      <div className="p-4 rounded-2xl bg-white/5 backdrop-blur border border-white/10 mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-slate-400">Your Risk Score</span>
          <span className={`text-xs font-semibold ${risk.color}`}>
            {risk.label}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex-1 h-3 bg-white/10 rounded-full overflow-hidden">
            <div
              className={`h-full ${risk.bar} rounded-full transition-all duration-700`}
              style={{ width: `${riskScore}%` }}
            />
          </div>
          <span className={`text-lg font-bold ${risk.color}`}>{riskScore}</span>
        </div>
      </div>

      {/* Plan Cards */}
      <div className="space-y-4">
        {plans.map((plan) => {
          const isRecommended = plan.tier === 'Standard';
          return (
            <div
              key={plan.id}
              className={`relative p-5 rounded-2xl border transition-all ${
                isRecommended
                  ? 'bg-emerald-500/10 border-emerald-400/40 ring-1 ring-emerald-400/20'
                  : 'bg-white/5 border-white/10'
              }`}
            >
              {isRecommended && (
                <span className="absolute -top-2.5 left-4 px-3 py-0.5 bg-emerald-500 text-white text-[10px] font-bold rounded-full uppercase tracking-wider">
                  Recommended
                </span>
              )}

              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-xl bg-gradient-to-br ${
                      TIER_COLORS[plan.tier] || TIER_COLORS.Basic
                    } flex items-center justify-center text-white font-bold text-sm`}
                  >
                    {plan.tier[0]}
                  </div>
                  <div>
                    <h3 className="text-white font-semibold text-sm">
                      {plan.tier}
                    </h3>
                    <p className="text-slate-400 text-xs">
                      {plan.coveragePercent}% coverage
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-white font-bold text-lg">
                    &#8377;{plan.weeklyPremium}
                  </p>
                  <p className="text-slate-500 text-[10px]">per week</p>
                </div>
              </div>

              {/* Details */}
              <div className="grid grid-cols-2 gap-2 mb-4">
                <div className="p-2.5 rounded-lg bg-white/5">
                  <p className="text-slate-500 text-[10px]">Daily Payout</p>
                  <p className="text-white text-sm font-semibold">
                    &#8377;{plan.dailyPayout}
                  </p>
                </div>
                <div className="p-2.5 rounded-lg bg-white/5">
                  <p className="text-slate-500 text-[10px]">Max Days</p>
                  <p className="text-white text-sm font-semibold">
                    {plan.maxDays} days
                  </p>
                </div>
              </div>

              {plan.formula && (
                <p className="text-slate-500 text-[10px] mb-4 font-mono bg-white/5 p-2 rounded-lg">
                  {plan.formula}
                </p>
              )}

              <button
                onClick={() => handleSelect(plan)}
                disabled={submitting}
                className={`w-full py-2.5 rounded-xl text-sm font-semibold active:scale-[0.98] transition-transform disabled:opacity-50 ${
                  isRecommended
                    ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 text-white shadow-lg shadow-emerald-500/25'
                    : 'bg-white/10 text-white hover:bg-white/15'
                }`}
              >
                {submitting ? 'Processing...' : 'Select Plan'}
              </button>
            </div>
          );
        })}
      </div>

      {error && (
        <p className="mt-4 text-red-400 text-xs text-center">{error}</p>
      )}
    </div>
  );
}
