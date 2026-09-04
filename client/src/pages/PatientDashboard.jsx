import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../components/Button.jsx';
import AppointmentBadge from '../components/AppointmentBadge.jsx';
import { STATUS_META } from '../lib/status.js';
import { api, getErrorMessage } from '../services/api.js';
import CreditBalanceCard from '../components/CreditBalanceCard.jsx';

export default function PatientDashboard({ user }) {
  const [appointments, setAppointments] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [appointmentsRes, doctorsRes] = await Promise.all([api.get('/appointments'), api.get('/doctors')]);
      setAppointments(appointmentsRes.data.appointments || []);
      setDoctors((doctorsRes.data.doctors || []).slice(0, 4));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function acceptAlternative(id, date) {
    try {
      await api.post(`/appointments/${id}/accept-alternative`, { date });
      setSuccess('Alternative date selected. The doctor will confirm it.');
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function cancel(id) {
    try {
      await api.post(`/appointments/${id}/cancel`);
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  const pending = appointments.filter((item) => item.status === 'REQUESTED' || item.status === 'RESCHEDULED');
  const confirmed = appointments.filter((item) => item.status === 'ACCEPTED');
  const alternatives = appointments.filter((item) => item.status === 'ALTERNATIVE_OFFERED' || item.status === 'REJECTED');
  const history = appointments.filter((item) => ['CANCELLED', 'COMPLETED'].includes(item.status));

  if (loading) {
    return <main className="mx-auto max-w-5xl px-4 py-10 text-sm text-slate-500">Loading dashboard…</main>;
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Patient dashboard</h1>
          <p className="mt-2 text-slate-600">Hello {user.name}. View doctors, request a day, and track responses.</p>
        </div>
        <Link to="/doctors"><Button>Browse doctors</Button></Link>
      </div>

      {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {success ? <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{success}</div> : null}

      <div className="mt-6">
        <CreditBalanceCard
          balance={user.creditBalance ?? 0}
          subscription={user.subscription}
        />
      </div>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-slate-900">Doctors</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {doctors.map((doctor) => (
            <article key={doctor.id} className="rounded-xl border border-slate-200 bg-white p-5">
              <h3 className="font-semibold text-slate-900">{doctor.name}</h3>
              <p className="text-sm text-slate-500">{doctor.specialization}</p>
              <p className="mt-2 text-sm text-slate-600">Available: {doctor.availability}</p>
              <p className="text-sm text-slate-600">Next available: {doctor.nextAvailableDate || 'None'}</p>
              <div className="mt-4 flex gap-2">
                <Link to={`/doctors/${doctor.id}`}><Button variant="secondary">View</Button></Link>
                <Link to={`/doctors/${doctor.id}`}><Button>Book</Button></Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <AppointmentList title="Pending requests" items={pending} onCancel={cancel} />
      <AppointmentList title="Confirmed appointments" items={confirmed} onCancel={cancel} />
      <section className="mt-10">
        <h2 className="text-lg font-semibold text-slate-900">Rejected / alternative dates</h2>
        <div className="mt-4 grid gap-3">
          {alternatives.length === 0 ? <p className="text-sm text-slate-500">No rejected requests.</p> : null}
          {alternatives.map((item) => (
            <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{item.doctor?.name}</p>
                  <p className="text-sm text-slate-500">{item.weekdayLabel} · {item.date}</p>
                  {item.rejectionReason ? <p className="mt-2 text-sm text-slate-700">{item.rejectionReason}</p> : null}
                </div>
                <AppointmentBadge status={item.status} />
              </div>
              {item.suggestedDates?.length ? (
                <div className="mt-3">
                  <p className="text-sm font-medium text-slate-700">Suggested available dates</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {item.suggestedDates.map((date) => (
                      <Button key={date} variant="secondary" onClick={() => acceptAlternative(item.id, date)}>
                        Accept {date}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </section>
      <AppointmentList title="History" items={history} />
    </main>
  );
}

function AppointmentList({ title, items, onCancel }) {
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <div className="mt-4 grid gap-3">
        {items.length === 0 ? <p className="text-sm text-slate-500">Nothing here yet.</p> : null}
        {items.map((item) => (
          <article key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
            <div>
              <p className="font-medium">{item.doctor?.name}</p>
              <p className="text-sm text-slate-500">{item.weekdayLabel} · {item.date} · {STATUS_META[item.status]?.hint}</p>
            </div>
            <div className="flex items-center gap-2">
              <AppointmentBadge status={item.status} />
              {onCancel && item.status !== 'COMPLETED' && item.status !== 'CANCELLED' ? (
                <Button variant="danger" onClick={() => onCancel(item.id)}>Cancel</Button>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
