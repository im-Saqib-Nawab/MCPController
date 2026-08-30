export const STATUS_META = {
  REQUESTED: { label: 'Pending', tone: 'amber', hint: 'Waiting for the doctor to respond.' },
  ACCEPTED: { label: 'Confirmed', tone: 'emerald', hint: 'This appointment is booked.' },
  REJECTED: { label: 'Rejected', tone: 'red', hint: 'This request was not accepted.' },
  ALTERNATIVE_OFFERED: { label: 'Alternative suggested', tone: 'sky', hint: 'Choose one of the suggested days.' },
  RESCHEDULED: { label: 'Rescheduled', tone: 'sky', hint: 'Waiting for confirmation on a new day.' },
  CANCELLED: { label: 'Cancelled', tone: 'slate', hint: 'This appointment is no longer active.' },
  COMPLETED: { label: 'Completed', tone: 'slate', hint: 'This visit is finished.' }
};

export const TONE_CLASSES = {
  amber: 'bg-amber-50 text-amber-800 border-amber-200',
  emerald: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  red: 'bg-red-50 text-red-800 border-red-200',
  sky: 'bg-sky-50 text-sky-800 border-sky-200',
  slate: 'bg-slate-100 text-slate-700 border-slate-200'
};

export const DAY_META = {
  available: { label: 'Available', className: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  busy: { label: 'Busy', className: 'bg-amber-50 text-amber-800 border-amber-200' },
  not_available: { label: 'Not available', className: 'bg-slate-100 text-slate-600 border-slate-200' }
};

export function weekdayLabel(day) {
  return String(day || '').replace(/^./, (letter) => letter.toUpperCase());
}
