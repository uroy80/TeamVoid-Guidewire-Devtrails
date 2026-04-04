import { create } from 'zustand';

// ── Types ───────────────────────────────────────────────────
export interface Worker {
  id: string;
  fullName: string;
  mobile: string;
  platformType: string;
  platformId: string;
  vehicleType?: string;
  city: string;
  state: string;
  exclusionsAcknowledged?: boolean;
}

export interface Plan {
  id: string;
  name: string;
  description: string;
  premium: number;
  coverageAmount: number;
  duration: number;
  triggers: string[];
}

export interface ZoneWeather {
  zoneId: string;
  zoneName: string;
  temperature: number;
  humidity: number;
  windSpeed: number;
  rainfall: number;
  alertLevel: 'normal' | 'watch' | 'warning' | 'critical';
}

// ── Store shape ─────────────────────────────────────────────
interface AppState {
  // Auth
  token: string | null;
  worker: Worker | null;
  isAdmin: boolean;
  isAuthenticated: boolean;

  // Auth actions
  login: (token: string, worker?: Worker, isAdmin?: boolean) => void;
  logout: () => void;
  setWorker: (worker: Worker) => void;

  // Policy
  activePlan: Plan | null;
  plans: Plan[];
  setPlans: (plans: Plan[]) => void;
  setActivePlan: (plan: Plan | null) => void;

  // Weather
  zones: ZoneWeather[];
  setZoneWeather: (zones: ZoneWeather[]) => void;
}

// ── Helpers ─────────────────────────────────────────────────
const getStoredToken = (): string | null => {
  try {
    return localStorage.getItem('gs_token');
  } catch {
    return null;
  }
};

const getStoredAdmin = (): boolean => {
  try {
    return localStorage.getItem('gs_is_admin') === 'true';
  } catch {
    return false;
  }
};

// ── Store ───────────────────────────────────────────────────
export const useStore = create<AppState>((set) => ({
  // Auth state — rehydrate from localStorage
  token: getStoredToken(),
  worker: null,
  isAdmin: getStoredAdmin(),
  isAuthenticated: !!getStoredToken(),

  login: (token, worker = undefined, isAdmin = false) => {
    localStorage.setItem('gs_token', token);
    if (isAdmin) localStorage.setItem('gs_is_admin', 'true');
    set({
      token,
      worker: worker ?? null,
      isAdmin,
      isAuthenticated: true,
    });
  },

  logout: () => {
    localStorage.removeItem('gs_token');
    localStorage.removeItem('gs_is_admin');
    set({
      token: null,
      worker: null,
      isAdmin: false,
      isAuthenticated: false,
      activePlan: null,
    });
  },

  setWorker: (worker) => set({ worker }),

  // Policy state
  activePlan: null,
  plans: [],
  setPlans: (plans) => set({ plans }),
  setActivePlan: (plan) => set({ activePlan: plan }),

  // Weather state
  zones: [],
  setZoneWeather: (zones) => set({ zones }),
}));
