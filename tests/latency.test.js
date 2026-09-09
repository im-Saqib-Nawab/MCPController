import './setup-env.js';
import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import mongoose from 'mongoose';
import request from 'supertest';
import { User } from '../server/models/User.js';
import { RequestLatencySample } from '../server/models/RequestLatencySample.js';
import { EndpointSlo } from '../server/models/EndpointSlo.js';
import { EndpointSloAudit } from '../server/models/EndpointSloAudit.js';
import { LatencyAlert } from '../server/models/LatencyAlert.js';
import { LatencyMinuteBucket } from '../server/models/LatencyMinuteBucket.js';
import { config } from '../server/config/env.js';
import { computeLatencyStats, percentile } from '../server/lib/percentile.js';
import { buildTimingBreakdown } from '../server/lib/timing-breakdown.js';
import { validateSloInput } from '../server/services/slo.service.js';
import { evaluateLatencyAlerts } from '../server/services/latency-alert.service.js';
import { AppError } from '../server/middleware/error.middleware.js';

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
  await Promise.all([
    User.deleteMany({}),
    RequestLatencySample.deleteMany({}),
    EndpointSlo.deleteMany({}),
    EndpointSloAudit.deleteMany({}),
    LatencyAlert.deleteMany({}),
    LatencyMinuteBucket.deleteMany({})
  ]);

  adminAgent = request.agent(app);
  await adminAgent.post('/api/auth/login').send({
    email: config.adminEmail,
    password: config.adminPassword
  });

  patientAgent = request.agent(app);
  await patientAgent.post('/api/auth/register').send({
    name: 'Patient Latency',
    email: 'patient-latency@test.example',
    password: 'password123',
    role: 'patient'
  });
});

after(async () => {
  await mongoose.disconnect();
});

