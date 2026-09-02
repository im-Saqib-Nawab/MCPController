import { config } from '../config.js';
import { HttpClient } from './http-client.js';
import { doctorRolloutBucket, isDoctorInPercentage } from '../../server/lib/rollout.js';
import { isDoctorIncluded } from '../../server/services/featureFlag.service.js';

function assertCondition(name, ok, details = '') {
  return { name, ok, details };
}

export async function verifyFeatureFlags() {
  const admin = new HttpClient();
  const login = await admin.login(config.adminEmail, config.adminPassword);
  if (!login.ok) {
    throw new Error(`Admin login failed: HTTP ${login.status}`);
  }

  const checks = [];
  const key = config.medicineFeatureKey;

  async function setFlag(body) {
    const res = await admin.patch(`/api/admin/feature-flags/${key}`, body);
    if (!res.ok) {
      throw new Error(`Failed to update feature flag: HTTP ${res.status} ${JSON.stringify(res.data)}`);
    }
    return res.data.flag;
  }

  async function doctorAccess(email, password) {
    const client = new HttpClient();
    const res = await client.login(email, password);
    if (!res.ok) {
      throw new Error(`Doctor login failed for ${email}: HTTP ${res.status}`);
    }
    const me = await client.me();
    return me.data?.user?.features?.[key] || null;
  }

  async function patientAccess(email, password) {
    const client = new HttpClient();
    const res = await client.login(email, password);
    if (!res.ok) {
      throw new Error(`Patient login failed for ${email}: HTTP ${res.status}`);
    }
    const me = await client.me();
    return me.data?.user?.features?.[key] || null;
  }

  // 100% rollout
  await setFlag({ enabled: true, doctorAccess: 'all', patientsEnabled: true, percentage: 100 });
  for (const doctor of config.personas.doctors) {
    const access = await doctorAccess(doctor.email, doctor.password);
    checks.push(assertCondition(`100% doctor ${doctor.email}`, access?.canView === true, JSON.stringify(access)));
  }
  const patientEnabled = await patientAccess(config.personas.patients[0].email, config.personas.patients[0].password);
  checks.push(assertCondition('100% patient canView', patientEnabled?.canView === true));

  // Role-based patient toggle off
  await setFlag({ patientsEnabled: false });
  const patientBlocked = await patientAccess(config.personas.patients[0].email, config.personas.patients[0].password);
  checks.push(assertCondition('patient toggle off', patientBlocked?.canView === false));

  // Specific doctor targeting (ahmed included, ali excluded)
  const doctorsRes = await admin.get('/api/doctors');
  const doctors = doctorsRes.data?.doctors || [];
  const ahmedDoctor = doctors.find((d) => d.email === 'ahmed@clinic.example') || doctors[0];
  const aliDoctor = doctors.find((d) => d.email === 'ali@clinic.example') || doctors[1];

  if (ahmedDoctor && aliDoctor) {
    const includedId = ahmedDoctor._id || ahmedDoctor.id;

    await setFlag({
      enabled: true,
      doctorAccess: 'specific',
      doctorIds: [includedId],
      patientsEnabled: false
    });

    const ahmedAccess = await doctorAccess('ahmed@clinic.example', 'Doctor123!');
    const aliAccess = await doctorAccess('ali@clinic.example', 'Doctor123!');

    checks.push(
      assertCondition(
        'specific targeting includes ahmed',
        ahmedAccess?.canView === true,
        `doctorId=${ahmedAccess?.doctorId}`
      )
    );
    checks.push(
      assertCondition(
        'specific targeting excludes ali',
        aliAccess?.canView === false,
        `doctorId=${aliAccess?.doctorId}`
      )
    );
  }

  // Percentage rollouts — verify consistency (same result on repeated calls)
  for (const pct of [10, 25, 50]) {
    const flag = await setFlag({
      enabled: true,
      doctorAccess: 'percentage',
      percentage: pct,
      patientsEnabled: false
    });

    for (const doctorCred of config.personas.doctors) {
      const client = new HttpClient();
      await client.login(doctorCred.email, doctorCred.password);
      const first = await client.me();
      const second = await client.me();
      const featureA = first.data?.user?.features?.[key];
      const featureB = second.data?.user?.features?.[key];
      checks.push(
        assertCondition(
          `${pct}% consistency ${doctorCred.email}`,
          featureA?.canView === featureB?.canView,
          `canView=${featureA?.canView}`
        )
      );

      const doctorId = featureA?.doctorId;
      if (doctorId) {
        const expected = isDoctorIncluded(
          {
            key,
            enabled: true,
            doctorAccess: 'percentage',
            percentage: pct,
            doctorIds: []
          },
          doctorId
        );
        checks.push(
          assertCondition(
            `${pct}% bucket correctness ${doctorCred.email}`,
            featureA?.canView === expected,
            `bucket=${doctorRolloutBucket(key, doctorId)} pct=${pct}`
          )
        );
      }
    }

    const adminFlag = await admin.get(`/api/admin/feature-flags/${key}`);
    const includedCount = adminFlag.data?.flag?.includedDoctorCount ?? 0;
    const totalCount = adminFlag.data?.flag?.totalDoctorCount ?? 0;
    // With small doctor populations, aggregate counts are not statistically meaningful.
    if (totalCount >= 20) {
      const expectedMin = Math.floor((totalCount * pct) / 100) - 2;
      const expectedMax = Math.ceil((totalCount * pct) / 100) + 2;
      checks.push(
        assertCondition(
          `${pct}% included doctor count`,
          includedCount >= Math.max(0, expectedMin) && includedCount <= expectedMax,
          `included=${includedCount}/${totalCount}`
        )
      );
    }
  }

  // Disabled flag
  await setFlag({ enabled: false, patientsEnabled: false });
  const disabledDoctor = await doctorAccess(config.personas.doctors[0].email, config.personas.doctors[0].password);
  checks.push(assertCondition('disabled feature', disabledDoctor?.canView === false));

  // Restore defaults for normal usage
  await setFlag({ enabled: true, doctorAccess: 'all', patientsEnabled: true, percentage: 100 });

  const passed = checks.filter((c) => c.ok).length;
  const failed = checks.filter((c) => !c.ok);

  return {
    total: checks.length,
    passed,
    failed: failed.length,
    checks,
    failures: failed
  };
}

export async function verifyFeatureFlagUnderLoad(sampleRequestIds = []) {
  const admin = new HttpClient();
  await admin.login(config.adminEmail, config.adminPassword);

  const flagRes = await admin.get(`/api/admin/feature-flags/${config.medicineFeatureKey}`);
  const flag = flagRes.data?.flag;
  if (!flag) {
    return { ok: false, message: 'Could not read feature flag during load verification' };
  }

  return {
    ok: true,
    flag: {
      enabled: flag.enabled,
      doctorAccess: flag.doctorAccess,
      percentage: flag.percentage,
      patientsEnabled: flag.patientsEnabled,
      includedDoctorCount: flag.includedDoctorCount,
      totalDoctorCount: flag.totalDoctorCount
    },
    sampledRequestIds: sampleRequestIds.slice(0, 5)
  };
}
