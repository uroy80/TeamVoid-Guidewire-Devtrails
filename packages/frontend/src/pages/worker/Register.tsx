import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { worker } from '../../api/client';

const PLATFORMS = [
  { id: 'blinkit', name: 'Blinkit', color: 'from-yellow-400 to-yellow-600' },
  { id: 'zepto', name: 'Zepto', color: 'from-purple-400 to-purple-600' },
  { id: 'instamart', name: 'Instamart', color: 'from-orange-400 to-orange-600' },
];

const CITIES: Record<string, { state: string; zones: string[] }> = {
  Mumbai: { state: 'Maharashtra', zones: ['Andheri', 'Bandra', 'Dadar', 'Powai', 'Thane'] },
  Chennai: { state: 'Tamil Nadu', zones: ['T. Nagar', 'Adyar', 'Anna Nagar', 'Velachery', 'OMR'] },
  Kolkata: { state: 'West Bengal', zones: ['Salt Lake', 'Park Street', 'Howrah', 'Dum Dum', 'Jadavpur'] },
};

const DARK_STORES: Record<string, string[]> = {
  Andheri: ['DS-ANH-01', 'DS-ANH-02', 'DS-ANH-03'],
  Bandra: ['DS-BAN-01', 'DS-BAN-02'],
  Dadar: ['DS-DAD-01', 'DS-DAD-02'],
  Powai: ['DS-POW-01'],
  Thane: ['DS-THA-01', 'DS-THA-02'],
  'T. Nagar': ['DS-TNG-01', 'DS-TNG-02'],
  Adyar: ['DS-ADY-01'],
  'Anna Nagar': ['DS-ANN-01', 'DS-ANN-02'],
  Velachery: ['DS-VEL-01'],
  OMR: ['DS-OMR-01', 'DS-OMR-02'],
  'Salt Lake': ['DS-SLK-01', 'DS-SLK-02'],
  'Park Street': ['DS-PKS-01'],
  Howrah: ['DS-HWR-01', 'DS-HWR-02'],
  'Dum Dum': ['DS-DDM-01'],
  Jadavpur: ['DS-JAD-01'],
};

const TOTAL_STEPS = 5;

