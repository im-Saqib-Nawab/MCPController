import { logOperation, logError } from './request-context.js';
import { roleLabel } from './roles.js';

export const MCP_ACTION_LABELS = {
  list_doctors: 'List Doctors',
  get_doctor: 'View Doctor',
  add_doctor: 'Create Doctor',
  update_doctor: 'Update Doctor',
  delete_doctor: 'Delete Doctor',
  list_patients: 'List Patients',
  get_patient: 'View Patient',
  add_patient: 'Create Patient',
  update_patient: 'Update Patient',
  delete_patient: 'Delete Patient',
  list_appointments: 'List Appointments',
  request_appointment: 'Book Appointment',
  accept_appointment: 'Accept Appointment',
  reject_appointment: 'Reject Appointment',
  suggest_alternative_date: 'Suggest Alternative Date',
  accept_alternative_date: 'Accept Alternative Date',
  cancel_appointment: 'Cancel Appointment',
  complete_appointment: 'Complete Appointment',
  get_appointment: 'View Appointment',
  list_my_appointments: 'List My Appointments',
  list_doctor_appointment_requests: 'List Appointment Requests',
  admin_update_appointment: 'Admin Update Appointment',
  admin_get_dashboard_stats: 'View Dashboard Stats',
  check_doctor_availability: 'Check Doctor Availability',
  update_availability: 'Update Availability',
  get_my_profile: 'View Profile',
  update_my_profile: 'Update Profile',
  search_logs: 'Search Logs',
  get_request_logs: 'View Request Logs'
};

function actorKind(role) {
  return role === 'admin' ? 'Admin' : 'User';
}

function slugify(action) {
  return String(action)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.|\.$/g, '');
}

export function formatAuditMessage({ actorName, role, action, status }) {
  const statusText =
    status === 'success' ? 'Success' : status === 'error' ? 'Failed' : String(status || 'Unknown');
  return `${actorKind(role)}: ${actorName || 'Unknown'} | Role: ${roleLabel(role)} | Action: ${action} | Status: ${statusText}`;
}

export function auditFieldsFromUser(user, overrides = {}) {
  if (!user) {
    return overrides;
  }

  return {
    userId: user._id ? String(user._id) : user.id ? String(user.id) : overrides.userId,
    role: user.role || overrides.role,
    actorName: user.name || overrides.actorName,
    ...overrides
  };
}

export function logAudit(user, action, options = {}) {
  const {
    status = 'success',
    level = status === 'error' ? 'warn' : 'info',
    metadata,
    tool,
    durationMs,
    statusCode,
    ...rest
  } = options;

  const actorName = user?.name || rest.actorName || 'Unknown';
  const role = user?.role || rest.role;
  const userId = user?._id ? String(user._id) : user?.id ? String(user.id) : rest.userId;
  const message = formatAuditMessage({ actorName, role, action, status });

  logOperation(level, `audit.${slugify(action)}`, {
    category: 'audit',
    action,
    actorName,
    role,
    userId,
    status,
    message,
    tool,
    durationMs,
    statusCode,
    metadata: metadata && Object.keys(metadata).length ? metadata : undefined,
    ...rest
  });
}

export function logAuditFailure(user, action, err, options = {}) {
  const actorName = user?.name || options.actorName || 'Unknown';
  const role = user?.role || options.role;
  const message = formatAuditMessage({ actorName, role, action, status: 'error' });

  logError(err, {
    operation: `audit.${slugify(action)}`,
    category: 'audit',
    action,
    actorName,
    role,
    userId: user?._id ? String(user._id) : user?.id ? String(user.id) : options.userId,
    status: 'error',
    message,
    ...options
  });
}

export function mcpActionLabel(toolName) {
  return MCP_ACTION_LABELS[toolName] || toolName.replace(/_/g, ' ');
}
