export const WEEKDAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday'
];

export const DAY_STATES = ['available', 'unavailable'];

const UTC_DAY_TO_WEEKDAY = [6, 0, 1, 2, 3, 4, 5];

export function defaultWeeklyAvailability() {
  return {
    monday: 'available',
    tuesday: 'available',
    wednesday: 'available',
    thursday: 'available',
    friday: 'available',
    saturday: 'unavailable',
    sunday: 'unavailable'
  };
}

export function normalizeWeeklyAvailability(input) {
  const defaults = defaultWeeklyAvailability();
  if (!input || typeof input !== 'object') {
    return defaults;
  }

  const next = { ...defaults };
  for (const day of WEEKDAYS) {
    const value = String(input[day] || '').toLowerCase();
    if (value === 'available' || value === 'unavailable') {
      next[day] = value;
    }
  }
  return next;
}

export function isValidDateString(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) {
    return false;
  }
  const [year, month, day] = String(value).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function weekdayFromDate(dateStr) {
  const [year, month, day] = String(dateStr).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return WEEKDAYS[UTC_DAY_TO_WEEKDAY[date.getUTCDay()]];
}

export function todayUtcDateString() {
  return new Date().toISOString().slice(0, 10);
}

export function addDays(dateStr, amount) {
  const [year, month, day] = String(dateStr).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return date.toISOString().slice(0, 10);
}

export function upcomingDates(count = 21, from = todayUtcDateString()) {
  const dates = [];
  for (let i = 1; i <= count; i += 1) {
    dates.push(addDays(from, i));
  }
  return dates;
}

export function capitalize(value) {
  const text = String(value || '');
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
}

export function summarizeAvailability(weekly) {
  const schedule = normalizeWeeklyAvailability(weekly);
  const available = WEEKDAYS.filter((day) => schedule[day] === 'available').map(capitalize);
  return available.length ? available.join(', ') : 'No available days';
}

export function weekdayLabel(weekday) {
  return capitalize(weekday);
}
