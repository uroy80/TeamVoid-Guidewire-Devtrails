import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { policy, worker } from '../api/client';
import { generatePolicyPDF } from '../utils/generatePolicyPDF';
import ThemeToggle from '../components/ThemeToggle';

interface PlanData {
  tier: string;
  premium: number;
  dailyPayout: number;
  maxDays: number;
  coveragePct: number;
  hourlyRate: number;
  avgHours: number;
  dailyIncome: number;
  riskScore: number;
  riskFactor: number;
  formula: { premium: string; payout: string };
}

type Stage = 'plans' | 'payment' | 'processing' | 'receipt';

const TIER_META: Record<string, { label: string; icon: string; color: string; gradient: string }> = {
  basic: { label: 'Basic', icon: 'ri-shield-line', color: '#94a3b8', gradient: 'linear-gradient(135deg, #64748b, #94a3b8)' },
  standard: { label: 'Standard', icon: 'ri-shield-star-line', color: '#3b82f6', gradient: 'linear-gradient(135deg, #3b82f6, #6366f1, #8b5cf6)' },
  premium: { label: 'Premium', icon: 'ri-vip-crown-line', color: '#f59e0b', gradient: 'linear-gradient(135deg, #f59e0b, #f97316)' },
};

const RISK_COLORS = [
  { max: 30, label: 'Low', color: '#10b981' },
  { max: 60, label: 'Medium', color: '#eab308' },
  { max: 80, label: 'High', color: '#f97316' },
  { max: 100, label: 'Very High', color: '#ef4444' },
];

function getRiskInfo(score: number) {
  return RISK_COLORS.find((r) => score <= r.max) || RISK_COLORS[3];
}

