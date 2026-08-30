import { STATUS_META, TONE_CLASSES } from '../lib/status.js';

const STATUS_ICONS = {
  REQUESTED: '🟡',
  ACCEPTED: '🟢',
  REJECTED: '🔴',
  ALTERNATIVE_OFFERED: '🔵',
  RESCHEDULED: '🔵',
  CANCELLED: '⚫',
  COMPLETED: '⚫'
};

export default function AppointmentBadge({ status }) {
  const meta = STATUS_META[status] || { label: status, tone: 'slate', hint: '' };
  const icon = STATUS_ICONS[status] || '•';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${TONE_CLASSES[meta.tone]}`}
      title={meta.hint || meta.label}
    >
      <span aria-hidden="true">{icon}</span>
      {meta.label}
    </span>
  );
}
