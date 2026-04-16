import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor: attach JWT
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('gs_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor: redirect on 401
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401 && !window.location.pathname.includes('/login')) {
      localStorage.removeItem('gs_token');
      localStorage.removeItem('gs_admin');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  },
);

// ── Auth ────────────────────────────────────────────────────
export const auth = {
  sendOtp: (mobile: string) =>
    api.post('/auth/send-otp', { mobile }),
  verifyOtp: (mobile: string, otp: string) =>
    api.post('/auth/verify-otp', { mobile, otp }),
  adminLogin: (email: string, password: string) =>
    api.post('/auth/admin/login', { email, password }),
};

// ── Worker ──────────────────────────────────────────────────
export const worker = {
  getMe: () => api.get('/workers/me'),
  register: (data: {
    name: string;
    mobile: string;
    platform: string;
    latitude: number;
    longitude: number;
    dark_store_id?: string;
  }) => api.post('/workers/register', data),
  acknowledgeExclusions: () => api.post('/workers/acknowledge-exclusions'),
  submitLocation: (data: {
    latitude: number;
    longitude: number;
    accuracy?: number;
    source?: string;
    device_fingerprint?: string;
  }) => api.post('/workers/me/location', data),
  getLocationTrail: () => api.get('/workers/me/location-trail'),
};

// ── Geo ────────────────────────────────────────────────────
export const geo = {
  detect: () => api.get('/geo/detect'),
  nearbyStores: (lat: number, lng: number, radius?: number, platform?: string) =>
    api.get('/geo/nearby-stores', {
      params: { lat, lng, radius: radius || 50, ...(platform ? { platform } : {}) },
    }),
};

// ── Stores ─────────────────────────────────────────────────
export const stores = {
  cities: () => api.get('/stores/cities'),
  nearby: (lat: number, lng: number, radius?: number) =>
    api.get('/stores/nearby', { params: { lat, lng, radius: radius || 50 } }),
  byCity: (cityName: string) => api.get(`/stores/city/${cityName}`),
};

// ── Policy ──────────────────────────────────────────────────
export const policy = {
  getPlans: () => api.get('/policies/plans'),
  createPolicy: (data: { coverage_level: string; payment_upi: string }) =>
    api.post('/policies', data),
  getActive: () => api.get('/policies/current'),
  getHistory: () => api.get('/policies/history'),
  toggleAutoRenew: (id: string) => api.put(`/policies/${id}/auto-renew`),
};

// ── Claims ──────────────────────────────────────────────────
export const claims = {
  getClaims: () => api.get('/claims'),
  getClaim: (id: string) => api.get(`/claims/${id}`),
  requestClaim: (data: { disruption_type: string; description: string; latitude: number; longitude: number; device_fingerprint?: string }) =>
    api.post('/claims/request', data),
};

// ── Analytics ───────────────────────────────────────────────
export const analytics = {
  getWorkerSummary: () => api.get('/analytics/worker/summary'),
  getAdminOverview: () => api.get('/analytics/admin/overview'),
  getAdminFraud: () => api.get('/analytics/admin/fraud'),
};

// ── Triggers ────────────────────────────────────────────────
export const triggers = {
  getStatus: () => api.get('/triggers/status'),
  checkNow: () => api.post('/triggers/check-now'),
  createManual: (data: {
    zone_id: string;
    event_type: string;
    severity: string;
    duration_hours: number;
  }) => api.post('/triggers/manual', data),
};

// ── Admin ───────────────────────────────────────────────────
export const admin = {
  getReviewQueue: () => api.get('/admin/claims/review-queue'),
  resolveClaim: (id: string, data: { approved: boolean; reason?: string }) =>
    api.put(`/admin/claims/${id}/resolve`, data),
  getAuditLog: (params?: { entity_type?: string; entity_id?: string; limit?: number; offset?: number }) =>
    api.get('/admin/audit-log', { params }),
  getWorkers: () => api.get('/admin/workers'),
  getWorkerDetail: (id: string) => api.get(`/admin/workers/${id}`),
  deleteWorker: (id: string) => api.delete(`/admin/workers/${id}`),
  getStats: () => api.get('/admin/stats'),
  getAIInsights: () => api.get('/admin/ai-insights'),
  getWorkerAIRisk: (id: string) => api.get(`/admin/workers/${id}/ai-risk`),
  getClaimAIAssessment: (id: string) => api.get(`/admin/claims/${id}/ai-assessment`),
  getHeatmap: () => api.get('/admin/heatmap'),
  resetAll: () => api.post('/admin/reset'),
  // ── Actuarial (Wave 2) ───────────────────────────────────
  getActuarialOverview: () => api.get('/admin/actuarial/overview'),
  getActuarialByZone: () => api.get('/admin/actuarial/by-zone'),
};

// ── Demo ───────────────────────────────────────────────────
export const demo = {
  simulate: (scenario: string) => api.post('/demo/simulate', { scenario }),
};

// ── Public (no auth required) ──────────────────────────────
export const publicApi = {
  getStats: () => api.get('/public/stats').then((r) => r.data),
};

// ── Community (worker reports) ─────────────────────────────
export const community = {
  submitReport: (body: {
    latitude: number;
    longitude: number;
    condition_type: string;
    severity: string;
    notes?: string;
  }) => api.post('/community/report', body).then((r) => r.data),
  getPending: () => api.get('/community/admin/pending').then((r) => r.data.reports),
};

export default api;