export default function CoverageSelection() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<PlanData[]>([]);
  const [riskScore, setRiskScore] = useState(0);
  const [me, setMe] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Payment flow
  const [stage, setStage] = useState<Stage>('plans');
  const [selectedPlan, setSelectedPlan] = useState<PlanData | null>(null);
  const [upiId, setUpiId] = useState('');
  const [createdPolicy, setCreatedPolicy] = useState<any>(null);
  const receiptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const [plansRes, meRes] = await Promise.all([policy.getPlans(), worker.getMe()]);
        const plansData = plansRes.data?.plans || plansRes.data || [];
        setPlans(plansData);
        setMe(meRes.data);
        setRiskScore(meRes.data?.risk_score || plansData[0]?.riskScore || 50);
        setUpiId(meRes.data?.payment_upi || `${meRes.data?.mobile}@upi`);
      } catch {
        setError('Failed to load plans');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSelectPlan = (plan: PlanData) => {
    setSelectedPlan(plan);
    setStage('payment');
  };

  const handlePay = async () => {
    if (!selectedPlan || !upiId) return;
    setStage('processing');
    setError('');

    // Simulate payment processing delay
    await new Promise((r) => setTimeout(r, 2500));

    try {
      const res = await policy.createPolicy({
        coverage_level: selectedPlan.tier,
        payment_upi: upiId,
      });
      setCreatedPolicy(res.data?.policy || res.data);
      setStage('receipt');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Payment failed');
      setStage('payment');
    }
  };

  const handleDownloadPolicy = async () => {
    if (!createdPolicy || !me || !selectedPlan) return;
    const meta = TIER_META[selectedPlan.tier] || TIER_META.basic;
    const riskInfo = getRiskInfo(riskScore);
    await generatePolicyPDF({
      policyNumber: createdPolicy.policy_number,
      workerName: me.name,
      workerMobile: me.mobile,
      workerPlatform: me.platform,
      riskScore,
      riskLabel: riskInfo.label,
      tierLabel: meta.label,
      premium: selectedPlan.premium,
      coveragePct: selectedPlan.coveragePct,
      dailyPayout: selectedPlan.dailyPayout,
      maxDays: selectedPlan.maxDays,
      formulaPremium: selectedPlan.formula.premium,
      formulaPayout: selectedPlan.formula.payout,
      riskFactor: selectedPlan.riskFactor,
      startDate: new Date(createdPolicy.coverage_period_start).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }),
      endDate: new Date(createdPolicy.coverage_period_end).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }),
      transactionRef: createdPolicy.payment_transaction_ref,
      upi: upiId,
      paymentDate: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }),
    });
  };
  const risk = getRiskInfo(riskScore);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
        <div className="w-10 h-10 border-4 rounded-full animate-spin" style={{ borderColor: 'var(--accent-light)', borderTopColor: 'var(--accent)' }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen px-6 py-8 pb-20" style={{ background: 'var(--bg-primary)' }}>
      <div className="flex justify-end mb-2"><ThemeToggle /></div>

      {/* ── Stage: Plans ── */}
      {stage === 'plans' && (
        <>
          <h1 className="text-2xl font-bold mb-1 slide-up" style={{ color: 'var(--text-primary)' }}>Choose Your Coverage</h1>
          <p className="text-sm mb-6 slide-up" style={{ color: 'var(--text-secondary)' }}>Based on your AI-generated risk profile</p>

          {/* Risk Score */}
          <div className="flex justify-center mb-6 slide-up" style={{ animationDelay: '0.1s' }}>
            <div className="risk-meter">
              <div style={{
                position: 'absolute', inset: 0, borderRadius: '50%', padding: '8px',
                background: `conic-gradient(from 220deg, #10b981 0%, #eab308 25%, #f97316 50%, #ef4444 ${(riskScore / 100) * 75}%, var(--bg-secondary) ${(riskScore / 100) * 75}%, var(--bg-secondary) 100%)`,
                WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                WebkitMaskComposite: 'xor', maskComposite: 'exclude',
              }} />
              <div className="risk-meter-inner">
                <span className="text-3xl font-extrabold" style={{ color: risk.color }}>{riskScore}</span>
                <span className="text-xs font-semibold" style={{ color: risk.color }}>{risk.label} Risk</span>
              </div>
            </div>
          </div>

          {/* Worker info */}
          {me && (
            <div className="glass p-3 mb-6 flex items-center gap-3 slide-up" style={{ animationDelay: '0.15s' }}>
              <i className="ri-user-line text-lg" style={{ color: 'var(--accent)' }} />
              <div className="flex-1">
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{me.name}</p>
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  {me.platform} &middot; &#8377;{Math.round(me.hourly_rate)}/hr &middot; {me.avg_hours_per_day}hrs/day
                </p>
              </div>
              <span className="px-2 py-1 rounded-full text-[10px] font-bold capitalize" style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>
                {me.risk_tier}
              </span>
            </div>
          )}

          {/* Plans */}
          <div className="space-y-4">
            {plans.map((plan, idx) => {
              const isRecommended = plan.tier === 'standard';
              const meta = TIER_META[plan.tier] || TIER_META.basic;
              return (
                <div key={plan.tier} className="glass p-5 relative slide-up card-hover"
                  style={{ animationDelay: `${0.2 + idx * 0.1}s`, borderColor: isRecommended ? 'rgba(59, 130, 246, 0.4)' : undefined, borderWidth: isRecommended ? '2px' : undefined }}>
                  {isRecommended && (
                    <span className="absolute -top-2.5 left-4 px-3 py-0.5 text-white text-[10px] font-bold rounded-full uppercase tracking-wider" style={{ background: meta.gradient }}>Recommended</span>
                  )}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: meta.gradient }}>
                        <i className={`${meta.icon} text-white text-xl`} />
                      </div>
                      <div>
                        <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{meta.label}</h3>
                        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{plan.coveragePct}% coverage</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-xl" style={{ color: 'var(--text-primary)' }}>&#8377;{plan.premium}</p>
                      <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>per week</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    <div className="p-2.5 rounded-xl" style={{ background: 'var(--bg-card)' }}>
                      <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Daily Payout</p>
                      <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>&#8377;{plan.dailyPayout}</p>
                    </div>
                    <div className="p-2.5 rounded-xl" style={{ background: 'var(--bg-card)' }}>
                      <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Max Days</p>
                      <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{plan.maxDays} days</p>
                    </div>
                    <div className="p-2.5 rounded-xl" style={{ background: 'var(--bg-card)' }}>
                      <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Daily Income</p>
                      <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>&#8377;{plan.dailyIncome}</p>
                    </div>
                  </div>
                  {plan.formula && (
                    <div className="text-[10px] font-mono mb-4 p-2.5 rounded-lg space-y-1" style={{ color: 'var(--text-muted)', background: 'var(--bg-card)' }}>
                      <div><span style={{ color: 'var(--text-secondary)' }}>Premium:</span> {plan.formula.premium}</div>
                      <div><span style={{ color: 'var(--text-secondary)' }}>Payout:</span> {plan.formula.payout}</div>
                    </div>
                  )}
                  <button onClick={() => handleSelectPlan(plan)}
                    className={`w-full py-3 rounded-xl text-sm font-semibold transition-all ${isRecommended ? 'btn-primary' : ''}`}
                    style={!isRecommended ? { background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border)' } : undefined}>
                    Select {meta.label}
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── Stage: Payment ── */}
      {stage === 'payment' && selectedPlan && (
        <div className="fade-in">
          <button onClick={() => setStage('plans')} className="flex items-center gap-1 text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
            <i className="ri-arrow-left-line" /> Back to plans
          </button>

          <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Complete Payment</h1>
          <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>Secure UPI payment for your insurance policy</p>

          {/* Order Summary */}
          <div className="glass p-5 mb-6">
            <h3 className="text-xs font-semibold mb-4 uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              <i className="ri-file-list-3-line mr-1" style={{ color: 'var(--accent)' }} /> Order Summary
            </h3>
            <div className="flex items-center justify-between mb-3 pb-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: (TIER_META[selectedPlan.tier] || TIER_META.basic).gradient }}>
                  <i className={`${(TIER_META[selectedPlan.tier] || TIER_META.basic).icon} text-white text-lg`} />
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{(TIER_META[selectedPlan.tier] || TIER_META.basic).label} Plan</p>
                  <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{selectedPlan.coveragePct}% coverage &middot; 7 days</p>
                </div>
              </div>
              <p className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>&#8377;{selectedPlan.premium}</p>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between" style={{ color: 'var(--text-secondary)' }}>
                <span>Base Premium</span><span>&#8377;{selectedPlan.formula.premium.split('×')[0].replace('₹','').trim()}</span>
              </div>
              <div className="flex justify-between" style={{ color: 'var(--text-secondary)' }}>
                <span>Risk Factor</span><span>{selectedPlan.riskFactor}x</span>
              </div>
              <div className="flex justify-between" style={{ color: 'var(--text-secondary)' }}>
                <span>GST</span><span style={{ color: 'var(--success)' }}>Included</span>
              </div>
              <div className="flex justify-between pt-2 font-bold text-sm" style={{ borderTop: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                <span>Total</span><span>&#8377;{selectedPlan.premium}</span>
              </div>
            </div>
          </div>

          {/* UPI Payment */}
          <div className="glass p-5 mb-6">
            <h3 className="text-xs font-semibold mb-4 uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              <i className="ri-bank-line mr-1" style={{ color: 'var(--accent)' }} /> Payment Method
            </h3>
            <div className="flex items-center gap-3 p-3 rounded-xl mb-4" style={{ background: 'var(--bg-card)', border: '2px solid var(--accent)' }}>
              <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
                <i className="ri-bank-card-line text-xl text-green-500" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>UPI Payment</p>
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Instant & Secure</p>
              </div>
              <i className="ri-checkbox-circle-fill text-lg" style={{ color: 'var(--accent)' }} />
            </div>

            <label className="text-xs font-medium block mb-2" style={{ color: 'var(--text-secondary)' }}>UPI ID</label>
            <input
              type="text"
              value={upiId}
              onChange={(e) => setUpiId(e.target.value)}
              placeholder="yourname@upi"
              className="input-style w-full mb-2"
            />
            <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              <i className="ri-lock-line mr-1" />Payment is simulated for demo. No real money will be charged.
            </p>
          </div>

          {error && (
            <div className="glass p-3 mb-4 flex items-center gap-2">
              <i className="ri-error-warning-line text-red-400" />
              <p className="text-red-400 text-xs">{error}</p>
            </div>
          )}

          <button onClick={handlePay} disabled={!upiId} className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-40">
            <i className="ri-secure-payment-line" /> Pay &#8377;{selectedPlan.premium}
          </button>
        </div>
      )}

      {/* ── Stage: Processing ── */}
      {stage === 'processing' && (
        <div className="min-h-[60vh] flex flex-col items-center justify-center text-center fade-in">
          <div className="w-20 h-20 gradient-primary rounded-full flex items-center justify-center mb-6 glow" style={{ animation: 'float 2s ease-in-out infinite' }}>
            <i className="ri-bank-card-line text-white text-4xl" />
          </div>
          <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Processing Payment</h2>
          <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>Verifying UPI transaction...</p>
          <div className="w-48 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-secondary)' }}>
            <div className="h-full progress-bar rounded-full" style={{ background: 'linear-gradient(90deg, #3b82f6, #8b5cf6, #ec4899)', backgroundSize: '200% 100%' }} />
          </div>
          <p className="text-xs mt-4" style={{ color: 'var(--text-muted)' }}>Please do not close this page</p>
        </div>
      )}

      {/* ── Stage: Receipt ── */}
      {stage === 'receipt' && createdPolicy && selectedPlan && (
        <div className="fade-in" ref={receiptRef}>
          {/* Success animation */}
          <div className="flex flex-col items-center text-center mb-6">
            <div className="w-20 h-20 gradient-success rounded-full flex items-center justify-center mb-4" style={{ boxShadow: '0 0 40px rgba(16,185,129,0.4)' }}>
              <i className="ri-check-line text-white text-4xl" />
            </div>
            <h2 className="text-xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Payment Successful!</h2>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Your policy is now active</p>
          </div>

          {/* Receipt Card */}
          <div className="glass p-5 mb-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Payment Receipt</h3>
              <span className="px-2 py-1 rounded-full text-[10px] font-bold" style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981' }}>PAID</span>
            </div>
            <div className="space-y-2.5 text-xs">
              {[
                { label: 'Transaction ID', value: createdPolicy.payment_transaction_ref },
                { label: 'Policy Number', value: createdPolicy.policy_number },
                { label: 'Plan', value: (TIER_META[selectedPlan.tier] || TIER_META.basic).label },
                { label: 'Amount', value: `₹${createdPolicy.weekly_premium}` },
                { label: 'Payment Method', value: `UPI (${upiId})` },
                { label: 'Date', value: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) },
              ].map((item) => (
                <div key={item.label} className="flex justify-between py-1.5" style={{ borderBottom: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{item.label}</span>
                  <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Policy Summary */}
          <div className="glass p-5 mb-4">
            <h3 className="text-xs font-semibold mb-3 uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Policy Details</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl" style={{ background: 'var(--bg-card)' }}>
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Coverage</p>
                <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{selectedPlan.coveragePct}%</p>
              </div>
              <div className="p-3 rounded-xl" style={{ background: 'var(--bg-card)' }}>
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Daily Payout</p>
                <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>&#8377;{selectedPlan.dailyPayout}</p>
              </div>
              <div className="p-3 rounded-xl" style={{ background: 'var(--bg-card)' }}>
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Valid From</p>
                <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                  {new Date(createdPolicy.coverage_period_start).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                </p>
              </div>
              <div className="p-3 rounded-xl" style={{ background: 'var(--bg-card)' }}>
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Valid Till</p>
                <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                  {new Date(createdPolicy.coverage_period_end).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                </p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <button onClick={handleDownloadPolicy}
              className="glass w-full py-3 text-sm font-semibold flex items-center justify-center gap-2"
              style={{ color: 'var(--accent)', borderColor: 'rgba(59,130,246,0.3)' }}>
              <i className="ri-file-pdf-2-line" /> Download Policy (PDF)
            </button>
            <button onClick={() => navigate('/dashboard', { replace: true })}
              className="btn-primary w-full flex items-center justify-center gap-2">
              <i className="ri-dashboard-line" /> Go to Dashboard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
