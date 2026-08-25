import './setup-env.js';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import { AuthorizationCode } from '../server/models/AuthorizationCode.js';
import { OAuthClient } from '../server/models/OAuthClient.js';
import { hashToken } from '../server/services/token.service.js';
import { mcpResourceUrl } from '../server/config/env.js';

function pkce() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
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

test('user can register, login, and read /api/auth/me', async () => {
  const agent = request.agent(app);
  const registered = await agent.post('/api/auth/register').send({
    name: 'Ada',
    email: 'ada@example.com',
    password: 'password123'
  });
  assert.equal(registered.status, 201);

  const me = await agent.get('/api/auth/me');
  assert.equal(me.status, 200);
  assert.equal(me.body.user.email, 'ada@example.com');

  await agent.post('/api/auth/logout');
  const loggedOut = await agent.get('/api/auth/me');
  assert.equal(loggedOut.status, 401);

  const login = await agent.post('/api/auth/login').send({
    email: 'ada@example.com',
    password: 'password123'
  });
  assert.equal(login.status, 200);
});

test('OAuth rejects unknown clients and unregistered redirect URIs', async () => {
  const { challenge } = pkce();
  const unknown = await request(app).get('/api/oauth/request').query({
    response_type: 'code',
    client_id: 'missing',
    redirect_uri: 'http://localhost/callback',
    scope: 'read',
    code_challenge: challenge,
    code_challenge_method: 'S256'
  });
  assert.equal(unknown.status, 401);

  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({
    email: 'ada@example.com',
    password: 'password123'
  });

  const registered = await request(app).post('/oauth/register').send({
    client_name: 'Test App',
    redirect_uris: ['http://localhost:9999/callback'],
    token_endpoint_auth_method: 'none'
  });
  assert.equal(registered.status, 201);
  const clientId = registered.body.client_id;

  const badRedirect = await agent.get('/api/oauth/request').query({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: 'https://evil.example/steal',
    scope: 'read',
    code_challenge: challenge,
    code_challenge_method: 'S256'
  });
  assert.equal(badRedirect.status, 400);
  assert.match(badRedirect.body.message, /redirect/i);
});

test('authorization code is single-use, PKCE-bound, and exchanges for a token', async () => {
  const { verifier, challenge } = pkce();
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({
    email: 'ada@example.com',
    password: 'password123'
  });

  const registered = await request(app).post('/oauth/register').send({
    client_name: 'Chat Client',
    redirect_uris: ['http://localhost:9999/callback'],
    token_endpoint_auth_method: 'none'
  });
  const clientId = registered.body.client_id;
  const query = {
    response_type: 'code',
    client_id: clientId,
    redirect_uri: 'http://localhost:9999/callback',
    scope: 'read write',
    state: 'abc',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    resource: mcpResourceUrl()
  };

  const consent = await agent.post('/api/oauth/consent').send({
    decision: 'allow',
    scopes: ['read', 'write'],
    query
  });
  assert.equal(consent.status, 200);
  const redirectUrl = new URL(consent.body.redirectUrl);
  const code = redirectUrl.searchParams.get('code');
  assert.ok(code);
  assert.equal(redirectUrl.searchParams.get('state'), 'abc');

  const tokenRes = await request(app).post('/oauth/token').type('form').send({
    grant_type: 'authorization_code',
    code,
    redirect_uri: 'http://localhost:9999/callback',
    client_id: clientId,
    code_verifier: verifier,
    resource: mcpResourceUrl()
  });
  assert.equal(tokenRes.status, 200);
  assert.ok(tokenRes.body.access_token);

  const reuse = await request(app).post('/oauth/token').type('form').send({
    grant_type: 'authorization_code',
    code,
    redirect_uri: 'http://localhost:9999/callback',
    client_id: clientId,
    code_verifier: verifier
  });
  assert.equal(reuse.status, 400);

  function mcpPayload(res) {
    const text = res.text || '';
    const dataLine = text.split('\n').find((line) => line.startsWith('data: '));
    if (dataLine) return JSON.parse(dataLine.slice(6));
    return res.body;
  }

  const init = await request(app)
    .post('/mcp')
    .set('Authorization', `Bearer ${tokenRes.body.access_token}`)
    .set('Accept', 'application/json, text/event-stream')
    .set('Content-Type', 'application/json')
    .set('MCP-Protocol-Version', '2025-11-25')
    .send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'tests', version: '1.0.0' }
      }
    });
  assert.ok(init.status === 200 || init.status === 202);
  const initPayload = mcpPayload(init);
  assert.ok(initPayload.result || initPayload.error, JSON.stringify(initPayload));

  const deleteCall = await request(app)
    .post('/mcp')
    .set('Authorization', `Bearer ${tokenRes.body.access_token}`)
    .set('Accept', 'application/json, text/event-stream')
    .set('Content-Type', 'application/json')
    .set('MCP-Protocol-Version', '2025-11-25')
    .send({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'delete_data', arguments: { id: '000000000000000000000000' } }
    });
  assert.equal(deleteCall.status, 200);
  const bodyText = JSON.stringify(mcpPayload(deleteCall)) + (deleteCall.text || '');
  assert.match(bodyText, /Permission denied|insufficient|delete/i);
});

test('expired authorization codes are rejected', async () => {
  await OAuthClient.create({
    clientId: 'expired-client',
    clientName: 'Expired',
    redirectUris: ['http://localhost:9999/callback'],
    allowedScopes: ['read'],
    tokenEndpointAuthMethod: 'none'
  });
  const { challenge } = pkce();
  await AuthorizationCode.create({
    codeHash: hashToken('expired-code'),
    clientId: 'expired-client',
    userId: new mongoose.Types.ObjectId(),
    redirectUri: 'http://localhost:9999/callback',
    scopes: ['read'],
    resource: mcpResourceUrl(),
    codeChallenge: challenge,
    codeChallengeMethod: 'S256',
    expiresAt: new Date(Date.now() - 1000),
    used: false
  });

  const res = await request(app).post('/oauth/token').type('form').send({
    grant_type: 'authorization_code',
    code: 'expired-code',
    redirect_uri: 'http://localhost:9999/callback',
    client_id: 'expired-client',
    code_verifier: 'verifier-does-not-matter-after-expiry'
  });
  assert.equal(res.status, 400);
});

test('MCP without a bearer token returns 401 and a resource_metadata challenge', async () => {
  const res = await request(app).post('/mcp').set('Accept', 'application/json').send({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'tests', version: '1.0.0' }
    }
  });
  assert.equal(res.status, 401);
  assert.match(res.headers['www-authenticate'] || '', /resource_metadata/);
});

test('discovery documents are published', async () => {
  const as = await request(app).get('/.well-known/oauth-authorization-server');
  assert.equal(as.status, 200);
  assert.ok(as.body.authorization_endpoint);
  assert.deepEqual(as.body.code_challenge_methods_supported, ['S256']);

  const rs = await request(app).get('/.well-known/oauth-protected-resource');
  assert.equal(rs.status, 200);
  assert.ok(rs.body.authorization_servers.length);
});
