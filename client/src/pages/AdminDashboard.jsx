import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../components/Button.jsx';
import PermissionCard from '../components/PermissionCard.jsx';
import AppointmentBadge from '../components/AppointmentBadge.jsx';
import { api, getErrorMessage } from '../services/api.js';

export default function AdminDashboard({ user }) {
  const [stats, setStats] = useState(null);
  const [doctors, setDoctors] = useState([]);
  const [patients, setPatients] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [users, setUsers] = useState([]);
  const [connections, setConnections] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);
  const [doctorForm, setDoctorForm] = useState({ name: '', specialization: '', email: '', phone: '', password: '' });
  const [patientForm, setPatientForm] = useState({ name: '', email: '', password: '', phone: '' });
  const [editingDoctor, setEditingDoctor] = useState(null);
  const [editingPatient, setEditingPatient] = useState(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const [statsRes, doctorsRes, patientsRes, appointmentsRes, usersRes, connectionsRes] = await Promise.all([
        api.get('/admin/stats'),
        api.get('/doctors'),
        api.get('/patients'),
        api.get('/appointments'),
        api.get('/admin/users'),
        api.get('/connections')
      ]);
      setStats(statsRes.data.stats);
      setDoctors(doctorsRes.data.doctors || []);
      setPatients(patientsRes.data.patients || []);
      setAppointments(appointmentsRes.data.appointments || []);
      setUsers(usersRes.data.users || []);
      setConnections(connectionsRes.data.connections || []);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createDoctor(event) {
    event.preventDefault();
    setError('');
    try {
      await api.post('/doctors', doctorForm);
      setDoctorForm({ name: '', specialization: '', email: '', phone: '', password: '' });
      setSuccess('Doctor created.');
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function createPatient(event) {
    event.preventDefault();
    setError('');
    try {
      await api.post('/patients', patientForm);
      setPatientForm({ name: '', email: '', password: '', phone: '' });
      setSuccess('Patient created.');
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function removeDoctor(id) {
    if (!window.confirm('Delete this doctor?')) return;
    try {
      await api.delete(`/doctors/${id}`);
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function removePatient(id) {
    if (!window.confirm('Delete this patient?')) return;
    try {
      await api.delete(`/patients/${id}`);
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function saveDoctorEdit(event) {
    event.preventDefault();
    if (!editingDoctor) return;
    try {
      await api.patch(`/doctors/${editingDoctor.id}`, {
        name: editingDoctor.name,
        specialization: editingDoctor.specialization,
        email: editingDoctor.email,
        phone: editingDoctor.phone
      });
      setEditingDoctor(null);
      setSuccess('Doctor updated.');
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function savePatientEdit(event) {
    event.preventDefault();
    if (!editingPatient) return;
    try {
      await api.patch(`/patients/${editingPatient.id}`, {
        name: editingPatient.name,
        phone: editingPatient.phone,
        age: editingPatient.age === '' ? null : Number(editingPatient.age),
        gender: editingPatient.gender
      });
      setEditingPatient(null);
      setSuccess('Patient updated.');
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function revokeConnection(clientId) {
    if (!window.confirm('Revoke this MCP connection? ChatGPT will need to reconnect.')) return;
    try {
      await api.delete(`/connections/${encodeURIComponent(clientId)}`);
      setSuccess('Connection revoked.');
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function changeAppointment(id, action) {
    try {
      await api.post(`/appointments/${id}/${action}`);
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function savePermissions(target) {
    try {
      await api.patch(`/admin/users/${target.id}/permissions`, { allowedScopes: target.allowedScopes });
      setSuccess(
        `Updated permissions for ${target.email}. Log tools update immediately. Other MCP tools may require reconnecting ChatGPT.`
      );
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  function toggleScope(target, scope) {
    setUsers((current) =>
      current.map((item) => {
        if (item.id !== target.id) return item;
        const has = item.allowedScopes.includes(scope);
        return {
          ...item,
          allowedScopes: has ? item.allowedScopes.filter((value) => value !== scope) : [...item.allowedScopes, scope]
        };
      })
    );
  }

  if (loading) {
    return <main className="mx-auto max-w-6xl px-4 py-10 text-sm text-slate-500">Loading dashboard…</main>;
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-3xl font-semibold text-slate-900">Admin dashboard</h1>
      <p className="mt-2 text-slate-600">{user.name} · {user.email}</p>
      <p className="mt-2 text-sm">
        <Link to="/admin/observability" className="text-slate-700 underline hover:text-slate-900">
          Open observability
        </Link>
      </p>

      {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {success ? <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{success}</div> : null}

      <section className="mt-8 grid gap-4 sm:grid-cols-4">
        {[
          ['Doctors', stats?.doctors],
          ['Patients', stats?.patients],
          ['Pending requests', stats?.pendingAppointments],
          ["Today's appointments", stats?.todayAppointments]
        ].map(([label, value]) => (
          <article key={label} className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{value ?? 0}</p>
          </article>
        ))}
      </section>

      <section className="mt-10 grid gap-6 lg:grid-cols-2">
        <form onSubmit={createDoctor} className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold text-slate-900">Create doctor</h2>
          <div className="mt-4 grid gap-3">
            <input required placeholder="Name" className="rounded-lg border border-slate-300 px-3 py-2" value={doctorForm.name} onChange={(e) => setDoctorForm({ ...doctorForm, name: e.target.value })} />
            <input required placeholder="Specialization" className="rounded-lg border border-slate-300 px-3 py-2" value={doctorForm.specialization} onChange={(e) => setDoctorForm({ ...doctorForm, specialization: e.target.value })} />
            <input placeholder="Email" type="email" className="rounded-lg border border-slate-300 px-3 py-2" value={doctorForm.email} onChange={(e) => setDoctorForm({ ...doctorForm, email: e.target.value })} />
            <input placeholder="Phone" className="rounded-lg border border-slate-300 px-3 py-2" value={doctorForm.phone} onChange={(e) => setDoctorForm({ ...doctorForm, phone: e.target.value })} />
            <input placeholder="Login password (optional)" type="password" minLength={8} className="rounded-lg border border-slate-300 px-3 py-2" value={doctorForm.password} onChange={(e) => setDoctorForm({ ...doctorForm, password: e.target.value })} />
            <Button type="submit">Add doctor</Button>
          </div>
        </form>

        <form onSubmit={createPatient} className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold text-slate-900">Create patient</h2>
          <div className="mt-4 grid gap-3">
            <input required placeholder="Name" className="rounded-lg border border-slate-300 px-3 py-2" value={patientForm.name} onChange={(e) => setPatientForm({ ...patientForm, name: e.target.value })} />
            <input required placeholder="Email" type="email" className="rounded-lg border border-slate-300 px-3 py-2" value={patientForm.email} onChange={(e) => setPatientForm({ ...patientForm, email: e.target.value })} />
            <input required placeholder="Password" type="password" minLength={8} className="rounded-lg border border-slate-300 px-3 py-2" value={patientForm.password} onChange={(e) => setPatientForm({ ...patientForm, password: e.target.value })} />
            <input placeholder="Phone" className="rounded-lg border border-slate-300 px-3 py-2" value={patientForm.phone} onChange={(e) => setPatientForm({ ...patientForm, phone: e.target.value })} />
            <Button type="submit">Add patient</Button>
          </div>
        </form>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-slate-900">Doctors</h2>
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Specialization</th>
                <th className="px-4 py-3">Availability</th>
                <th className="px-4 py-3">Next available</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {doctors.map((doctor) => (
                <tr key={doctor.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium">{doctor.name}</td>
                  <td className="px-4 py-3">{doctor.specialization}</td>
                  <td className="px-4 py-3">{doctor.availability}</td>
                  <td className="px-4 py-3">{doctor.nextAvailableDate || '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <Link to={`/doctors/${doctor.id}`} className="mr-3 underline">View</Link>
                    <button type="button" className="mr-3 underline" onClick={() => setEditingDoctor({ ...doctor })}>Edit</button>
                    <button type="button" className="text-red-700" onClick={() => removeDoctor(doctor.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-slate-900">Patients</h2>
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {patients.map((patient) => (
                <tr key={patient.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium">{patient.name}</td>
                  <td className="px-4 py-3">{patient.email}</td>
                  <td className="px-4 py-3">{patient.phone || '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <button type="button" className="mr-3 underline" onClick={() => setEditingPatient({ ...patient, age: patient.age ?? '' })}>Edit</button>
                    <button type="button" className="text-red-700" onClick={() => removePatient(patient.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-slate-900">Appointments</h2>
        <div className="mt-4 grid gap-3">
          {appointments.length === 0 ? <p className="text-sm text-slate-500">No appointments yet.</p> : null}
          {appointments.map((item) => (
            <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-slate-900">{item.patient?.name} → {item.doctor?.name}</p>
                  <p className="text-sm text-slate-500">{item.weekdayLabel} · {item.date}</p>
                </div>
                <AppointmentBadge status={item.status} />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {item.status === 'REQUESTED' || item.status === 'ALTERNATIVE_OFFERED' || item.status === 'RESCHEDULED' ? (
                  <>
                    <Button onClick={() => changeAppointment(item.id, 'accept')}>Accept</Button>
                    <Button variant="secondary" onClick={() => changeAppointment(item.id, 'reject')}>Reject</Button>
                  </>
                ) : null}
                {item.status !== 'CANCELLED' && item.status !== 'COMPLETED' ? (
                  <Button variant="danger" onClick={() => changeAppointment(item.id, 'cancel')}>Cancel</Button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-slate-900">Permissions</h2>
        <p className="mt-1 text-sm text-slate-500">These scopes control what each person can grant to ChatGPT.</p>
        <div className="mt-4 grid gap-4">
          {users.filter((item) => item.role !== 'admin').map((item) => (
            <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-slate-900">{item.name}</h3>
                  <p className="text-sm text-slate-500">{item.email} · {item.role}</p>
                </div>
                <Button onClick={() => savePermissions(item)}>Save permissions</Button>
              </div>
              <div className="mt-4">
                <PermissionCard scopes={item.allowedScopes} editable onToggle={(scope) => toggleScope(item, scope)} />
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-slate-900">Connected applications</h2>
        <div className="mt-4 grid gap-3">
          {connections.length === 0 ? <p className="text-sm text-slate-500">No MCP connections yet.</p> : null}
          {connections.map((connection) => (
            <article key={connection.clientId} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{connection.clientName}</p>
                  <p className="mt-1 text-xs text-slate-400 break-all">{connection.clientId}</p>
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

      {editingDoctor ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <form onSubmit={saveDoctorEdit} className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="font-semibold text-slate-900">Edit doctor</h2>
            <div className="mt-4 grid gap-3">
              <input required className="rounded-lg border border-slate-300 px-3 py-2" value={editingDoctor.name} onChange={(e) => setEditingDoctor({ ...editingDoctor, name: e.target.value })} />
              <input required className="rounded-lg border border-slate-300 px-3 py-2" value={editingDoctor.specialization} onChange={(e) => setEditingDoctor({ ...editingDoctor, specialization: e.target.value })} />
              <input className="rounded-lg border border-slate-300 px-3 py-2" value={editingDoctor.email || ''} onChange={(e) => setEditingDoctor({ ...editingDoctor, email: e.target.value })} />
              <input className="rounded-lg border border-slate-300 px-3 py-2" value={editingDoctor.phone || ''} onChange={(e) => setEditingDoctor({ ...editingDoctor, phone: e.target.value })} />
            </div>
            <div className="mt-4 flex gap-2">
              <Button type="submit">Save</Button>
              <Button type="button" variant="secondary" onClick={() => setEditingDoctor(null)}>Cancel</Button>
            </div>
          </form>
        </div>
      ) : null}

      {editingPatient ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <form onSubmit={savePatientEdit} className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="font-semibold text-slate-900">Edit patient</h2>
            <div className="mt-4 grid gap-3">
              <input required className="rounded-lg border border-slate-300 px-3 py-2" value={editingPatient.name} onChange={(e) => setEditingPatient({ ...editingPatient, name: e.target.value })} />
              <input className="rounded-lg border border-slate-300 px-3 py-2" value={editingPatient.phone || ''} onChange={(e) => setEditingPatient({ ...editingPatient, phone: e.target.value })} />
              <input type="number" min="0" max="130" className="rounded-lg border border-slate-300 px-3 py-2" value={editingPatient.age} onChange={(e) => setEditingPatient({ ...editingPatient, age: e.target.value })} />
              <select className="rounded-lg border border-slate-300 px-3 py-2" value={editingPatient.gender || ''} onChange={(e) => setEditingPatient({ ...editingPatient, gender: e.target.value })}>
                <option value="">Prefer not to say</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="mt-4 flex gap-2">
              <Button type="submit">Save</Button>
              <Button type="button" variant="secondary" onClick={() => setEditingPatient(null)}>Cancel</Button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  );
}
