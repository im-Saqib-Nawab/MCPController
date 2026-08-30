import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../components/Button.jsx';
import { api, getErrorMessage } from '../services/api.js';

export default function Doctors() {
  const [doctors, setDoctors] = useState([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get('/doctors')
      .then(({ data }) => setDoctors(data.doctors || []))
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return doctors;
    return doctors.filter((doctor) =>
      [doctor.name, doctor.specialization, doctor.availability].some((field) =>
        String(field || '').toLowerCase().includes(value)
      )
    );
  }, [doctors, query]);

  if (loading) {
    return <main className="mx-auto max-w-5xl px-4 py-10 text-sm text-slate-500">Loading doctors…</main>;
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-3xl font-semibold text-slate-900">Doctors</h1>
      <p className="mt-2 text-slate-600">Search by name or specialization, then view availability and book a day.</p>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search doctors"
        className="mt-6 w-full rounded-lg border border-slate-300 px-3 py-2"
      />
      {error ? <p className="mt-4 text-sm text-red-700">{error}</p> : null}
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {filtered.map((doctor) => (
          <article key={doctor.id} className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-lg font-semibold text-slate-900">{doctor.name}</h2>
            <p className="text-sm text-slate-500">{doctor.specialization}</p>
            <p className="mt-3 text-sm text-slate-700">Available: {doctor.availability}</p>
            <p className="text-sm text-slate-700">Next available: {doctor.nextAvailableDate || 'None'}</p>
            <div className="mt-4 flex gap-2">
              <Link to={`/doctors/${doctor.id}`}><Button variant="secondary">View doctor</Button></Link>
              <Link to={`/doctors/${doctor.id}`}><Button>Book appointment</Button></Link>
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
