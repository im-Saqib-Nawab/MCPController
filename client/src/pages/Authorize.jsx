import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Button from '../components/Button.jsx';
import { api, getErrorMessage } from '../services/api.js';

const friendlyScopeLabel = {
  'doctor:read': 'Read Doctors',
  'doctor:write': 'Add & Update Doctors',
  'doctor:delete': 'Delete Doctors'
};

export default function Authorize() {
  const [params] = useSearchParams();
  const query = useMemo(() => Object.fromEntries(params.entries()), [params]);
  const [preview, setPreview] = useState(null);
  const [selected, setSelected] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const { data } = await api.get('/oauth/request', { params: query });
        if (cancelled) return;
        setPreview(data);
        setSelected(data.scopes.map((scope) => scope.value));
      } catch (err) {
        if (!cancelled) setError(getErrorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [params]);

  function toggle(value) {
    setSelected((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
    );
  }

  async function decide(decision) {
    setError('');
    try {
      const { data } = await api.post('/oauth/consent', {
        decision,
        scopes: selected,
        query
      });
      window.location.assign(data.redirectUrl);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  if (loading) {
    return <p className="px-4 py-16 text-center text-sm text-slate-500">Loading authorization request…</p>;
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">MCPController</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">
          ChatGPT is requesting access to Doctor Management
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          {preview?.client.clientName || 'This application'} will only be able to perform the actions you allow.
        </p>

        {preview ? (
          <fieldset className="mt-6">
            <legend className="text-sm font-medium text-slate-800">Requested permissions</legend>
            <p className="mt-1 text-xs text-slate-500">Select the permissions ChatGPT should receive.</p>
            <div className="mt-4 space-y-2">
              {preview.scopes.map((scope) => (
                <label key={scope.value} className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selected.includes(scope.value)}
                    onChange={() => toggle(scope.value)}
                    className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-slate-900">
                      {friendlyScopeLabel[scope.value] || scope.label}
                    </span>
                    <span className="block text-xs text-slate-500">{scope.value}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}

        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

        <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => decide('deny')}>
            Deny
          </Button>
          <Button onClick={() => decide('allow')} disabled={!preview || selected.length === 0}>
            Allow & Connect
          </Button>
        </div>
        <p className="mt-4 text-xs text-slate-500">
          <Link to="/dashboard" className="underline underline-offset-4">
            Return to dashboard
          </Link>
        </p>
      </div>
    </main>
  );
}
