// GigShield Prototype v2 — Enhanced
const state = {
  screen: 'splash',
  theme: localStorage.getItem('theme') || 'light',
  user: null,
  policy: null,
  claims: [],
  location: null,
  weather: { temp: 32, rainfall: 0, aqi: 156, humidity: 65, wind: 12 },
  selectedCity: null,
  selectedZone: null,
  selectedStore: null,
  detectedCity: null,
  riderProfile: null,
  riderRecords: []
};

const $ = id => document.getElementById(id);
const render = html => { document.getElementById('app').innerHTML = html; window.scrollTo(0,0); };
const wait = ms => new Promise(r => setTimeout(r, ms));

function applyTheme() {
  document.body.className = state.theme === 'light' ? 'light' : '';
  localStorage.setItem('theme', state.theme);
}

function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  applyTheme();
  if (state.user && state.policy) renderDashboard();
}

function getMapTile() {
  return state.theme === 'light'
    ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
}

function icon(name, cls = '') { return `<i class="ri-${name} ${cls}"></i>`; }

function calculateRiskScore(zone) {
  for (const city of Object.values(cityData)) {
    if (city.zones[zone]) return Math.min(100, Math.round(city.zones[zone].risk * 1.2));
  }
  return 50;
}

function getRiskTier(score) {
  if (score <= 25) return { tier: 'Low', color: '#10b981', bg: 'bg-emerald-500' };
  if (score <= 50) return { tier: 'Medium', color: '#eab308', bg: 'bg-yellow-500' };
  if (score <= 75) return { tier: 'High', color: '#f97316', bg: 'bg-orange-500' };
  return { tier: 'Critical', color: '#ef4444', bg: 'bg-red-500' };
}

function calculatePremium(riskScore, coverage) {
  const base = 50;
  const rf = 0.5 + (riskScore / 100) * 2;
  const cm = { basic: 0.7, standard: 1.0, premium: 1.4 }[coverage];
  return Math.max(29, Math.min(199, Math.round(base * rf * cm)));
}

function themeToggleBtn(extraClass = '') {
  return `<button onclick="toggleTheme()" class="w-10 h-10 glass rounded-full flex items-center justify-center text-lg ${extraClass}">
    ${state.theme === 'dark' ? icon('sun-line', 'text-yellow-400') : icon('moon-line', 'text-indigo-500')}
  </button>`;
}


// IP-based location detection
async function detectLocation() {
  try {
    const res = await fetch('https://ipapi.co/json/');
    const data = await res.json();
    const cityName = (data.city || '').toLowerCase();
    if (cityName.includes('chennai') || cityName.includes('madras')) {
      state.detectedCity = 'chennai';
      state.location = { lat: data.latitude, lng: data.longitude };
    } else if (cityName.includes('mumbai') || cityName.includes('bombay')) {
      state.detectedCity = 'mumbai';
      state.location = { lat: data.latitude, lng: data.longitude };
    } else if (cityName.includes('kolkata') || cityName.includes('calcutta')) {
      state.detectedCity = 'kolkata';
      state.location = { lat: data.latitude, lng: data.longitude };
    } else {
      // Default: try to match or fallback
      state.detectedCity = null;
      state.location = { lat: data.latitude || 19.076, lng: data.longitude || 72.877 };
    }
    return data;
  } catch {
    state.location = { lat: 19.076, lng: 72.877 };
    return null;
  }
}

// Splash
function renderSplash() {
  applyTheme();
  render(`
    <div class="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden bg-p">
      <div class="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl"></div>
      <div class="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl"></div>
      <div class="relative z-10 text-center">
        <div class="relative mb-8">
          <div class="absolute inset-0 bg-blue-500/30 rounded-full blur-2xl pulse-ring"></div>
          <div class="relative w-28 h-28 rounded-3xl flex items-center justify-center glow float mx-auto">
            <img src="logos/gigshield.png" alt="GigShield" class="w-28 h-28 rounded-3xl object-contain">
          </div>
        </div>
        <h1 class="text-4xl font-extrabold text-p mb-2">GigShield</h1>
        <p class="text-s mb-8">AI-Powered Income Protection</p>
        <div class="w-48 h-1.5 bg-s rounded-full overflow-hidden mx-auto">
          <div class="h-full progress-bar rounded-full" style="width:70%"></div>
        </div>
        <p class="text-m text-sm mt-6">Detecting your location...</p>
      </div>
    </div>
  `);
  detectLocation().then(() => { setTimeout(renderWelcome, 1500); });
}

// Welcome
function renderWelcome() {
  render(`
    <div class="min-h-screen flex flex-col p-6 relative overflow-hidden bg-p">
      <div class="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl"></div>
      <div class="flex justify-end mb-4">${themeToggleBtn()}</div>
      <div class="flex-1 flex flex-col justify-center slide-up">
        <div class="w-20 h-20 rounded-2xl flex items-center justify-center mb-8 glow">
          <img src="logos/gigshield.png" alt="GigShield" class="w-20 h-20 rounded-2xl object-contain">
        </div>
        <h1 class="text-3xl font-extrabold text-p mb-3">Protect Your<br/><span class="text-gradient">Income</span></h1>
        <p class="text-s mb-8 leading-relaxed">Automatic payouts when disruptions stop your deliveries. No paperwork. No waiting.</p>
        <div class="space-y-3 mb-8">
          ${[
            ['cloud-line text-blue-400', 'Heavy rain? Get paid instantly'],
            ['fire-line text-orange-400', 'Extreme heat? Covered'],
            ['forbid-line text-red-400', 'Curfew? We got you']
          ].map(([ic, text]) => `
            <div class="flex items-center gap-4 glass rounded-xl p-4">
              <span class="text-2xl">${icon(ic)}</span>
              <span class="text-p">${text}</span>
            </div>
          `).join('')}
        </div>
        <div class="glass rounded-2xl p-4">
          <div class="flex items-center gap-3">
            <div class="w-12 h-12 bg-emerald-500/20 rounded-xl flex items-center justify-center">
              ${icon('money-rupee-circle-line', 'text-emerald-400 text-2xl')}
            </div>
            <div>
              <p class="text-p font-semibold">Starting at just ₹29/week</p>
              <p class="text-s text-sm">Less than the cost of one delivery</p>
            </div>
          </div>
        </div>
      </div>
      <div class="space-y-3 mt-6">
        <button onclick="renderRegister()" class="w-full btn-primary text-white font-semibold py-4 rounded-2xl flex items-center justify-center gap-2">
          Get Started ${icon('arrow-right-line')}
        </button>
        <button onclick="quickLogin()" class="w-full glass text-p font-medium py-4 rounded-2xl">
          Already have an account? Login
        </button>
      </div>
    </div>
  `);
}


// Registration — Minimal: Platform + Mobile only
function renderRegister() {
  render(`
    <div class="min-h-screen bg-p p-6">
      <div class="flex justify-between items-center mb-6">
        <button onclick="renderWelcome()" class="text-s flex items-center gap-1">${icon('arrow-left-s-line')} Back</button>
        ${themeToggleBtn()}
      </div>
      <h1 class="text-2xl font-bold text-p mb-1">Get Started</h1>
      <p class="text-s mb-6">Step 1 of 6 — Verify Your Identity</p>
      <div class="flex gap-2 mb-8">${[1,2,3,4,5,6].map(i => `<div class="h-1.5 flex-1 rounded-full ${i===1?'gradient-primary':'bg-s'}"></div>`).join('')}</div>
      
      <form onsubmit="handleRegStep1(event)" class="space-y-5">
        <div>
          <label class="block text-sm font-medium text-s mb-2">${icon('building-line')} Select Your Platform</label>
          <div class="grid grid-cols-3 gap-3" id="platformPicker">
            ${[
              { id:'blinkit', name:'Blinkit', logo:'logos/blinkit.png', color:'#eab308' },
              { id:'zepto', name:'Zepto', logo:'logos/zepto.png', color:'#a855f7' },
              { id:'instamart', name:'Instamart', logo:'logos/instamart.png', color:'#f97316' }
            ].map(p => `
              <div onclick="selectPlatform('${p.id}')" class="platform-card p-3 glass rounded-xl text-center card-hover cursor-pointer border-2 border-transparent" data-platform="${p.id}" data-color="${p.color}">
                <img src="${p.logo}" alt="${p.name}" class="w-10 h-10 rounded-lg mx-auto object-contain">
                <p class="text-p font-medium mt-2 text-xs">${p.name}</p>
              </div>
            `).join('')}
          </div>
          <input type="hidden" name="platform" id="platformInput" value="blinkit">
        </div>
        <div>
          <label class="block text-sm font-medium text-s mb-2">${icon('phone-line')} Registered Mobile Number</label>
          <div class="flex">
            <span class="px-4 py-4 glass rounded-l-xl text-s border-r-0 flex items-center">+91</span>
            <input type="tel" id="mobile" required pattern="[0-9]{10}" class="flex-1 px-4 py-4 input-style rounded-r-xl" placeholder="10-digit number">
          </div>
          <p class="text-m text-xs mt-2">${icon('information-line')} Enter the mobile linked to your platform account</p>
        </div>
        <button type="submit" class="w-full btn-primary text-white font-semibold py-4 rounded-xl flex items-center justify-center gap-2">
          Verify & Continue ${icon('arrow-right-line')}
        </button>
      </form>
    </div>
  `);
  setTimeout(()=>selectPlatform('blinkit'),50);
}

