import crypto from 'node:crypto';

import { OAuthClient } from '../models/OAuthClient.js';
import { AuthorizationCode } from '../models/AuthorizationCode.js';
import { Connection } from '../models/Connection.js';
import { AccessToken } from '../models/AccessToken.js';

import {
  config,
  issuerUrl,
  mcpResourceUrl
} from '../config/env.js';

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

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

export function parseScopes(scope) {
  if (!scope) {
    return [...config.scopes];
  }

  const requested = String(scope)
    .split(/[\s+,]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter(
      (item) =>
        item !== 'offline_access' &&
        item !== 'openid'
    );

  const unknown = requested.filter(
    (item) => !config.scopes.includes(item)
  );

  if (unknown.length) {
    throw new AppError(
      400,
      'invalid_scope',
      `Unsupported scope: ${unknown.join(', ')}`
    );
  }

  return requested.length
    ? [...new Set(requested)]
    : [...config.scopes];
}

function normalizeRedirectUri(uri) {
  const value = String(uri || '').trim();

  if (!value) {
    return '';
  }

  try {
    return new URL(value).toString();
  } catch {
    return value;
  }
}

export function exactRedirectMatch(registered, candidate) {
  if (!Array.isArray(registered)) {
    return false;
  }

  const wanted = normalizeRedirectUri(candidate);

  return registered.some(
    (uri) =>
      uri === candidate ||
      normalizeRedirectUri(uri) === wanted
  );
}

export function firstString(value) {
  if (Array.isArray(value)) {
    return firstString(value[0]);
  }

  if (value == null || value === '') {
    return undefined;
  }

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
    return decodeURIComponent(
      String(value).replace(/\+/g, ' ')
    );
  } catch {
    return value;
  }
}

function stripSlash(value) {
  return String(value || '')
    .trim()
    .replace(/\/+$/, '');
}

/* -------------------------------------------------------------------------- */
/* HTTP Basic / OAuth client authentication                                   */
/* -------------------------------------------------------------------------- */

/**
 * OAuth Basic authentication normally has:
 *
 * Authorization: Basic base64(client_id:client_secret)
 *
 * ChatGPT/CIMD client IDs can themselves be HTTPS URLs.
 *
 * Example:
 *
 * https://chatgpt.com/.well-known/client.json
 *
 * The URL contains ":" characters, therefore blindly splitting on ":"
 * is incorrect.
 */
export function parseBasicAuthorization(header) {
  if (!header) {
    return null;
  }

  const value = String(header).trim();

  if (!/^Basic\s+/i.test(value)) {
    return null;
  }

  let decoded;

  try {
    decoded = Buffer.from(
      value.replace(/^Basic\s+/i, '').trim(),
      'base64'
    ).toString('utf8');
  } catch {
    return null;
  }

  if (!decoded) {
    return null;
  }

  /*
   * If the decoded value starts with an HTTPS URL, find the separator
   * colon only after the URL authority/path has been considered.
   *
   * For public CIMD clients ChatGPT normally sends no meaningful secret.
   */
  if (/^https?:\/\//i.test(decoded)) {
    try {
      const url = new URL(decoded);

      /*
       * If the whole decoded value is a valid URL, treat it as the
       * client_id. This handles:
       *
       * Basic base64("https://chatgpt.com/client.json")
       */
      return {
        clientId: formDecode(url.toString()),
        clientSecret: ''
      };
    } catch {
      /*
       * It may actually be:
       *
       * https://example.com/client.json:secret
       *
       * Remove the final ":secret" only if the prefix is a valid URL.
       */
      const lastColon = decoded.lastIndexOf(':');

      if (lastColon > 8) {
        const possibleClientId = decoded.slice(0, lastColon);
        const possibleSecret = decoded.slice(lastColon + 1);

        try {
          const parsed = new URL(possibleClientId);

          if (
            parsed.protocol === 'https:' ||
            parsed.protocol === 'http:'
          ) {
            return {
              clientId: formDecode(possibleClientId),
              clientSecret: formDecode(possibleSecret)
            };
          }
        } catch {
          // Continue below.
        }
      }
    }
  }

  const separator = decoded.indexOf(':');

  if (separator === -1) {
    return {
      clientId: formDecode(decoded),
      clientSecret: ''
    };
  }

  return {
    clientId: formDecode(decoded.slice(0, separator)),
    clientSecret: formDecode(decoded.slice(separator + 1))
  };
}

