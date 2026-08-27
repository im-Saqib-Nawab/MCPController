import { useCallback, useEffect, useState } from 'react';

import Button from '../components/Button.jsx';
import PermissionCard from '../components/PermissionCard.jsx';
import { api, getErrorMessage } from '../services/api.js';

export default function Dashboard({ user }) {
  const [connections, setConnections] = useState([]);
  const [doctors, setDoctors] = useState([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [revokingClientId, setRevokingClientId] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(
    async ({ initial = false } = {}) => {
      if (initial) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      setError('');

      try {
        /*
         * Both endpoints use the authenticated admin session cookie.
         */
        const [
          { data: connectionData },
          { data: doctorData }
        ] = await Promise.all([
          api.get('/connections'),
          api.get('/doctors')
        ]);

        /*
         * Defensive checks prevent crashes if the backend returns an
         * unexpected response.
         */
        setConnections(
          Array.isArray(connectionData?.connections)
            ? connectionData.connections
            : []
        );

        setDoctors(
          Array.isArray(doctorData?.doctors)
            ? doctorData.doctors
            : []
        );
      } catch (err) {
        setError(getErrorMessage(err));

        /*
         * If the admin session is gone, clear the dashboard data.
         * The parent application can also redirect based on its auth state.
         */
        if (err?.response?.status === 401) {
          setConnections([]);
          setDoctors([]);
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    load({ initial: true });
  }, [load]);

  async function revoke(clientId) {
    if (!clientId || revokingClientId) {
      return;
    }

    const confirmed = window.confirm(
      'Are you sure you want to revoke this application’s access?'
    );

    if (!confirmed) {
      return;
    }

    setError('');
    setRevokingClientId(clientId);

    try {
      await api.delete(
        `/connections/${encodeURIComponent(clientId)}`
      );

      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setRevokingClientId(null);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-10">
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
          <p className="text-sm text-slate-500">
            Loading dashboard…
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
            MCPController
          </p>

          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
            Doctor Management
          </h1>

          {user ? (
            <p className="mt-2 text-slate-600">
              {user.name || 'Administrator'}
              {user.email ? ` · ${user.email}` : ''}
            </p>
          ) : null}
        </div>

        <Button
          type="button"
          variant="secondary"
          onClick={() => load()}
          disabled={refreshing || revokingClientId !== null}
        >
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>

      {error ? (
        <div
          role="alert"
          className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3"
        >
          <p className="text-sm font-medium text-red-800">
            {error}
          </p>

          {error.toLowerCase().includes('login') ||
          error.toLowerCase().includes('authenticated') ||
          error.toLowerCase().includes('unauthorized') ? (
            <a
              href="/login"
              className="mt-2 inline-block text-sm font-medium text-red-700 underline underline-offset-4"
            >
              Log in again
            </a>
          ) : null}
        </div>
      ) : null}

      <section className="mt-8 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
          Admin
        </h2>

        <dl className="mt-3 grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">
              Status
            </dt>

            <dd className="font-medium text-emerald-700">
              Authenticated
            </dd>
          </div>

          <div>
            <dt className="text-slate-500">
              Role
            </dt>

            <dd className="font-medium text-slate-900">
              Single Admin
            </dd>
          </div>
        </dl>
      </section>

      <section className="mt-10">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-slate-900">
            Connected Applications
          </h2>

          <span className="text-sm text-slate-500">
            {connections.length}{' '}
            {connections.length === 1
              ? 'connection'
              : 'connections'}
          </span>
        </div>

        <div className="mt-4 grid gap-4">
          {connections.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6">
              <p className="text-sm font-medium text-slate-700">
                No applications connected yet.
              </p>

              <p className="mt-1 text-sm text-slate-500">
                When ChatGPT or another MCP client completes OAuth,
                the connection will appear here.
              </p>
            </div>
          ) : (
            connections.map((connection) => {
              const isRevoking =
                revokingClientId ===
                connection.clientId;

              return (
                <article
                  key={connection.clientId}
                  className="rounded-xl border border-slate-200 bg-white p-5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-semibold text-slate-900">
                        {connection.clientName ||
                          'MCP Client'}
                      </h3>

                      <p className="mt-1 text-sm text-emerald-700">
                        Connected
                      </p>

                      <p className="mt-2 break-all text-xs text-slate-400">
                        {connection.clientId}
                      </p>
                    </div>

                    <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                      Active
                    </span>
                  </div>

                  <div className="mt-5">
                    <p className="mb-2 text-sm font-medium text-slate-700">
                      Granted Permissions
                    </p>

                    <PermissionCard
                      scopes={
                        Array.isArray(
                          connection.scopes
                        )
                          ? connection.scopes
                          : []
                      }
                    />
                  </div>

                  <div className="mt-5">
                    <Button
                      type="button"
                      variant="danger"
                      onClick={() =>
                        revoke(
                          connection.clientId
                        )
                      }
                      disabled={
                        isRevoking ||
                        refreshing
                      }
                    >
                      {isRevoking
                        ? 'Revoking…'
                        : 'Revoke Access'}
                    </Button>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </section>

      <section className="mt-10">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-slate-900">
            Doctors
          </h2>

          <span className="text-sm text-slate-500">
            {doctors.length}{' '}
            {doctors.length === 1
              ? 'doctor'
              : 'doctors'}
          </span>
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {doctors.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">
              No doctors found.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[500px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-6 py-3 font-medium">
                      Name
                    </th>

                    <th className="px-6 py-3 font-medium">
                      Specialization
                    </th>

                    <th className="px-6 py-3 font-medium">
                      Email
                    </th>

                    <th className="px-6 py-3 font-medium">
                      Phone
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {doctors.map((doctor) => (
                    <tr
                      key={
                        doctor.id ||
                        doctor._id ||
                        `${doctor.email}-${doctor.name}`
                      }
                      className="border-b border-slate-100 last:border-b-0"
                    >
                      <td className="px-6 py-4 font-medium text-slate-900">
                        {doctor.name || '—'}
                      </td>

                      <td className="px-6 py-4 text-slate-600">
                        {doctor.specialization ||
                          '—'}
                      </td>

                      <td className="px-6 py-4 text-slate-600">
                        {doctor.email || '—'}
                      </td>

                      <td className="px-6 py-4 text-slate-600">
                        {doctor.phone || '—'}
                      </td>
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