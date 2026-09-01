import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Button from '../components/Button.jsx';
import AvailabilityGrid from '../components/AvailabilityGrid.jsx';
import MedicineList from '../components/MedicineList.jsx';
import { api, getErrorMessage } from '../services/api.js';

export default function DoctorDetail({ user }) {
  const { doctorId } = useParams();
  const [doctor, setDoctor] = useState(null);
  const [medicines, setMedicines] = useState([]);
  const [medicinesAvailable, setMedicinesAvailable] = useState(false);
  const [selectedDate, setSelectedDate] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    const { data } = await api.get(`/doctors/${doctorId}`);
    setDoctor(data.doctor);

    const canTryMedicines = Boolean(user?.features?.medicine_health_tips?.canView);
    if (canTryMedicines) {
      try {
        const medicinesRes = await api.get('/medicines', { params: { doctorId } });
        setMedicines(medicinesRes.data.medicines || []);
        setMedicinesAvailable(true);
      } catch {
        setMedicines([]);
        setMedicinesAvailable(false);
      }
    } else {
      setMedicines([]);
      setMedicinesAvailable(false);
    }
  }

  useEffect(() => {
    load()
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [doctorId]);

  async function book() {
    if (!selectedDate) {
      setError('Select an available day first.');
      return;
    }
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      await api.post('/appointments', { doctorId, date: selectedDate });
      setSuccess('Appointment requested. The doctor will accept one patient for that day.');
      setSelectedDate('');
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <main className="mx-auto max-w-3xl px-4 py-10 text-sm text-slate-500">Loading doctor…</main>;
  }

  if (!doctor) {
    return <main className="mx-auto max-w-3xl px-4 py-10 text-sm text-slate-500">Doctor not found.</main>;
  }

  const canBook = user?.role === 'patient' || user?.role === 'admin';

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Link to="/doctors" className="text-sm underline">Back to doctors</Link>
      <h1 className="mt-4 text-3xl font-semibold text-slate-900">{doctor.name}</h1>
      <p className="mt-2 text-slate-600">{doctor.specialization}</p>
      {doctor.phone ? <p className="mt-1 text-sm text-slate-500">{doctor.phone}</p> : null}

      <section className="mt-8 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold text-slate-900">Availability</h2>
        <p className="mt-1 text-sm text-slate-500">Available days can be requested. Busy days already have a confirmed patient.</p>
        <div className="mt-4">
          <AvailabilityGrid
            weeklyAvailability={doctor.weeklyAvailability}
            schedule={doctor.schedule}
            selectable={canBook}
            selectedDate={selectedDate}
            onSelect={setSelectedDate}
          />
        </div>
        {selectedDate ? <p className="mt-4 text-sm text-slate-700">Selected date: {selectedDate}</p> : null}
        {error ? <p className="mt-4 text-sm text-red-700">{error}</p> : null}
        {success ? <p className="mt-4 text-sm text-emerald-700">{success}</p> : null}
        {canBook ? (
          <div className="mt-4">
            <Button onClick={book} disabled={submitting || !selectedDate}>
              {submitting ? 'Requesting…' : 'Request appointment'}
            </Button>
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-500">Log in as a patient to request an appointment.</p>
        )}
      </section>

      {medicinesAvailable ? (
        <section className="mt-8 rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold text-slate-900">Medicine & Health Tips</h2>
          <p className="mt-1 text-sm text-slate-500">
            Common medicines and simple care guidance from {doctor.name}.
          </p>
          <div className="mt-4">
            <MedicineList medicines={medicines} emptyMessage="This doctor has not listed any medicines yet." />
          </div>
        </section>
      ) : null}
    </main>
  );
}
