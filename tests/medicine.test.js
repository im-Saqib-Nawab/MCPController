import './setup-env.js';
import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import mongoose from 'mongoose';
import request from 'supertest';
import { User } from '../server/models/User.js';
import { Doctor } from '../server/models/Doctor.js';
import { Medicine } from '../server/models/Medicine.js';
import { FeatureFlag } from '../server/models/FeatureFlag.js';
import { config } from '../server/config/env.js';
import { MEDICINE_FEATURE_KEY } from '../server/lib/medicines.js';
import { isDoctorInPercentage } from '../server/lib/rollout.js';

async function loginAdmin(agent) {
  const response = await agent.post('/api/auth/login').send({
    email: config.adminEmail,
    password: config.adminPassword
  });
  assert.equal(response.status, 200);
  return response;
}

async function enableFeatureForAll(adminAgent, { patientsEnabled = true } = {}) {
  const response = await adminAgent.patch(`/api/admin/feature-flags/${MEDICINE_FEATURE_KEY}`).send({
    enabled: true,
    doctorAccess: 'all',
    patientsEnabled
  });
  assert.equal(response.status, 200);
  return response.body.flag;
}

let app;
let adminAgent;
let doctorAgent;
let otherDoctorAgent;
let patientAgent;
let doctor;
let otherDoctor;

before(async () => {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/mcpcontroller_test';
  await mongoose.connect(uri);
  await mongoose.connection.dropDatabase();
  const mod = await import('../server/app.js');
  app = mod.default;
});

beforeEach(async () => {
  await Promise.all([
    User.deleteMany({}),
    Doctor.deleteMany({}),
    Medicine.deleteMany({}),
    FeatureFlag.deleteMany({})
  ]);

  adminAgent = request.agent(app);
  await loginAdmin(adminAgent);

  doctorAgent = request.agent(app);
  const doctorRegister = await doctorAgent.post('/api/auth/register').send({
    name: 'Dr. Ahmed Khan',
    email: 'ahmed@test.example',
    password: 'password123',
    role: 'doctor',
    specialization: 'Cardiology'
  });
  assert.equal(doctorRegister.status, 201);

  otherDoctorAgent = request.agent(app);
  const otherRegister = await otherDoctorAgent.post('/api/auth/register').send({
    name: 'Dr. Other',
    email: 'other@test.example',
    password: 'password123',
    role: 'doctor',
    specialization: 'Neurology'
  });
  assert.equal(otherRegister.status, 201);

  patientAgent = request.agent(app);
  const patientRegister = await patientAgent.post('/api/auth/register').send({
    name: 'Patient A',
    email: 'a@test.example',
    password: 'password123',
    role: 'patient'
  });
  assert.equal(patientRegister.status, 201);

  doctor = await Doctor.findById(doctorRegister.body.user.doctorId);
  otherDoctor = await Doctor.findById(otherRegister.body.user.doctorId);
});

after(async () => {
  await mongoose.disconnect();
});

test('medicine endpoints are blocked when the feature is disabled', async () => {
  const list = await doctorAgent.get('/api/medicines');
  assert.equal(list.status, 403);

  const create = await doctorAgent.post('/api/medicines').send({
    name: 'Paracetamol',
    usedFor: 'Pain and fever relief'
  });
  assert.equal(create.status, 403);

  const patientList = await patientAgent.get('/api/medicines');
  assert.equal(patientList.status, 403);
});

test('doctor can manage own medicines when feature is enabled for all doctors', async () => {
  await enableFeatureForAll(adminAgent);

  const create = await doctorAgent.post('/api/medicines').send({
    name: 'Paracetamol',
    usedFor: 'Pain and fever relief',
    careTips: 'Take with food if it upsets your stomach.',
    category: 'Pain relief'
  });
  assert.equal(create.status, 201);
  assert.equal(create.body.medicine.name, 'Paracetamol');

  const list = await doctorAgent.get('/api/medicines');
  assert.equal(list.status, 200);
  assert.equal(list.body.medicines.length, 1);

  const update = await doctorAgent.patch(`/api/medicines/${create.body.medicine.id}`).send({
    careTips: 'Drink water with each dose.'
  });
  assert.equal(update.status, 200);
  assert.match(update.body.medicine.careTips, /Drink water/);

  const del = await doctorAgent.delete(`/api/medicines/${create.body.medicine.id}`);
  assert.equal(del.status, 200);
});

test('patients can view medicines when patient access is enabled', async () => {
  await enableFeatureForAll(adminAgent, { patientsEnabled: true });

  await doctorAgent.post('/api/medicines').send({
    name: 'Ibuprofen',
    usedFor: 'Inflammation and pain relief',
    category: 'Pain relief'
  });

  const list = await patientAgent.get('/api/medicines');
  assert.equal(list.status, 200);
  assert.equal(list.body.medicines.length, 1);

  const byDoctor = await patientAgent.get('/api/medicines').query({ doctorId: String(doctor._id) });
  assert.equal(byDoctor.status, 200);
  assert.equal(byDoctor.body.medicines.length, 1);
});

