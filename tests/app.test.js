import './setup-env.js';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import { AuthorizationCode } from '../server/models/AuthorizationCode.js';
import { OAuthClient } from '../server/models/OAuthClient.js';
import { Doctor } from '../server/models/Doctor.js';
import { hashToken } from '../server/services/token.service.js';
import { config, mcpResourceUrl } from '../server/config/env.js';
import { parseBasicAuthorization } from '../server/services/oauth.service.js';

function pkce() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

function mcpPayload(res) {
  const text = res.text || '';
  const dataLine = text.split('\n').find((line) => line.startsWith('data: '));
  if (dataLine) {
    return JSON.parse(dataLine.slice(6));
  }
  return res.body;
}

function toolText(payload) {
  return JSON.parse(payload.result.content[0].text);
}

async function loginAdmin(agent) {
  const response = await agent.post('/api/auth/login').send({
    email: config.adminEmail,
    password: config.adminPassword
  });
  assert.equal(response.status, 200);
  return response;
}

async function createClient(clientId = 'chatgpt-test') {
  return OAuthClient.findOneAndUpdate(
    { clientId },
    {
      clientId,
      clientName: 'ChatGPT',
      redirectUris: ['http://localhost:9999/callback'],
      allowedScopes: ['doctor:read', 'doctor:write', 'doctor:delete'],
      tokenEndpointAuthMethod: 'none',
      grantTypes: ['authorization_code', 'refresh_token']
    },
    { upsert: true, new: true }
  );
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

test('parseBasicAuthorization keeps HTTPS CIMD client ids intact', () => {
  const clientId = 'https://chatgpt.com/oauth/17UGM9VNiuZ2/client.json';
  const unencoded = Buffer.from(`${clientId}:`).toString('base64');
  assert.deepEqual(parseBasicAuthorization(`Basic ${unencoded}`), {
    clientId,
    clientSecret: ''
  });

  const encoded = Buffer.from(`${encodeURIComponent(clientId)}:`).toString('base64');
  assert.equal(parseBasicAuthorization(`Basic ${encoded}`).clientId, clientId);
});

test('admin login works and registration is disabled', async () => {
  const agent = request.agent(app);
  const register = await agent.post('/api/auth/register').send({
    email: 'admin@example.com',
    password: 'whatever'
  });
  assert.equal(register.status, 404);

  await loginAdmin(agent);
  const me = await agent.get('/api/auth/me');
  assert.equal(me.status, 200);
  assert.equal(me.body.user.email, config.adminEmail);
});

test('OAuth authorization stores only approved scopes and token contains approved scopes', async () => {
  const client = await createClient('scopes-client');
  const agent = request.agent(app);
  await loginAdmin(agent);

  const { verifier, challenge } = pkce();
  const query = {
    response_type: 'code',
    client_id: client.clientId,
    redirect_uri: client.redirectUris[0],
    scope: 'doctor:read doctor:write doctor:delete',
    state: 'abc123',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    resource: mcpResourceUrl()
  };

  const preview = await agent.get('/api/oauth/request').query(query);
  assert.equal(preview.status, 200);
  assert.deepEqual(
    preview.body.scopes.map((scope) => scope.value),
    ['doctor:read', 'doctor:write', 'doctor:delete']
  );

  const consent = await agent.post('/api/oauth/consent').send({
    decision: 'allow',
    scopes: ['doctor:read', 'doctor:write'],
    query
  });
  assert.equal(consent.status, 200);

  const redirectUrl = new URL(consent.body.redirectUrl);
  const code = redirectUrl.searchParams.get('code');
  assert.ok(code);
  assert.equal(redirectUrl.searchParams.get('state'), 'abc123');

  const record = await AuthorizationCode.findOne({ codeHash: hashToken(code) }).lean();
  assert.deepEqual(record.scopes, ['doctor:read', 'doctor:write']);

  const tokenRes = await request(app).post('/oauth/token').type('form').send({
    grant_type: 'authorization_code',
    code,
    redirect_uri: client.redirectUris[0],
    client_id: client.clientId,
    code_verifier: verifier,
    resource: mcpResourceUrl()
  });
  assert.equal(tokenRes.status, 200);
  assert.equal(tokenRes.body.scope, 'doctor:read doctor:write');
});

test('public client token exchange can omit client_id and redirect_uri', async () => {
  const client = await createClient('public-client-no-token-auth');
  const agent = request.agent(app);
  await loginAdmin(agent);

  const { verifier, challenge } = pkce();
  const query = {
    response_type: 'code',
    client_id: client.clientId,
    redirect_uri: client.redirectUris[0],
    scope: 'doctor:read doctor:write',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    resource: mcpResourceUrl()
  };

  const consent = await agent.post('/api/oauth/consent').send({
    decision: 'allow',
    scopes: ['doctor:read'],
    query
  });
  const code = new URL(consent.body.redirectUrl).searchParams.get('code');

  const tokenRes = await request(app).post('/oauth/token').type('form').send({
    grant_type: 'authorization_code',
    code,
    code_verifier: verifier,
    resource: mcpResourceUrl()
  });

  assert.equal(tokenRes.status, 200);
  assert.equal(tokenRes.body.scope, 'doctor:read');
});

test('doctor tools honor read and write scopes and block delete without doctor:delete', async () => {
  await Doctor.deleteMany({});
  const initialDoctor = await Doctor.create({ name: 'Dr. Smith', specialization: 'Cardiology' });
  const client = await createClient('read-write-client');
  const agent = request.agent(app);
  await loginAdmin(agent);

  const { verifier, challenge } = pkce();
  const query = {
    response_type: 'code',
    client_id: client.clientId,
    redirect_uri: client.redirectUris[0],
    scope: 'doctor:read doctor:write doctor:delete',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    resource: mcpResourceUrl()
  };

  const consent = await agent.post('/api/oauth/consent').send({
    decision: 'allow',
    scopes: ['doctor:read', 'doctor:write'],
    query
  });
  const code = new URL(consent.body.redirectUrl).searchParams.get('code');

  const tokenRes = await request(app).post('/oauth/token').type('form').send({
    grant_type: 'authorization_code',
    code,
    redirect_uri: client.redirectUris[0],
    client_id: client.clientId,
    code_verifier: verifier,
    resource: mcpResourceUrl()
  });
  const token = tokenRes.body.access_token;

  const listRes = await request(app)
    .post('/mcp')
    .set('Authorization', `Bearer ${token}`)
    .set('Accept', 'application/json, text/event-stream')
    .set('Content-Type', 'application/json')
    .set('MCP-Protocol-Version', '2025-11-25')
    .send({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_doctors', arguments: {} } });
  assert.equal(listRes.status, 200);
  const listPayload = mcpPayload(listRes);
  const listedDoctors = toolText(listPayload);
  assert.ok(Array.isArray(listedDoctors));
  assert.ok(listedDoctors.length >= 1);

  const getRes = await request(app)
    .post('/mcp')
    .set('Authorization', `Bearer ${token}`)
    .set('Accept', 'application/json, text/event-stream')
    .set('Content-Type', 'application/json')
    .set('MCP-Protocol-Version', '2025-11-25')
    .send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'get_doctor', arguments: { doctorId: initialDoctor._id.toString() } } });
  assert.equal(getRes.status, 200);
  assert.equal(toolText(mcpPayload(getRes)).name, 'Dr. Smith');

  const addRes = await request(app)
    .post('/mcp')
    .set('Authorization', `Bearer ${token}`)
    .set('Accept', 'application/json, text/event-stream')
    .set('Content-Type', 'application/json')
    .set('MCP-Protocol-Version', '2025-11-25')
    .send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'add_doctor', arguments: { name: 'Dr. Ali', specialization: 'Neurology' } } });
  assert.equal(addRes.status, 200);
  const createdDoctor = toolText(mcpPayload(addRes));
  assert.equal(createdDoctor.name, 'Dr. Ali');

  const updateRes = await request(app)
    .post('/mcp')
    .set('Authorization', `Bearer ${token}`)
    .set('Accept', 'application/json, text/event-stream')
    .set('Content-Type', 'application/json')
    .set('MCP-Protocol-Version', '2025-11-25')
    .send({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'update_doctor', arguments: { doctorId: createdDoctor.id, specialization: 'Internal Medicine' } } });
  assert.equal(updateRes.status, 200);
  assert.equal(toolText(mcpPayload(updateRes)).specialization, 'Internal Medicine');

  const deleteRes = await request(app)
    .post('/mcp')
    .set('Authorization', `Bearer ${token}`)
    .set('Accept', 'application/json, text/event-stream')
    .set('Content-Type', 'application/json')
    .set('MCP-Protocol-Version', '2025-11-25')
    .send({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'delete_doctor', arguments: { doctorId: createdDoctor.id } } });
  assert.equal(deleteRes.status, 200);
  assert.match(JSON.stringify(mcpPayload(deleteRes)), /Permission denied/i);
});

