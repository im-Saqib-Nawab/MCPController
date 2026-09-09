import { lazy, Suspense } from 'react';
import AdminDashboard from './AdminDashboard.jsx';

const DoctorDashboard = lazy(() => import('./DoctorDashboard.jsx'));
const PatientDashboard = lazy(() => import('./PatientDashboard.jsx'));

function DashboardFallback() {
  return <main className="mx-auto max-w-5xl px-4 py-10 text-sm text-slate-500">Loading dashboard…</main>;
}

export default function Dashboard({ user, onUserUpdated }) {
  if (user?.role === 'admin') {
    return <AdminDashboard user={user} />;
  }
  if (user?.role === 'doctor') {
    return (
      <Suspense fallback={<DashboardFallback />}>
        <DoctorDashboard user={user} onUserUpdated={onUserUpdated} />
      </Suspense>
    );
  }
  return (
    <Suspense fallback={<DashboardFallback />}>
      <PatientDashboard user={user} />
    </Suspense>
  );
}
