import crypto from 'node:crypto';
import { OAuthClient } from '../models/OAuthClient.js';
import { AuthorizationCode } from '../models/AuthorizationCode.js';
import { Connection } from '../models/Connection.js';
import { AccessToken } from '../models/AccessToken.js';
import { config, issuerUrl, mcpResourceUrl } from '../config/env.js';
import { AppError } from '../middleware/error.middleware.js';
import {
  hashToken,
  issueTokens,
  pkceChallengeFromVerifier,
  randomToken,
  rotateRefreshToken
} from './token.service.js';

export const SCOPE_LABELS = {
  'doctor:read': 'Read Doctors',
  'doctor:write': 'Add & Update Doctors',
  'doctor:delete': 'Delete Doctors'
};

export function parseScopes(scope) {
  if (!scope) return [...config.scopes];
  const requested = String(scope)
    .split(/[\s+,]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => item !== 'offline_access' && item !== 'openid');
  const unknown = requested.filter((item) => !config.scopes.includes(item));
  if (unknown.length) {
    throw new AppError(400, 'invalid_scope', `Unsupported scope: ${unknown.join(', ')}`);
  }
  return requested.length ? requested : [...config.scopes];
}

export function exactRedirectMatch(registered, candidate) {
  return registered.some((uri) => uri === candidate);
}