test('delete doctor works when doctor:delete is granted', async () => {
  await Doctor.deleteMany({});
  const doctor = await Doctor.create({ name: 'Dr. Sarah', specialization: 'Dermatology' });
  const client = await createClient('delete-client');
  const agent = request.agent(app);
  await loginAdmin(agent);

  const { verifier, challenge } = pkce();
  const query = {
    response_type: 'code',
    client_id: client.clientId,
    redirect_uri: client.redirectUris[0],
    scope: 'doctor:read doctor:write doctor:delete',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    resource: mcpResourceUrl()
  };

  const consent = await agent.post('/api/oauth/consent').send({
    decision: 'allow',
    scopes: ['doctor:delete'],
    query
  });
  const code = new URL(consent.body.redirectUrl).searchParams.get('code');

  const tokenRes = await request(app).post('/oauth/token').type('form').send({
    grant_type: 'authorization_code',
    code,
    redirect_uri: client.redirectUris[0],
    client_id: client.clientId,
    code_verifier: verifier,
    resource: mcpResourceUrl()
  });

  const deleteRes = await request(app)
    .post('/mcp')
    .set('Authorization', `Bearer ${tokenRes.body.access_token}`)
    .set('Accept', 'application/json, text/event-stream')
    .set('Content-Type', 'application/json')
    .set('MCP-Protocol-Version', '2025-11-25')
    .send({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'delete_doctor', arguments: { doctorId: doctor._id.toString() } } });
  assert.equal(deleteRes.status, 200);
  assert.match(JSON.stringify(mcpPayload(deleteRes)), /deleted/i);
});