test('percentile and latency stats calculations', () => {
  const stats = computeLatencyStats([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
  assert.equal(stats.count, 10);
  assert.equal(stats.p50Ms, 50);
  assert.equal(stats.p95Ms, 100);
  assert.equal(stats.p99Ms, 100);
  assert.equal(percentile([1, 2, 3, 4, 5], 50), 3);
});

test('timing breakdown identifies bottleneck from trace steps', () => {
  const breakdown = buildTimingBreakdown({
    totalDurationMs: 2340,
    traceSteps: [
      { operation: 'mcp.auth.validated', durationMs: 30 },
      { operation: 'audit.book.appointment', durationMs: 80 },
      { operation: 'db.query', durationMs: 90 },
      { operation: 'deployment.proxy.completed', durationMs: 2050 },
      { operation: 'http.request.completed', durationMs: 90 }
    ]
  });

  assert.equal(breakdown.totalMs, 2340);
  assert.equal(breakdown.bottleneck.phase, 'external');
  assert.ok(breakdown.rows.some((row) => row.phase === 'external' && row.durationMs === 2050));
});

test('SLO validation rejects invalid budgets', () => {
  assert.throws(
    () => validateSloInput({ endpoint: '/mcp', p99BudgetMs: 0 }),
    (err) => err instanceof AppError && err.code === 'invalid_slo'
  );
});

test('admin can access latency observability endpoints', async () => {
  await RequestLatencySample.create({
    requestId: 'req-latency-1',
    method: 'GET',
    route: '/api/health',
    durationMs: 120,
    statusCode: 200
  });

  const endpoints = [
    '/api/admin/observability/latency',
    '/api/admin/observability/latency/slow-requests?route=/api/health',
    '/api/admin/observability/slo',
    '/api/admin/observability/alerts'
  ];

  for (const path of endpoints) {
    const res = await adminAgent.get(path);
    assert.equal(res.status, 200, `Expected 200 for ${path}, got ${res.status}`);
  }
});

test('non-admin cannot access latency endpoints', async () => {
  const endpoints = [
    '/api/admin/observability/latency',
    '/api/admin/observability/slo',
    '/api/admin/observability/alerts'
  ];

  for (const path of endpoints) {
    const res = await patientAgent.get(path);
    assert.equal(res.status, 403, `Expected 403 for ${path}, got ${res.status}`);
  }
});

test('creating and updating SLO writes audit log', async () => {
  const createRes = await adminAgent.post('/api/admin/observability/slo').send({
    endpoint: '/mcp',
    method: 'POST',
    primaryMetric: 'p99',
    p99BudgetMs: 1500,
    evaluationWindowDays: 30,
    alertConsecutiveMinutes: 5
  });

  assert.equal(createRes.status, 201);
  const sloId = createRes.body.slo.id;

  const updateRes = await adminAgent.patch(`/api/admin/observability/slo/${sloId}`).send({
    p99BudgetMs: 1200
  });
  assert.equal(updateRes.status, 200);
  assert.equal(updateRes.body.slo.p99BudgetMs, 1200);

  const auditRes = await adminAgent.get(`/api/admin/observability/slo/${sloId}/audit`);
  assert.equal(auditRes.status, 200);
  assert.ok(auditRes.body.audit.length >= 2);
  assert.equal(auditRes.body.audit[0].action, 'update');
  assert.equal(auditRes.body.audit[1].action, 'create');
  assert.ok(auditRes.body.audit[0].adminName);
});

test('wildcard SLO matches all recorded routes and reports current latency', async () => {
  await RequestLatencySample.create({
    requestId: 'req-wildcard-1',
    method: 'POST',
    route: '/api/appointments/abc123/cancel',
    durationMs: 1500,
    statusCode: 200
  });

  await EndpointSlo.create({
    endpoint: '*',
    method: '*',
    enabled: true,
    primaryMetric: 'p99',
    p99BudgetMs: 1000,
    evaluationWindowDays: 30,
    alertConsecutiveMinutes: 5
  });

  const res = await adminAgent.get('/api/admin/observability/slo');
  assert.equal(res.status, 200);
  const slo = res.body.slos.find((row) => row.endpoint === '*');
  assert.ok(slo);
  assert.ok(slo.sampleCount >= 1);
  assert.equal(slo.currentValue, 1500);
  assert.equal(slo.status, 'violating');
});

test('sample-based alert fires when wildcard SLO exceeds budget', async () => {
  await RequestLatencySample.create({
    requestId: 'req-alert-sample-1',
    method: 'POST',
    route: '/api/appointments/abc123/cancel',
    durationMs: 1500,
    statusCode: 200
  });

  await EndpointSlo.create({
    endpoint: '*',
    method: '*',
    enabled: true,
    primaryMetric: 'p99',
    p99BudgetMs: 1000,
    alertConsecutiveMinutes: 5
  });

  const res = await adminAgent.get('/api/admin/observability/alerts');
  assert.equal(res.status, 200);
  assert.ok(res.body.alerts.some((alert) => alert.status === 'violating'));
});

test('latency alert is created after consecutive SLO violations', async () => {
  await EndpointSlo.create({
    endpoint: '/mcp',
    method: '*',
    enabled: true,
    primaryMetric: 'p99',
    p99BudgetMs: 1000,
    alertConsecutiveMinutes: 5
  });

  const now = Date.now();
  for (let i = 0; i < 5; i += 1) {
    await LatencyMinuteBucket.create({
      route: '/mcp',
      method: '*',
      minuteStart: new Date(now - (4 - i) * 60 * 1000),
      count: 10,
      errorCount: 0,
      durationSamples: [1200, 1300, 1400, 1500, 1600],
      deploymentVersion: 'v-test'
    });
  }

  await evaluateLatencyAlerts();

  const alerts = await LatencyAlert.find({ endpoint: '/mcp', status: 'violating' }).lean();
  assert.equal(alerts.length, 1);
  assert.ok(alerts[0].currentValue > 1000);
  assert.equal(alerts[0].deploymentVersion, 'v-test');
});

test('latency alert resolves when metric returns below budget', async () => {
  await EndpointSlo.create({
    endpoint: '/api/doctors',
    method: '*',
    enabled: true,
    primaryMetric: 'p99',
    p99BudgetMs: 1000,
    alertConsecutiveMinutes: 5
  });

  await LatencyAlert.create({
    dedupeKey: '*:/api/doctors:p99',
    endpoint: '/api/doctors',
    method: '*',
    metric: 'p99',
    status: 'violating',
    currentValue: 1500,
    budgetValue: 1000,
    sloTarget: 'P99 < 1000ms',
    violationStartedAt: new Date(Date.now() - 10 * 60 * 1000)
  });

  const now = Date.now();
  for (let i = 0; i < 5; i += 1) {
    await LatencyMinuteBucket.create({
      route: '/api/doctors',
      method: '*',
      minuteStart: new Date(now - (4 - i) * 60 * 1000),
      count: 10,
      errorCount: 0,
      durationSamples: [100, 120, 150, 180, 200]
    });
  }

  await evaluateLatencyAlerts();

  const alert = await LatencyAlert.findOne({ endpoint: '/api/doctors' }).lean();
  assert.equal(alert.status, 'resolved');
  assert.ok(alert.resolvedAt);
});

test('request latency detail returns breakdown for sampled request', async () => {
  await RequestLatencySample.create({
    requestId: 'req-breakdown-1',
    method: 'POST',
    route: '/mcp',
    durationMs: 1800,
    statusCode: 200,
    phaseTimings: {
      authentication: 30,
      business: 80,
      database: 90,
      external: 1500,
      response: 100
    },
    timingDetails: {
      database: [{ label: 'db.query.doctors', durationMs: 90 }],
      external: [{ label: 'deployment.proxy.completed', durationMs: 1500 }]
    }
  });

  const res = await adminAgent.get('/api/admin/observability/latency/requests/req-breakdown-1');
  assert.equal(res.status, 200);
  assert.equal(res.body.request.durationMs, 1800);
  assert.equal(res.body.request.breakdown.bottleneck.phase, 'external');
  assert.ok(res.body.request.breakdown.details.external.length > 0);
});

test('authenticated user actions capture user identity in latency samples', async () => {
  await patientAgent.post('/api/appointments').send({
    doctorId: '000000000000000000000001',
    date: '2099-01-15'
  });

  const patientUser = await User.findOne({ email: 'patient-latency@test.example' }).lean();
  assert.ok(patientUser);

  let sample = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    sample = await RequestLatencySample.findOne({ userId: String(patientUser._id) })
      .sort({ createdAt: -1 })
      .lean();
    if (sample) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  if (sample) {
    assert.equal(sample.userId, String(patientUser._id));
    assert.ok(sample.durationMs >= 0);
  }
});

test('HTTP requests create latency samples in test mode', async () => {
  const res = await adminAgent.get('/api/admin/stats');
  assert.equal(res.status, 200);

  let samples = [];
  for (let attempt = 0; attempt < 20; attempt += 1) {
    samples = await RequestLatencySample.find({}).sort({ createdAt: -1 }).lean();
    if (samples.length) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  assert.ok(samples.length >= 1, `Expected samples, routes seen: ${samples.map((s) => s.route).join(', ')}`);
  assert.ok(samples[0].requestId);
  assert.ok(samples[0].durationMs >= 0);
});
