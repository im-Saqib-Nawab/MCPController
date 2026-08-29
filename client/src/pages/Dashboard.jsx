import { useCallback, useEffect, useState } from 'react';
import Button from '../components/Button.jsx';
import PermissionCard from '../components/PermissionCard.jsx';
import { api, getErrorMessage } from '../services/api.js';

const SCOPE_OPTIONS = [
  { value: 'doctor:read', label: 'Read doctors' },
  { value: 'doctor:create', label: 'Add/create doctors' },
  { value: 'doctor:update', label: 'Update doctors' },
  { value: 'doctor:delete', label: 'Delete doctors' }
];

export default function Dashboard({ user }) {
  const isAdmin = user?.role === 'admin';

  const [connections, setConnections] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [revokingClientId, setRevokingClientId] = useState(null);
  const [savingUserId, setSavingUserId] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(
    async ({ initial = false } = {}) => {
      if (initial) setLoading(true);
      else setRefreshing(true);

      setError('');
      setSuccess('');

      try {
        const requests = [api.get('/connections'), api.get('/doctors')];
        if (isAdmin) {
          requests.push(api.get('/admin/users'));
        }

        const results = await Promise.all(requests);
        setConnections(Array.isArray(results[0].data?.connections) ? results[0].data.connections : []);
        setDoctors(Array.isArray(results[1].data?.doctors) ? results[1].data.doctors : []);

        if (isAdmin && results[2]) {
          setUsers(Array.isArray(results[2].data?.users) ? results[2].data.users : []);
        }
      } catch (err) {
        setError(getErrorMessage(err));
        if (err?.response?.status === 401) {
          setConnections([]);
          setDoctors([]);
          setUsers([]);
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [isAdmin]
  );

  useEffect(() => {
    load({ initial: true });
  }, [load]);

  async function revoke(clientId) {
    if (!clientId || revokingClientId) return;
    if (!window.confirm('Revoke this application’s access? ChatGPT will need to authorize again.')) return;

    setRevokingClientId(clientId);
    setError('');
    try {
      await api.delete(`/connections/${encodeURIComponent(clientId)}`);
      setSuccess('Access revoked. Existing tokens are no longer valid.');
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setRevokingClientId(null);
    }
  }

  async function saveUserPermissions(targetUser) {
    setSavingUserId(targetUser.id);
    setError('');
    setSuccess('');
    try {
      await api.patch(`/admin/users/${targetUser.id}/permissions`, {
        allowedScopes: targetUser.allowedScopes
      });
      setSuccess(`Updated permissions for ${targetUser.email}.`);
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSavingUserId(null);
    }
  }

  function toggleUserScope(targetUser, scope) {
    setUsers((current) =>
      current.map((item) => {
        if (item.id !== targetUser.id) return item;
        const hasScope = item.allowedScopes.includes(scope);
        return {
          ...item,
          allowedScopes: hasScope
            ? item.allowedScopes.filter((value) => value !== scope)
            : [...item.allowedScopes, scope]
        };
      })
    );
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-10">
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
          <p className="text-sm text-slate-500">Loading dashboard…</p>
        </div>
      </main>
    );
  }

  const roleLabel = user.role === 'admin' ? 'Administrator' : 'User';

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">MCPController</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-900">Dashboard</h1>
          <p className="mt-2 text-slate-600">
            {user.name} · {user.email} · {roleLabel}
          </p>
        </div>
        <Button variant="secondary" onClick={() => load()} disabled={refreshing}>
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>

      {error ? (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}
      {success ? (
        <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {success}
        </div>
      ) : null}

      <section className="mt-8 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">Your account</h2>
        <dl className="mt-3 grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">Role</dt>
            <dd className="font-medium text-slate-900">{roleLabel}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Permissions you may grant to ChatGPT</dt>
            <dd className="mt-1">
              <PermissionCard scopes={user.allowedScopes || []} />
            </dd>
          </div>
        </dl>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-slate-900">Connected applications</h2>
        <div className="mt-4 grid gap-4">
          {connections.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
              No ChatGPT or MCP client connections yet.
            </div>
          ) : (
            connections.map((connection) => (
              <article key={connection.clientId} className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-semibold text-slate-900">{connection.clientName || 'MCP Client'}</h3>
                    <p className="mt-1 text-sm text-emerald-700">
                      Connected as {connection.authorizedAs === 'admin' ? 'Administrator' : 'User'}
                    </p>
                    <p className="mt-2 break-all text-xs text-slate-400">{connection.clientId}</p>
                  </div>
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                    Active
                  </span>
                </div>
                <div className="mt-4">
                  <p className="mb-2 text-sm font-medium text-slate-700">Granted permissions</p>
                  <PermissionCard scopes={connection.scopes || []} />
                </div>
                <div className="mt-4">
                  <Button
                    variant="danger"
                    onClick={() => revoke(connection.clientId)}
                    disabled={revokingClientId === connection.clientId}
                  >
                    {revokingClientId === connection.clientId ? 'Revoking…' : 'Revoke access'}
                  </Button>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      {isAdmin ? (
        <section className="mt-10">
          <h2 className="text-lg font-semibold text-slate-900">User permissions</h2>
          <p className="mt-1 text-sm text-slate-500">
            Control which OAuth scopes each user is allowed to grant when connecting ChatGPT.
          </p>
          <div className="mt-4 grid gap-4">
            {users
              .filter((item) => item.role !== 'admin')
              .map((item) => (
                <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="font-semibold text-slate-900">{item.name}</h3>
                      <p className="text-sm text-slate-500">{item.email}</p>
                    </div>
                    <Button
                      onClick={() => saveUserPermissions(item)}
                      disabled={savingUserId === item.id}
                    >
                      {savingUserId === item.id ? 'Saving…' : 'Save permissions'}
                    </Button>
                  </div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {SCOPE_OPTIONS.map((scope) => (
                      <label key={scope.value} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={item.allowedScopes.includes(scope.value)}
                          onChange={() => toggleUserScope(item, scope.value)}
                        />
                        {scope.label}
                      </label>
                    ))}
                  </div>
                </article>
              ))}
          </div>
        </section>
      ) : null}

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-slate-900">Doctors</h2>
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {doctors.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">No doctors found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-6 py-3 font-medium">Name</th>
                    <th className="px-6 py-3 font-medium">Specialization</th>
                    <th className="px-6 py-3 font-medium">Email</th>
                    <th className="px-6 py-3 font-medium">Phone</th>
                    <th className="px-6 py-3 font-medium">Availability</th>
                  </tr>
                </thead>
                <tbody>
                  {doctors.map((doctor) => (
                    <tr key={doctor.id || doctor._id} className="border-b border-slate-100 last:border-b-0">
                      <td className="px-6 py-4 font-medium text-slate-900">{doctor.name || '—'}</td>
                      <td className="px-6 py-4 text-slate-600">{doctor.specialization || '—'}</td>
                      <td className="px-6 py-4 text-slate-600">{doctor.email || '—'}</td>
                      <td className="px-6 py-4 text-slate-600">{doctor.phone || '—'}</td>
                      <td className="px-6 py-4 text-slate-600">{doctor.availability || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
