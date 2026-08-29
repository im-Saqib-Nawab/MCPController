import { useEffect, useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import Navbar from './components/Navbar.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Home from './pages/Home.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Authorize from './pages/Authorize.jsx';
import Success from './pages/Success.jsx';
import { api } from './services/api.js';

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

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 text-sm text-slate-500">
        Checking your session...
      </div>
    );
  }

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
              <Dashboard user={user} />
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
        <Route path="/oauth/success" element={<Success />} />
      </Routes>
    </div>
  );
}
