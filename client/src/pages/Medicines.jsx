import { useEffect, useState } from 'react';
import MedicineList from '../components/MedicineList.jsx';
import { api, getErrorMessage } from '../services/api.js';

export default function Medicines({ user }) {
  const [medicines, setMedicines] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get('/medicines')
      .then(({ data }) => setMedicines(data.medicines || []))
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <main className="mx-auto max-w-4xl px-4 py-10 text-sm text-slate-500">Loading medicines…</main>;
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-3xl font-semibold text-slate-900">Medicine & Health Tips</h1>
      <p className="mt-2 text-slate-600">
        Common medicines and simple care guidance from participating doctors.
      </p>
      {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      <section className="mt-8">
        <MedicineList medicines={medicines} showDoctor emptyMessage="No medicines are available right now." />
      </section>
    </main>
  );
}
