import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Button from '../components/Button.jsx';
import AppointmentBadge from '../components/AppointmentBadge.jsx';
import { WeeklyEditor } from '../components/AvailabilityGrid.jsx';
import { STATUS_META, weekdayLabel } from '../lib/status.js';
import { api, getErrorMessage } from '../services/api.js';
import CreditBalanceCard from '../components/CreditBalanceCard.jsx';

const MedicineManager = lazy(() => import('../components/MedicineManager.jsx'));

export default function DoctorDashboard({ user }) {
  const [appointments, setAppointments] = useState([]);
  const [weekly, setWeekly] = useState(user.weeklyAvailability || {});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);
  const [suggesting, setSuggesting] = useState(null);
  const [suggestDates, setSuggestDates] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const appointmentsRes = await api.get('/appointments');
      setAppointments(appointmentsRes.data.appointments || []);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const pending = appointments.filter((item) => ['REQUESTED', 'ALTERNATIVE_OFFERED', 'RESCHEDULED'].includes(item.status));
  const confirmed = appointments.filter((item) => item.status === 'ACCEPTED');
  const history = appointments.filter((item) => ['REJECTED', 'CANCELLED', 'COMPLETED'].includes(item.status));
  const canManageMedicines = Boolean(user.features?.medicine_health_tips?.canManage);
  const today = new Date().toISOString().slice(0, 10);
  const todayAppointments = appointments.filter(
    (item) => item.date === today && ['ACCEPTED', 'REQUESTED', 'ALTERNATIVE_OFFERED', 'RESCHEDULED'].includes(item.status)
  );

  const requestGroups = useMemo(() => {
    const groups = new Map();
    for (const item of pending) {
      const key = item.date;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [pending]);

  async function saveAvailability() {
    if (!user.doctorId) return;
    try {
      const { data } = await api.patch(`/doctors/${user.doctorId}/availability`, { weeklyAvailability: weekly });
      setWeekly(data.doctor.weeklyAvailability);
      setSuccess('Availability updated.');
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function act(id, action, body) {
    try {
      await api.post(`/appointments/${id}/${action}`, body);
      setSuccess('Appointment updated.');
      setSuggesting(null);
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  if (loading) {
    return <main className="mx-auto max-w-5xl px-4 py-10 text-sm text-slate-500">Loading dashboard…</main>;
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-3xl font-semibold text-slate-900">Doctor dashboard</h1>
      <p className="mt-2 text-slate-600">{user.name} · {user.specialization}</p>

      {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {success ? <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{success}</div> : null}

      <div className="mt-6">
        <CreditBalanceCard
          balance={user.creditBalance ?? 0}
          subscription={user.subscription}
        />
      </div>

      <section className="mt-8 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold text-slate-900">Weekly availability</h2>
        <p className="mt-1 text-sm text-slate-500">Patients can only request days you mark as available. A confirmed booking makes that calendar day busy.</p>
        <div className="mt-4">
          <WeeklyEditor value={weekly} onChange={setWeekly} />
        </div>
        <div className="mt-4">
          <Button onClick={saveAvailability}>Save availability</Button>
        </div>
      </section>

      {canManageMedicines ? (
        <section className="mt-10 rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold text-slate-900">Medicine & Health Tips</h2>
          <p className="mt-1 text-sm text-slate-500">
            Add medicines your patients can read, with common uses and simple care tips for minor situations.
          </p>
          <div className="mt-4">
            <Suspense fallback={<p className="text-sm text-slate-500">Loading medicines…</p>}>
              <MedicineManager />
            </Suspense>
          </div>
        </section>
      ) : null}

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-slate-900">Today&apos;s appointments</h2>
        <div className="mt-4 grid gap-3">
          {todayAppointments.length === 0 ? (
            <p className="text-sm text-slate-500">No appointments scheduled for today.</p>
          ) : null}
          {todayAppointments.map((item) => (
            <article key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
              <div>
                <p className="font-medium">{item.patient?.name}</p>
                <p className="text-sm text-slate-500">{item.weekdayLabel} · {item.date}</p>
              </div>
              <AppointmentBadge status={item.status} />
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-slate-900">Appointment requests</h2>
        <div className="mt-4 grid gap-4">
          {requestGroups.length === 0 ? <p className="text-sm text-slate-500">No pending requests.</p> : null}
          {requestGroups.map(([date, items]) => (
            <article key={date} className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="font-medium text-slate-900">
                {items[0].weekdayLabel} · {date}
              </p>
              {items.length > 1 ? (
                <p className="mt-1 text-sm text-amber-700">{items.length} patients are requesting an appointment for {items[0].weekdayLabel}.</p>
              ) : null}
              <div className="mt-4 grid gap-3">
                {items.map((item) => (
                  <div key={item.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-medium">{item.patient?.name}</p>
                        <p className="text-xs text-slate-500">{item.patient?.email}</p>
                      </div>
                      <AppointmentBadge status={item.status} />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button onClick={() => act(item.id, 'accept')}>Accept</Button>
                      <Button variant="secondary" onClick={() => act(item.id, 'reject')}>Reject</Button>
                      <Button variant="secondary" onClick={() => setSuggesting(item.id)}>Suggest another day</Button>
                    </div>
                    {suggesting === item.id ? (
                      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                        <input
                          placeholder="YYYY-MM-DD, YYYY-MM-DD"
                          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                          value={suggestDates}
                          onChange={(e) => setSuggestDates(e.target.value)}
                        />
                        <Button onClick={() => act(item.id, 'suggest', { dates: suggestDates.split(',').map((value) => value.trim()).filter(Boolean) })}>
                          Send suggestion
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-slate-900">Upcoming confirmed</h2>
        <div className="mt-4 grid gap-3">
          {confirmed.length === 0 ? <p className="text-sm text-slate-500">No confirmed appointments.</p> : null}
          {confirmed.map((item) => (
            <article key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
              <div>
                <p className="font-medium">{item.patient?.name}</p>
                <p className="text-sm text-slate-500">{weekdayLabel(item.weekday)} · {item.date}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => act(item.id, 'complete')}>Complete</Button>
                <Button variant="danger" onClick={() => act(item.id, 'cancel')}>Cancel</Button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-slate-900">History</h2>
        <div className="mt-4 grid gap-3">
          {history.map((item) => (
            <article key={item.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4">
              <div>
                <p className="font-medium">{item.patient?.name}</p>
                <p className="text-sm text-slate-500">{item.date} · {STATUS_META[item.status]?.label}</p>
              </div>
              <AppointmentBadge status={item.status} />
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