test('patients cannot view medicines when patient access is disabled', async () => {
  await enableFeatureForAll(adminAgent, { patientsEnabled: false });

  await doctorAgent.post('/api/medicines').send({
    name: 'Ibuprofen',
    usedFor: 'Inflammation and pain relief'
  });

  const list = await patientAgent.get('/api/medicines');
  assert.equal(list.status, 403);
});

test('specific doctor rollout limits access to selected doctors', async () => {
  const patch = await adminAgent.patch(`/api/admin/feature-flags/${MEDICINE_FEATURE_KEY}`).send({
    enabled: true,
    doctorAccess: 'specific',
    doctorIds: [String(doctor._id)],
    patientsEnabled: true
  });
  assert.equal(patch.status, 200);

  const allowedCreate = await doctorAgent.post('/api/medicines').send({
    name: 'Allowed Med',
    usedFor: 'Testing specific rollout'
  });
  assert.equal(allowedCreate.status, 201);

  const blockedCreate = await otherDoctorAgent.post('/api/medicines').send({
    name: 'Blocked Med',
    usedFor: 'Should not be allowed'
  });
  assert.equal(blockedCreate.status, 403);

  const patientList = await patientAgent.get('/api/medicines');
  assert.equal(patientList.status, 200);
  assert.equal(patientList.body.medicines.length, 1);
  assert.equal(patientList.body.medicines[0].name, 'Allowed Med');

  const blockedDoctorView = await patientAgent
    .get('/api/medicines')
    .query({ doctorId: String(otherDoctor._id) });
  assert.equal(blockedDoctorView.status, 403);
});

test('percentage rollout is stable and enforced', async () => {
  const pct = 50;
  const patch = await adminAgent.patch(`/api/admin/feature-flags/${MEDICINE_FEATURE_KEY}`).send({
    enabled: true,
    doctorAccess: 'percentage',
    percentage: pct,
    patientsEnabled: true
  });
  assert.equal(patch.status, 200);

  const doctorAllowed = isDoctorInPercentage(MEDICINE_FEATURE_KEY, doctor._id, pct);
  const otherAllowed = isDoctorInPercentage(MEDICINE_FEATURE_KEY, otherDoctor._id, pct);

  const doctorCreate = await doctorAgent.post('/api/medicines').send({
    name: 'Pct Med',
    usedFor: 'Percentage rollout test'
  });
  assert.equal(doctorCreate.status, doctorAllowed ? 201 : 403);

  const otherCreate = await otherDoctorAgent.post('/api/medicines').send({
    name: 'Other Pct Med',
    usedFor: 'Percentage rollout test'
  });
  assert.equal(otherCreate.status, otherAllowed ? 201 : 403);

  const doctorAllowedAgain = isDoctorInPercentage(MEDICINE_FEATURE_KEY, doctor._id, pct);
  assert.equal(doctorAllowed, doctorAllowedAgain);
});

test('non-admin users cannot manage feature flags', async () => {
  const doctorAttempt = await doctorAgent.patch(`/api/admin/feature-flags/${MEDICINE_FEATURE_KEY}`).send({
    enabled: true
  });
  assert.equal(doctorAttempt.status, 403);

  const patientAttempt = await patientAgent.patch(`/api/admin/feature-flags/${MEDICINE_FEATURE_KEY}`).send({
    enabled: true
  });
  assert.equal(patientAttempt.status, 403);
});

test('admin can enable and disable the feature', async () => {
  const enable = await adminAgent.patch(`/api/admin/feature-flags/${MEDICINE_FEATURE_KEY}`).send({
    enabled: true,
    doctorAccess: 'all',
    patientsEnabled: true
  });
  assert.equal(enable.status, 200);
  assert.equal(enable.body.flag.enabled, true);

  const me = await doctorAgent.get('/api/auth/me');
  assert.equal(me.body.user.features.medicine_health_tips.canManage, true);

  const disable = await adminAgent.patch(`/api/admin/feature-flags/${MEDICINE_FEATURE_KEY}`).send({
    enabled: false
  });
  assert.equal(disable.status, 200);
  assert.equal(disable.body.flag.enabled, false);

  const blocked = await doctorAgent.post('/api/medicines').send({
    name: 'Should Fail',
    usedFor: 'Feature disabled'
  });
  assert.equal(blocked.status, 403);
});

test('doctor cannot modify another doctor medicine', async () => {
  await enableFeatureForAll(adminAgent);

  const adminCreate = await adminAgent.post('/api/medicines').send({
    name: 'Other Doctor Med',
    usedFor: 'Admin created for other doctor',
    doctorId: String(otherDoctor._id)
  });
  assert.equal(adminCreate.status, 201);

  const patchAttempt = await doctorAgent.patch(`/api/medicines/${adminCreate.body.medicine.id}`).send({
    name: 'Hijacked'
  });
  assert.equal(patchAttempt.status, 403);
});