test('revoked token cannot use MCP', async () => {
  await Doctor.deleteMany({});
  await Doctor.create({ name: 'Dr. Ali', specialization: 'Neurology' });
  const client = await createClient('revoked-client');
  const agent = request.agent(app);
  await loginAdmin(agent);

  const { verifier, challenge } = pkce();
  const query = {
    response_type: 'code',
    client_id: client.clientId,
    redirect_uri: client.redirectUris[0],
    scope: 'doctor:read doctor:write doctor:delete',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    resource: mcpResourceUrl()
  };

  const consent = await agent.post('/api/oauth/consent').send({
    decision: 'allow',
    scopes: ['doctor:read', 'doctor:write'],
    query
  });
  const code = new URL(consent.body.redirectUrl).searchParams.get('code');

  const tokenRes = await request(app).post('/oauth/token').type('form').send({
    grant_type: 'authorization_code',
    code,
    redirect_uri: client.redirectUris[0],
    client_id: client.clientId,
    code_verifier: verifier,
    resource: mcpResourceUrl()
  });
  const accessToken = tokenRes.body.access_token;

  const revoke = await request(app).post('/oauth/revoke').type('form').send({ token: accessToken });
  assert.equal(revoke.status, 200);
  assert.equal(revoke.body.revoked, true);

  const denied = await request(app)
    .post('/mcp')
    .set('Authorization', `Bearer ${accessToken}`)
    .set('Accept', 'application/json')
    .set('Content-Type', 'application/json')
    .set('MCP-Protocol-Version', '2025-11-25')
    .send({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'list_doctors', arguments: {} } });
  assert.equal(denied.status, 401);
});

