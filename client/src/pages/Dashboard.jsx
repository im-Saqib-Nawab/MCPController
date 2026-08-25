import { useEffect, useState } from 'react';
import Button from '../components/Button.jsx';
import PermissionCard from '../components/PermissionCard.jsx';
import { api, getErrorMessage } from '../services/api.js';

export default function Dashboard({ user }) {
  const [connections, setConnections] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [error, setError] = useState('');

  async function load() {
    try {
      const [{ data: connectionData }, { data: doctorData }] = await Promise.all([
        api.get('/connections'),
        api.get('/doctors')
      ]);
      setConnections(connectionData.connections);
      setDoctors(doctorData.doctors);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function revoke(clientId) {
    try {
      await api.delete(`/connections/${encodeURIComponent(clientId)}`);
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">MCPController</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Doctor Management</h1>
      <p className="mt-2 text-slate-600">
        {user.name} · {user.email}
      </p>

      <section className="mt-8 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">Admin</h2>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">Status</dt>
            <dd className="font-medium text-slate-900">Authenticated</dd>
          </div>
          <div>
            <dt className="text-slate-500">Role</dt>
            <dd className="font-medium text-slate-900">Single Admin</dd>
          </div>
        </dl>
      </section>

      <h2 className="mt-10 text-lg font-semibold text-slate-900">Connected Application</h2>
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      <div className="mt-4 grid gap-4">
        {connections.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
            No applications connected yet. When ChatGPT (or MCP Inspector) completes OAuth, it will appear here.
          </p>
        ) : (
          connections.map((connection) => (
            <article key={connection.clientId} className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">{connection.clientName}</h3>
                  <p className="mt-1 text-sm text-emerald-700">Connected</p>
                </div>
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                  Active
                </span>
              </div>
              <div className="mt-4">
                <p className="mb-2 text-sm font-medium text-slate-700">Granted Permissions</p>
                <PermissionCard scopes={connection.scopes} />
              </div>
              <div className="mt-5">
                <Button variant="danger" onClick={() => revoke(connection.clientId)}>
                  Revoke Access
                </Button>
              </div>
            </article>
          ))
        )}
      </div>

      <h2 className="mt-10 text-lg font-semibold text-slate-900">Doctors</h2>
      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {doctors.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">No doctors found.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
              <tr>
                <th className="px-6 py-3 font-medium">Name</th>
                <th className="px-6 py-3 font-medium">Specialization</th>
              </tr>
            </thead>
            <tbody>
              {doctors.map((doctor) => (
                <tr key={doctor.id} className="border-b border-slate-100 last:border-b-0">
                  <td className="px-6 py-4 font-medium text-slate-900">{doctor.name}</td>
                  <td className="px-6 py-4 text-slate-600">{doctor.specialization}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
