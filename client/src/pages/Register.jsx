import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import Button from '../components/Button.jsx';
import { api, getErrorMessage } from '../services/api.js';

export default function Register({ onRegistered }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const redirectTarget = params.get('returnTo') || '/dashboard';

  const [role, setRole] = useState('patient');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [specialization, setSpecialization] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const payload = { name, email, password, role, phone };
      if (role === 'doctor') payload.specialization = specialization;
      const { data } = await api.post('/auth/register', payload);
      onRegistered?.(data.user);

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
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">Create account</h1>
        <p className="mt-2 text-sm text-slate-600">
          Register as a patient to book appointments, or as a doctor to manage your availability and requests.
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <fieldset className="grid grid-cols-2 gap-2 text-sm">
            {['patient', 'doctor'].map((value) => (
              <label
                key={value}
                className={`rounded-lg border px-3 py-2 ${role === value ? 'border-slate-900 bg-slate-50' : 'border-slate-300'}`}
              >
                <input
                  type="radio"
                  name="role"
                  value={value}
                  checked={role === value}
                  onChange={() => setRole(value)}
                  className="mr-2"
                />
                {value === 'patient' ? 'Patient' : 'Doctor'}
              </label>
            ))}
          </fieldset>

          <label className="block text-sm">
            <span className="font-medium text-slate-700">Name</span>
            <input
              type="text"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
            />
          </label>

          {role === 'doctor' ? (
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Specialization</span>
              <input
                type="text"
                required
                value={specialization}
                onChange={(event) => setSpecialization(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
              />
            </label>
          ) : null}

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
            <span className="font-medium text-slate-700">Phone</span>
            <input
              type="text"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
            />
          </label>

          <label className="block text-sm">
            <span className="font-medium text-slate-700">Password</span>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
            />
          </label>

          {error ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Creating account…' : 'Create account'}
          </Button>
        </form>

        <p className="mt-4 text-sm text-slate-500">
          Already have an account?{' '}
          <Link to={`/login${redirectTarget !== '/dashboard' ? `?returnTo=${encodeURIComponent(redirectTarget)}` : ''}`} className="underline">
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}
