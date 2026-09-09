import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Navbar from './components/Navbar.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import AdminRoute from './components/AdminRoute.jsx';
import { useAuth } from './context/AuthContext.jsx';
import Home from './pages/Home.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Doctors from './pages/Doctors.jsx';
import DoctorDetail from './pages/DoctorDetail.jsx';
import Medicines from './pages/Medicines.jsx';
import Profile from './pages/Profile.jsx';
import Authorize from './pages/Authorize.jsx';
import Success from './pages/Success.jsx';
import Credits from './pages/Credits.jsx';
import CreditHistory from './pages/CreditHistory.jsx';
import Plans from './pages/Plans.jsx';
import PurchaseSuccess from './pages/PurchaseSuccess.jsx';

import Observability from './pages/Observability.jsx';

const TestingCenter = lazy(() => import('./pages/TestingCenter.jsx'));
const AdminCreditsPage = lazy(() => import('./pages/AdminCreditsPage.jsx'));
const AdminCreditsUsersPage = lazy(() => import('./pages/AdminCreditsUsersPage.jsx'));
const DeploymentControl = lazy(() => import('./pages/DeploymentControl.jsx'));

function PageFallback() {
  return <div className="px-4 py-16 text-center text-sm text-slate-500">Loading…</div>;
}

function NotFound() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold text-slate-900">Page not found</h1>
      <p className="mt-2 text-sm text-slate-600">The page you requested does not exist.</p>
      <a href="/dashboard" className="mt-6 inline-block text-sm text-slate-700 underline hover:text-slate-900">
        Go to dashboard
      </a>
    </main>
  );
}

export default function App() {
  const { user, setUser } = useAuth();

  return (
    <div className="min-h-screen">
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login onLoggedIn={setUser} />} />
        <Route path="/register" element={<Register onRegistered={setUser} />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard user={user} onUserUpdated={setUser} />
            </ProtectedRoute>
          }
        />
        <Route path="/admin" element={<Navigate to="/dashboard" replace />} />
        <Route path="/admin/dashboard" element={<Navigate to="/dashboard" replace />} />
        <Route
          path="/doctors"
          element={
            <ProtectedRoute>
              <Doctors />
            </ProtectedRoute>
          }
        />
        <Route
          path="/doctors/:doctorId"
          element={
            <ProtectedRoute>
              <DoctorDetail user={user} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/medicines"
          element={
            <ProtectedRoute>
              <Medicines user={user} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <Profile user={user} onUserUpdated={setUser} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/authorize"
          element={
            <ProtectedRoute>
              <Authorize user={user} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/testing"
          element={
            <AdminRoute>
              <Suspense fallback={<PageFallback />}>
                <TestingCenter />
              </Suspense>
            </AdminRoute>
          }
        />
        <Route
          path="/admin/observability"
          element={
            <AdminRoute>
              <Observability />
            </AdminRoute>
          }
        />
        <Route
          path="/credits"
          element={
            <ProtectedRoute>
              <Credits />
            </ProtectedRoute>
          }
        />
        <Route
          path="/credits/history"
          element={
            <ProtectedRoute>
              <CreditHistory />
            </ProtectedRoute>
          }
        />
        <Route
          path="/plans"
          element={
            <ProtectedRoute>
              <Plans />
            </ProtectedRoute>
          }
        />
        <Route
          path="/purchase/success"
          element={
            <ProtectedRoute>
              <PurchaseSuccess />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/credits"
          element={
            <AdminRoute>
              <Suspense fallback={<PageFallback />}>
                <AdminCreditsPage />
              </Suspense>
            </AdminRoute>
          }
        />
        <Route
          path="/admin/credits/users"
          element={
            <AdminRoute>
              <Suspense fallback={<PageFallback />}>
                <AdminCreditsUsersPage />
              </Suspense>
            </AdminRoute>
          }
        />
        <Route
          path="/admin/deployment"
          element={
            <AdminRoute>
              <Suspense fallback={<PageFallback />}>
                <DeploymentControl user={user} />
              </Suspense>
            </AdminRoute>
          }
        />
        <Route path="/oauth/success" element={<Success />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </div>
  );
}