export default function Register() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [name, setName] = useState('');
  const [platform, setPlatform] = useState('');
  const [city, setCity] = useState('');
  const [zone, setZone] = useState('');
  const [darkStore, setDarkStore] = useState('');
  const [weeklyDeliveries, setWeeklyDeliveries] = useState('');

  const canProceed = () => {
    switch (step) {
      case 1: return name.trim().length >= 2;
      case 2: return !!platform;
      case 3: return !!city && !!zone;
      case 4: return !!darkStore;
      case 5: return Number(weeklyDeliveries) > 0;
      default: return false;
    }
  };

  const handleNext = () => {
    if (step < TOTAL_STEPS) setStep(step + 1);
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleSubmit = async () => {
    setError('');
    setLoading(true);
    try {
      await worker.register({
        name: name.trim(),
        mobile: '', // already authed
        platform,
        latitude: 0,
        longitude: 0,
      });
      navigate('/coverage', { replace: true });
    } catch (err: any) {
      setError(err.response?.data?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col px-6 py-8">
      {/* Progress */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-slate-400">
            Step {step} of {TOTAL_STEPS}
          </span>
          <span className="text-xs text-emerald-400 font-medium">
            {Math.round((step / TOTAL_STEPS) * 100)}%
          </span>
        </div>
        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-full transition-all duration-500"
            style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
          />
        </div>
      </div>

      {/* Form area */}
      <div className="flex-1">
        {/* Step 1: Name */}
        {step === 1 && (
          <div className="animate-fadeIn">
            <h2 className="text-xl font-bold text-white mb-1">What's your name?</h2>
            <p className="text-slate-400 text-sm mb-6">
              This will appear on your insurance policy.
            </p>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
              className="w-full bg-white/10 text-white px-4 py-3 rounded-xl text-sm placeholder-slate-500 outline-none focus:ring-2 focus:ring-emerald-400/50 transition"
              autoFocus
            />
          </div>
        )}

        {/* Step 2: Platform */}
        {step === 2 && (
          <div className="animate-fadeIn">
            <h2 className="text-xl font-bold text-white mb-1">
              Which platform do you deliver for?
            </h2>
            <p className="text-slate-400 text-sm mb-6">
              Select your primary delivery platform.
            </p>
            <div className="space-y-3">
              {PLATFORMS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPlatform(p.id)}
                  className={`w-full flex items-center gap-4 p-4 rounded-2xl border transition-all ${
                    platform === p.id
                      ? 'bg-white/10 border-emerald-400/50 ring-1 ring-emerald-400/30'
                      : 'bg-white/5 border-white/10 hover:bg-white/[0.07]'
                  }`}
                >
                  <div
                    className={`w-12 h-12 rounded-xl bg-gradient-to-br ${p.color} flex items-center justify-center text-white font-bold text-lg`}
                  >
                    {p.name[0]}
                  </div>
                  <span className="text-white font-medium text-sm">{p.name}</span>
                  {platform === p.id && (
                    <span className="ml-auto text-emerald-400 text-lg">
                      &#10003;
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: City & Zone */}
        {step === 3 && (
          <div className="animate-fadeIn">
            <h2 className="text-xl font-bold text-white mb-1">
              Where do you deliver?
            </h2>
            <p className="text-slate-400 text-sm mb-6">
              Select your city and zone for weather coverage.
            </p>

            <label className="text-xs text-slate-400 mb-1.5 block">City</label>
            <div className="flex gap-2 mb-5">
              {Object.keys(CITIES).map((c) => (
                <button
                  key={c}
                  onClick={() => { setCity(c); setZone(''); setDarkStore(''); }}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    city === c
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-400/40'
                      : 'bg-white/5 text-slate-400 border border-white/10'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>

            {city && (
              <>
                <label className="text-xs text-slate-400 mb-1.5 block">Zone</label>
                <select
                  value={zone}
                  onChange={(e) => { setZone(e.target.value); setDarkStore(''); }}
                  className="w-full bg-white/10 text-white px-4 py-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-400/50 appearance-none"
                >
                  <option value="" className="bg-slate-800">Select a zone</option>
                  {CITIES[city].zones.map((z) => (
                    <option key={z} value={z} className="bg-slate-800">
                      {z}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>
        )}

        {/* Step 4: Dark Store */}
        {step === 4 && (
          <div className="animate-fadeIn">
            <h2 className="text-xl font-bold text-white mb-1">
              Select your dark store
            </h2>
            <p className="text-slate-400 text-sm mb-6">
              Dark stores in {zone}, {city}.
            </p>
            <div className="space-y-2">
              {(DARK_STORES[zone] || []).map((ds) => (
                <button
                  key={ds}
                  onClick={() => setDarkStore(ds)}
                  className={`w-full flex items-center gap-3 p-4 rounded-xl border transition-all ${
                    darkStore === ds
                      ? 'bg-white/10 border-emerald-400/50 ring-1 ring-emerald-400/30'
                      : 'bg-white/5 border-white/10 hover:bg-white/[0.07]'
                  }`}
                >
                  <div className="w-10 h-10 rounded-lg bg-slate-700 flex items-center justify-center text-emerald-400 text-xs font-mono">
                    {ds.split('-').slice(-1)[0]}
                  </div>
                  <span className="text-white text-sm font-medium">{ds}</span>
                  {darkStore === ds && (
                    <span className="ml-auto text-emerald-400 text-lg">
                      &#10003;
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 5: Weekly Deliveries */}
        {step === 5 && (
          <div className="animate-fadeIn">
            <h2 className="text-xl font-bold text-white mb-1">
              Weekly deliveries
            </h2>
            <p className="text-slate-400 text-sm mb-6">
              Average number of deliveries per week. This helps calculate your risk
              and premium.
            </p>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={weeklyDeliveries}
              onChange={(e) => setWeeklyDeliveries(e.target.value)}
              placeholder="e.g. 120"
              className="w-full bg-white/10 text-white px-4 py-3 rounded-xl text-sm placeholder-slate-500 outline-none focus:ring-2 focus:ring-emerald-400/50 transition"
              autoFocus
            />
            {Number(weeklyDeliveries) > 0 && (
              <p className="mt-3 text-xs text-slate-500">
                ~{Math.round(Number(weeklyDeliveries) / 7)} deliveries per day
              </p>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <p className="mt-4 text-red-400 text-xs text-center">{error}</p>
        )}
      </div>

      {/* Navigation */}
      <div className="flex gap-3 pt-6">
        {step > 1 && (
          <button
            onClick={handleBack}
            className="flex-1 py-3 rounded-xl bg-white/10 text-white font-medium text-sm active:scale-[0.98] transition-transform"
          >
            Back
          </button>
        )}
        {step < TOTAL_STEPS ? (
          <button
            onClick={handleNext}
            disabled={!canProceed()}
            className="flex-1 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-white font-semibold text-sm shadow-lg shadow-emerald-500/25 disabled:opacity-40 active:scale-[0.98] transition-transform"
          >
            Continue
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!canProceed() || loading}
            className="flex-1 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-white font-semibold text-sm shadow-lg shadow-emerald-500/25 disabled:opacity-40 active:scale-[0.98] transition-transform"
          >
            {loading ? 'Submitting...' : 'Complete Registration'}
          </button>
        )}
      </div>
    </div>
  );
}
