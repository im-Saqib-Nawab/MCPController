import AdminDashboard from './AdminDashboard.jsx';
import DoctorDashboard from './DoctorDashboard.jsx';
import PatientDashboard from './PatientDashboard.jsx';

export default function Dashboard({ user, onUserUpdated }) {
  if (user?.role === 'admin') {
    return <AdminDashboard user={user} />;
  }
  if (user?.role === 'doctor') {
    return <DoctorDashboard user={user} onUserUpdated={onUserUpdated} />;
  }
  return <PatientDashboard user={user} />;
}
