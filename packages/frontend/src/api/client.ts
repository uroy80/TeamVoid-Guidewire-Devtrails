import axios from 'axios';
import type { AxiosError, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';

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

// ─── Refresh-token rotation machinery ──────────────────────────────────────
// A single in-flight refresh promise prevents N concurrent 401s from each
// triggering their own refresh call (which would burn the refresh_token and
// cause the server to trip the reuse-detection kill switch on the entire
// session family). All queued requests wait on the same rotation.
let refreshInFlight: Promise<string | null> | null = null;

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

async function rotateRefreshToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem('gs_refresh_token');
  if (!refreshToken) return null;
  try {
    // Use bare axios here so we don't re-enter our own interceptor chain.
    const { data } = await axios.post('/api/auth/refresh-token', {
      refresh_token: refreshToken,
    });
    if (data?.access_token && data?.refresh_token) {
      localStorage.setItem('gs_token', data.access_token);
      localStorage.setItem('gs_refresh_token', data.refresh_token);
      return data.access_token as string;
    }
    return null;
  } catch {
    // Server rejected the refresh — either expired, revoked, or reuse detected.
    // Drop the stale pair so we don't keep retrying on every subsequent call.
    localStorage.removeItem('gs_refresh_token');
    return null;
  }
}

function redirectToLogin(): void {
  const path = window.location.pathname;
  const isAuthPage = path.includes('/login') || path === '/welcome' || path === '/';
  if (isAuthPage) return;
  localStorage.removeItem('gs_token');
  localStorage.removeItem('gs_refresh_token');
  localStorage.removeItem('gs_is_admin');
  localStorage.removeItem('gs_admin');
  window.location.href = path.startsWith('/admin') ? '/admin/login' : '/welcome';
}

// Response interceptor: silent refresh on 401, redirect on failure
api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as RetriableConfig | undefined;
    const status = error.response?.status;

    // Only attempt refresh for 401s on non-auth endpoints that we haven't
    // already retried. The refresh-token endpoint itself must never recurse.
    const url = original?.url ?? '';
    const isAuthCall =
      url.includes('/auth/refresh-token') ||
      url.includes('/auth/send-otp') ||
      url.includes('/auth/verify-otp') ||
      url.includes('/auth/admin/login') ||
      url.includes('/auth/logout');

    if (status === 401 && original && !original._retried && !isAuthCall) {
      original._retried = true;

      if (!refreshInFlight) {
        refreshInFlight = rotateRefreshToken().finally(() => {
          refreshInFlight = null;
        });
      }

      const newToken = await refreshInFlight;
      if (newToken) {
        // Replay the original request with the freshly-rotated access token.
        original.headers = original.headers ?? {};
        (original.headers as Record<string, string>).Authorization = `Bearer ${newToken}`;
        return api.request(original as AxiosRequestConfig);
      }

      // Refresh failed — kick to login.
      redirectToLogin();
    } else if (status === 401 && !isAuthCall) {
      redirectToLogin();
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
  getWorkerDeletePreview: (id: string) => api.get(`/admin/workers/${id}/delete-preview`),
  deleteWorker: (id: string) => api.delete(`/admin/workers/${id}`),
  getStats: () => api.get('/admin/stats'),
  // ── Claims management ──────────────────────────────────────
  listClaims: (params?: { status?: string; limit?: number; offset?: number }) =>
    api.get('/admin/claims', { params }),
  getClaim: (id: string) => api.get(`/admin/claims/${id}`),
  approveClaim: (id: string, reason?: string) =>
    api.post(`/admin/claims/${id}/approve`, { reason }),
  rejectClaim: (id: string, reason?: string) =>
    api.post(`/admin/claims/${id}/reject`, { reason }),
  getAIInsights: () => api.get('/admin/ai-insights'),
  getWorkerAIRisk: (id: string) => api.get(`/admin/workers/${id}/ai-risk`),
  getClaimAIAssessment: (id: string) => api.get(`/admin/claims/${id}/ai-assessment`),
  getHeatmap: () => api.get('/admin/heatmap'),
  resetAll: () => api.post('/admin/reset'),
  // ── Ring-fraud linkage ───────────────────────────────────
  getWorkerLinkage: (id: string) => api.get(`/admin/workers/${id}/linkage`),
  getRingFraudHotspots: () => api.get('/admin/ring-fraud/hotspots'),
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