test('consent preview lists write and delete even if ChatGPT only requests doctor:read', async () => {
  const client = await createClient('read-only-request-client');
  const agent = request.agent(app);
  await loginAdmin(agent);

  const { challenge } = pkce();
  const preview = await agent.get('/api/oauth/request').query({
    response_type: 'code',
    client_id: client.clientId,
    redirect_uri: client.redirectUris[0],
    scope: 'doctor:read',
    state: 'scope-subset',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    resource: mcpResourceUrl()
  });
  assert.equal(preview.status, 200);
  assert.deepEqual(
    preview.body.scopes.map((scope) => scope.value),
    ['doctor:read', 'doctor:write', 'doctor:delete']
  );
  assert.equal(preview.body.scopes.find((scope) => scope.value === 'doctor:read').requested, true);
  assert.equal(preview.body.scopes.find((scope) => scope.value === 'doctor:write').requested, false);
});

test('unauthenticated MCP advertises all doctor scopes', async () => {
  const response = await request(app)
    .post('/mcp')
    .set('Accept', 'application/json')
    .set('Content-Type', 'application/json')
    .send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
  assert.equal(response.status, 401);
  const header = response.headers['www-authenticate'] || '';
  assert.match(header, /doctor:read/);
  assert.match(header, /doctor:write/);
  assert.match(header, /doctor:delete/);
});

test('token exchange accepts ChatGPT CIMD client_id in HTTP Basic', async () => {
  const clientId = 'https://chatgpt.com/oauth/17UGM9VNiuZ2/client.json';
  const redirectUri = 'https://chatgpt.com/connector/oauth/17UGM9VNiuZ2';
  const client = await createClient(clientId);
  client.redirectUris = [redirectUri];
  await client.save();

  const agent = request.agent(app);
  await loginAdmin(agent);
  const { verifier, challenge } = pkce();
  const query = {
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'doctor:read doctor:write',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    resource: mcpResourceUrl()
  };

  const consent = await agent.post('/api/oauth/consent').send({
    decision: 'allow',
    scopes: ['doctor:read', 'doctor:write'],
    query
  });
  const code = new URL(consent.body.redirectUrl).searchParams.get('code');

  const basic = Buffer.from(`${clientId}:`).toString('base64');
  const tokenRes = await request(app)
    .post('/oauth/token')
    .set('Authorization', `Basic ${basic}`)
    .set('Origin', 'https://chatgpt.com')
    .type('form')
    .send({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
      resource: [mcpResourceUrl(), `${mcpResourceUrl()}/`]
    });

  assert.equal(tokenRes.status, 200);
  assert.equal(tokenRes.body.token_type, 'Bearer');
  assert.equal(tokenRes.body.resource, mcpResourceUrl());
  assert.ok(tokenRes.headers['access-control-allow-origin']);
});

test('discovery documents are published', async () => {
  const as = await request(app).get('/.well-known/oauth-authorization-server');
  assert.equal(as.status, 200);
  assert.equal(as.body.revocation_endpoint, `${config.apiUrl}/oauth/revoke`);
  assert.deepEqual(as.body.code_challenge_methods_supported, ['S256']);

  const rs = await request(app).get('/.well-known/oauth-protected-resource');
  assert.equal(rs.status, 200);
  assert.ok(rs.body.authorization_servers.length);
});