function selectPlatform(id) {
  $('platformInput').value = id;
  document.querySelectorAll('.platform-card').forEach(c => {
    if (c.dataset.platform === id) {
      c.style.borderColor = c.dataset.color;
      c.style.background = c.dataset.color + '18';
    } else {
      c.style.borderColor = 'transparent';
      c.style.background = '';
    }
  });
}

// Resolve city name from CSV to cityData key
function resolveCityKey(csvCity) {
  if (!csvCity) return null;
  const lower = csvCity.toLowerCase().trim();
  for (const [key, val] of Object.entries(cityData)) {
    if (val.name.toLowerCase() === lower || key === lower) return key;
  }
  return null;
}

// Find store object from cityData by store_id
function findStoreById(cityKey, zone, storeId) {
  const zoneData = cityData[cityKey]?.zones[zone];
  if (!zoneData) return null;
  return zoneData.stores.find(s => s.id === storeId) || null;
}

function handleRegStep1(e) {
  e.preventDefault();
  const platform = $('platformInput').value;
  const mobile = $('mobile').value;
  state.user = { mobile, platform };
  renderOTP();
}


// OTP Verification
function renderOTP() {
  render(`
    <div class="min-h-screen bg-p p-6">
      <div class="flex justify-between items-center mb-6">
        <button onclick="renderRegister()" class="text-s flex items-center gap-1">${icon('arrow-left-s-line')} Back</button>
        ${themeToggleBtn()}
      </div>
      <h1 class="text-2xl font-bold text-p mb-1">Verify Mobile</h1>
      <p class="text-s mb-6">Step 2 of 6 — OTP Verification</p>
      <div class="flex gap-2 mb-8">${[1,2,3,4,5,6].map(i=>`<div class="h-1.5 flex-1 rounded-full ${i<=2?'gradient-primary':'bg-s'}"></div>`).join('')}</div>
      <div class="slide-up">
        <div class="glass rounded-2xl p-6 mb-6 text-center">
          <div class="w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            ${icon('message-2-line', 'text-blue-400 text-3xl')}
          </div>
          <p class="text-p font-medium mb-1">OTP sent to</p>
          <p class="text-gradient font-bold text-lg">+91 ${state.user.mobile}</p>
        </div>
        <div class="flex gap-3 justify-center mb-8" id="otpBoxes">
          ${[0,1,2,3].map(i=>`<input type="text" maxlength="1" class="w-14 h-14 text-center text-2xl font-bold input-style rounded-xl" id="otp${i}" oninput="otpNext(${i})" onkeydown="otpBack(event,${i})">`).join('')}
        </div>
        <button onclick="verifyOTP()" class="w-full btn-primary text-white font-semibold py-4 rounded-xl mb-4">Verify ${icon('check-line')}</button>
        <p class="text-center text-s text-sm">Didn't receive? <button onclick="resendOTP()" class="text-blue-400 font-medium">Resend OTP</button></p>
      </div>
    </div>
  `);
  setTimeout(()=>$('otp0')?.focus(),100);
}

function otpNext(i){if($('otp'+i).value&&i<3)$('otp'+(i+1)).focus();}
function otpBack(e,i){if(e.key==='Backspace'&&!$('otp'+i).value&&i>0)$('otp'+(i-1)).focus();}
function resendOTP(){document.querySelector('.text-s.text-sm').innerHTML='OTP resent! '+icon('check-line','text-emerald-400');}

async function verifyOTP(){
  const code=[0,1,2,3].map(i=>$('otp'+i).value).join('');
  if(code.length<4){alert('Enter 4-digit OTP');return;}
  render(`<div class="min-h-screen bg-p flex items-center justify-center"><div class="text-center slide-up"><div class="w-20 h-20 gradient-success rounded-full flex items-center justify-center mx-auto mb-4 glow-success">${icon('check-line','text-white text-4xl')}</div><p class="text-p font-bold text-xl">Verified!</p></div></div>`);
  await wait(800);
  fetchRiderData();
}

// Fetch rider data from CSV after OTP verification
async function fetchRiderData() {
  const platform = state.user.platform;
  const mobile = state.user.mobile;

  render(`<div class="min-h-screen bg-p flex items-center justify-center"><div class="text-center slide-up"><div class="w-16 h-16 gradient-primary rounded-full flex items-center justify-center mx-auto mb-4 glow">${icon('loader-4-line','text-white text-3xl animate-spin')}</div><p class="text-p font-bold">Fetching your details...</p><p class="text-s text-sm mt-2">Connecting to ${platform.charAt(0).toUpperCase()+platform.slice(1)} API</p></div></div>`);

  const records = await RiderAPI.findRider(platform, mobile);

  if (records.length === 0) {
    // Rider not found — show error
    render(`
      <div class="min-h-screen bg-p flex items-center justify-center p-6">
        <div class="text-center slide-up">
          <div class="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            ${icon('error-warning-line','text-red-400 text-4xl')}
          </div>
          <h2 class="text-p font-bold text-xl mb-2">Rider Not Found</h2>
          <p class="text-s mb-2">No records found for +91 ${mobile} on ${platform.charAt(0).toUpperCase()+platform.slice(1)}</p>
          <p class="text-m text-sm mb-6">Please check your mobile number and platform selection</p>
          <button onclick="renderRegister()" class="w-full btn-primary text-white font-semibold py-4 rounded-xl flex items-center justify-center gap-2">
            ${icon('arrow-left-s-line')} Try Again
          </button>
        </div>
      </div>
    `);
    return;
  }

  const profile = RiderAPI.computeRiderProfile(records);
  state.riderProfile = profile;
  state.riderRecords = records;

  // Resolve city key from CSV city name
  const cityKey = resolveCityKey(profile.city);
  const zone = profile.zone;
  const store = findStoreById(cityKey, zone, profile.store_id);
  const zoneData = cityData[cityKey]?.zones[zone];

  state.selectedCity = cityKey;
  state.selectedZone = zone;
  state.selectedStore = store;
  state.location = { lat: zoneData?.lat || 19.076, lng: zoneData?.lng || 72.877, zone };

  const zoneRisk = zoneData?.risk || 50;
  const riskScore = InsuranceEngine.computeRiskScore(profile, zoneRisk);

  state.user = {
    name: profile.name,
    mobile,
    platform,
    city: cityData[cityKey]?.name || profile.city,
    zone,
    store: store?.name || profile.store_id,
    storeId: profile.store_id,
    deliveries: profile.avgDeliveriesPerDay,
    riskScore,
    aadhaar: profile.aadhaar,
    avgDailyEarning: profile.avgDailyEarning,
    avgDeliveriesPerDay: profile.avgDeliveriesPerDay,
    disruptionRate: profile.disruptionRate,
    platformRating: profile.latestRating
  };

  // Show fetched profile summary briefly
  render(`
    <div class="min-h-screen bg-p flex items-center justify-center p-6">
      <div class="text-center slide-up">
        <div class="w-20 h-20 gradient-success rounded-full flex items-center justify-center mx-auto mb-4 glow-success">
          ${icon('user-follow-line','text-white text-4xl')}
        </div>
        <h2 class="text-p font-bold text-xl mb-1">Welcome, ${profile.name}</h2>
        <p class="text-s mb-4">${platform.charAt(0).toUpperCase()+platform.slice(1)} · ${profile.city} · ${zone}</p>
        <div class="glass rounded-2xl p-4 text-left space-y-2 mb-4">
          ${[
            ['e-bike-line','Avg Deliveries',profile.avgDeliveriesPerDay+'/day'],
            ['money-rupee-circle-line','Avg Earning','₹'+profile.avgDailyEarning+'/day'],
            ['star-line','Rating',profile.latestRating+'★'],
            ['calendar-line','Active',profile.monthsActive+' months']
          ].map(([ic,label,val])=>`
            <div class="flex justify-between items-center">
              <span class="text-s flex items-center gap-2 text-sm">${icon(ic)} ${label}</span>
              <span class="text-p font-semibold text-sm">${val}</span>
            </div>`).join('')}
        </div>
        <p class="text-m text-xs">Proceeding to KYC verification...</p>
      </div>
    </div>
  `);
  await wait(1800);
  renderAadhaarKYC();
}

