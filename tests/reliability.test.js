import './setup-env.js';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import request from 'supertest';
import { config } from '../server/config/env.js';

let app;

before(async () => {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/mcpcontroller_test';
  await mongoose.connect(uri);
  const mod = await import('../server/app.js');
  app = mod.default;
});

after(async () => {
  await mongoose.disconnect();
});

test('liveness endpoint responds without requiring database readiness details', async () => {
  const response = await request(app).get('/api/health/live');
  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.service, config.mcpServerName);
});

test('readiness endpoint reports database connectivity', async () => {
  const response = await request(app).get('/api/health/ready');
  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.database, 'connected');
});

test('list endpoints support explicit pagination metadata', async () => {
  const agent = request.agent(app);
  const login = await agent.post('/api/auth/login').send({
    email: config.adminEmail,
    password: config.adminPassword
  });
  assert.equal(login.status, 200);

  const doctors = await agent.get('/api/doctors?page=1&limit=1');
  assert.equal(doctors.status, 200);
  assert.ok(Array.isArray(doctors.body.doctors));
  assert.equal(doctors.body.pagination.page, 1);
  assert.equal(doctors.body.pagination.limit, 1);
  assert.ok(typeof doctors.body.pagination.total === 'number');

  const appointments = await agent.get('/api/appointments?page=1&limit=5');
  assert.equal(appointments.status, 200);
  assert.ok(Array.isArray(appointments.body.appointments));
  assert.equal(appointments.body.pagination.limit, 5);
});

test('metrics endpoint exposes runtime counters', async () => {
  const response = await request(app).get('/api/metrics');
  assert.equal(response.status, 200);
  assert.match(response.text, /http_requests_total/);
  assert.match(response.text, /process_uptime_seconds/);
});

test('routine HTTP logs are not persisted while audit logs are', async () => {
  const { SystemLog } = await import('../server/models/SystemLog.js');
  const { flushLogQueue } = await import('../server/services/log-store.service.js');
  const before = await SystemLog.countDocuments({ category: 'audit' });

  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({
    email: config.adminEmail,
    password: config.adminPassword
  });
  await flushLogQueue();

  const httpLogs = await SystemLog.countDocuments({ operation: 'http.request.completed' });
  const auditLogs = await SystemLog.countDocuments({ category: 'audit' });

  assert.equal(httpLogs, 0);
  assert.ok(auditLogs >= before + 1);
});

test('appointments list avoids per-row patient and doctor lookups', async () => {
  const { User } = await import('../server/models/User.js');
  const { Doctor } = await import('../server/models/Doctor.js');
  const { Appointment } = await import('../server/models/Appointment.js');

  await Appointment.deleteMany({});
  await Doctor.deleteMany({});
  await User.deleteMany({ email: { $in: ['perf-patient@test.example', 'perf-doctor@test.example'] } });

  const patient = await User.create({
    name: 'Perf Patient',
    email: 'perf-patient@test.example',
    password: 'password123',
    role: 'patient'
  });
  const doctor = await Doctor.create({ name: 'Perf Doctor', specialization: 'General' });

  await Appointment.insertMany([
    {
      patientId: patient._id,
      doctorId: doctor._id,
      date: '2030-01-01',
      weekday: 'tuesday',
      status: 'REQUESTED'
    },
    {
      patientId: patient._id,
      doctorId: doctor._id,
      date: '2030-01-02',
      weekday: 'wednesday',
      status: 'REQUESTED'
    }
  ]);

  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({
    email: config.adminEmail,
    password: config.adminPassword
  });

  const originalFind = User.find;
  const originalDoctorFind = Doctor.find;
  let userFindCalls = 0;
  let doctorFindCalls = 0;

  User.find = function patchedUserFind(...args) {
    userFindCalls += 1;
    return originalFind.apply(this, args);
  };
  Doctor.find = function patchedDoctorFind(...args) {
    doctorFindCalls += 1;
    return originalDoctorFind.apply(this, args);
  };

  try {
    const response = await agent.get('/api/appointments');
    assert.equal(response.status, 200);
    assert.equal(response.body.appointments.length, 2);
    assert.equal(userFindCalls, 1);
    assert.equal(doctorFindCalls, 1);
    assert.ok(response.body.appointments.every((row) => row.patient && row.doctor));
  } finally {
    User.find = originalFind;
    Doctor.find = originalDoctorFind;
  }
});
