import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Button from '../components/Button.jsx';
import { api, getErrorMessage } from '../services/api.js';

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
    <main className="mx-auto max-w-lg px-4 py-12">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-medium text-slate-500">MCPController</p>
        <h1 className="mt-2 text-xl font-semibold text-slate-900">
          {preview?.client.clientName || 'An application'} is requesting access
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {preview?.client.clientName || 'This application'} wants permission to access your MCPController account.
        </p>

        {preview ? (
          <fieldset className="mt-6">
            <legend className="text-sm font-medium text-slate-800">Requested permissions</legend>
            <p className="mt-1 text-xs text-slate-500">You choose which permissions to grant.</p>
            <div className="mt-3 space-y-2">
              {preview.scopes.map((scope) => (
                <label key={scope.value} className="flex items-start gap-3 rounded-lg border border-slate-200 p-3">
                  <input
                    type="checkbox"
                    checked={selected.includes(scope.value)}
                    onChange={() => toggle(scope.value)}
                    className="mt-1"
                  />
                  <span>
                    <span className="block text-sm font-medium capitalize text-slate-900">{scope.value}</span>
                    <span className="block text-xs text-slate-500">{scope.label}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}

        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={() => decide('deny')}>
            Cancel
          </Button>
          <Button onClick={() => decide('allow')} disabled={!preview || selected.length === 0}>
            Allow & Connect
          </Button>
        </div>
        <p className="mt-4 text-xs text-slate-500">
          <Link to="/dashboard" className="underline">
            Return to dashboard
          </Link>
        </p>
      </div>
    </main>
  );
}