// Aadhaar KYC + Face Scan
function renderAadhaarKYC() {
  const prefillAadhaar = state.user.aadhaar || '';
  const formatted = prefillAadhaar.replace(/(\d{4})(?=\d)/g, '$1 ');
  render(`
    <div class="min-h-screen bg-p p-6">
      <div class="flex justify-between items-center mb-6">
        <button onclick="renderOTP()" class="text-s flex items-center gap-1">${icon('arrow-left-s-line')} Back</button>
        ${themeToggleBtn()}
      </div>
      <h1 class="text-2xl font-bold text-p mb-1">KYC Verification</h1>
      <p class="text-s mb-6">Step 3 of 6 — Aadhaar Verification</p>
      <div class="flex gap-2 mb-8">${[1,2,3,4,5,6].map(i=>`<div class="h-1.5 flex-1 rounded-full ${i<=3?'gradient-primary':'bg-s'}"></div>`).join('')}</div>
      <div class="slide-up" id="aadhaarForm">
        <div class="glass rounded-2xl p-6 mb-6">
          <div class="flex items-center gap-3 mb-4">
            <div class="w-12 h-12 bg-orange-500/20 rounded-xl flex items-center justify-center">
              ${icon('bank-card-line', 'text-orange-400 text-2xl')}
            </div>
            <div>
              <p class="text-p font-semibold">Aadhaar Verification</p>
              <p class="text-s text-sm">UIDAI-linked identity check</p>
            </div>
          </div>
          <label class="block text-sm font-medium text-s mb-2">Aadhaar Number</label>
          <input type="text" id="aadhaar" maxlength="14" class="w-full px-4 py-4 input-style rounded-xl tracking-widest text-lg" placeholder="XXXX XXXX XXXX" value="${formatted}" oninput="formatAadhaar(this)">
          ${prefillAadhaar ? `<p class="text-emerald-400 text-xs mt-2">${icon('checkbox-circle-fill')} Auto-filled from platform records</p>` : `<p class="text-m text-xs mt-2">${icon('lock-line')} Encrypted & stored securely</p>`}
        </div>
        <button onclick="sendAadhaarOTP()" id="aadhaarOtpBtn" class="w-full btn-primary text-white font-semibold py-4 rounded-xl flex items-center justify-center gap-2">
          ${icon('message-2-line')} Send OTP to Aadhaar Mobile
        </button>
      </div>
    </div>
  `);
}

function formatAadhaar(el){
  let v=el.value.replace(/\D/g,'').slice(0,12);
  el.value=v.replace(/(\d{4})(?=\d)/g,'$1 ');
}

async function sendAadhaarOTP(){
  const aadhaar=$('aadhaar').value.replace(/\s/g,'');
  if(aadhaar.length!==12){alert('Enter valid 12-digit Aadhaar');return;}
  state.user.aadhaar=aadhaar;

  // Show OTP screen for Aadhaar-linked mobile
  $('aadhaarForm').innerHTML=`
    <div class="slide-up">
      <div class="glass rounded-2xl p-6 mb-6 text-center">
        <div class="w-16 h-16 bg-orange-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
          ${icon('message-2-line', 'text-orange-400 text-3xl')}
        </div>
        <p class="text-p font-medium mb-1">OTP sent to Aadhaar-linked mobile</p>
        <p class="text-gradient font-bold text-lg">****${aadhaar.slice(-4)}</p>
        <p class="text-m text-xs mt-2">6-digit OTP sent via UIDAI</p>
      </div>
      <div class="flex gap-2 justify-center mb-8" id="aadhaarOtpBoxes">
        ${[0,1,2,3,4,5].map(i=>`<input type="text" maxlength="1" class="w-11 h-12 text-center text-xl font-bold input-style rounded-xl" id="aotp${i}" oninput="aotpNext(${i})" onkeydown="aotpBack(event,${i})">`).join('')}
      </div>
      <button onclick="verifyAadhaarOTP()" class="w-full btn-primary text-white font-semibold py-4 rounded-xl mb-4">Verify Aadhaar OTP ${icon('check-line')}</button>
      <p class="text-center text-s text-sm">Didn't receive? <button onclick="resendAadhaarOTP()" class="text-blue-400 font-medium">Resend OTP</button></p>
    </div>`;
  setTimeout(()=>$('aotp0')?.focus(),100);
}

function aotpNext(i){if($('aotp'+i).value&&i<5)$('aotp'+(i+1)).focus();}
function aotpBack(e,i){if(e.key==='Backspace'&&!$('aotp'+i).value&&i>0)$('aotp'+(i-1)).focus();}
function resendAadhaarOTP(){document.querySelector('.text-s.text-sm').innerHTML='OTP resent via UIDAI! '+icon('check-line','text-emerald-400');}

async function verifyAadhaarOTP(){
  const code=[0,1,2,3,4,5].map(i=>$('aotp'+i).value).join('');
  if(code.length<6){alert('Enter 6-digit OTP');return;}

  // Show success then proceed to face scan
  render(`<div class="min-h-screen bg-p flex items-center justify-center"><div class="text-center slide-up"><div class="w-20 h-20 gradient-success rounded-full flex items-center justify-center mx-auto mb-4 glow-success">${icon('check-line','text-white text-4xl')}</div><p class="text-p font-bold text-xl">Aadhaar Verified!</p><p class="text-s text-sm mt-2">Proceeding to face scan...</p></div></div>`);
  await wait(1200);
  renderFaceScan();
}

function renderFaceScan(){
  const aadhaar = state.user.aadhaar;
  render(`
    <div class="min-h-screen bg-p p-6">
      <div class="flex justify-between items-center mb-6">
        <span class="text-s">${icon('camera-line')} Face Verification</span>
        ${themeToggleBtn()}
      </div>
      <h1 class="text-2xl font-bold text-p mb-1">Face Scan</h1>
      <p class="text-s mb-6">Matching with system records</p>
      <div class="slide-up" id="faceScanArea">
        <div class="text-center">
          <div class="relative w-56 h-72 mx-auto mb-6 rounded-3xl overflow-hidden" style="background:linear-gradient(135deg,#1e293b,#0f172a)">
            <div class="face-oval absolute inset-8"></div>
            <div class="scan-line absolute left-0 right-0 h-1" style="top:10%"></div>
            <div class="absolute inset-0 flex items-center justify-center">
              ${icon('user-face-line', 'text-blue-400/40 text-7xl')}
            </div>
            <div class="absolute bottom-4 left-0 right-0 text-center">
              <p class="text-blue-400 text-sm font-medium status-pulse" id="scanStatus">Scanning face...</p>
            </div>
          </div>
          <p class="text-s text-sm">Hold your face within the oval</p>
        </div>
      </div>
    </div>
  `);
  runFaceScan(aadhaar);
}

async function runFaceScan(aadhaar){
  await wait(2000);
  if($('scanStatus'))$('scanStatus').textContent='Matching with system records...';
  await wait(1500);
  if($('scanStatus'))$('scanStatus').textContent='Verifying liveness...';
  await wait(1000);
  render(`<div class="min-h-screen bg-p flex items-center justify-center"><div class="text-center slide-up"><div class="w-20 h-20 gradient-success rounded-full flex items-center justify-center mx-auto mb-4 glow-success">${icon('check-double-line','text-white text-4xl')}</div><p class="text-p font-bold text-xl mb-2">KYC Complete</p><p class="text-s">Face matched with our system records</p><p class="text-m text-sm mt-1">Aadhaar: ****${aadhaar.slice(-4)}</p></div></div>`);
  await wait(1200);
  renderLocationMap();
}


