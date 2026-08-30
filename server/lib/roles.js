export const ROLES = {
  ADMIN: 'admin',
  DOCTOR: 'doctor',
  PATIENT: 'patient'
};

/** Legacy accounts used role "user". Treat them as patients. */
export function normalizeRole(role) {
  if (role === 'user') return ROLES.PATIENT;
  return role;
}

export function isAdmin(user) {
  return user?.role === ROLES.ADMIN;
}

export function isDoctor(user) {
  return normalizeRole(user?.role) === ROLES.DOCTOR;
}

export function isPatient(user) {
  return normalizeRole(user?.role) === ROLES.PATIENT;
}

export function publicRole(user) {
  if (!user) return null;
  if (user.role === ROLES.ADMIN) return ROLES.ADMIN;
  return normalizeRole(user.role);
}

export function roleLabel(role) {
  const normalized = normalizeRole(role);
  if (normalized === ROLES.ADMIN) return 'Administrator';
  if (normalized === ROLES.DOCTOR) return 'Doctor';
  if (normalized === ROLES.PATIENT) return 'Patient';
  return 'User';
}
