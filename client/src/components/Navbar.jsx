import { Link, useNavigate } from 'react-router-dom';
import { api } from '../services/api.js';

export default function Navbar({ user, onLogout }) {
  const navigate = useNavigate();

  async function logout() {
    try {
      await api.post('/auth/logout');
    } catch {
      // Local session is still cleared so the user can leave a broken session.
    }
    onLogout?.();
    navigate('/');
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <Link to="/" className="text-base font-semibold tracking-tight text-slate-900">
          MCPController
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          {user ? (
            <>
              <Link to="/dashboard" className="text-slate-600 hover:text-slate-900">
                Dashboard
              </Link>
              {user.role === 'admin' ? (
                <Link to="/admin/observability" className="text-slate-600 hover:text-slate-900">
                  Observability
                </Link>
              ) : null}
              <Link to="/doctors" className="text-slate-600 hover:text-slate-900">
                Doctors
              </Link>
              <Link to="/profile" className="text-slate-600 hover:text-slate-900">
                Profile
              </Link>
              <button type="button" onClick={logout} className="text-slate-600 hover:text-slate-900">
                Log out
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="text-slate-600 hover:text-slate-900">
                Log in
              </Link>
              <Link to="/register" className="text-slate-600 hover:text-slate-900">
                Register
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