// Location Map Confirmation
function renderLocationMap() {
  const loc = state.location;
  render(`
    <div class="min-h-screen bg-p p-6">
      <div class="flex justify-between items-center mb-6">
        <span class="text-s">${icon('map-pin-line')} Confirm Location</span>
        ${themeToggleBtn()}
      </div>
      <h1 class="text-2xl font-bold text-p mb-1">Your Zone</h1>
      <p class="text-s mb-6">Step 4 of 6 — Location Confirmation</p>
      <div class="flex gap-2 mb-6">${[1,2,3,4,5,6].map(i=>`<div class="h-1.5 flex-1 rounded-full ${i<=4?'gradient-primary':'bg-s'}"></div>`).join('')}</div>
      <div class="slide-up">
        <div id="locationMap" class="w-full h-56 rounded-2xl mb-6 overflow-hidden"></div>
        <div class="glass rounded-2xl p-5 mb-6">
          <div class="flex items-center gap-3 mb-3">
            ${icon('map-pin-2-fill', 'text-blue-400 text-xl')}
            <div>
              <p class="text-p font-semibold">${state.user.zone}</p>
              <p class="text-s text-sm">${state.user.city} — ${state.user.store}</p>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3 mt-4">
            <div class="bg-s rounded-xl p-3 text-center">
              <p class="text-m text-xs">Risk Level</p>
              <p class="text-p font-bold">${getRiskTier(state.user.riskScore).tier}</p>
            </div>
            <div class="bg-s rounded-xl p-3 text-center">
              <p class="text-m text-xs">Flood Zone</p>
              <p class="text-p font-bold">${state.user.riskScore>60?'Yes':'No'}</p>
            </div>
          </div>
        </div>
        <button onclick="renderExclusions()" class="w-full btn-primary text-white font-semibold py-4 rounded-xl">Confirm Location ${icon('arrow-right-line')}</button>
      </div>
    </div>
  `);
  setTimeout(()=>{
    const m=L.map('locationMap').setView([loc.lat,loc.lng],14);
    L.tileLayer(getMapTile(),{maxZoom:18}).addTo(m);
    L.circle([loc.lat,loc.lng],{radius:500,color:'#3b82f6',fillColor:'#3b82f6',fillOpacity:0.15}).addTo(m);
    L.marker([loc.lat,loc.lng]).addTo(m);
    if(state.selectedStore){
      L.marker([state.selectedStore.lat,state.selectedStore.lng],{opacity:0.8}).addTo(m).bindPopup(state.selectedStore.name);
    }
  },100);
}

// Exclusions
function renderExclusions() {
  render(`
    <div class="min-h-screen bg-p p-6">
      <div class="flex justify-between items-center mb-6">
        <button onclick="renderLocationMap()" class="text-s flex items-center gap-1">${icon('arrow-left-s-line')} Back</button>
        ${themeToggleBtn()}
      </div>
      <h1 class="text-2xl font-bold text-p mb-1">Coverage Terms</h1>
      <p class="text-s mb-6">Step 5 of 6 — What's Covered</p>
      <div class="flex gap-2 mb-8">${[1,2,3,4,5,6].map(i=>`<div class="h-1.5 flex-1 rounded-full ${i<=5?'gradient-primary':'bg-s'}"></div>`).join('')}</div>
      <div class="slide-up">
        <div class="glass rounded-2xl p-5 mb-4">
          <h3 class="text-p font-semibold mb-3 flex items-center gap-2">${icon('check-double-line','text-emerald-400')} Covered</h3>
          ${['Heavy Rainfall (>50mm/hr)','Extreme Heat (>42°C)','Flooding (sensor-verified)','Air Quality Crisis (AQI >300)','Civil Unrest / Bandh (govt-declared)'].map(t=>`
            <div class="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
              ${icon('checkbox-circle-fill','text-emerald-400')}<span class="text-p text-sm">${t}</span>
            </div>`).join('')}
        </div>
        <div class="glass rounded-2xl p-5 mb-4">
          <h3 class="text-p font-semibold mb-3 flex items-center gap-2">${icon('close-circle-line','text-red-400')} Not Covered</h3>
          ${['Health / medical expenses','Life insurance','Accident / injury','Vehicle repair / damage','Personal disputes or voluntary absence'].map(t=>`
            <div class="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
              ${icon('close-line','text-red-400')}<span class="text-s text-sm">${t}</span>
            </div>`).join('')}
        </div>
        <label class="flex items-start gap-3 glass rounded-2xl p-4 mb-6 cursor-pointer">
          <input type="checkbox" id="acceptTerms" class="mt-1 w-5 h-5 accent-blue-500">
          <span class="text-s text-sm">I understand GigShield covers <strong class="text-p">income loss only</strong> from verified environmental disruptions. This is not health, life, or accident insurance.</span>
        </label>
        <button onclick="acceptExclusions()" class="w-full btn-primary text-white font-semibold py-4 rounded-xl">Accept & Continue ${icon('arrow-right-line')}</button>
      </div>
    </div>
  `);
}

function acceptExclusions(){
  if(!$('acceptTerms').checked){alert('Please accept the terms to continue');return;}
  renderRiskProfile();
}

// Risk Profile
function renderRiskProfile() {
  const score = state.user.riskScore;
  const tier = getRiskTier(score);
  const angle = -90 + (score / 100) * 180;
  render(`
    <div class="min-h-screen bg-p p-6">
      <div class="flex justify-between items-center mb-6">
        <span class="text-s">${icon('bar-chart-box-line')} Risk Assessment</span>
        ${themeToggleBtn()}
      </div>
      <h1 class="text-2xl font-bold text-p mb-1">Your Risk Profile</h1>
      <p class="text-s mb-6">Step 6 of 6 — AI-Powered Analysis</p>
      <div class="flex gap-2 mb-8">${[1,2,3,4,5,6].map(i=>`<div class="h-1.5 flex-1 rounded-full gradient-primary"></div>`).join('')}</div>
      <div class="slide-up">
        <div class="glass rounded-2xl p-6 mb-6 text-center">
          <div class="relative w-48 h-24 mx-auto mb-4 overflow-hidden">
            <div class="absolute bottom-0 left-0 right-0 h-48 w-48 mx-auto risk-meter rounded-full" style="clip-path:polygon(0 50%,100% 50%,100% 100%,0 100%)"></div>
            <div class="absolute bottom-0 left-1/2 w-1 h-20 bg-white rounded-full origin-bottom" style="transform:translateX(-50%) rotate(${angle}deg);transition:transform 1s cubic-bezier(0.34,1.56,0.64,1)"></div>
            <div class="absolute bottom-0 left-1/2 w-4 h-4 bg-white rounded-full" style="transform:translateX(-50%) translateY(50%)"></div>
          </div>
          <p class="text-4xl font-extrabold text-p">${score}</p>
          <p class="text-sm font-semibold" style="color:${tier.color}">${tier.tier} Risk</p>
        </div>
        <div class="grid grid-cols-2 gap-3 mb-6">
          ${[
            ['cloud-line','Flood Risk',score>60?'High':'Moderate','blue'],
            ['temp-hot-line','Heat Index',score>50?'Elevated':'Normal','orange'],
            ['haze-line','AQI Impact',score>45?'Significant':'Low','purple'],
            ['road-map-line','Zone Density',state.user.deliveries>100?'High':'Medium','emerald']
          ].map(([ic,label,val,col])=>`
            <div class="glass rounded-xl p-4">
              <div class="flex items-center gap-2 mb-2">${icon(ic,'text-'+col+'-400')}<span class="text-s text-xs">${label}</span></div>
              <p class="text-p font-bold">${val}</p>
            </div>`).join('')}
        </div>
        <button onclick="renderCoverage()" class="w-full btn-primary text-white font-semibold py-4 rounded-xl">Choose Coverage ${icon('arrow-right-line')}</button>
      </div>
    </div>
  `);
}


