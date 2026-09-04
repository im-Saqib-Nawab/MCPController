import './setup-env.js';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import { OAuthClient } from '../server/models/OAuthClient.js';
import { User } from '../server/models/User.js';
import { CreditTransaction } from '../server/models/CreditTransaction.js';
import { config, mcpResourceUrl } from '../server/config/env.js';
import { CREDIT_COSTS } from '../server/config/credit-costs.js';

function pkce() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

function mcpPayload(res) {
  const text = res.text || '';
  const dataLine = text.split('\n').find((line) => line.startsWith('data: '));
  if (dataLine) return JSON.parse(dataLine.slice(6));
  return res.body;
}

function toolText(payload) {
  return JSON.parse(payload.result.content[0].text);
}

async function createClient(clientId = 'credits-test-client') {
  return OAuthClient.findOneAndUpdate(
    { clientId },
    {
      clientId,
      clientName: 'Credits Test',
      redirectUris: ['http://localhost:9999/callback'],
      allowedScopes: [...config.scopes],
      tokenEndpointAuthMethod: 'none',
      grantTypes: ['authorization_code', 'refresh_token']
    },
    { upsert: true, new: true }
  );
}

async function mcpTokenForUser(app, agent, scopes) {
  const client = await createClient(`credits-${Date.now()}`);
  const { verifier, challenge } = pkce();
  const query = {
    response_type: 'code',
    client_id: client.clientId,
    redirect_uri: client.redirectUris[0],
    scope: scopes.join(' '),
    code_challenge: challenge,
    code_challenge_method: 'S256',
    resource: mcpResourceUrl()
  };

  const consent = await agent.post('/api/oauth/consent').send({
    decision: 'allow',
    scopes,
    query
  });
  assert.equal(consent.status, 200, consent.body?.message);
  const code = new URL(consent.body.redirectUrl).searchParams.get('code');

  const tokenRes = await request(app).post('/oauth/token').type('form').send({
    grant_type: 'authorization_code',
    code,
    redirect_uri: client.redirectUris[0],
    client_id: client.clientId,
    code_verifier: verifier,
    resource: mcpResourceUrl()
  });
  assert.equal(tokenRes.status, 200, tokenRes.body?.message);
  return tokenRes.body.access_token;
}

async function callMcpTool(app, token, toolName, args = {}) {
  return request(app)
    .post('/mcp')
    .set('Authorization', `Bearer ${token}`)
    .set('Accept', 'application/json, text/event-stream')
    .set('Content-Type', 'application/json')
    .set('MCP-Protocol-Version', '2025-11-25')
    .send({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: { name: toolName, arguments: args }
    });
}

let app;

before(async () => {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/mcpcontroller_test';
  await mongoose.connect(uri);
  await mongoose.connection.dropDatabase();
  const mod = await import('../server/app.js');
  app = mod.default;
});

after(async () => {
  await mongoose.disconnect();
});

test('new patient receives initial free credits on registration', async () => {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/register').send({
    name: 'Test Patient',
    email: `patient-${Date.now()}@test.com`,
    password: 'password12345',
    role: 'patient'
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.user.creditBalance, config.credits.initialFreeCredits);

  const tx = await CreditTransaction.findOne({ userId: res.body.user.id, type: 'initial_grant' }).lean();
  assert.ok(tx);
  assert.equal(tx.amount, config.credits.initialFreeCredits);
});

test('credit summary API returns balance and usage', async () => {
  const agent = request.agent(app);
  const reg = await agent.post('/api/auth/register').send({
    name: 'Summary Patient',
    email: `summary-${Date.now()}-${Math.random()}@test.com`,
    password: 'password12345',
    role: 'patient'
  });
  assert.equal(reg.status, 201, reg.body?.message || JSON.stringify(reg.body));

  const res = await agent.get('/api/credits/summary');
  assert.equal(res.status, 200);
  assert.equal(res.body.balance, config.credits.initialFreeCredits);
});

test('MCP list_doctors deducts credits on success', async () => {
  const agent = request.agent(app);
  const reg = await agent.post('/api/auth/register').send({
    name: 'MCP Patient',
    email: `mcp-${Date.now()}-${Math.random()}@test.com`,
    password: 'password12345',
    role: 'patient'
  });
  assert.equal(reg.status, 201, reg.body?.message);
  const userId = reg.body.user.id;
  const before = reg.body.user.creditBalance;
  const token = await mcpTokenForUser(app, agent, ['doctor:read', 'profile:read']);

  const res = await callMcpTool(app, token, 'list_doctors');
  assert.equal(res.status, 200);
  const result = toolText(mcpPayload(res));
  assert.equal(result.credits.charged, CREDIT_COSTS.list_doctors);

  const after = await User.findById(userId).lean();
  assert.equal(after.creditBalance, before - CREDIT_COSTS.list_doctors);
});

