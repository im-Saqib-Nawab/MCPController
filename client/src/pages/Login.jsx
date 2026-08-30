import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import Button from '../components/Button.jsx';
import { api, getErrorMessage } from '../services/api.js';

export default function Login({ onLoggedIn }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const redirectTarget = params.get('returnTo') || '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { data } = await api.post('/auth/login', { email, password });
      onLoggedIn?.(data.user);

      const safePath = redirectTarget.startsWith('/') ? redirectTarget : '/dashboard';
      navigate(safePath, { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-12">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
          MCPController
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">Log in</h1>
        <p className="mt-2 text-sm text-slate-600">
          Sign in as a patient, doctor, or administrator. ChatGPT connections use this same account.
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
            />
          </label>

          <label className="block text-sm">
            <span className="font-medium text-slate-700">Password</span>
            <input
              type="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
            />
          </label>

          {error ? (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          ) : null}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Signing in…' : 'Log in'}
          </Button>
        </form>

        <p className="mt-4 text-sm text-slate-500">
          No account yet?{' '}
          <Link to={`/register${redirectTarget !== '/dashboard' ? `?returnTo=${encodeURIComponent(redirectTarget)}` : ''}`} className="underline">
            Create one
          </Link>
        </p>
      </div>
    </main>
  );
}
