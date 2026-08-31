import { Navigate, useLocation } from 'react-router-dom';

export default function AdminRoute({ user, loading, children }) {
  const location = useLocation();

  if (loading) {
    return <div className="px-4 py-16 text-center text-sm text-slate-500">Loading…</div>;
  }

  if (!user) {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?returnTo=${encodeURIComponent(next)}`} replace />;
  }

  if (user.role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
