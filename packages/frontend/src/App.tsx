import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'sonner';
import { useStore } from './store/store';
import { lazy, Suspense, type ReactNode } from 'react';
import './i18n';
import ErrorBoundary from './components/ErrorBoundary';

// ── Lazy-loaded pages ───────────────────────────────────────
const Welcome = lazy(() => import('./pages/Welcome'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const CoverageSelection = lazy(() => import('./pages/CoverageSelection'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Claims = lazy(() => import('./pages/Claims'));
const Profile = lazy(() => import('./pages/Profile'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const FraudReview = lazy(() => import('./pages/FraudReview'));
const AdminLogin = lazy(() => import('./pages/admin/AdminLogin'));
const Demo = lazy(() => import('./pages/Demo'));
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers'));
const AdminClaims = lazy(() => import('./pages/admin/AdminClaims'));
const Actuarial = lazy(() => import('./pages/admin/Actuarial'));

// ── Loading spinner ─────────────────────────────────────────
function LoadingFallback() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-[var(--bg-primary)]">
      <div className="w-10 h-10 border-4 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

// ── Route guards ────────────────────────────────────────────
function ProtectedRoute({ children }: { children: ReactNode }) {
  const isAuthenticated = useStore((s) => s.isAuthenticated);
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

function AdminRoute({ children }: { children: ReactNode }) {
  const isAuthenticated = useStore((s) => s.isAuthenticated);
  const isAdmin = useStore((s) => s.isAdmin);

  if (!isAuthenticated || !isAdmin) {
    return <Navigate to="/admin/login" replace />;
  }

  return <>{children}</>;
}

// ── Splash redirect ─────────────────────────────────────────
function Splash() {
  const isAuthenticated = useStore((s) => s.isAuthenticated);
  return <Navigate to={isAuthenticated ? '/dashboard' : '/welcome'} replace />;
}

// ── App ─────────────────────────────────────────────────────
export default function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <Toaster position="top-right" richColors theme="dark" />
        <Suspense fallback={<LoadingFallback />}>
          <ErrorBoundary>
          <Routes>
            {/* Public */}
            <Route path="/" element={<Splash />} />
            <Route path="/welcome" element={<Welcome />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/coverage" element={<CoverageSelection />} />
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/demo" element={<Demo />} />

            {/* Protected */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/claims"
              element={
                <ProtectedRoute>
                  <Claims />
                </ProtectedRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <Profile />
                </ProtectedRoute>
              }
            />

            {/* Admin */}
            <Route
              path="/admin"
              element={
                <AdminRoute>
                  <AdminDashboard />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/fraud"
              element={
                <AdminRoute>
                  <FraudReview />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/users"
              element={
                <AdminRoute>
                  <AdminUsers />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/claims"
              element={
                <AdminRoute>
                  <AdminClaims />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/actuarial"
              element={
                <AdminRoute>
                  <Actuarial />
                </AdminRoute>
              }
            />

            {/* Catch-all */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </ErrorBoundary>
        </Suspense>
      </div>
    </BrowserRouter>
  );
}
