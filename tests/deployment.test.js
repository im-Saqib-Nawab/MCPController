import './setup-env.js';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import { DeploymentRollout } from '../server/models/DeploymentRollout.js';
import { DeploymentRolloutAudit } from '../server/models/DeploymentRolloutAudit.js';
import { User } from '../server/models/User.js';
import { config } from '../server/config/env.js';
import {
  computeAssignment,
  createAssignmentCookieValue,
  resolveStickyAssignment,
  verifyAssignmentCookie
} from '../server/lib/deployment-assignment.js';
import { isRouterExcludedPath, isCanaryProxyPath } from '../server/lib/deployment-proxy.js';
import { DEPLOYMENT_ROLLOUT_KEY } from '../server/models/DeploymentRollout.js';

async function loginAdmin(agent, email = config.adminEmail, password = config.adminPassword) {
  const response = await agent.post('/api/auth/login').send({ email, password });
  assert.equal(response.status, 200);
  return response;
}

async function seedRollout(overrides = {}) {
  return DeploymentRollout.findOneAndUpdate(
    { key: DEPLOYMENT_ROLLOUT_KEY },
    {
      key: DEPLOYMENT_ROLLOUT_KEY,
      productionVersion: 'v1',
      canaryVersion: 'v2',
      canaryDeploymentUrl: 'https://mcpcontroller-canary.example.vercel.app',
      canaryPercentage: 0,
      rolloutEnabled: false,
      rolloutStatus: 'idle',
      assignmentEpoch: 1,
      ...overrides
    },
    { upsert: true, new: true }
  );
}

let app;

before(async () => {
  process.env.IS_DEPLOYMENT_ROUTER = 'true';
  process.env.VERCEL_ENV = 'production';

  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/mcpcontroller_test';
  await mongoose.connect(uri);
  await mongoose.connection.dropDatabase();

  const mod = await import('../server/app.js');
  app = mod.default;

  await User.create({
    name: 'Secondary Admin',
    email: 'secondary-admin@example.com',
    password: 'change-this-password',
    role: 'admin'
  });
});

after(async () => {
  await mongoose.disconnect();
});

test('computeAssignment is stable and respects percentage boundaries', () => {
  const subject = 'user:abc123';
  assert.equal(computeAssignment(subject, 0, 1), 'production');
  assert.equal(computeAssignment(subject, 100, 1), 'canary');

  const first = computeAssignment(subject, 50, 7);
  const second = computeAssignment(subject, 50, 7);
  assert.equal(first, second);
});

test('assignment cookie remains valid for the same epoch and subject', () => {
  const value = createAssignmentCookieValue({
    assignment: 'canary',
    epoch: 3,
    subject: 'user:123'
  });

  const payload = verifyAssignmentCookie(value);
  assert.ok(payload);
  assert.equal(payload.assignment, 'canary');
  assert.equal(payload.epoch, 3);
  assert.equal(payload.subject, 'user:123');
});

test('resolveStickyAssignment uses cookie while rollout remains active', () => {
  const rollout = {
    canaryDeploymentUrl: 'https://preview.vercel.app',
    canaryVersion: 'v2',
    canaryPercentage: 25,
    rolloutEnabled: true,
    assignmentEpoch: 2
  };

  const cookie = createAssignmentCookieValue({
    assignment: 'canary',
    epoch: 2,
    subject: 'user:999'
  });

  const req = {
    cookies: {
      mcpcontroller_rollout: cookie,
      mcpcontroller_session: undefined
    },
    headers: {}
  };

  const sticky = resolveStickyAssignment(req, rollout);
  assert.equal(sticky.assignment, 'canary');
  assert.equal(sticky.reason, 'cookie');
});

test('rollback epoch forces production even for prior canary cookie', () => {
  const rollout = {
    canaryDeploymentUrl: 'https://preview.vercel.app',
    canaryVersion: 'v2',
    canaryPercentage: 0,
    rolloutEnabled: false,
    assignmentEpoch: 3
  };

  const cookie = createAssignmentCookieValue({
    assignment: 'canary',
    epoch: 2,
    subject: 'user:777'
  });

  const req = {
    cookies: { mcpcontroller_rollout: cookie },
    headers: {}
  };

  const sticky = resolveStickyAssignment(req, rollout);
  assert.equal(sticky.assignment, 'production');
});

test('GET /api/admin/deployment/overview requires admin auth', async () => {
  const res = await request(app).get('/api/admin/deployment/overview');
  assert.equal(res.status, 401);
});

test('non-primary admin can view deployment overview but cannot change rollout', async () => {
  await seedRollout();

  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({
    email: 'secondary-admin@example.com',
    password: 'change-this-password'
  });

  const overview = await agent.get('/api/admin/deployment/overview');
  assert.equal(overview.status, 200);
  assert.equal(overview.body.permissions.canManage, false);

  const patch = await agent.patch('/api/admin/deployment/percentage').send({ percentage: 10 });
  assert.equal(patch.status, 403);
});