/* -------------------------------------------------------------------------- */
/* Resource validation                                                        */
/* -------------------------------------------------------------------------- */

export function canonicalResource(value) {
  const mcp = stripSlash(mcpResourceUrl());
  const issuer = stripSlash(issuerUrl());

  if (!value) {
    return mcp;
  }

  let normalized = stripSlash(value);

  try {
    normalized = stripSlash(
      decodeURIComponent(normalized)
    );
  } catch {
    // Keep original value.
  }

  if (
    normalized === mcp ||
    normalized === issuer ||
    normalized === `${issuer}/mcp`
  ) {
    return mcp;
  }

  return normalized;
}

function sameResource(left, right) {
  if (!left || !right) {
    return false;
  }

  return (
    canonicalResource(left) ===
    canonicalResource(right)
  );
}

export function isAllowedResource(value) {
  if (!value) {
    return true;
  }

  return (
    canonicalResource(value) ===
    stripSlash(mcpResourceUrl())
  );
}

/* -------------------------------------------------------------------------- */
/* CIMD                                                                       */
/* -------------------------------------------------------------------------- */

function cimdAuthMethod(metadata) {
  const methods = []
    .concat(metadata?.token_endpoint_auth_method || [])
    .concat(metadata?.token_endpoint_auth_methods_supported || [])
    .map(String);

  /*
   * ChatGPT's CIMD client is treated as a public client.
   * PKCE is therefore used instead of a client secret.
   */
  if (methods.includes('none')) {
    return 'none';
  }

  return 'none';
}

async function fetchClientIdMetadataDocument(clientId) {
  if (!/^https:\/\//i.test(clientId)) {
    return null;
  }

  let parsed;

  try {
    parsed = new URL(clientId);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'https:') {
    return null;
  }

  let response;

  try {
    response = await fetch(clientId, {
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
      headers: {
        accept: 'application/json',
        'user-agent': 'MCPController/1.0'
      }
    });
  } catch {
    return null;
  }

  if (!response.ok) {
    return null;
  }

  let metadata;

  try {
    metadata = await response.json();
  } catch {
    return null;
  }

  if (!metadata || typeof metadata !== 'object') {
    return null;
  }

  const redirectUris =
    metadata.redirect_uris ||
    metadata.redirectUris;

  if (
    !Array.isArray(redirectUris) ||
    redirectUris.length === 0
  ) {
    return null;
  }

  /*
   * Validate every redirect URI.
   */
  const normalizedRedirectUris = [];

  for (const redirectUri of redirectUris) {
    if (typeof redirectUri !== 'string') {
      continue;
    }

    const normalized =
      normalizeRedirectUri(redirectUri);

    if (!normalized) {
      continue;
    }

    normalizedRedirectUris.push(normalized);
  }

  if (!normalizedRedirectUris.length) {
    return null;
  }

  return OAuthClient.findOneAndUpdate(
    { clientId },
    {
      clientId,
      clientName:
        metadata.client_name ||
        metadata.clientName ||
        'MCP Client',

      redirectUris: normalizedRedirectUris,

      allowedScopes: [...config.scopes],

      tokenEndpointAuthMethod:
        cimdAuthMethod(metadata),

      clientUri: clientId,

      jwksUri:
        metadata.jwks_uri ||
        metadata.jwksUri ||
        null,

      grantTypes:
        Array.isArray(metadata.grant_types)
          ? metadata.grant_types
          : ['authorization_code', 'refresh_token']
    },
    {
      upsert: true,
      new: true,
      runValidators: true
    }
  );
}

/* -------------------------------------------------------------------------- */
/* OAuth clients                                                              */
/* -------------------------------------------------------------------------- */

export async function findClient(clientId) {
  const normalizedClientId = firstString(clientId);

  if (!normalizedClientId) {
    throw new AppError(
      400,
      'invalid_client',
      'Invalid client'
    );
  }

  let client = await OAuthClient.findOne({
    clientId: normalizedClientId
  });

  if (!client) {
    client =
      await fetchClientIdMetadataDocument(
        normalizedClientId
      );
  }

  if (!client) {
    throw new AppError(
      400,
      'invalid_client',
      'Invalid client'
    );
  }

  return client;
}

