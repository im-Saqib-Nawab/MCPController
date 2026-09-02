import { addDays, todayUtcDateString, weekdayFromDate } from '../../server/lib/availability.js';
import { config } from '../config.js';

function futureAvailableDate(from = todayUtcDateString()) {
  for (let i = 1; i <= 21; i += 1) {
    const date = addDays(from, i);
    const weekday = weekdayFromDate(date);
    if (weekday !== 'saturday' && weekday !== 'sunday') {
      return date;
    }
  }
  return addDays(from, 7);
}

function record(metrics, scenario, client, method, path, result, role) {
  metrics.record({
    scenario,
    method,
    path,
    status: result.status,
    durationMs: result.durationMs,
    requestId: result.requestId,
    ok: result.ok,
    role
  });
  return result;
}

export async function scenarioHealthCheck(client, metrics) {
  return record(metrics, 'health', client, 'GET', '/api/health', await client.get('/api/health'));
}

export async function scenarioAuthMe(client, metrics) {
  return record(metrics, 'auth.me', client, 'GET', '/api/auth/me', await client.me());
}

export async function scenarioListDoctors(client, metrics) {
  return record(metrics, 'doctors.list', client, 'GET', '/api/doctors', await client.get('/api/doctors'));
}

export async function scenarioGetDoctor(client, metrics, doctorId) {
  const path = `/api/doctors/${doctorId}`;
  return record(metrics, 'doctors.get', client, 'GET', path, await client.get(path));
}

export async function scenarioListPatients(client, metrics) {
  return record(metrics, 'patients.list', client, 'GET', '/api/patients', await client.get('/api/patients'));
}

export async function scenarioListAppointments(client, metrics) {
  return record(metrics, 'appointments.list', client, 'GET', '/api/appointments', await client.get('/api/appointments'));
}

export async function scenarioBookAppointment(client, metrics, doctorId) {
  const path = '/api/appointments';
  const body = {
    doctorId,
    date: futureAvailableDate(),
    notes: `Load test booking ${Date.now()}`
  };
  const result = await client.post(path, body);
  const ok = result.status === 201 || result.status === 409 || result.status === 400;
  metrics.record({
    scenario: 'appointments.book',
    method: 'POST',
    path,
    status: result.status,
    durationMs: result.durationMs,
    requestId: result.requestId,
    ok
  });
  return result;
}

export async function scenarioCancelAppointment(client, metrics, appointmentId) {
  const path = `/api/appointments/${appointmentId}/cancel`;
  const result = await client.post(path, {});
  const ok = result.status === 200 || result.status === 403 || result.status === 404;
  metrics.record({
    scenario: 'appointments.cancel',
    method: 'POST',
    path,
    status: result.status,
    durationMs: result.durationMs,
    requestId: result.requestId,
    ok
  });
  return result;
}

export async function scenarioListMedicines(client, metrics) {
  const result = await client.get('/api/medicines');
  const ok = result.status === 200 || result.status === 403;
  metrics.record({
    scenario: 'medicines.list',
    method: 'GET',
    path: '/api/medicines',
    status: result.status,
    durationMs: result.durationMs,
    requestId: result.requestId,
    ok
  });
  return result;
}

export async function scenarioAdminStats(client, metrics) {
  return record(metrics, 'admin.stats', client, 'GET', '/api/admin/stats', await client.get('/api/admin/stats'));
}

export async function scenarioAdminObservability(client, metrics) {
  const sinceMinutes = 60;
  const paths = [
    `/api/admin/observability/metrics?sinceMinutes=${sinceMinutes}`,
    `/api/admin/observability/traces?sinceMinutes=${sinceMinutes}&limit=20`,
    `/api/admin/observability/logs?sinceMinutes=${sinceMinutes}&limit=20`
  ];

  const results = [];
  for (const path of paths) {
    results.push(record(metrics, 'admin.observability', client, 'GET', path, await client.get(path)));
  }
  return results;
}

export async function scenarioFeatureFlagRead(client, metrics) {
  const path = `/api/admin/feature-flags/${config.medicineFeatureKey}`;
  return record(metrics, 'feature-flags.read', client, 'GET', path, await client.get(path));
}

