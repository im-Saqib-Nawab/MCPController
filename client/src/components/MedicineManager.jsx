import { useCallback, useEffect, useState } from 'react';
import Button from './Button.jsx';
import MedicineList from './MedicineList.jsx';
import { api, getErrorMessage } from '../services/api.js';

const CATEGORIES = [
  'Pain relief',
  'Cold & flu',
  'Allergy',
  'Digestive',
  'Skin care',
  'Vitamins',
  'First aid',
  'Other'
];

const EMPTY_FORM = {
  name: '',
  usedFor: '',
  careTips: '',
  warnings: '',
  category: 'Other'
};

export default function MedicineManager({ user }) {
  const [medicines, setMedicines] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError('');
    try {
      const { data } = await api.get('/medicines');
      setMedicines(data.medicines || []);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setSuccess('');
    try {
      if (editing) {
        await api.patch(`/medicines/${editing.id}`, form);
        setSuccess('Medicine updated.');
      } else {
        await api.post('/medicines', form);
        setSuccess('Medicine added.');
      }
      setForm(EMPTY_FORM);
      setEditing(null);
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  function startEdit(medicine) {
    setEditing(medicine);
    setForm({
      name: medicine.name,
      usedFor: medicine.usedFor,
      careTips: medicine.careTips || '',
      warnings: medicine.warnings || '',
      category: medicine.category || 'Other'
    });
    setSuccess('');
    setError('');
  }

  function cancelEdit() {
    setEditing(null);
    setForm(EMPTY_FORM);
  }

  async function remove(id) {
    if (!window.confirm('Delete this medicine?')) return;
    setError('');
    try {
      await api.delete(`/medicines/${id}`);
      setSuccess('Medicine deleted.');
      if (editing?.id === id) cancelEdit();
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Loading medicines…</p>;
  }

  return (
    <div>
      {error ? <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {success ? <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{success}</div> : null}

      <form onSubmit={submit} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <h3 className="font-medium text-slate-900">{editing ? 'Edit medicine' : 'Add a medicine'}</h3>
        <p className="mt-1 text-sm text-slate-500">
          Share what it is commonly used for and simple care tips for minor situations.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <input
            required
            placeholder="Medicine name"
            className="rounded-lg border border-slate-300 px-3 py-2"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <select
            className="rounded-lg border border-slate-300 px-3 py-2"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          >
            {CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
          <textarea
            required
            placeholder="What is it commonly used for?"
            className="sm:col-span-2 rounded-lg border border-slate-300 px-3 py-2"
            rows={2}
            value={form.usedFor}
            onChange={(e) => setForm({ ...form, usedFor: e.target.value })}
          />
          <textarea
            placeholder="Simple care tips (optional)"
            className="sm:col-span-2 rounded-lg border border-slate-300 px-3 py-2"
            rows={2}
            value={form.careTips}
            onChange={(e) => setForm({ ...form, careTips: e.target.value })}
          />
          <textarea
            placeholder="Warnings or when to see a doctor (optional)"
            className="sm:col-span-2 rounded-lg border border-slate-300 px-3 py-2"
            rows={2}
            value={form.warnings}
            onChange={(e) => setForm({ ...form, warnings: e.target.value })}
          />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="submit">{editing ? 'Save changes' : 'Add medicine'}</Button>
          {editing ? (
            <Button type="button" variant="secondary" onClick={cancelEdit}>
              Cancel
            </Button>
          ) : null}
        </div>
      </form>

      <div className="mt-6">
        <h3 className="font-medium text-slate-900">Your medicines</h3>
        <div className="mt-3 grid gap-3">
          {medicines.length === 0 ? (
            <p className="text-sm text-slate-500">No medicines added yet.</p>
          ) : (
            medicines.map((medicine) => (
              <div key={medicine.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <MedicineList medicines={[medicine]} />
                <div className="mt-3 flex gap-2">
                  <button type="button" className="text-sm underline" onClick={() => startEdit(medicine)}>
                    Edit
                  </button>
                  <button type="button" className="text-sm text-red-700" onClick={() => remove(medicine.id)}>
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