test('get_credit_balance is free', async () => {
  const agent = request.agent(app);
  const reg = await agent.post('/api/auth/register').send({
    name: 'Free Tool Patient',
    email: `free-${Date.now()}-${Math.random()}@test.com`,
    password: 'password12345',
    role: 'patient'
  });
  assert.equal(reg.status, 201);
  const before = reg.body.user.creditBalance;
  const token = await mcpTokenForUser(app, agent, ['profile:read']);

  const res = await callMcpTool(app, token, 'get_credit_balance');
  assert.equal(res.status, 200);
  const result = toolText(mcpPayload(res));
  assert.equal(result.credits.charged, 0);

  const after = await User.findById(reg.body.user.id).lean();
  assert.equal(after.creditBalance, before);
});

test('insufficient credits blocks expensive MCP operation without charging', async () => {
  const agent = request.agent(app);
  const reg = await agent.post('/api/auth/register').send({
    name: 'Low Credit Patient',
    email: `low-${Date.now()}-${Math.random()}@test.com`,
    password: 'password12345',
    role: 'patient'
  });
  assert.equal(reg.status, 201);
  await User.findByIdAndUpdate(reg.body.user.id, { creditBalance: 5 });
  const token = await mcpTokenForUser(app, agent, ['appointment:create', 'profile:read']);

  const res = await callMcpTool(app, token, 'request_appointment', {
    doctorId: new mongoose.Types.ObjectId().toString(),
    date: '2099-12-01',
    confirm: true
  });

  assert.equal(res.status, 200);
  const payload = mcpPayload(res);
  assert.ok(payload.result?.isError);
  const result = JSON.parse(payload.result.content[0].text);
  assert.equal(result.error, 'insufficient_credits');

  const after = await User.findById(reg.body.user.id).lean();
  assert.equal(after.creditBalance, 5);
});

test('admin MCP usage bypasses credit deduction', async () => {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({
    email: config.adminEmail,
    password: config.adminPassword
  });

  const token = await mcpTokenForUser(app, agent, ['doctor:read', 'profile:read', 'appointment:read']);
  const res = await callMcpTool(app, token, 'list_doctors');
  assert.equal(res.status, 200);
  const result = toolText(mcpPayload(res));
  assert.equal(result.credits.bypass, 'admin');

  const me = await agent.get('/api/auth/me');
  const bypassTx = await CreditTransaction.findOne({
    userId: me.body.user.id,
    type: 'admin_bypass',
    tool: 'list_doctors'
  }).lean();
  assert.ok(bypassTx);
});

test('dev payment flow adds subscription credits idempotently', async () => {
  const agent = request.agent(app);
  const reg = await agent.post('/api/auth/register').send({
    name: 'Buyer Patient',
    email: `buy-${Date.now()}-${Math.random()}@test.com`,
    password: 'password12345',
    role: 'patient'
  });
  assert.equal(reg.status, 201);
  await User.findByIdAndUpdate(reg.body.user.id, { creditBalance: 0 });

  const checkout = await agent.post('/api/credits/checkout').send({ planId: 'monthly' });
  assert.equal(checkout.status, 200);

  const complete = await agent.post(`/api/payments/dev-complete?session=${checkout.body.sessionId}`);
  assert.equal(complete.status, 200);
  assert.equal(complete.body.alreadyCompleted, false);

  const after = await User.findById(reg.body.user.id).lean();
  assert.equal(after.creditBalance, config.subscriptionPlans[0].credits);

  const duplicate = await agent.post(`/api/payments/dev-complete?session=${checkout.body.sessionId}`);
  assert.equal(duplicate.status, 200);
  assert.equal(duplicate.body.alreadyCompleted, true);

  const still = await User.findById(reg.body.user.id).lean();
  assert.equal(still.creditBalance, config.subscriptionPlans[0].credits);
});

test('concurrent deductions cannot overspend balance', async () => {
  const { deductCredits, InsufficientCreditsError } = await import('../server/services/credit.service.js');
  const user = await User.create({
    name: 'Concurrent User',
    email: `concurrent-${Date.now()}-${Math.random()}@test.com`,
    password: 'password12345',
    role: 'patient',
    creditBalance: 3,
    allowedScopes: ['doctor:read']
  });

  const results = await Promise.allSettled([
    deductCredits({ userId: user._id, amount: 2, tool: 'test_a', action: 'Test A', idempotencyKey: `a-${Date.now()}` }),
    deductCredits({ userId: user._id, amount: 2, tool: 'test_b', action: 'Test B', idempotencyKey: `b-${Date.now()}` })
  ]);

  const fulfilled = results.filter((r) => r.status === 'fulfilled');
  const rejected = results.filter((r) => r.status === 'rejected');
  assert.equal(fulfilled.length, 1, `expected 1 fulfilled, got ${fulfilled.length}`);
  assert.equal(rejected.length, 1);
  assert.ok(rejected[0].reason instanceof InsufficientCreditsError);

  const after = await User.findById(user._id).lean();
  assert.equal(after.creditBalance, 1);
});
