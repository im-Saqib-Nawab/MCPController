import { isDoctorIncluded } from '../../server/services/featureFlag.service.js';
import { isDoctorInPercentage } from '../../server/lib/rollout.js';
import { config } from '../config.js';

export function createFeatureFlagTracker() {
  const results = [];

  function record({ email, role, doctorId, flag, actualCanView, actualCanManage }) {
    const expectedCanView = computeExpected(flag, role, doctorId);
    results.push({
      time: new Date().toISOString(),
      email,
      role,
      doctorId: doctorId || null,
      expectedCanView,
      actualCanView: Boolean(actualCanView),
      actualCanManage: Boolean(actualCanManage),
      match: expectedCanView === Boolean(actualCanView)
    });
  }

  return {
    record,
    getResults: () => results,
    summarize() {
      const total = results.length;
      const matched = results.filter((r) => r.match).length;
      const mismatches = results.filter((r) => !r.match);
      return {
        total,
        matched,
        mismatched: mismatches.length,
        matchRate: total ? Number(((matched / total) * 100).toFixed(2)) : 100,
        mismatches: mismatches.slice(-20),
        byRole: ['admin', 'doctor', 'patient'].map((role) => {
          const rows = results.filter((r) => r.role === role);
          const roleMatched = rows.filter((r) => r.match).length;
          return {
            role,
            total: rows.length,
            matched: roleMatched,
            mismatched: rows.length - roleMatched
          };
        }),
      recentResults: results.slice(-40).reverse()
    };
    }
  };
}

function computeExpected(flag, role, doctorId) {
  if (!flag?.enabled) return false;
  if (role === 'admin') return true;
  if (role === 'patient') return Boolean(flag.patientsEnabled);
  if (role === 'doctor') {
    if (!doctorId) return false;
    return isDoctorIncluded(flag, doctorId);
  }
  return false;
}

export function buildExpectedFlagSummary(flag) {
  return {
    key: flag.key || config.medicineFeatureKey,
    enabled: Boolean(flag.enabled),
    doctorAccess: flag.doctorAccess || 'all',
    percentage: Number(flag.percentage) || 0,
    patientsEnabled: Boolean(flag.patientsEnabled),
    doctorIds: (flag.doctorIds || []).map(String)
  };
}

export { isDoctorInPercentage };