// Coverage Selection
function renderCoverage() {
  const zoneRisk = cityData[state.selectedCity]?.zones[state.selectedZone]?.risk || 50;
  const plans = InsuranceEngine.generatePlans(state.riderProfile, zoneRisk);
  const icons = { basic:'shield-line', standard:'shield-check-line', premium:'shield-star-line' };
  const colors = { basic:'blue', standard:'purple', premium:'amber' };
  const p0 = plans[0]; // grab shared stats from first plan

  render(`
    <div class="min-h-screen bg-p p-6">
      <div class="flex justify-between items-center mb-6">
        <button onclick="renderRiskProfile()" class="text-s flex items-center gap-1">${icon('arrow-left-s-line')} Back</button>
        ${themeToggleBtn()}
      </div>
      <h1 class="text-2xl font-bold text-p mb-1">Choose Plan</h1>
      <p class="text-s mb-4">Select your weekly coverage</p>

      <!-- Rider stats card -->
      <div class="glass rounded-2xl p-4 mb-5">
        <p class="text-s text-xs mb-3">${icon('calculator-line')} Your pricing inputs</p>
        <div class="grid grid-cols-3 gap-2 text-center">
          <div class="bg-s rounded-xl p-2">
            <p class="text-m text-xs">Hourly Rate</p>
            <p class="text-p font-bold">₹${p0.hourlyRate}</p>
          </div>
          <div class="bg-s rounded-xl p-2">
            <p class="text-m text-xs">Avg Hours</p>
            <p class="text-p font-bold">${p0.avgHours}/day</p>
          </div>
          <div class="bg-s rounded-xl p-2">
            <p class="text-m text-xs">Risk Factor</p>
            <p class="text-p font-bold">${p0.riskFactor}×</p>
          </div>
        </div>
      </div>

      <div class="space-y-4 slide-up">
        ${plans.map(p=>{
          const col = colors[p.tier];
          const isPopular = p.tier === 'standard';
          return `
          <div onclick="selectPlan('${p.tier}',${p.premium},${p.dailyPayout},${p.maxDays},${p.hourlyRate},${p.coveragePct})" class="glass rounded-2xl p-5 cursor-pointer card-hover relative ${isPopular?'border-2 border-purple-500':''}">
            ${isPopular?'<div class="absolute -top-3 right-4 bg-purple-500 text-white text-xs font-bold px-3 py-1 rounded-full">RECOMMENDED</div>':''}
            <div class="flex items-center justify-between mb-3">
              <div class="flex items-center gap-3">
                <div class="w-12 h-12 bg-${col}-500/20 rounded-xl flex items-center justify-center">
                  ${icon(icons[p.tier],'text-'+col+'-400 text-2xl')}
                </div>
                <div>
                  <p class="text-p font-bold">${p.tier.charAt(0).toUpperCase()+p.tier.slice(1)}</p>
                  <p class="text-s text-sm">₹${p.dailyPayout}/day · up to ${p.maxDays} days</p>
                </div>
              </div>
              <div class="text-right">
                <p class="text-p font-extrabold text-xl">₹${p.premium}</p>
                <p class="text-s text-xs">/week</p>
              </div>
            </div>
            <div class="bg-s rounded-lg p-2 mt-2 space-y-1">
              <p class="text-m text-xs">${icon('money-rupee-circle-line')} Premium: ${p.formula.premium}</p>
              <p class="text-m text-xs">${icon('hand-coin-line')} Payout: ${p.formula.payout}</p>
            </div>
            <div class="flex items-center gap-2 mt-3">
              <div class="flex-1 h-1.5 bg-s rounded-full overflow-hidden"><div class="h-full bg-${col}-500 rounded-full" style="width:${p.coveragePct}%"></div></div>
              <span class="text-m text-xs">${p.coveragePct}% coverage</span>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>
  `);
}

function selectPlan(tier, price, dailyPayout, maxDays, hourlyRate, coveragePct) {
  state.policy = {
    tier, price,
    payout: dailyPayout,
    maxDays,
    hourlyRate,
    coveragePct,
    startDate: new Date().toISOString().split('T')[0],
    status: 'active',
    id: 'GS-' + Date.now().toString(36).toUpperCase()
  };
  purchasePolicy();
}

// Payment Processing
async function purchasePolicy() {
  render(`
    <div class="min-h-screen bg-p flex items-center justify-center">
      <div class="text-center slide-up p-6">
        <div class="w-20 h-20 gradient-primary rounded-full flex items-center justify-center mx-auto mb-6 glow">
          ${icon('bank-card-line', 'text-white text-3xl')}
        </div>
        <p class="text-p font-bold text-xl mb-2">Processing Payment</p>
        <p class="text-s mb-6">₹${state.policy.price}/week via UPI</p>
        <div class="w-48 h-1.5 bg-s rounded-full overflow-hidden mx-auto">
          <div class="h-full progress-bar rounded-full" style="width:0%" id="payBar"></div>
        </div>
        <p class="text-m text-sm mt-4 status-pulse" id="payStatus">Connecting to payment gateway...</p>
      </div>
    </div>
  `);
  await animateProgress('payBar','payStatus',[
    [30,'Verifying UPI...'],
    [60,'Processing ₹'+state.policy.price+'...'],
    [90,'Confirming...'],
    [100,'Done!']
  ]);
  await wait(500);
  renderPaymentSuccess();
}

async function animateProgress(barId,statusId,steps){
  for(const [pct,msg] of steps){
    await wait(600);
    const bar=$(barId);
    const st=$(statusId);
    if(bar)bar.style.width=pct+'%';
    if(st)st.textContent=msg;
  }
}

function renderPaymentSuccess() {
  render(`
    <div class="min-h-screen bg-p flex items-center justify-center p-6">
      <div class="text-center slide-up">
        <div class="relative mb-6">
          <div class="absolute inset-0 bg-emerald-500/30 rounded-full blur-2xl pulse-ring"></div>
          <div class="relative w-24 h-24 gradient-success rounded-full flex items-center justify-center mx-auto glow-success">
            ${icon('check-double-line', 'text-white text-4xl')}
          </div>
        </div>
        <h1 class="text-2xl font-extrabold text-p mb-2">You're Protected!</h1>
        <p class="text-s mb-6">Policy ${state.policy.id} is now active</p>
        <div class="glass rounded-2xl p-5 mb-6 text-left">
          <div class="space-y-3">
            ${[
              ['shield-check-line','Plan',state.policy.tier.charAt(0).toUpperCase()+state.policy.tier.slice(1)],
              ['money-rupee-circle-line','Premium','₹'+state.policy.price+'/week'],
              ['hand-coin-line','Payout','₹'+state.policy.payout+'/day'],
              ['calendar-line','Max Duration',state.policy.maxDays+' days'],
              ['map-pin-line','Zone',state.user.zone]
            ].map(([ic,label,val])=>`
              <div class="flex justify-between items-center">
                <span class="text-s flex items-center gap-2">${icon(ic)} ${label}</span>
                <span class="text-p font-semibold">${val}</span>
              </div>`).join('')}
          </div>
        </div>
        <button onclick="renderDashboard()" class="w-full btn-primary text-white font-semibold py-4 rounded-xl">Go to Dashboard ${icon('arrow-right-line')}</button>
      </div>
    </div>
  `);
}


// Dashboard
function renderDashboard() {
  const tier = getRiskTier(state.user.riskScore);
  const w = state.weather;
  render(`
    <div class="min-h-screen bg-p pb-24">
      <!-- Header -->
      <div class="p-6 pb-0">
        <div class="flex justify-between items-center mb-6">
          <div>
            <p class="text-s text-sm">Good ${new Date().getHours()<12?'morning':new Date().getHours()<17?'afternoon':'evening'},</p>
            <h1 class="text-xl font-bold text-p">${state.user.name.split(' ')[0]} ${icon('verified-badge-fill','text-blue-400')}</h1>
          </div>
          <div class="flex items-center gap-2">
            ${themeToggleBtn()}
            <button onclick="renderProfile()" class="w-10 h-10 gradient-primary rounded-full flex items-center justify-center text-white font-bold">${state.user.name[0]}</button>
          </div>
        </div>
      </div>

      <div class="px-6 space-y-4 slide-up">
        <!-- Policy Card -->
        <div class="gradient-primary rounded-2xl p-5 text-white relative overflow-hidden">
          <div class="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
          <div class="relative">
            <div class="flex justify-between items-start mb-4">
              <div>
                <p class="text-white/70 text-sm">Active Policy</p>
                <p class="font-bold text-lg">${state.policy.id}</p>
              </div>
              <div class="bg-white/20 rounded-full px-3 py-1 text-xs font-bold flex items-center gap-1">
                ${icon('checkbox-circle-fill')} Active
              </div>
            </div>
            <div class="flex justify-between">
              <div><p class="text-white/70 text-xs">Plan</p><p class="font-bold">${state.policy.tier.charAt(0).toUpperCase()+state.policy.tier.slice(1)}</p></div>
              <div><p class="text-white/70 text-xs">Premium</p><p class="font-bold">₹${state.policy.price}/wk</p></div>
              <div><p class="text-white/70 text-xs">Payout</p><p class="font-bold">₹${state.policy.payout}/day</p></div>
            </div>
          </div>
        </div>

        <!-- Weather Strip -->
        <div class="glass rounded-2xl p-4">
          <p class="text-s text-xs mb-3 flex items-center gap-1">${icon('cloud-line')} Live Conditions — ${state.user.zone}</p>
          <div class="grid grid-cols-4 gap-2 text-center">
            ${[
              ['temp-hot-line',w.temp+'°C','Temp','orange'],
              ['rainy-line',w.rainfall+'mm','Rain','blue'],
              ['haze-line','AQI '+w.aqi,'Air','purple'],
              ['windy-line',w.wind+'km/h','Wind','cyan']
            ].map(([ic,val,label,col])=>`
              <div class="bg-s rounded-xl p-2">
                ${icon(ic,'text-'+col+'-400 text-lg')}
                <p class="text-p font-bold text-sm">${val}</p>
                <p class="text-m text-xs">${label}</p>
              </div>`).join('')}
          </div>
        </div>

        <!-- Map Preview -->
        <div class="glass rounded-2xl overflow-hidden">
          <div id="dashboardMap" class="w-full h-36"></div>
          <div class="p-3 flex justify-between items-center">
            <span class="text-s text-sm">${icon('map-pin-2-fill','text-blue-400')} ${state.user.zone}</span>
            <button onclick="renderFullMap()" class="text-blue-400 text-sm font-medium">View Full Map ${icon('arrow-right-s-line')}</button>
          </div>
        </div>

        <!-- Quick Actions -->
        <div class="grid grid-cols-2 gap-3">
          <button onclick="simulateDisruption()" class="glass rounded-2xl p-4 text-left card-hover">
            <div class="w-10 h-10 bg-red-500/20 rounded-xl flex items-center justify-center mb-3">
              ${icon('alarm-warning-line','text-red-400 text-xl')}
            </div>
            <p class="text-p font-semibold text-sm">Simulate</p>
            <p class="text-s text-xs">Test disruption</p>
          </button>
          <button onclick="renderClaims()" class="glass rounded-2xl p-4 text-left card-hover">
            <div class="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center mb-3">
              ${icon('file-list-3-line','text-emerald-400 text-xl')}
            </div>
            <p class="text-p font-semibold text-sm">Claims</p>
            <p class="text-s text-xs">${state.claims.length} total</p>
          </button>
        </div>

        <!-- Earnings -->
        <div class="glass rounded-2xl p-5">
          <p class="text-s text-sm mb-3">${icon('line-chart-line')} Weekly Earnings Impact</p>
          <canvas id="earningsChart" height="120"></canvas>
        </div>
      </div>

      ${renderBottomNav('home')}
    </div>
  `);
  initDashboardMap();
  initEarningsChart();
}

function initDashboardMap(){
  setTimeout(()=>{
    const loc=state.location;
    const m=L.map('dashboardMap',{zoomControl:false,attributionControl:false}).setView([loc.lat,loc.lng],13);
    L.tileLayer(getMapTile(),{maxZoom:18}).addTo(m);
    L.circle([loc.lat,loc.lng],{radius:800,color:'#3b82f6',fillColor:'#3b82f6',fillOpacity:0.1}).addTo(m);
    L.marker([loc.lat,loc.lng]).addTo(m);
  },100);
}

function initEarningsChart(){
  setTimeout(()=>{
    const ctx=$('earningsChart');
    if(!ctx)return;
    const isLight=state.theme==='light';
    new Chart(ctx,{
      type:'line',
      data:{
        labels:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
        datasets:[{
          label:'Earnings ₹',
          data:[850,920,0,0,780,1100,950],
          borderColor:'#3b82f6',
          backgroundColor:'rgba(59,130,246,0.1)',
          fill:true,tension:0.4,pointRadius:4,pointBackgroundColor:'#3b82f6'
        },{
          label:'Insurance ₹',
          data:[0,0,1000,1000,0,0,0],
          borderColor:'#10b981',
          backgroundColor:'rgba(16,185,129,0.1)',
          fill:true,tension:0.4,pointRadius:4,pointBackgroundColor:'#10b981'
        }]
      },
      options:{
        responsive:true,
        plugins:{legend:{labels:{color:isLight?'#475569':'#94a3b8',font:{size:11}}}},
        scales:{
          x:{ticks:{color:isLight?'#475569':'#64748b'},grid:{color:isLight?'rgba(0,0,0,0.05)':'rgba(255,255,255,0.05)'}},
          y:{ticks:{color:isLight?'#475569':'#64748b',callback:v=>'₹'+v},grid:{color:isLight?'rgba(0,0,0,0.05)':'rgba(255,255,255,0.05)'}}
        }
      }
    });
  },200);
}


// Disruption Simulation
async function simulateDisruption() {
  const events = [
    { type:'Heavy Rainfall', icon:'rainy-line', color:'blue', trigger:'Rainfall >50mm/hr detected', value:'72mm/hr', threshold:'50mm/hr' },
    { type:'Extreme Heat', icon:'temp-hot-line', color:'orange', trigger:'Temperature >42°C detected', value:'44°C', threshold:'42°C' },
    { type:'Poor Air Quality', icon:'haze-line', color:'purple', trigger:'AQI >300 detected', value:'342', threshold:'300' },
    { type:'Flooding', icon:'flood-line', color:'cyan', trigger:'Water level >30cm detected', value:'45cm', threshold:'30cm' }
  ];
  const evt = events[Math.floor(Math.random()*events.length)];

  render(`
    <div class="min-h-screen bg-p p-6">
      <div class="flex justify-between items-center mb-6">
        <button onclick="renderDashboard()" class="text-s flex items-center gap-1">${icon('arrow-left-s-line')} Back</button>
        ${themeToggleBtn()}
      </div>
      <div class="slide-up">
        <div class="text-center mb-6">
          <div class="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4 pulse-ring relative">
            <div class="absolute inset-0 bg-red-500/20 rounded-full"></div>
            ${icon('alarm-warning-fill','text-red-400 text-4xl relative z-10')}
          </div>
          <h1 class="text-2xl font-extrabold text-p mb-1">Disruption Detected</h1>
          <p class="text-s">${evt.type} in ${state.user.zone}</p>
        </div>
        <div class="glass rounded-2xl p-5 mb-4">
          <div class="flex items-center gap-3 mb-4">
            ${icon(evt.icon,'text-'+evt.color+'-400 text-2xl')}
            <div>
              <p class="text-p font-bold">${evt.type}</p>
              <p class="text-s text-sm">${evt.trigger}</p>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div class="bg-s rounded-xl p-3 text-center">
              <p class="text-m text-xs">Current</p>
              <p class="text-red-400 font-bold text-lg">${evt.value}</p>
            </div>
            <div class="bg-s rounded-xl p-3 text-center">
              <p class="text-m text-xs">Threshold</p>
              <p class="text-s font-bold text-lg">${evt.threshold}</p>
            </div>
          </div>
        </div>
        <div class="glass rounded-2xl p-5 mb-6">
          <p class="text-s text-sm mb-3">${icon('robot-line')} AI Verification Pipeline</p>
          <div class="space-y-3" id="verifySteps">
            ${['Satellite data confirmed','IoT sensor cross-check','Zone impact radius calculated','Fraud score: 0.02 (Clean)'].map((s,i)=>`
              <div class="flex items-center gap-3" id="step${i}">
                <div class="w-6 h-6 bg-s rounded-full flex items-center justify-center"><div class="w-2 h-2 bg-s rounded-full"></div></div>
                <span class="text-m text-sm">${s}</span>
              </div>`).join('')}
          </div>
        </div>
        <button onclick="processAutoClaim()" id="claimBtn" class="w-full btn-primary text-white font-semibold py-4 rounded-xl opacity-50 pointer-events-none">
          ${icon('loader-4-line','animate-spin')} Verifying...
        </button>
      </div>
    </div>
  `);

  for(let i=0;i<4;i++){
    await wait(800);
    const step=$('step'+i);
    if(step){
      step.querySelector('.w-6').innerHTML=icon('checkbox-circle-fill','text-emerald-400');
      step.querySelector('span').classList.remove('text-m');
      step.querySelector('span').classList.add('text-p');
    }
  }
  const btn=$('claimBtn');
  // Payout = Hours Lost × Hourly Rate × Coverage %
  const hoursLost = Math.floor(Math.random() * 4) + 6; // 6–9 hours lost
  const hourlyRate = state.policy.hourlyRate || 100;
  const coveragePct = (state.policy.coveragePct || 75) / 100;
  const payoutAmount = InsuranceEngine.computePayout(hoursLost, hourlyRate, coveragePct);

  if(btn){btn.classList.remove('opacity-50','pointer-events-none');btn.innerHTML=`Auto-Claim ₹${payoutAmount} ${icon('arrow-right-line')}`;}
}

// Fraud Check + Auto Claim
async function processAutoClaim() {
  const hoursLost = Math.floor(Math.random() * 4) + 6;
  const hourlyRate = state.policy.hourlyRate || 100;
  const coveragePct = (state.policy.coveragePct || 75) / 100;
  const payoutAmount = InsuranceEngine.computePayout(hoursLost, hourlyRate, coveragePct);

  const claim = {
    id:'CLM-'+Date.now().toString(36).toUpperCase(),
    date:new Date().toLocaleDateString('en-IN'),
    amount: payoutAmount,
    hoursLost,
    hourlyRate,
    coveragePct: Math.round(coveragePct * 100),
    formula: `${hoursLost}hrs × ₹${hourlyRate}/hr × ${Math.round(coveragePct*100)}%`,
    status:'processing',
    type:'Auto-triggered'
  };

  render(`
    <div class="min-h-screen bg-p p-6 flex flex-col items-center justify-center">
      <div class="text-center slide-up w-full max-w-sm">
        <div class="w-20 h-20 gradient-primary rounded-full flex items-center justify-center mx-auto mb-6 glow">
          ${icon('robot-line','text-white text-3xl')}
        </div>
        <h2 class="text-xl font-bold text-p mb-6">AI Fraud Analysis</h2>
        <div class="space-y-4 text-left w-full" id="fraudSteps">
          ${[
            ['gps-line','Location Authenticity','Checking GPS vs cell tower...'],
            ['smartphone-line','Device Fingerprint','Analyzing device signature...'],
            ['user-search-line','Behavioral Score','Computing BAS score...'],
            ['group-line','Ring Detection','Scanning for coordinated patterns...'],
            ['shield-check-line','Final Verdict','Compiling results...']
          ].map(([ic,title,desc],i)=>`
            <div class="glass rounded-xl p-4 flex items-center gap-3" id="fraud${i}">
              <div class="w-10 h-10 bg-s rounded-lg flex items-center justify-center">${icon(ic,'text-s')}</div>
              <div class="flex-1">
                <p class="text-p text-sm font-medium">${title}</p>
                <p class="text-m text-xs">${desc}</p>
              </div>
              <div class="w-6 h-6" id="fraudIcon${i}"></div>
            </div>`).join('')}
        </div>
      </div>
    </div>
  `);

  const scores=['98.2%','Verified','0.94','Clean','Approved'];
  for(let i=0;i<5;i++){
    await wait(700);
    const el=$('fraud'+i);
    const ic=$('fraudIcon'+i);
    if(el){
      el.querySelector('.text-m').textContent=scores[i];
      el.querySelector('.text-m').classList.remove('text-m');
      el.querySelector('.text-m')|| el.querySelectorAll('p')[1].classList.add('text-emerald-400','font-semibold');
    }
    if(ic)ic.innerHTML=icon('checkbox-circle-fill','text-emerald-400');
  }

  await wait(800);
  claim.status='approved';
  state.claims.unshift(claim);
  renderPayoutSuccess(claim);
}

function renderPayoutSuccess(claim) {
  render(`
    <div class="min-h-screen bg-p flex items-center justify-center p-6">
      <div class="text-center slide-up">
        <div class="relative mb-6">
          <div class="absolute inset-0 bg-emerald-500/30 rounded-full blur-2xl pulse-ring"></div>
          <div class="relative w-24 h-24 gradient-success rounded-full flex items-center justify-center mx-auto glow-success">
            ${icon('money-rupee-circle-line','text-white text-4xl')}
          </div>
        </div>
        <h1 class="text-3xl font-extrabold text-p mb-2">₹${claim.amount}</h1>
        <p class="text-s mb-1">Payout Approved</p>
        ${claim.formula ? `<p class="text-m text-xs mb-1">${claim.formula}</p>` : ''}
        <p class="text-m text-sm mb-6">Credited to UPI in ~30 minutes</p>
        <div class="glass rounded-2xl p-5 mb-6 text-left">
          ${[
            ['hashtag','Claim ID',claim.id],
            ['time-line','Processed',claim.date],
            ['timer-line','Hours Lost',(claim.hoursLost||'-')+' hrs'],
            ['money-rupee-circle-line','Hourly Rate','₹'+(claim.hourlyRate||'-')],
            ['percent-line','Coverage',( claim.coveragePct||'-')+'%'],
            ['shield-check-line','Fraud Score','0.02 — Clean'],
            ['timer-flash-line','Total Time','< 4 minutes']
          ].map(([ic,label,val])=>`
            <div class="flex justify-between items-center py-2 border-b border-white/5 last:border-0">
              <span class="text-s flex items-center gap-2 text-sm">${icon(ic)} ${label}</span>
              <span class="text-p font-semibold text-sm">${val}</span>
            </div>`).join('')}
        </div>
        <button onclick="renderDashboard()" class="w-full btn-primary text-white font-semibold py-4 rounded-xl">Back to Dashboard ${icon('arrow-right-line')}</button>
      </div>
    </div>
  `);
}


// Claims History
function renderClaims() {
  render(`
    <div class="min-h-screen bg-p pb-24">
      <div class="p-6">
        <div class="flex justify-between items-center mb-6">
          <h1 class="text-xl font-bold text-p">Claims History</h1>
          ${themeToggleBtn()}
        </div>
        ${state.claims.length===0?`
          <div class="text-center py-16">
            <div class="w-20 h-20 bg-s rounded-full flex items-center justify-center mx-auto mb-4">
              ${icon('file-list-3-line','text-m text-3xl')}
            </div>
            <p class="text-p font-semibold mb-1">No claims yet</p>
            <p class="text-s text-sm">Claims will appear here when disruptions are detected</p>
          </div>
        `:`
          <div class="space-y-3 slide-up">
            ${state.claims.map(c=>`
              <div class="glass rounded-2xl p-4">
                <div class="flex justify-between items-start mb-2">
                  <div>
                    <p class="text-p font-semibold">${c.id}</p>
                    <p class="text-s text-sm">${c.type} · ${c.date}</p>
                  </div>
                  <span class="px-3 py-1 rounded-full text-xs font-bold ${c.status==='approved'?'bg-emerald-500/20 text-emerald-400':'bg-yellow-500/20 text-yellow-400'}">
                    ${c.status.toUpperCase()}
                  </span>
                </div>
                <div class="flex justify-between items-center pt-2 border-t border-white/5">
                  <span class="text-s text-sm">Payout</span>
                  <span class="text-p font-bold">₹${c.amount}</span>
                </div>
              </div>
            `).join('')}
          </div>
        `}
      </div>
      ${renderBottomNav('claims')}
    </div>
  `);
}

// Full Map
function renderFullMap() {
  const city = state.selectedCity || 'mumbai';
  const zones = cityData[city].zones;
  render(`
    <div class="min-h-screen bg-p pb-24">
      <div class="p-6 pb-3">
        <div class="flex justify-between items-center mb-4">
          <h1 class="text-xl font-bold text-p">Zone Map</h1>
          <div class="flex items-center gap-2">
            ${themeToggleBtn()}
          </div>
        </div>
        <div class="flex gap-2 mb-4 overflow-x-auto">
          ${Object.keys(cityData).map(c=>`
            <button onclick="switchMapCity('${c}')" class="px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap ${city===c?'btn-primary text-white':'glass text-s'}">${cityData[c].name}</button>
          `).join('')}
        </div>
      </div>
      <div id="fullMap" class="mx-6 rounded-2xl overflow-hidden" style="height:calc(100vh - 220px)"></div>
      <!-- Legend -->
      <div class="mx-6 mt-3 glass rounded-xl p-3 flex flex-wrap gap-3 text-xs">
        <span class="flex items-center gap-1"><span class="w-3 h-3 rounded-full bg-emerald-500 inline-block"></span> Low</span>
        <span class="flex items-center gap-1"><span class="w-3 h-3 rounded-full bg-yellow-500 inline-block"></span> Medium</span>
        <span class="flex items-center gap-1"><span class="w-3 h-3 rounded-full bg-orange-500 inline-block"></span> High</span>
        <span class="flex items-center gap-1"><span class="w-3 h-3 rounded-full bg-red-500 inline-block"></span> Critical</span>
        <span class="flex items-center gap-1"><span class="w-3 h-3 rounded-full" style="background:#8b5cf6"></span> Dark Store</span>
      </div>
      ${renderBottomNav('map')}
    </div>
  `);
  setTimeout(()=>{
    const first=Object.values(zones)[0];
    const m=L.map('fullMap').setView([first.lat,first.lng],12);
    L.tileLayer(getMapTile(),{maxZoom:18}).addTo(m);
    Object.entries(zones).forEach(([name,z])=>{
      const t=getRiskTier(Math.min(100,Math.round(z.risk*1.2)));
      L.circle([z.lat,z.lng],{radius:1000,color:t.color,fillColor:t.color,fillOpacity:0.15}).addTo(m);
      L.marker([z.lat,z.lng]).addTo(m).bindPopup(`<b>${name}</b><br>Risk: ${t.tier} (${z.risk})<br>PIN: ${z.pin}<br>Stores: ${z.stores.length}`);
      z.stores.forEach(s=>{
        L.circleMarker([s.lat,s.lng],{radius:5,color:'#8b5cf6',fillColor:'#8b5cf6',fillOpacity:0.8}).addTo(m).bindPopup(`<b>${s.name}</b><br>${s.platform}<br>ID: ${s.id}`);
      });
    });
    // Highlight user's current zone if in this city
    if(state.selectedCity === city && state.location) {
      L.circle([state.location.lat,state.location.lng],{radius:300,color:'#3b82f6',fillColor:'#3b82f6',fillOpacity:0.3,dashArray:'5,10'}).addTo(m).bindPopup('Your location');
    }
  },100);
}

function switchMapCity(city){
  state.selectedCity=city;
  renderFullMap();
}

// Profile
function renderProfile() {
  render(`
    <div class="min-h-screen bg-p pb-24">
      <div class="p-6">
        <div class="flex justify-between items-center mb-6">
          <h1 class="text-xl font-bold text-p">Profile</h1>
          ${themeToggleBtn()}
        </div>
        <div class="slide-up">
          <div class="text-center mb-6">
            <div class="w-20 h-20 gradient-primary rounded-full flex items-center justify-center mx-auto mb-3 text-white text-2xl font-bold">${state.user.name[0]}</div>
            <h2 class="text-p font-bold text-lg">${state.user.name}</h2>
            <p class="text-s text-sm">${state.user.platform.charAt(0).toUpperCase()+state.user.platform.slice(1)} · ${state.user.zone}</p>
          </div>
          <div class="space-y-3">
            ${[
              ['phone-line','Mobile','+91 '+state.user.mobile],
              ['building-line','Platform',state.user.platform.charAt(0).toUpperCase()+state.user.platform.slice(1)],
              ['map-pin-line','City',state.user.city],
              ['road-map-line','Zone',state.user.zone],
              ['store-2-line','Dark Store',state.user.store],
              ['e-bike-line','Avg Deliveries',state.user.deliveries+'/week'],
              ['bar-chart-box-line','Risk Score',state.user.riskScore+'/100'],
              ['bank-card-line','Aadhaar','****'+((state.user.aadhaar||'').slice(-4)||'XXXX')],
              ['shield-check-line','Policy',state.policy?state.policy.id:'None'],
              ['money-rupee-circle-line','Premium',state.policy?'₹'+state.policy.price+'/week':'—']
            ].map(([ic,label,val])=>`
              <div class="glass rounded-xl p-4 flex justify-between items-center">
                <span class="text-s flex items-center gap-2">${icon(ic)} ${label}</span>
                <span class="text-p font-semibold text-sm">${val}</span>
              </div>`).join('')}
          </div>
          <button onclick="logout()" class="w-full glass text-red-400 font-semibold py-4 rounded-xl mt-6 flex items-center justify-center gap-2">
            ${icon('logout-box-r-line')} Logout
          </button>
        </div>
      </div>
      ${renderBottomNav('profile')}
    </div>
  `);
}

// Bottom Navigation
function renderBottomNav(active) {
  const items = [
    { id:'home', icon:'home-5-line', iconActive:'home-5-fill', label:'Home', action:'renderDashboard()' },
    { id:'claims', icon:'file-list-3-line', iconActive:'file-list-3-fill', label:'Claims', action:'renderClaims()' },
    { id:'map', icon:'map-2-line', iconActive:'map-2-fill', label:'Map', action:'renderFullMap()' },
    { id:'profile', icon:'user-line', iconActive:'user-fill', label:'Profile', action:'renderProfile()' }
  ];
  return `
    <div class="fixed bottom-0 left-0 right-0 glass border-t border-white/5 px-6 py-3 flex justify-around" style="background:var(--nav-bg);backdrop-filter:blur(20px)">
      ${items.map(it=>`
        <button onclick="${it.action}" class="flex flex-col items-center gap-1 ${active===it.id?'text-blue-400':'text-m'}">
          ${icon(active===it.id?it.iconActive:it.icon,'text-xl')}
          <span class="text-xs font-medium">${it.label}</span>
        </button>
      `).join('')}
    </div>`;
}

// Quick Login (Demo)
async function quickLogin() {
  render(`<div class="min-h-screen bg-p flex items-center justify-center"><div class="text-center slide-up"><div class="w-16 h-16 gradient-primary rounded-full flex items-center justify-center mx-auto mb-4 glow">${icon('loader-4-line','text-white text-3xl animate-spin')}</div><p class="text-p font-bold">Loading demo rider...</p><p class="text-s text-sm mt-2">Fetching Blinkit history</p></div></div>`);

  const records = await RiderAPI.findRider('blinkit', '7001989183');
  const profile = records.length > 0 ? RiderAPI.computeRiderProfile(records) : null;
  const zoneRisk = cityData.kolkata.zones['Salt Lake'].risk;

  state.riderProfile = profile;
  state.riderRecords = records;
  state.selectedCity='kolkata';
  state.selectedZone='Salt Lake';
  state.selectedStore=cityData.kolkata.zones['Salt Lake'].stores[0];
  state.location={lat:22.5800,lng:88.4179};

  const riskScore = profile ? InsuranceEngine.computeRiskScore(profile, zoneRisk) : 58;
  const plans = InsuranceEngine.generatePlans(profile, zoneRisk);
  const stdPlan = plans.find(p => p.tier === 'standard');

  state.user = {
    name: profile?.name || 'Usham Roy',
    mobile: '7001989183',
    platform: 'blinkit',
    city: 'Kolkata',
    zone: 'Salt Lake',
    store: 'Blinkit Salt Lake',
    storeId: 'BLK-SLK-01',
    deliveries: profile?.avgDeliveriesPerDay || 20,
    riskScore,
    aadhaar: profile?.aadhaar || '876543217744',
    avgDailyEarning: profile?.avgDailyEarning || 1400,
    platformRating: profile?.latestRating || 4.9
  };
  state.policy = {
    tier: 'standard',
    price: stdPlan?.premium || 89,
    payout: stdPlan?.dailyPayout || 1000,
    maxDays: stdPlan?.maxDays || 5,
    hourlyRate: profile ? InsuranceEngine.computeHourlyRate(profile) : 100,
    coveragePct: 75,
    startDate: new Date().toISOString().split('T')[0],
    status: 'active',
    id: 'GS-DEMO2024'
  };
  state.claims = [
    { id:'CLM-DEMO01', date:'18 Mar 2026', amount: state.policy.payout, hoursLost:8, hourlyRate:state.policy.hourlyRate, coveragePct:75, formula:`8hrs × ₹${state.policy.hourlyRate}/hr × 75%`, status:'approved', type:'Heavy Rainfall' },
    { id:'CLM-DEMO02', date:'15 Mar 2026', amount: state.policy.payout, hoursLost:7, hourlyRate:state.policy.hourlyRate, coveragePct:75, formula:`7hrs × ₹${state.policy.hourlyRate}/hr × 75%`, status:'approved', type:'Extreme Heat' }
  ];
  renderDashboard();
}

// Logout
function logout() {
  state.user=null;state.policy=null;state.claims=[];
  state.selectedCity=null;state.selectedZone=null;state.selectedStore=null;
  state.riderProfile=null;state.riderRecords=[];
  renderWelcome();
}

// Service Worker Registration
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('sw.js').catch(()=>{});
}

// Boot
renderSplash();
