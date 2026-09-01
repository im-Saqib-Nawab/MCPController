import { useCallback, useEffect, useState } from 'react';
import Button from './Button.jsx';
import { api, getErrorMessage } from '../services/api.js';

const PERCENTAGE_PRESETS = [10, 25, 50, 100];

export default function FeatureFlagPanel({ doctors, onUpdated }) {
  const [flag, setFlag] = useState(null);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const { data } = await api.get('/admin/feature-flags/medicine_health_tips');
      setFlag(data.flag);
      setDraft({
        enabled: data.flag.enabled,
        patientsEnabled: data.flag.patientsEnabled,
        doctorAccess: data.flag.doctorAccess,
        doctorIds: [...(data.flag.doctorIds || [])],
        percentage: data.flag.percentage ?? 0
      });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function toggleDoctor(id) {
    setDraft((current) => {
      const doctorIds = current.doctorIds.includes(id)
        ? current.doctorIds.filter((value) => value !== id)
        : [...current.doctorIds, id];
      return { ...current, doctorIds };
    });
  }

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const { data } = await api.patch('/admin/feature-flags/medicine_health_tips', draft);
      setFlag(data.flag);
      setDraft({
        enabled: data.flag.enabled,
        patientsEnabled: data.flag.patientsEnabled,
        doctorAccess: data.flag.doctorAccess,
        doctorIds: [...(data.flag.doctorIds || [])],
        percentage: data.flag.percentage ?? 0
      });
      setSuccess('Feature settings saved.');
      onUpdated?.();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Loading feature settings…</p>;
  }

  if (!draft) {
    return null;
  }

  return (
    <form onSubmit={save} className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-900">{flag?.name || 'Medicine & Health Tips'}</h2>
          <p className="mt-1 text-sm text-slate-500">{flag?.description}</p>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium text-slate-900">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
          />
          Feature enabled
        </label>
      </div>

      {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {success ? <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{success}</div> : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium text-slate-900">Doctor access</legend>
          {[
            ['all', 'All doctors'],
            ['specific', 'Specific doctors'],
            ['percentage', 'Percentage rollout']
          ].map(([value, label]) => (
            <label key={value} className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="radio"
                name="doctorAccess"
                value={value}
                checked={draft.doctorAccess === value}
                onChange={() => setDraft({ ...draft, doctorAccess: value })}
              />
              {label}
            </label>
          ))}
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium text-slate-900">Patient access</legend>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={draft.patientsEnabled}
              onChange={(e) => setDraft({ ...draft, patientsEnabled: e.target.checked })}
            />
            Allow patients to view medicines and health tips
          </label>
          <p className="text-xs text-slate-500">
            Patients only see medicines from doctors included in the rollout above.
          </p>
        </fieldset>
      </div>

      {draft.doctorAccess === 'specific' ? (
        <div className="mt-6">
          <p className="text-sm font-medium text-slate-900">Select doctors</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {doctors.map((doctor) => (
              <label key={doctor.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.doctorIds.includes(doctor.id)}
                  onChange={() => toggleDoctor(doctor.id)}
                />
                <span>
                  {doctor.name} · {doctor.specialization}
                </span>
              </label>
            ))}
          </div>
        </div>
      ) : null}

      {draft.doctorAccess === 'percentage' ? (
        <div className="mt-6">
          <p className="text-sm font-medium text-slate-900">Rollout percentage</p>
          <p className="mt-1 text-xs text-slate-500">
            Each doctor is assigned a stable bucket so access does not change randomly between visits.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {PERCENTAGE_PRESETS.map((value) => (
              <button
                key={value}
                type="button"
                className={`rounded-lg border px-3 py-1.5 text-sm ${draft.percentage === value ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 text-slate-700'}`}
                onClick={() => setDraft({ ...draft, percentage: value })}
              >
                {value}%
              </button>
            ))}
          </div>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            className="mt-4 w-full"
            value={draft.percentage}
            onChange={(e) => setDraft({ ...draft, percentage: Number(e.target.value) })}
          />
          <p className="mt-2 text-sm text-slate-600">
            Currently includes {flag?.includedDoctorCount ?? 0} of {flag?.totalDoctorCount ?? doctors.length} doctors.
          </p>
        </div>
      ) : null}

      {draft.doctorAccess === 'all' && draft.enabled ? (
        <p className="mt-6 text-sm text-slate-600">All {doctors.length} doctors will have access when enabled.</p>
      ) : null}

      <div className="mt-6">
        <Button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save feature settings'}
        </Button>
      </div>
    </form>
  );
}