test('primary admin can configure rollout and rollback safely', async () => {
  await seedRollout();

  const agent = request.agent(app);
  await loginAdmin(agent);

  const target = await agent.patch('/api/admin/deployment/canary-target').send({
    canaryDeploymentUrl: 'https://mcpcontroller-canary.example.vercel.app',
    canaryVersion: 'v2'
  });
  assert.equal(target.status, 200);
  assert.equal(target.body.rollout.canaryVersion, 'v2');

  const pct = await agent.patch('/api/admin/deployment/percentage').send({ percentage: 25 });
  assert.equal(pct.status, 200);
  assert.equal(pct.body.rollout.canaryPercentage, 25);
  assert.equal(pct.body.rollout.rolloutEnabled, true);

  const invalid = await agent.patch('/api/admin/deployment/percentage').send({ percentage: 150 });
  assert.equal(invalid.status, 400);

  const rollback = await agent.post('/api/admin/deployment/rollback');
  assert.equal(rollback.status, 200);
  assert.equal(rollback.body.rollout.canaryPercentage, 0);
  assert.equal(rollback.body.rollout.rolloutEnabled, false);
  assert.equal(rollback.body.rollout.assignmentEpoch, 2);

  const audits = await DeploymentRolloutAudit.find({}).sort({ createdAt: -1 }).lean();
  assert.ok(audits.length >= 3);
  assert.equal(audits[0].action, 'rollback');
});

test('rejects untrusted canary deployment URLs', async () => {
  await seedRollout({ canaryDeploymentUrl: '', canaryVersion: '' });

  const agent = request.agent(app);
  await loginAdmin(agent);

  const res = await agent.patch('/api/admin/deployment/canary-target').send({
    canaryDeploymentUrl: 'https://evil.example.com',
    canaryVersion: 'v2'
  });

  assert.equal(res.status, 400);
});

test('discovery metadata always advertises the stable public origin', async () => {
  const res = await request(app).get('/.well-known/oauth-protected-resource');
  assert.equal(res.status, 200);
  assert.equal(res.body.resource, `${config.apiUrl}/mcp`);
  assert.deepEqual(res.body.authorization_servers, [config.apiUrl]);
});

test('health endpoint exposes deployment version metadata', async () => {
  const res = await request(app).get('/api/health/live');
  assert.equal(res.status, 200);
  assert.ok(res.body.deploymentVersion);
  assert.equal(res.body.isDeploymentRouter, true);
});

test('router excluded paths stay on the production control plane', () => {
  assert.equal(isRouterExcludedPath('/.well-known/oauth-protected-resource'), true);
  assert.equal(isRouterExcludedPath('/api/admin/deployment/overview'), true);
  assert.equal(isRouterExcludedPath('/api/admin/users'), true);
  assert.equal(isRouterExcludedPath('/api/auth/login'), true);
  assert.equal(isRouterExcludedPath('/api/auth/register'), true);
  assert.equal(isRouterExcludedPath('/api/auth/me'), false);
  assert.equal(isRouterExcludedPath('/health/live'), true);
  assert.equal(isRouterExcludedPath('/health/ready'), true);
  assert.equal(isRouterExcludedPath('/metrics'), true);
  assert.equal(isRouterExcludedPath('/api/metrics'), true);
  assert.equal(isRouterExcludedPath('/assets/index-abc123.js'), true);
  assert.equal(isRouterExcludedPath('/mcp'), false);
  assert.equal(isRouterExcludedPath('/oauth/token'), false);
  assert.equal(isRouterExcludedPath('/dashboard'), false);
});

test('only backend routes are proxied to canary', () => {
  assert.equal(isCanaryProxyPath('/admin/deployment'), false);
  assert.equal(isCanaryProxyPath('/login'), false);
  assert.equal(isCanaryProxyPath('/assets/index-abc123.js'), false);
  assert.equal(isCanaryProxyPath('/api/doctors'), true);
  assert.equal(isCanaryProxyPath('/mcp'), true);
  assert.equal(isCanaryProxyPath('/oauth/token'), true);
  assert.equal(isCanaryProxyPath('/api/admin/deployment/overview'), false);
});

test('sticky assignment remains stable across repeated requests at 50%', () => {
  const rollout = {
    canaryDeploymentUrl: 'https://preview.vercel.app',
    canaryVersion: 'v2',
    canaryPercentage: 50,
    rolloutEnabled: true,
    assignmentEpoch: 4
  };

  const req = {
    cookies: {},
    headers: { authorization: 'Bearer stable-token-value' }
  };

  const first = resolveStickyAssignment(req, rollout);
  const cookie = createAssignmentCookieValue({
    assignment: first.assignment,
    epoch: first.epoch,
    subject: first.subject
  });

  const sticky = resolveStickyAssignment(
    {
      cookies: { mcpcontroller_rollout: cookie },
      headers: req.headers
    },
    rollout
  );

  assert.equal(sticky.subject, first.subject);
  assert.equal(sticky.assignment, first.assignment);
  assert.equal(sticky.reason, 'cookie');
});

