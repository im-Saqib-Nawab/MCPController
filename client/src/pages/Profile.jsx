import { useEffect, useState } from 'react';
import Button from '../components/Button.jsx';
import PermissionCard from '../components/PermissionCard.jsx';
import { api, getErrorMessage } from '../services/api.js';

export default function Profile({ user, onUserUpdated }) {
  const [form, setForm] = useState({
    name: user.name || '',
    phone: user.phone || '',
    age: user.age ?? '',
    gender: user.gender || '',
    bio: user.bio || '',
    specialization: user.specialization || ''
  });
  const [connections, setConnections] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get('/connections')
      .then(({ data }) => setConnections(data.connections || []))
      .catch(() => setConnections([]));
  }, []);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const payload = {
        name: form.name,
        phone: form.phone,
        gender: form.gender,
        bio: form.bio
      };
      if (form.age !== '') payload.age = Number(form.age);
      if (user.role === 'doctor') payload.specialization = form.specialization;
      const { data } = await api.patch('/auth/me', payload);
      onUserUpdated?.(data.user);
      setSuccess('Profile updated.');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function revokeConnection(clientId) {
    if (!window.confirm('Revoke this MCP connection?')) return;
    try {
      await api.delete(`/connections/${encodeURIComponent(clientId)}`);
      setConnections((current) => current.filter((item) => item.clientId !== clientId));
      setSuccess('Connection revoked.');
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-3xl font-semibold text-slate-900">Profile</h1>
      <p className="mt-2 text-sm text-slate-600">Update only your own account information.</p>

      {error ? <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {success ? <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{success}</p> : null}

      <form onSubmit={submit} className="mt-6 space-y-4 rounded-xl border border-slate-200 bg-white p-6">
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Name</span>
          <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={form.name} onChange={(e) => update('name', e.target.value)} required />
        </label>
        {user.role === 'doctor' ? (
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Specialization</span>
            <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={form.specialization} onChange={(e) => update('specialization', e.target.value)} />
          </label>
        ) : null}
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Phone</span>
          <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={form.phone} onChange={(e) => update('phone', e.target.value)} />
        </label>
        {user.role !== 'admin' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Age</span>
              <input type="number" min="0" max="130" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={form.age} onChange={(e) => update('age', e.target.value)} />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Gender</span>
              <select className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={form.gender} onChange={(e) => update('gender', e.target.value)}>
                <option value="">Prefer not to say</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="other">Other</option>
              </select>
            </label>
          </div>
        ) : null}
        <label className="block text-sm">
          <span className="font-medium text-slate-700">About</span>
          <textarea className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" rows="3" value={form.bio} onChange={(e) => update('bio', e.target.value)} />
        </label>
        <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</Button>
      </form>

      <section className="mt-10 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-900">Connected applications</h2>
        <p className="mt-1 text-sm text-slate-500">ChatGPT and other MCP clients authorized with your account.</p>
        <div className="mt-4 grid gap-3">
          {connections.length === 0 ? <p className="text-sm text-slate-500">No active connections.</p> : null}
          {connections.map((connection) => (
            <article key={connection.clientId} className="rounded-lg border border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{connection.clientName || 'MCP Client'}</p>
                  <p className="mt-1 break-all text-xs text-slate-400">{connection.clientId}</p>
                </div>
                <Button variant="danger" onClick={() => revokeConnection(connection.clientId)}>Revoke access</Button>
              </div>
              <div className="mt-3">
                <PermissionCard scopes={connection.scopes || []} />
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
