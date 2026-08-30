import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import Button from '../components/Button.jsx';
import { SCOPE_OPTIONS } from '../lib/scopes.js';
import { api, getErrorMessage } from '../services/api.js';

const friendlyScopeLabel = Object.fromEntries(SCOPE_OPTIONS.map((scope) => [scope.value, scope.label]));

export default function Authorize({ user }) {
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();

  const query = useMemo(() => Object.fromEntries(params.entries()), [params]);

  const [preview, setPreview] = useState(null);
  const [selected, setSelected] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadAuthorizationRequest() {
      setLoading(true);
      setError('');

      try {
        const { data } = await api.get('/oauth/request', { params: query });
        if (cancelled) return;

        setPreview(data);
        setSelected(data.scopes.map((scope) => scope.value));
      } catch (err) {
        if (!cancelled) {
          setError(getErrorMessage(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadAuthorizationRequest();
    return () => {
      cancelled = true;
    };
  }, [query]);

  function toggleScope(value) {
    setSelected((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
    );
  }

  async function decide(decision) {
    if (submitting) return;
    setError('');

    if (decision === 'allow' && selected.length === 0) {
      setError('Select at least one permission before connecting.');
      return;
    }

    setSubmitting(true);
    try {
      const { data } = await api.post('/oauth/consent', {
        decision,
        scopes: decision === 'allow' ? [...new Set(selected)] : [],
        query
      });

      if (!data?.redirectUrl) {
        throw new Error('Authorization server did not return a redirect URL.');
      }

      window.location.replace(data.redirectUrl);
    } catch (err) {
      setSubmitting(false);
      setError(getErrorMessage(err));
    }
  }

  function login() {
    const currentUrl = `${location.pathname}${location.search}`;
    navigate(`/login?returnTo=${encodeURIComponent(currentUrl)}`);
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm text-slate-500">Loading authorization request…</p>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="mx-auto max-w-xl px-4 py-12">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-slate-900">Login required</h1>
          <p className="mt-3 text-sm text-slate-600">
            Log in or create an account before approving this ChatGPT connection.
          </p>
          <div className="mt-6 flex gap-3">
            <Button onClick={login}>Log in</Button>
            <Button variant="secondary" onClick={() => navigate('/register')}>
              Register
            </Button>
          </div>
        </div>
      </main>
    );
  }

  if (!preview) {
    return (
      <main className="mx-auto max-w-xl px-4 py-12">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-slate-900">Authorization unavailable</h1>
          {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
          <Link to="/dashboard" className="mt-6 inline-block text-sm underline">
            Return to dashboard
          </Link>
        </div>
      </main>
    );
  }

  const roleLabel = user.role === 'admin' ? 'Administrator' : user.role === 'doctor' ? 'Doctor' : 'Patient';

  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">OAuth consent</p>
        <h1 className="mt-3 text-2xl font-semibold text-slate-900">
          ChatGPT is requesting access
        </h1>
        <p className="mt-3 text-sm text-slate-600">
          You are authorizing as <strong>{roleLabel}</strong> ({user.email}). All permissions your
          account can grant are pre-selected so ChatGPT receives a clean, successful connection.
        </p>

        <div className="mt-4 rounded-lg bg-slate-50 px-4 py-3">
          <p className="text-xs text-slate-500">Application</p>
          <p className="mt-1 font-medium text-slate-800">{preview.client.clientName || 'MCP Client'}</p>
          <p className="mt-1 break-all text-xs text-slate-500">{preview.client.clientId}</p>
        </div>

        <fieldset className="mt-6">
          <legend className="text-sm font-medium text-slate-800">Permissions</legend>
          <div className="mt-4 space-y-2">
            {preview.scopes.map((scope) => (
              <label
                key={scope.value}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 ${
                  selected.includes(scope.value) ? 'border-slate-400 bg-slate-50' : 'border-slate-200'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(scope.value)}
                  onChange={() => toggleScope(scope.value)}
                  disabled={submitting}
                  className="h-4 w-4"
                />
                <span>
                  <span className="block text-sm font-medium">{friendlyScopeLabel[scope.value] || scope.label}</span>
                  <span className="block text-xs text-slate-500">{scope.value}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

        <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => decide('deny')} disabled={submitting}>
            Deny
          </Button>
          <Button onClick={() => decide('allow')} disabled={submitting || selected.length === 0}>
            {submitting ? 'Connecting…' : 'Allow & Connect'}
          </Button>
        </div>
      </div>
    </main>
  );
}