export async function scenarioFeatureFlagViaMe(client, metrics, { persona, featureFlagTracker, expectedFlag } = {}) {
  const result = await client.me();
  const feature = result.data?.user?.features?.[config.medicineFeatureKey];
  const role = persona?.role || result.data?.user?.role;

  if (featureFlagTracker && expectedFlag && persona) {
    featureFlagTracker.record({
      email: persona.credentials?.email || result.data?.user?.email,
      role,
      doctorId: feature?.doctorId,
      flag: expectedFlag,
      actualCanView: feature?.canView,
      actualCanManage: feature?.canManage
    });
  }

  metrics.record({
    scenario: 'feature-flags.me',
    method: 'GET',
    path: '/api/auth/me',
    status: result.status,
    durationMs: result.durationMs,
    requestId: result.requestId,
    ok: result.ok,
    role,
    meta: feature
      ? { canView: feature.canView, canManage: feature.canManage, doctorId: feature.doctorId }
      : null
  });
  return result;
}

export async function scenarioFailure400(client, metrics) {
  const result = await client.post('/api/appointments', { doctorId: 'bad', date: 'not-a-date' });
  metrics.record({
    scenario: 'failure.400',
    method: 'POST',
    path: '/api/appointments',
    status: result.status,
    durationMs: result.durationMs,
    requestId: result.requestId,
    ok: result.status === 400
  });
  return result;
}

export async function scenarioFailure401(client, metrics) {
  const anon = new (client.constructor)(client.baseUrl);
  const result = await anon.get('/api/doctors');
  metrics.record({
    scenario: 'failure.401',
    method: 'GET',
    path: '/api/doctors',
    status: result.status,
    durationMs: result.durationMs,
    requestId: result.requestId,
    ok: result.status === 401
  });
  return result;
}

export async function scenarioFailure403(client, metrics, role) {
  if (role === 'admin') {
    return null;
  }
  const result = await client.get('/api/admin/stats');
  metrics.record({
    scenario: 'failure.403',
    method: 'GET',
    path: '/api/admin/stats',
    status: result.status,
    durationMs: result.durationMs,
    requestId: result.requestId,
    ok: result.status === 403
  });
  return result;
}

export async function scenarioFailure404(client, metrics) {
  const path = '/api/doctors/507f1f77bcf86cd799439011';
  const result = await client.get(path);
  metrics.record({
    scenario: 'failure.404',
    method: 'GET',
    path,
    status: result.status,
    durationMs: result.durationMs,
    requestId: result.requestId,
    ok: result.status === 404
  });
  return result;
}

export async function scenarioFailureAuth(client, metrics) {
  const badClient = new (client.constructor)(client.baseUrl);
  const result = await badClient.post('/api/auth/login', {
    email: 'nobody@example.com',
    password: 'wrong-password-123'
  });
  metrics.record({
    scenario: 'failure.auth',
    method: 'POST',
    path: '/api/auth/login',
    status: result.status,
    durationMs: result.durationMs,
    requestId: result.requestId,
    ok: result.status === 401
  });
  return result;
}

export async function runPersonaWorkflow({
  client,
  persona,
  user,
  metrics,
  includeFailures = false,
  featureFlagTracker = null,
  expectedFlag = null
}) {
  await scenarioHealthCheck(client, metrics);
  await scenarioAuthMe(client, metrics);
  await scenarioListDoctors(client, metrics);

  const doctors = (await client.get('/api/doctors')).data?.doctors || [];
  if (doctors[0]?._id || doctors[0]?.id) {
    const doctorId = doctors[0]._id || doctors[0].id;
    await scenarioGetDoctor(client, metrics, doctorId);

    if (persona.role === 'patient') {
      const booked = await scenarioBookAppointment(client, metrics, doctorId);
      const appointmentId = booked.data?.appointment?._id || booked.data?.appointment?.id;
      if (appointmentId) {
        await scenarioCancelAppointment(client, metrics, appointmentId);
      }
    }
  }

  if (persona.role === 'admin' || persona.role === 'doctor') {
    await scenarioListPatients(client, metrics);
  }

  await scenarioListAppointments(client, metrics);
  await scenarioListMedicines(client, metrics);
  await scenarioFeatureFlagViaMe(client, metrics, { persona, featureFlagTracker, expectedFlag });

  if (persona.role === 'admin') {
    await scenarioAdminStats(client, metrics);
    await scenarioFeatureFlagRead(client, metrics);
    await scenarioAdminObservability(client, metrics);
  }

  if (includeFailures) {
    await scenarioFailure400(client, metrics);
    await scenarioFailure401(client, metrics);
    await scenarioFailure403(client, metrics, persona.role);
    await scenarioFailure404(client, metrics);
    await scenarioFailureAuth(client, metrics);
  }
}
