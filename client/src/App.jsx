import { lazy, Suspense, useEffect, useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import Navbar from './components/Navbar.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import AdminRoute from './components/AdminRoute.jsx';
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
import { api } from './services/api.js';

const TestingCenter = lazy(() => import('./pages/TestingCenter.jsx'));
const Observability = lazy(() => import('./pages/Observability.jsx'));
const AdminCreditsPage = lazy(() => import('./pages/AdminCreditsPage.jsx'));

function PageFallback() {
  return <div className="px-4 py-16 text-center text-sm text-slate-500">Loading…</div>;
}

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get('/auth/me')
      .then(({ data }) => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen">
      <Navbar user={user} onLogout={() => setUser(null)} />
      <Routes>
        <Route path="/" element={<Home user={user} />} />
        <Route path="/login" element={<Login onLoggedIn={setUser} />} />
        <Route path="/register" element={<Register onRegistered={setUser} />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute user={user} loading={loading}>
              <Dashboard user={user} onUserUpdated={setUser} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/doctors"
          element={
            <ProtectedRoute user={user} loading={loading}>
              <Doctors />
            </ProtectedRoute>
          }
        />
        <Route
          path="/doctors/:doctorId"
          element={
            <ProtectedRoute user={user} loading={loading}>
              <DoctorDetail user={user} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/medicines"
          element={
            <ProtectedRoute user={user} loading={loading}>
              <Medicines user={user} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute user={user} loading={loading}>
              <Profile user={user} onUserUpdated={setUser} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/authorize"
          element={
            <ProtectedRoute user={user} loading={loading}>
              <Authorize user={user} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/testing"
          element={
            <AdminRoute user={user} loading={loading}>
              <Suspense fallback={<PageFallback />}>
                <TestingCenter />
              </Suspense>
            </AdminRoute>
          }
        />
        <Route
          path="/admin/observability"
          element={
            <AdminRoute user={user} loading={loading}>
              <Suspense fallback={<PageFallback />}>
                <Observability />
              </Suspense>
            </AdminRoute>
          }
        />
        <Route
          path="/credits"
          element={
            <ProtectedRoute user={user} loading={loading}>
              <Credits />
            </ProtectedRoute>
          }
        />
        <Route
          path="/credits/history"
          element={
            <ProtectedRoute user={user} loading={loading}>
              <CreditHistory />
            </ProtectedRoute>
          }
        />
        <Route
          path="/plans"
          element={
            <ProtectedRoute user={user} loading={loading}>
              <Plans />
            </ProtectedRoute>
          }
        />
        <Route
          path="/purchase/success"
          element={
            <ProtectedRoute user={user} loading={loading}>
              <PurchaseSuccess />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/credits"
          element={
            <AdminRoute user={user} loading={loading}>
              <Suspense fallback={<PageFallback />}>
                <AdminCreditsPage />
              </Suspense>
            </AdminRoute>
          }
        />
        <Route path="/oauth/success" element={<Success />} />
      </Routes>
    </div>
  );
}