test('login and admin APIs stay on production even during active canary rollout', async () => {
  await seedRollout({
    canaryPercentage: 100,
    rolloutEnabled: true,
    rolloutStatus: 'rolling'
  });

  const agent = request.agent(app);
  const login = await agent.post('/api/auth/login').send({
    email: config.adminEmail,
    password: config.adminPassword
  });
  assert.equal(login.status, 200);
  assert.equal(login.headers['x-served-by'], 'router');

  const overview = await agent.get('/api/admin/deployment/overview');
  assert.equal(overview.status, 200);
});

test('setting canary percentage to 0 increments assignment epoch', async () => {
  await seedRollout({
    canaryPercentage: 25,
    rolloutEnabled: true,
    rolloutStatus: 'rolling',
    assignmentEpoch: 4
  });

  const agent = request.agent(app);
  await loginAdmin(agent);

  const res = await agent.patch('/api/admin/deployment/percentage').send({ percentage: 0 });
  assert.equal(res.status, 200);
  assert.equal(res.body.rollout.canaryPercentage, 0);
  assert.equal(res.body.rollout.rolloutEnabled, false);
  assert.equal(res.body.rollout.assignmentEpoch, 5);
});

test('percentage presets 10, 50, and 100 are accepted', async () => {
  await seedRollout();

  const agent = request.agent(app);
  await loginAdmin(agent);

  for (const pct of [10, 50, 100]) {
    const res = await agent.patch('/api/admin/deployment/percentage').send({ percentage: pct });
    assert.equal(res.status, 200, `expected ${pct}% to succeed`);
    assert.equal(res.body.rollout.canaryPercentage, pct);
    assert.equal(res.body.rollout.rolloutEnabled, true);
  }

  const zero = await agent.patch('/api/admin/deployment/percentage').send({ percentage: 0 });
  assert.equal(zero.status, 200);
  assert.equal(zero.body.rollout.canaryPercentage, 0);
});

test('deployment overview is readable on non-router runtimes', async () => {
  const { getDeploymentOverview } = await import('../server/services/deployment.service.js');
  const original = config.isDeploymentRouter;

  config.isDeploymentRouter = false;

  try {
    const overview = await getDeploymentOverview();
    assert.equal(overview.router.isRouter, false);
    assert.equal(overview.router.canManageFromHere, false);
    assert.ok(overview.servers);
    assert.ok(overview.traffic);
  } finally {
    config.isDeploymentRouter = original;
  }
});

test('write operations reject non-router runtimes', async () => {
  const { setRolloutPercentage } = await import('../server/services/deployment.service.js');
  const original = config.isDeploymentRouter;

  config.isDeploymentRouter = false;

  try {
    await assert.rejects(
      () =>
        setRolloutPercentage({
          percentage: 10,
          adminUser: { _id: '1', email: config.adminEmail, role: 'admin' },
          requestId: 'test',
          req: { headers: { host: 'preview.example.vercel.app' } }
        }),
      (err) => err.status === 403
    );
  } finally {
    config.isDeploymentRouter = original;
  }
});

test('write operations allow public entrypoint host even when router flag is false', async () => {
  await seedRollout();

  const adminUser = await User.findOne({ email: config.adminEmail }).lean();
  assert.ok(adminUser);

  const { setRolloutPercentage } = await import('../server/services/deployment.service.js');
  const original = config.isDeploymentRouter;
  config.isDeploymentRouter = false;

  try {
    const publicHost = new URL(config.apiUrl).hostname;
    const rollout = await setRolloutPercentage({
      percentage: 10,
      adminUser,
      requestId: 'test',
      req: { headers: { host: publicHost } }
    });
    assert.equal(rollout.canaryPercentage, 10);
  } finally {
    config.isDeploymentRouter = original;
    await seedRollout({ canaryPercentage: 0, rolloutEnabled: false, assignmentEpoch: 1 });
  }
});

test('bearer-token subject hashing is stable for MCP sticky routing', () => {
  const token = crypto.randomBytes(24).toString('hex');
  const req = {
    cookies: {},
    headers: { authorization: `Bearer ${token}` }
  };

  const rollout = {
    canaryDeploymentUrl: 'https://preview.vercel.app',
    canaryVersion: 'v2',
    canaryPercentage: 100,
    rolloutEnabled: true,
    assignmentEpoch: 1
  };

  const first = resolveStickyAssignment(req, rollout);
  const second = resolveStickyAssignment(req, rollout);
  assert.equal(first.subject, second.subject);
  assert.equal(first.assignment, 'canary');
});
