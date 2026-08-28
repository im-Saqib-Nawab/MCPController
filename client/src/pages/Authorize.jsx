import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';

import Button from '../components/Button.jsx';
import { api, getErrorMessage } from '../services/api.js';

const friendlyScopeLabel = {
  'doctor:read': 'Read Doctors',
  'doctor:write': 'Add & Update Doctors',
  'doctor:delete': 'Delete Doctors'
};

export default function Authorize() {
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();

  const query = useMemo(
    () => Object.fromEntries(params.entries()),
    [params]
  );

  const [preview, setPreview] = useState(null);
  const [selected, setSelected] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [requiresLogin, setRequiresLogin] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadAuthorizationRequest() {
      setLoading(true);
      setError('');
      setRequiresLogin(false);

      try {
        const { data } = await api.get('/oauth/request', {
          params: query
        });

        if (cancelled) return;

        if (!data || !data.client || !Array.isArray(data.scopes)) {
          throw new Error(
            'The authorization server returned an invalid authorization request.'
          );
        }

        setPreview(data);

        const requestedScopes = data.scopes
          .filter(
            (scope) =>
              scope &&
              typeof scope.value === 'string' &&
              scope.requested === true
          )
          .map((scope) => scope.value);

        setSelected([...new Set(requestedScopes)]);
      } catch (err) {
        if (cancelled) return;

        const status = err?.response?.status;

        if (status === 401) {
          setRequiresLogin(true);
          setError(
            'You must log in as the administrator before approving this connection.'
          );
          return;
        }

        setError(getErrorMessage(err));
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadAuthorizationRequest();

    return () => {
      cancelled = true;
    };
  }, [query]);

  function toggleScope(value) {
    if (!preview?.scopes?.some((scope) => scope.value === value)) {
      return;
    }

    setSelected((current) => {
      if (current.includes(value)) {
        return current.filter((item) => item !== value);
      }
      return [...current, value];
    });
  }

  async function decide(decision) {
    if (submitting) return;

    setError('');

    if (decision === 'allow' && selected.length === 0) {
      setError('Select at least one permission before connecting.');
      return;
    }

    if (!query.client_id) {
      setError('The OAuth request is missing client_id.');
      return;
    }

    if (!query.redirect_uri) {
      setError('The OAuth request is missing redirect_uri.');
      return;
    }

    if (!query.code_challenge) {
      setError('The OAuth request is missing PKCE code_challenge.');
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

      const status = err?.response?.status;

      if (status === 401) {
        setRequiresLogin(true);
        setError(
          'Your administrator session has expired. Please log in again.'
        );
        return;
      }

      setError(getErrorMessage(err));
    }
  }

  function login() {
    const currentUrl = `${location.pathname}${location.search}`;
    const loginUrl = `/login?returnTo=${encodeURIComponent(currentUrl)}`;
    navigate(loginUrl);
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm text-slate-500">
            Loading authorization request…
          </p>
        </div>
      </main>
    );
  }

  if (requiresLogin) {
    return (
      <main className="mx-auto max-w-xl px-4 py-12">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
            MCPController
          </p>

          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">
            Administrator login required
          </h1>

          <p className="mt-3 text-sm leading-6 text-slate-600">
            Log in as the administrator to review and approve the ChatGPT MCP
            connection.
          </p>

          {error ? (
            <p
              role="alert"
              className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {error}
            </p>
          ) : null}

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Button onClick={login} disabled={submitting} className="flex-1">
              Log in as Administrator
            </Button>

            <Button
              variant="secondary"
              onClick={() => navigate('/dashboard')}
              disabled={submitting}
            >
              Dashboard
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
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
            MCPController
          </p>

          <h1 className="mt-3 text-2xl font-semibold text-slate-900">
            Authorization request unavailable
          </h1>

          {error ? (
            <p role="alert" className="mt-4 text-sm text-red-600">
              {error}
            </p>
          ) : null}

          <div className="mt-6">
            <Link
              to="/dashboard"
              className="text-sm underline underline-offset-4"
            >
              Return to dashboard
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
          MCPController
        </p>

        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">
          ChatGPT is requesting access to Doctor Management
        </h1>

        <p className="mt-3 text-sm leading-6 text-slate-600">
          <strong>
            {preview.client.clientName || 'This application'}
          </strong>{' '}
          will only be able to perform the actions you allow.
        </p>

        <div className="mt-4 rounded-lg bg-slate-50 px-4 py-3">
          <p className="text-xs text-slate-500">Client</p>
          <p className="mt-1 break-all text-xs font-medium text-slate-700">
            {preview.client.clientId}
          </p>
        </div>

        <fieldset className="mt-6">
          <legend className="text-sm font-medium text-slate-800">
            Requested permissions
          </legend>

          <p className="mt-1 text-xs text-slate-500">
            Select the permissions ChatGPT should receive.
          </p>

          <div className="mt-4 space-y-2">
            {preview.scopes.map((scope) => (
              <label
                key={scope.value}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition ${
                  selected.includes(scope.value)
                    ? 'border-slate-400 bg-slate-50'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(scope.value)}
                  onChange={() => toggleScope(scope.value)}
                  disabled={submitting}
                  className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
                />

                <span className="min-w-0">
                  <span className="block text-sm font-medium text-slate-900">
                    {friendlyScopeLabel[scope.value] ||
                      scope.label ||
                      scope.value}
                  </span>

                  <span className="block text-xs text-slate-500">
                    {scope.value}
                  </span>

                  {scope.requested === false ? (
                    <span className="mt-1 block text-[11px] text-slate-400">
                      Not explicitly requested by the client
                    </span>
                  ) : null}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {error ? (
          <p
            role="alert"
            className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {error}
          </p>
        ) : null}

        <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="secondary"
            onClick={() => decide('deny')}
            disabled={submitting}
          >
            {submitting ? 'Processing…' : 'Deny'}
          </Button>

          <Button
            type="button"
            onClick={() => decide('allow')}
            disabled={submitting || selected.length === 0}
          >
            {submitting ? 'Connecting…' : 'Allow & Connect'}
          </Button>
        </div>

        <p className="mt-4 text-xs text-slate-500">
          <Link
            to="/dashboard"
            className="underline underline-offset-4"
          >
            Return to dashboard
          </Link>
        </p>
      </div>
    </main>
  );
}