export async function registerClient(body = {}) {
  const redirectUris = body.redirect_uris;

  if (
    !Array.isArray(redirectUris) ||
    redirectUris.length === 0
  ) {
    throw new AppError(
      400,
      'invalid_client_metadata',
      'redirect_uris is required'
    );
  }

  const normalizedRedirectUris =
    redirectUris
      .filter(
        (uri) =>
          typeof uri === 'string' &&
          uri.trim()
      )
      .map(normalizeRedirectUri);

  if (!normalizedRedirectUris.length) {
    throw new AppError(
      400,
      'invalid_client_metadata',
      'At least one valid redirect URI is required'
    );
  }

  const clientId = randomToken();

  const authMethod =
    body.token_endpoint_auth_method ||
    'none';

  const supportedMethods = [
    'none',
    'client_secret_post',
    'client_secret_basic'
  ];

  if (!supportedMethods.includes(authMethod)) {
    throw new AppError(
      400,
      'invalid_client_metadata',
      'Unsupported token endpoint authentication method'
    );
  }

  let clientSecret;
  let clientSecretHash = null;

  if (authMethod !== 'none') {
    clientSecret = randomToken();
    clientSecretHash =
      hashToken(clientSecret);
  }

  const client = await OAuthClient.create({
    clientId,

    clientName:
      body.client_name || 'MCP Client',

    clientSecretHash,

    redirectUris: normalizedRedirectUris,

    allowedScopes: [...config.scopes],

    tokenEndpointAuthMethod: authMethod,

    grantTypes: [
      'authorization_code',
      'refresh_token'
    ]
  });

  return {
    client_id: client.clientId,

    client_secret: clientSecret,

    client_name: client.clientName,

    redirect_uris: client.redirectUris,

    grant_types: client.grantTypes,

    token_endpoint_auth_method:
      client.tokenEndpointAuthMethod,

    client_id_issued_at:
      Math.floor(Date.now() / 1000)
  };
}

/* -------------------------------------------------------------------------- */
/* Authorization request                                                     */
/* -------------------------------------------------------------------------- */

export function validateAuthorizeParams(query = {}) {
  const responseType =
    firstString(query.response_type);

  const clientId =
    firstString(query.client_id);

  const redirectUri =
    firstString(query.redirect_uri);

  const scope =
    firstString(query.scope);

  const state =
    firstString(query.state);

  const codeChallenge =
    firstString(query.code_challenge);

  const codeChallengeMethod =
    firstString(query.code_challenge_method);

  const resource =
    firstString(query.resource);

  if (responseType !== 'code') {
    throw new AppError(
      400,
      'unsupported_response_type',
      'response_type must be "code".'
    );
  }

  if (!clientId) {
    throw new AppError(
      400,
      'invalid_client',
      'Invalid client'
    );
  }

  if (!redirectUri) {
    throw new AppError(
      400,
      'invalid_request',
      'redirect_uri is required.'
    );
  }

  /*
   * OAuth 2.1 / MCP authorization flow requires PKCE.
   */
  if (!codeChallenge) {
    throw new AppError(
      400,
      'invalid_request',
      'PKCE code_challenge is required.'
    );
  }

  if (
    codeChallengeMethod &&
    codeChallengeMethod !== 'S256'
  ) {
    throw new AppError(
      400,
      'invalid_request',
      'code_challenge_method must be S256.'
    );
  }

  if (
    !/^[A-Za-z0-9._~-]{43,128}$/.test(
      normalizePkceChallenge(codeChallenge)
    )
  ) {
    throw new AppError(
      400,
      'invalid_request',
      'Invalid PKCE code_challenge.'
    );
  }

  if (
    resource &&
    !isAllowedResource(resource)
  ) {
    throw new AppError(
      400,
      'invalid_target',
      `resource must be the MCP endpoint (${mcpResourceUrl()}).`
    );
  }

  return {
    clientId,

    redirectUri,

    scopes: parseScopes(scope),

    state,

    codeChallenge:
      normalizePkceChallenge(
        codeChallenge
      ),

    codeChallengeMethod: 'S256',

    resource:
      canonicalResource(
        resource ||
          mcpResourceUrl()
      )
  };
}

