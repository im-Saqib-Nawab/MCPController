import { DAY_META, weekdayLabel } from '../lib/status.js';

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

export default function AvailabilityGrid({ weeklyAvailability = {}, schedule = [], selectable = false, selectedDate, onSelect }) {
  const byWeekday = WEEKDAYS.reduce((acc, day) => {
    const standing = weeklyAvailability[day] || 'unavailable';
    const weekdayDates = schedule.filter((item) => item.weekday === day);
    const next = weekdayDates.find((item) => item.status === 'available');
    let status = 'not_available';
    if (standing !== 'unavailable') {
      if (!weekdayDates.length || weekdayDates.some((item) => item.status === 'available')) {
        status = 'available';
      } else {
        status = 'busy';
      }
    }
    acc[day] = {
      standing,
      status,
      nextDate: next?.date || null
    };
    return acc;
  }, {});

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {WEEKDAYS.map((day) => {
        const item = byWeekday[day];
        const meta = DAY_META[item.status] || DAY_META.not_available;
        const canSelect = selectable && item.status === 'available' && item.nextDate;
        const active = selectedDate && schedule.some((entry) => entry.date === selectedDate && entry.weekday === day);

        return (
          <button
            key={day}
            type="button"
            disabled={!canSelect}
            onClick={() => canSelect && onSelect?.(item.nextDate)}
            className={`rounded-xl border px-3 py-3 text-left ${meta.className} ${
              active ? 'ring-2 ring-slate-900' : ''
            } ${canSelect ? 'cursor-pointer' : 'cursor-default'}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{weekdayLabel(day)}</span>
              <span className="text-xs">{meta.label}</span>
            </div>
            {item.nextDate && item.status === 'available' ? (
              <p className="mt-1 text-xs opacity-80">Next: {item.nextDate}</p>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function WeeklyEditor({ value, onChange }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {WEEKDAYS.map((day) => {
        const current = value?.[day] || 'unavailable';
        return (
          <label key={day} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm">
            <span className="font-medium text-slate-800">{weekdayLabel(day)}</span>
            <select
              value={current}
              onChange={(event) => onChange({ ...value, [day]: event.target.value })}
              className="rounded-lg border border-slate-300 px-2 py-1"
            >
              <option value="available">Available</option>
              <option value="unavailable">Not available</option>
            </select>
          </label>
        );
      })}
    </div>
  );
}
