import './setup-env.js';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import { doctorRolloutBucket, isDoctorInPercentage } from '../server/lib/rollout.js';
import {
  getMedicineFeatureAccess,
  isDoctorIncluded,
  updateFeatureFlag
} from '../server/services/featureFlag.service.js';
import { FeatureFlag } from '../server/models/FeatureFlag.js';
import { MEDICINE_FEATURE_KEY } from '../server/lib/medicines.js';

before(async () => {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/mcpcontroller_test';
  await mongoose.connect(uri);
  await mongoose.connection.dropDatabase();
});

after(async () => {
  await mongoose.disconnect();
});

test('doctorRolloutBucket is stable for the same doctor and feature key', () => {
  const first = doctorRolloutBucket(MEDICINE_FEATURE_KEY, '507f1f77bcf86cd799439011');
  const second = doctorRolloutBucket(MEDICINE_FEATURE_KEY, '507f1f77bcf86cd799439011');
  assert.equal(first, second);
  assert.ok(first >= 0 && first < 100);
});

test('isDoctorInPercentage respects rollout boundaries', () => {
  const doctorId = '507f1f77bcf86cd799439011';
  const bucket = doctorRolloutBucket(MEDICINE_FEATURE_KEY, doctorId);

  assert.equal(isDoctorInPercentage(MEDICINE_FEATURE_KEY, doctorId, 0), false);
  assert.equal(isDoctorInPercentage(MEDICINE_FEATURE_KEY, doctorId, 100), true);
  assert.equal(isDoctorInPercentage(MEDICINE_FEATURE_KEY, doctorId, bucket + 1), bucket < bucket + 1);
  assert.equal(isDoctorInPercentage(MEDICINE_FEATURE_KEY, doctorId, bucket), false);
});

test('isDoctorIncluded handles all, specific, and percentage modes', () => {
  const doctorA = '507f1f77bcf86cd799439011';
  const doctorB = '507f1f77bcf86cd799439012';

  const allFlag = {
    key: MEDICINE_FEATURE_KEY,
    enabled: true,
    doctorAccess: 'all',
    doctorIds: [],
    percentage: 0
  };
  assert.equal(isDoctorIncluded(allFlag, doctorA), true);

  const specificFlag = {
    ...allFlag,
    doctorAccess: 'specific',
    doctorIds: [doctorA]
  };
  assert.equal(isDoctorIncluded(specificFlag, doctorA), true);
  assert.equal(isDoctorIncluded(specificFlag, doctorB), false);

  const disabledFlag = { ...allFlag, enabled: false };
  assert.equal(isDoctorIncluded(disabledFlag, doctorA), false);
});

test('getMedicineFeatureAccess for admin, disabled feature, and patient toggle', async () => {
  await FeatureFlag.deleteMany({});

  const admin = { _id: 'admin-id', role: 'admin' };
  const adminAccess = await getMedicineFeatureAccess(admin);
  assert.equal(adminAccess.canView, true);
  assert.equal(adminAccess.canManage, true);

  const doctor = { _id: 'doctor-user-id', role: 'doctor' };
  const patient = { _id: 'patient-user-id', role: 'patient' };

  const disabledDoctorAccess = await getMedicineFeatureAccess(doctor);
  assert.equal(disabledDoctorAccess.canView, false);
  assert.equal(disabledDoctorAccess.canManage, false);

  const disabledPatientAccess = await getMedicineFeatureAccess(patient);
  assert.equal(disabledPatientAccess.canView, false);
  assert.equal(disabledPatientAccess.canManage, false);

  await updateFeatureFlag(
    MEDICINE_FEATURE_KEY,
    { enabled: true, doctorAccess: 'all', patientsEnabled: true },
    admin
  );

  const enabledPatientAccess = await getMedicineFeatureAccess(patient);
  assert.equal(enabledPatientAccess.canView, true);
  assert.equal(enabledPatientAccess.canManage, false);

  await updateFeatureFlag(MEDICINE_FEATURE_KEY, { patientsEnabled: false }, admin);
  const patientBlocked = await getMedicineFeatureAccess(patient);
  assert.equal(patientBlocked.canView, false);
});