/* -------------------------------------------------------------------------- */
/* Authorization preview                                                     */
/* -------------------------------------------------------------------------- */

export async function previewAuthorization(
  query
) {
  const params =
    validateAuthorizeParams(query);

  const client =
    await findClient(params.clientId);

  if (
    !exactRedirectMatch(
      client.redirectUris,
      params.redirectUri
    )
  ) {
    throw new AppError(
      400,
      'invalid_redirect_uri',
      'Invalid redirect URI'
    );
  }

  const offered =
    config.scopes.filter((scope) =>
      client.allowedScopes.includes(scope)
    );

  return {
    client: {
      clientId: client.clientId,
      clientName: client.clientName
    },

    scopes: offered.map((value) => ({
      value,

      label:
        SCOPE_LABELS[value] ||
        value,

      requested:
        params.scopes.includes(value)
    })),

    redirectUri:
      params.redirectUri,

    state:
      params.state,

    resource:
      params.resource
  };
}

/* -------------------------------------------------------------------------- */
/* Authorization code                                                        */
/* -------------------------------------------------------------------------- */

export async function createAuthorizationCode({
  user,
  query,
  grantedScopes
}) {
  if (!user?._id) {
    throw new AppError(
      401,
      'invalid_request',
      'Authenticated user is required.'
    );
  }

  const params =
    validateAuthorizeParams(query);

  const client =
    await findClient(params.clientId);

  if (
    !exactRedirectMatch(
      client.redirectUris,
      params.redirectUri
    )
  ) {
    throw new AppError(
      400,
      'invalid_redirect_uri',
      'Invalid redirect URI'
    );
  }

  const requestedScopes =
    Array.isArray(grantedScopes)
      ? grantedScopes
      : params.scopes;

  const scopes =
    requestedScopes.filter(
      (scope) =>
        config.scopes.includes(scope) &&
        client.allowedScopes.includes(scope)
    );

  if (!scopes.length) {
    throw new AppError(
      400,
      'invalid_scope',
      'Select at least one permission.'
    );
  }

  const code = randomToken();

  await AuthorizationCode.create({
    codeHash:
      hashToken(code),

    clientId:
      client.clientId,

    userId:
      user._id,

    redirectUri:
      params.redirectUri,

    scopes,

    resource:
      params.resource,

    codeChallenge:
      params.codeChallenge,

    codeChallengeMethod:
      'S256',

    expiresAt:
      new Date(
        Date.now() +
          config.authCodeTtlSeconds * 1000
      ),

    used: false
  });

  await Connection.findOneAndUpdate(
    {
      userId: user._id,
      clientId: client.clientId
    },
    {
      userId: user._id,
      clientId: client.clientId,
      clientName: client.clientName,
      scopes,
      connectedAt: new Date()
    },
    {
      upsert: true,
      new: true
    }
  );

  const redirect =
    new URL(params.redirectUri);

  redirect.searchParams.set(
    'code',
    code
  );

  if (params.state) {
    redirect.searchParams.set(
      'state',
      params.state
    );
  }

  return {
    redirectUrl:
      redirect.toString(),

    code
  };
}

/* -------------------------------------------------------------------------- */
/* Deny authorization                                                        */
/* -------------------------------------------------------------------------- */

export async function denyAuthorization(
  query
) {
  const params =
    validateAuthorizeParams(query);

  const client =
    await findClient(params.clientId);

  if (
    !exactRedirectMatch(
      client.redirectUris,
      params.redirectUri
    )
  ) {
    throw new AppError(
      400,
      'invalid_redirect_uri',
      'Invalid redirect URI'
    );
  }

  const redirect =
    new URL(params.redirectUri);

  redirect.searchParams.set(
    'error',
    'access_denied'
  );

  if (params.state) {
    redirect.searchParams.set(
      'state',
      params.state
    );
  }

  return {
    redirectUrl:
      redirect.toString()
  };
}

/* -------------------------------------------------------------------------- */
/* OAuth client authentication                                                */
/* -------------------------------------------------------------------------- */

function extractClientCredentials(req) {
  const basic =
    parseBasicAuthorization(
      req.headers.authorization
    );

  if (basic?.clientId) {
    return basic;
  }

  return {
    clientId:
      firstString(
        req.body?.client_id
      ),

    clientSecret:
      firstString(
        req.body?.client_secret
      ) || ''
  };
}

