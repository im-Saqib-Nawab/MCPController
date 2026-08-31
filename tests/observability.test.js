import './setup-env.js';
import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import mongoose from 'mongoose';
import request from 'supertest';
import { User } from '../server/models/User.js';
import { config } from '../server/config/env.js';

let app;
let adminAgent;
let patientAgent;

before(async () => {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/mcpcontroller_test';
  await mongoose.connect(uri);
  await mongoose.connection.dropDatabase();
  const mod = await import('../server/app.js');
  app = mod.default;
});

beforeEach(async () => {
  await User.deleteMany({});

  adminAgent = request.agent(app);
  await adminAgent.post('/api/auth/login').send({
    email: config.adminEmail,
    password: config.adminPassword
  });

  patientAgent = request.agent(app);
  await patientAgent.post('/api/auth/register').send({
    name: 'Patient Test',
    email: 'patient-obs@test.example',
    password: 'password123',
    role: 'patient'
  });
});

after(async () => {
  await mongoose.disconnect();
});

test('admin can access observability endpoints', async () => {
  const endpoints = [
    '/api/admin/observability/overview',
    '/api/admin/observability/logs',
    '/api/admin/observability/traces',
    '/api/admin/observability/metrics'
  ];

  for (const path of endpoints) {
    const res = await adminAgent.get(path);
    assert.equal(res.status, 200, `Expected 200 for ${path}, got ${res.status}`);
  }
});

test('normal user cannot access observability endpoints', async () => {
  const endpoints = [
    '/api/admin/observability/overview',
    '/api/admin/observability/logs',
    '/api/admin/observability/traces',
    '/api/admin/observability/metrics'
  ];

  for (const path of endpoints) {
    const res = await patientAgent.get(path);
    assert.equal(res.status, 403, `Expected 403 for ${path}, got ${res.status}`);
  }
});

test('unauthenticated requests to observability endpoints are rejected', async () => {
  const res = await request(app).get('/api/admin/observability/logs');
  assert.equal(res.status, 401);
});

test('logs:read is not offered as a grantable scope', async () => {
  const res = await adminAgent.get('/api/admin/scopes');
  assert.equal(res.status, 200);
  const values = res.body.scopes.map((scope) => scope.value);
  assert.equal(values.includes('logs:read'), false);
});

test('log tools are admin-only in permission checks', async () => {
  const { isToolExposed, assertLogToolAllowed } = await import('../server/services/permission.service.js');

  assert.equal(isToolExposed('search_logs', ['doctor:read'], 'patient'), false);
  assert.equal(isToolExposed('search_logs', ['doctor:read'], 'admin'), true);
  assert.equal(isToolExposed('get_request_logs', [], 'admin'), true);

  assert.doesNotThrow(() => assertLogToolAllowed('search_logs', [], 'admin'));
  assert.throws(
    () => assertLogToolAllowed('search_logs', ['doctor:read'], 'patient'),
    /Administrator access required/
  );
});
