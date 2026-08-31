export function roleLabel(role) {
  if (role === 'admin') return 'Administrator';
  if (role === 'doctor') return 'Doctor';
  if (role === 'patient' || role === 'user') return 'Patient';
  return role ? String(role) : 'Unknown';
}