async function authenticateOAuthClient(
  req,
  expectedClientId = null
) {
  const {
    clientId,
    clientSecret
  } = extractClientCredentials(req);

  /*
   * If the request contains a client_id, use it.
   * Otherwise the authorization code's client ID may be used.
   */
  const resolvedClientId =
    clientId ||
    expectedClientId;

  if (!resolvedClientId) {
    throw new AppError(
      401,
      'invalid_client',
      'Client authentication failed.'
    );
  }

  const client =
    await findClient(
      resolvedClientId
    );

  /*
   * Never allow an explicitly supplied client_id
   * to silently become another client.
   */
  if (
    expectedClientId &&
    client.clientId !== expectedClientId
  ) {
    throw new AppError(
      400,
      'invalid_grant',
      'Authorization code does not belong to this client.'
    );
  }

  if (
    client.tokenEndpointAuthMethod ===
      'none' ||
    !client.clientSecretHash
  ) {
    return client;
  }

  if (
    !clientSecret ||
    hashToken(clientSecret) !==
      client.clientSecretHash
  ) {
    throw new AppError(
      401,
      'invalid_client',
      'Invalid client'
    );
  }

  return client;
}

/* -------------------------------------------------------------------------- */
/* Token exchange                                                             */
/* -------------------------------------------------------------------------- */

export async function exchangeToken(req) {
  const grantType =
    firstString(
      req.body?.grant_type
    );

  /* ------------------------------ refresh -------------------------------- */

  if (grantType === 'refresh_token') {
    const refreshToken =
      firstString(
        req.body?.refresh_token
      );

    if (!refreshToken) {
      throw new AppError(
        400,
        'invalid_request',
        'refresh_token is required.'
      );
    }

    const client =
      await authenticateOAuthClient(req);

    const tokens =
      await rotateRefreshToken(
        refreshToken
      );

    if (!tokens) {
      throw new AppError(
        400,
        'invalid_grant',
        'Invalid or expired refresh token.'
      );
    }

    /*
     * IMPORTANT:
     * Your rotateRefreshToken() should ideally return clientId.
     *
     * If it does not, the token service should be updated so a refresh
     * token can never be used by another OAuth client.
     */
    if (
      tokens.clientId &&
      tokens.clientId !== client.clientId
    ) {
      throw new AppError(
        400,
        'invalid_grant',
        'Refresh token does not belong to this client.'
      );
    }

    return tokens;
  }

  /* ------------------------ authorization code --------------------------- */

  if (grantType !== 'authorization_code') {
    throw new AppError(
      400,
      'unsupported_grant_type',
      'Unsupported grant_type.'
    );
  }

  const code =
    firstString(
      req.body?.code
    );

  const redirectUri =
    firstString(
      req.body?.redirect_uri
    );

  const codeVerifier =
    firstString(
      req.body?.code_verifier
    ) ||
    firstString(
      req.body?.codeVerifier
    );

  const resource =
    firstString(
      req.body?.resource
    );

  if (!code) {
    throw new AppError(
      400,
      'invalid_request',
      'code is required.'
    );
  }

  if (!codeVerifier) {
    throw new AppError(
      400,
      'invalid_request',
      'code_verifier is required.'
    );
  }

  const record =
    await AuthorizationCode.findOne({
      codeHash:
        hashToken(code)
    });

  if (!record) {
    throw new AppError(
      400,
      'invalid_grant',
      'Invalid authorization code'
    );
  }

  if (record.used) {
    throw new AppError(
      400,
      'invalid_grant',
      'Authorization code has already been used.'
    );
  }

  if (
    record.expiresAt.getTime() <=
    Date.now()
  ) {
    throw new AppError(
      400,
      'invalid_grant',
      'Authorization code has expired.'
    );
  }

  const client =
    await authenticateOAuthClient(
      req,
      record.clientId
    );

  /*
   * redirect_uri is REQUIRED if it was included in the
   * authorization request. We stored it, therefore require
   * an exact match here.
   */
  if (
    !redirectUri ||
    redirectUri !== record.redirectUri
  ) {
    throw new AppError(
      400,
      'invalid_grant',
      'redirect_uri does not match the authorization request.'
    );
  }

  /*
   * Verify it is still registered for the same client.
   */
  if (
    !exactRedirectMatch(
      client.redirectUris,
      redirectUri
    )
  ) {
    throw new AppError(
      400,
      'invalid_grant',
      'redirect_uri is not registered for this client.'
    );
  }

  if (
    resource &&
    !sameResource(
      resource,
      record.resource
    )
  ) {
    throw new AppError(
      400,
      'invalid_target',
      'resource does not match the authorization request.'
    );
  }

  const expected =
    normalizePkceChallenge(
      pkceChallengeFromVerifier(
        codeVerifier
      )
    );

  const actual =
    normalizePkceChallenge(
      record.codeChallenge
    );

  if (expected !== actual) {
    throw new AppError(
      400,
      'invalid_grant',
      'PKCE verification failed.'
    );
  }

  /*
   * Authorization codes are single-use.
   */
  record.used = true;
  await record.save();

  return issueTokens({
    userId:
      record.userId,

    clientId:
      record.clientId,

    scopes:
      record.scopes,

    resource:
      record.resource
  });
}