async function fetchClientIdMetadataDocument(clientId) {
  // Client ID Metadata Documents (CIMD): the client_id is an HTTPS URL that
  // returns JSON describing the app. ChatGPT can use this instead of DCR.
  if (!/^https:\/\//i.test(clientId)) return null;
  let parsed;
  try {
    parsed = new URL(clientId);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;

  const response = await fetch(clientId, {
    redirect: 'error',
    signal: AbortSignal.timeout(5000),
    headers: { accept: 'application/json' }
  });
  if (!response.ok) return null;
  const metadata = await response.json();
  if (!metadata || !Array.isArray(metadata.redirect_uris)) return null;

  return OAuthClient.findOneAndUpdate(
    { clientId },
    {
      clientId,
      clientName: metadata.client_name || metadata.clientName || 'MCP Client',
      redirectUris: metadata.redirect_uris,
      allowedScopes: config.scopes,
      tokenEndpointAuthMethod: metadata.token_endpoint_auth_method || 'none',
      clientUri: clientId,
      grantTypes: metadata.grant_types || ['authorization_code', 'refresh_token']
    },
    { upsert: true, new: true }
  );
}

export async function findClient(clientId) {
  if (!clientId) {
    throw new AppError(400, 'invalid_client', 'Invalid client');
  }
  let client = await OAuthClient.findOne({ clientId });
  if (!client) {
    client = await fetchClientIdMetadataDocument(clientId);
  }
  if (!client) {
    throw new AppError(400, 'invalid_client', 'Invalid client');
  }
  return client;
}

export async function registerClient(body) {
  const redirectUris = body.redirect_uris;
  if (!Array.isArray(redirectUris) || redirectUris.length === 0) {
    throw new AppError(400, 'invalid_client_metadata', 'redirect_uris is required');
  }

  const clientId = randomToken();
  const authMethod = body.token_endpoint_auth_method || 'none';
  let clientSecret;
  let clientSecretHash = null;
  if (authMethod !== 'none') {
    clientSecret = randomToken();
    clientSecretHash = hashToken(clientSecret);
  }

  const client = await OAuthClient.create({
    clientId,
    clientName: body.client_name || 'MCP Client',
    clientSecretHash,
    redirectUris,
    allowedScopes: config.scopes,
    tokenEndpointAuthMethod: authMethod,
    grantTypes: ['authorization_code', 'refresh_token']
  });

  return {
    client_id: client.clientId,
    client_secret: clientSecret,
    client_name: client.clientName,
    redirect_uris: client.redirectUris,
    grant_types: client.grantTypes,
    token_endpoint_auth_method: client.tokenEndpointAuthMethod,
    client_id_issued_at: Math.floor(Date.now() / 1000)
  };
}

export function validateAuthorizeParams(query) {
  const {
    response_type,
    client_id,
    redirect_uri,
    scope,
    state,
    code_challenge,
    code_challenge_method,
    resource
  } = query;

  if (response_type !== 'code') {
    throw new AppError(400, 'unsupported_response_type', 'response_type must be "code".');
  }
  if (!client_id) {
    throw new AppError(400, 'invalid_client', 'Invalid client');
  }
  if (!redirect_uri) {
    throw new AppError(400, 'invalid_redirect_uri', 'Invalid redirect URI');
  }
  // OAuth 2.1 requires PKCE. S256 is the only method we accept.
  if (!code_challenge) {
    throw new AppError(400, 'invalid_request', 'PKCE code_challenge is required.');
  }
  if (code_challenge_method && code_challenge_method !== 'S256') {
    throw new AppError(400, 'invalid_request', 'code_challenge_method must be S256.');
  }

  const resourceValue = resource || mcpResourceUrl();
  if (resource && resource !== mcpResourceUrl()) {
    throw new AppError(
      400,
      'invalid_target',
      `resource must be the MCP endpoint (${mcpResourceUrl()}).`
    );
  }

  return {
    clientId: client_id,
    redirectUri: redirect_uri,
    scopes: parseScopes(scope),
    state,
    codeChallenge: code_challenge,
    codeChallengeMethod: 'S256',
    resource: resourceValue
  };
}

export async function previewAuthorization(query) {
  const params = validateAuthorizeParams(query);
  const client = await findClient(params.clientId);
  if (!exactRedirectMatch(client.redirectUris, params.redirectUri)) {
    // Never bounce the user to an unregistered URI — that is an open redirect.
    throw new AppError(400, 'invalid_redirect_uri', 'Invalid redirect URI');
  }
  // Offer every scope this client may receive. ChatGPT often requests only
  // doctor:read (from a stale 401 challenge); the Admin still needs to see
  // write/delete and can grant them.
  const offered = config.scopes.filter((scope) => client.allowedScopes.includes(scope));
  return {
    client: {
      clientId: client.clientId,
      clientName: client.clientName
    },
    scopes: offered.map((value) => ({
      value,
      label: SCOPE_LABELS[value] || value,
      requested: params.scopes.includes(value)
    })),
    redirectUri: params.redirectUri,
    state: params.state,
    resource: params.resource
  };
}

export async function createAuthorizationCode({ user, query, grantedScopes }) {
  const params = validateAuthorizeParams(query);
  const client = await findClient(params.clientId);
  if (!exactRedirectMatch(client.redirectUris, params.redirectUri)) {
    throw new AppError(400, 'invalid_redirect_uri', 'Invalid redirect URI');
  }

  const scopes = (grantedScopes || params.scopes).filter((scope) =>
    client.allowedScopes.includes(scope)
  );
  if (!scopes.length) {
    throw new AppError(400, 'invalid_scope', 'Select at least one permission.');
  }

  const code = randomToken();
  await AuthorizationCode.create({
    codeHash: hashToken(code),
    clientId: client.clientId,
    userId: user._id,
    redirectUri: params.redirectUri,
    scopes,
    resource: params.resource,
    codeChallenge: params.codeChallenge,
    codeChallengeMethod: 'S256',
    expiresAt: new Date(Date.now() + config.authCodeTtlSeconds * 1000),
    used: false
  });

  await Connection.findOneAndUpdate(
    { userId: user._id, clientId: client.clientId },
    {
      userId: user._id,
      clientId: client.clientId,
      clientName: client.clientName,
      scopes,
      connectedAt: new Date()
    },
    { upsert: true }
  );

  const redirect = new URL(params.redirectUri);
  redirect.searchParams.set('code', code);
  if (params.state) redirect.searchParams.set('state', params.state);
  return { redirectUrl: redirect.toString(), code };
}

export async function denyAuthorization(query) {
  const params = validateAuthorizeParams(query);
  const client = await findClient(params.clientId);
  if (!exactRedirectMatch(client.redirectUris, params.redirectUri)) {
    throw new AppError(400, 'invalid_redirect_uri', 'Invalid redirect URI');
  }
  const redirect = new URL(params.redirectUri);
  redirect.searchParams.set('error', 'access_denied');
  if (params.state) redirect.searchParams.set('state', params.state);
  return { redirectUrl: redirect.toString() };
}

export async function revokeToken(token) {
  if (!token) {
    throw new AppError(400, 'invalid_request', 'token is required');
  }

  const record = await AccessToken.findOne({
    $or: [{ tokenHash: hashToken(token) }, { refreshTokenHash: hashToken(token) }]
  });

  if (!record) {
    return { revoked: false };
  }

  record.revoked = true;
  await record.save();
  await Connection.deleteOne({ userId: record.userId, clientId: record.clientId });

  return { revoked: true };
}

function extractClientSecret(req) {
  const header = req.headers.authorization;
  if (header?.startsWith('Basic ')) {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const sep = decoded.indexOf(':');
    return {
      clientId: decoded.slice(0, sep),
      clientSecret: decoded.slice(sep + 1)
    };
  }
  return {
    clientId: req.body.client_id,
    clientSecret: req.body.client_secret
  };
}

async function authenticateOAuthClient(req) {
  const { clientId, clientSecret } = extractClientSecret(req);
  const client = await findClient(clientId);
  if (client.tokenEndpointAuthMethod === 'none') {
    return client;
  }
  if (!clientSecret || hashToken(clientSecret) !== client.clientSecretHash) {
    throw new AppError(401, 'invalid_client', 'Invalid client');
  }
  return client;
}

export async function exchangeToken(req) {
  const grantType = req.body.grant_type;
  const client = await authenticateOAuthClient(req);

  if (grantType === 'refresh_token') {
    const tokens = await rotateRefreshToken(req.body.refresh_token);
    if (!tokens) {
      throw new AppError(400, 'invalid_grant', 'Token expired');
    }
    return tokens;
  }

  if (grantType !== 'authorization_code') {
    throw new AppError(400, 'unsupported_grant_type', 'Unsupported grant_type.');
  }

  const { code, redirect_uri, code_verifier, resource } = req.body;
  if (!code || !redirect_uri || !code_verifier) {
    throw new AppError(400, 'invalid_request', 'code, redirect_uri, and code_verifier are required.');
  }

  const record = await AuthorizationCode.findOne({ codeHash: hashToken(code) });
  if (!record) {
    throw new AppError(400, 'invalid_authorization_code', 'Invalid authorization code');
  }
  if (record.used) {
    throw new AppError(400, 'invalid_authorization_code', 'Authorization code has already been used.');
  }
  if (record.expiresAt.getTime() <= Date.now()) {
    throw new AppError(400, 'invalid_authorization_code', 'Authorization code has expired.');
  }
  if (record.clientId !== client.clientId) {
    throw new AppError(400, 'invalid_grant', 'Authorization code does not belong to this client.');
  }
  if (record.redirectUri !== redirect_uri) {
    throw new AppError(400, 'invalid_grant', 'redirect_uri does not match the authorization request.');
  }
  if (resource && resource !== record.resource) {
    throw new AppError(400, 'invalid_target', 'resource does not match the authorization request.');
  }

  const expected = pkceChallengeFromVerifier(code_verifier);
  if (expected !== record.codeChallenge) {
    throw new AppError(400, 'invalid_grant', 'PKCE verification failed.');
  }

  record.used = true;
  await record.save();

  return issueTokens({
    userId: record.userId,
    clientId: record.clientId,
    scopes: record.scopes,
    resource: record.resource
  });
}

export function authorizationServerMetadata() {
  const issuer = issuerUrl();
  return {
    issuer,
    authorization_endpoint: `${config.appUrl}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    registration_endpoint: `${issuer}/oauth/register`,
    revocation_endpoint: `${issuer}/oauth/revoke`,
    scopes_supported: [...config.scopes, 'offline_access'],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
    code_challenge_methods_supported: ['S256'],
    revocation_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
    client_id_metadata_document_supported: true
  };
}

export function protectedResourceMetadata() {
  const resource = mcpResourceUrl();
  const issuer = issuerUrl();
  return {
    resource,
    authorization_servers: [issuer],
    bearer_methods_supported: ['header'],
    scopes_supported: config.scopes,
    resource_documentation: `${config.appUrl}/`
  };
}

export function oauthErrorRedirect(redirectUri, error, state) {
  try {
    const url = new URL(redirectUri);
    url.searchParams.set('error', error);
    if (state) url.searchParams.set('state', state);
    return url.toString();
  } catch {
    return null;
  }
}

export function generateState() {
  return crypto.randomBytes(16).toString('hex');
}
