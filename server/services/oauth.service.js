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
import { clientIdFromJwt, verifyClientAssertion } from './client-assertion.js';

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

function normalizeRedirectUri(uri) {
  const value = String(uri || '').trim();
  if (!value) return '';
  try {
    return new URL(value).toString();
  } catch {
    return value;
  }
}

export function exactRedirectMatch(registered, candidate) {
  const wanted = normalizeRedirectUri(candidate);
  return registered.some((uri) => uri === candidate || normalizeRedirectUri(uri) === wanted);
}

export function firstString(value) {
  if (Array.isArray(value)) return firstString(value[0]);
  if (value == null || value === '') return undefined;
  return String(value);
}

export function normalizePkceChallenge(value) {
  return String(value || '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function formDecode(value) {
  try {
    return decodeURIComponent(String(value).replace(/\+/g, ' '));
  } catch {
    return value;
  }
}

/**
 * ChatGPT's client_id is an HTTPS URL (CIMD). HTTP Basic splits on the first
 * colon, so an unencoded `https://chatgpt.com/.../client.json:` becomes
 * username `https` and a 400 invalid_client. RFC 6749 also form-encodes the
 * username, which we decode here.
 */
export function parseBasicAuthorization(header) {
  if (!header?.startsWith('Basic ')) return null;
  const decoded = Buffer.from(header.slice(6).trim(), 'base64').toString('utf8');

  let clientId;
  let clientSecret = '';

  if (/^https?:\/\//i.test(decoded)) {
    const schemeEnd = decoded.indexOf('://') + 3;
    const extraColon = decoded.indexOf(':', schemeEnd);
    if (extraColon < 0) {
      clientId = decoded;
    } else {
      const lastColon = decoded.lastIndexOf(':');
      const secretPart = decoded.slice(lastColon + 1);
      if (secretPart === '' || !secretPart.includes('/')) {
        clientId = decoded.slice(0, lastColon);
        clientSecret = secretPart;
      } else {
        clientId = decoded;
      }
    }
  } else {
    const sep = decoded.indexOf(':');
    if (sep < 0) {
      clientId = decoded;
    } else {
      clientId = decoded.slice(0, sep);
      clientSecret = decoded.slice(sep + 1);
    }
  }

  return { clientId: formDecode(clientId), clientSecret: formDecode(clientSecret) };
}

function stripSlash(value) {
  return String(value || '').trim().replace(/\/$/, '');
}

export function canonicalResource(value) {
  const mcp = stripSlash(mcpResourceUrl());
  const issuer = stripSlash(issuerUrl());
  if (!value) return mcp;
  let normalized = stripSlash(value);
  try {
    normalized = stripSlash(decodeURIComponent(normalized));
  } catch {
    // Keep the raw value when it is not URI-encoded.
  }
  if (normalized === mcp || normalized === issuer || normalized === `${issuer}/mcp`) {
    return mcp;
  }
  return normalized;
}

function sameResource(left, right) {
  if (!left || !right) return false;
  return canonicalResource(left) === canonicalResource(right);
}

export function isAllowedResource(value) {
  if (!value) return true;
  return canonicalResource(value) === stripSlash(mcpResourceUrl());
}

function cimdAuthMethod(metadata) {
  const methods = []
    .concat(metadata.token_endpoint_auth_method || [])
    .concat(metadata.token_endpoint_auth_methods_supported || [])
    .map(String);
  // CIMD URL clients are public. We do not implement private_key_jwt, so PKCE
  // (`none`) is the only method we persist — otherwise ChatGPT would later
  // fail token exchange looking for a client secret we never issued.
  if (methods.includes('none') || methods.length === 0) return 'none';
  return 'none';
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
    signal: AbortSignal.timeout(8000),
    headers: {
      accept: 'application/json',
      'user-agent': 'MCPController/1.0'
    }
  });
  if (!response.ok) return null;
  const metadata = await response.json();
  const redirectUris = metadata.redirect_uris || metadata.redirectUris;
  if (!metadata || !Array.isArray(redirectUris) || redirectUris.length === 0) return null;

  return OAuthClient.findOneAndUpdate(
    { clientId },
    {
      clientId,
      clientName: metadata.client_name || metadata.clientName || 'MCP Client',
      redirectUris,
      allowedScopes: config.scopes,
      tokenEndpointAuthMethod: cimdAuthMethod(metadata),
      clientUri: clientId,
      jwksUri: metadata.jwks_uri || metadata.jwksUri || null,
      grantTypes: metadata.grant_types || ['authorization_code', 'refresh_token']
    },
    { upsert: true, new: true, runValidators: true }
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

  const resourceValue = canonicalResource(resource || mcpResourceUrl());
  if (resource && !isAllowedResource(resource)) {
    throw new AppError(
      400,
      'invalid_target',
      `resource must be the MCP endpoint (${mcpResourceUrl()}).`
    );
  }

  return {
    clientId: firstString(client_id),
    redirectUri: firstString(redirect_uri),
    scopes: parseScopes(scope),
    state: firstString(state),
    codeChallenge: normalizePkceChallenge(firstString(code_challenge)),
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
  const headerCreds = parseBasicAuthorization(req.headers.authorization);
  if (headerCreds?.clientId) {
    return headerCreds;
  }
  return {
    clientId: firstString(req.body?.client_id),
    clientSecret: firstString(req.body?.client_secret)
  };
}

async function authenticateOAuthClient(req, fallbackClientId = null) {
  const { clientId, clientSecret } = extractClientSecret(req);
  const resolvedClientId = clientId || fallbackClientId;
  let client;
  try {
    client = await findClient(resolvedClientId);
  } catch (err) {
    if (fallbackClientId && resolvedClientId !== fallbackClientId) {
      client = await findClient(fallbackClientId);
    } else {
      throw err;
    }
  }
  if (client.tokenEndpointAuthMethod === 'none' || !client.clientSecretHash) {
    return client;
  }
  if (!clientSecret || hashToken(clientSecret) !== client.clientSecretHash) {
    throw new AppError(401, 'invalid_client', 'Invalid client');
  }
  return client;
}

export async function exchangeToken(req) {
  const grantType = firstString(req.body?.grant_type);

  if (grantType === 'refresh_token') {
    await authenticateOAuthClient(req);
    const tokens = await rotateRefreshToken(firstString(req.body?.refresh_token));
    if (!tokens) {
      throw new AppError(400, 'invalid_grant', 'Token expired');
    }
    return tokens;
  }

  if (grantType !== 'authorization_code') {
    throw new AppError(400, 'unsupported_grant_type', 'Unsupported grant_type.');
  }

  const code = firstString(req.body?.code);
  const redirectUri = firstString(req.body?.redirect_uri);
  const codeVerifier = firstString(req.body?.code_verifier) || firstString(req.body?.codeVerifier);
  const resource = firstString(req.body?.resource);
  if (!code || !codeVerifier) {
    throw new AppError(400, 'invalid_request', 'code and code_verifier are required.');
  }

  const record = await AuthorizationCode.findOne({ codeHash: hashToken(code) });
  if (!record) {
    throw new AppError(400, 'invalid_grant', 'Invalid authorization code');
  }
  if (record.used) {
    throw new AppError(400, 'invalid_grant', 'Authorization code has already been used.');
  }
  if (record.expiresAt.getTime() <= Date.now()) {
    throw new AppError(400, 'invalid_grant', 'Authorization code has expired.');
  }

  const client = await authenticateOAuthClient(req, record.clientId);
  if (record.clientId !== client.clientId) {
    throw new AppError(400, 'invalid_grant', 'Authorization code does not belong to this client.');
  }

  const resolvedRedirectUri = redirectUri || record.redirectUri;
  if (record.redirectUri !== resolvedRedirectUri) {
    throw new AppError(400, 'invalid_grant', 'redirect_uri does not match the authorization request.');
  }
  if (resource && !sameResource(resource, record.resource)) {
    throw new AppError(400, 'invalid_target', 'resource does not match the authorization request.');
  }

  const expected = normalizePkceChallenge(pkceChallengeFromVerifier(codeVerifier));
  if (expected !== normalizePkceChallenge(record.codeChallenge)) {
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