/* -------------------------------------------------------------------------- */
/* Revocation                                                                */
/* -------------------------------------------------------------------------- */

export async function revokeToken(
  req
) {
  const token =
    firstString(
      req.body?.token
    ) ||
    firstString(
      req.body?.access_token
    ) ||
    firstString(
      req.body?.refresh_token
    );

  if (!token) {
    throw new AppError(
      400,
      'invalid_request',
      'token is required'
    );
  }

  const client =
    await authenticateOAuthClient(req);

  const tokenHash =
    hashToken(token);

  const record =
    await AccessToken.findOne({
      $or: [
        { tokenHash },
        { refreshTokenHash: tokenHash }
      ]
    });

  /*
   * OAuth revocation should not reveal whether a token exists.
   * But if a record exists for another client, don't revoke it.
   */
  if (!record) {
    return {
      revoked: false
    };
  }

  if (
    record.clientId !==
    client.clientId
  ) {
    return {
      revoked: false
    };
  }

  record.revoked = true;
  await record.save();

  await Connection.deleteOne({
    userId:
      record.userId,

    clientId:
      record.clientId
  });

  return {
    revoked: true
  };
}

/* -------------------------------------------------------------------------- */
/* Metadata                                                                   */
/* -------------------------------------------------------------------------- */

export function authorizationServerMetadata() {
  const issuer =
    issuerUrl();

  return {
    issuer,

    authorization_endpoint:
      `${config.appUrl}/oauth/authorize`,

    token_endpoint:
      `${issuer}/oauth/token`,

    registration_endpoint:
      `${issuer}/oauth/register`,

    revocation_endpoint:
      `${issuer}/oauth/revoke`,

    scopes_supported: [
      ...config.scopes,
      'offline_access'
    ],

    response_types_supported: [
      'code'
    ],

    grant_types_supported: [
      'authorization_code',
      'refresh_token'
    ],

    token_endpoint_auth_methods_supported: [
      'none',
      'client_secret_post',
      'client_secret_basic'
    ],

    code_challenge_methods_supported: [
      'S256'
    ],

    revocation_endpoint_auth_methods_supported: [
      'none',
      'client_secret_post',
      'client_secret_basic'
    ],

    client_id_metadata_document_supported:
      true
  };
}

export function protectedResourceMetadata() {
  const resource =
    mcpResourceUrl();

  const issuer =
    issuerUrl();

  return {
    resource,

    authorization_servers: [
      issuer
    ],

    bearer_methods_supported: [
      'header'
    ],

    scopes_supported:
      [...config.scopes],

    resource_documentation:
      `${config.appUrl}/`
  };
}

/* -------------------------------------------------------------------------- */
/* OAuth error redirect                                                       */
/* -------------------------------------------------------------------------- */

export function oauthErrorRedirect(
  redirectUri,
  error,
  state
) {
  try {
    const url =
      new URL(redirectUri);

    url.searchParams.set(
      'error',
      error
    );

    if (state) {
      url.searchParams.set(
        'state',
        state
      );
    }

    return url.toString();
  } catch {
    return null;
  }
}

export function generateState() {
  return crypto
    .randomBytes(16)
    .toString('hex');
}