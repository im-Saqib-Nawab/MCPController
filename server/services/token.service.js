import crypto from 'node:crypto';
import { AccessToken } from '../models/AccessToken.js';
import { config } from '../config/env.js';

/* -------------------------------------------------------------------------- */
/* Crypto & Token Helpers                                                     */
/* -------------------------------------------------------------------------- */

export function hashToken(value) {
  return crypto
    .createHash('sha256')
    .update(String(value), 'utf8')
    .digest('hex');
}

export function randomToken() {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * RFC 7636 S256 PKCE Challenge generation:
 * BASE64URL(SHA256(code_verifier))
 */
export function pkceChallengeFromVerifier(verifier) {
  return crypto
    .createHash('sha256')
    .update(String(verifier), 'utf8')
    .digest('base64url');
}

/* -------------------------------------------------------------------------- */
/* Access + Refresh Token Issuance                                            */
/* -------------------------------------------------------------------------- */

export async function issueTokens({ userId, clientId, scopes, resource }) {
  if (!userId) {
    throw new Error('userId is required to issue tokens.');
  }

  if (!clientId) {
    throw new Error('clientId is required to issue tokens.');
  }

  if (!Array.isArray(scopes) || scopes.length === 0) {
    throw new Error('At least one scope is required to issue tokens.');
  }

  if (!resource) {
    throw new Error('resource is required to issue tokens.');
  }

  const accessToken = randomToken();
  const refreshToken = randomToken();
  const now = Date.now();

  const accessExpiresAt = new Date(now + config.accessTokenTtlSeconds * 1000);
  const refreshExpiresAt = new Date(now + config.refreshTokenTtlSeconds * 1000);

  // Deduplicate scope entries
  const uniqueScopes = [...new Set(scopes)];

  await AccessToken.create({
    tokenHash: hashToken(accessToken),
    refreshTokenHash: hashToken(refreshToken),
    userId,
    clientId,
    scopes: uniqueScopes,
    resource,
    expiresAt: accessExpiresAt,
    refreshExpiresAt,
    revoked: false
  });

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: 'Bearer',
    expires_in: config.accessTokenTtlSeconds,
    scope: uniqueScopes.join(' '),
    resource
  };
}

/* -------------------------------------------------------------------------- */
/* Access Token Resolution                                                    */
/* -------------------------------------------------------------------------- */

/**
 * MCP requests send: Authorization: Bearer <access_token>
 * Only the SHA-256 hash is stored in MongoDB.
 */
export async function resolveAccessToken(rawToken) {
  if (typeof rawToken !== 'string' || !rawToken.trim()) {
    return null;
  }

  const token = rawToken.trim();

  const record = await AccessToken.findOne({
    tokenHash: hashToken(token),
    revoked: false
  });

  if (!record) {
    return null;
  }

  if (!record.expiresAt || record.expiresAt.getTime() <= Date.now()) {
    return null;
  }

  // Ensure record structure is valid for MCP context
  if (!record.resource) {
    return null;
  }

  return record;
}

/* -------------------------------------------------------------------------- */
/* Refresh Token Rotation                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Single-use Refresh Tokens:
 * Issuance happens BEFORE revoking the previous token record to guarantee 
 * database errors do not leave the client stranded without active tokens.
 */
export async function rotateRefreshToken(rawRefreshToken) {
  if (typeof rawRefreshToken !== 'string' || !rawRefreshToken.trim()) {
    return null;
  }

  const refreshToken = rawRefreshToken.trim();

  const record = await AccessToken.findOne({
    refreshTokenHash: hashToken(refreshToken),
    revoked: false
  });

  if (!record) {
    return null;
  }

  if (!record.refreshExpiresAt || record.refreshExpiresAt.getTime() <= Date.now()) {
    return null;
  }

  // Record integrity validation
  if (!record.clientId || !record.userId || !record.resource) {
    return null;
  }

  if (!Array.isArray(record.scopes) || record.scopes.length === 0) {
    return null;
  }

  // Issue new token set prior to invalidating existing record
  const tokens = await issueTokens({
    userId: record.userId,
    clientId: record.clientId,
    scopes: record.scopes,
    resource: record.resource
  });

  // Mark previous refresh token as consumed
  record.revoked = true;
  await record.save();

  /*
   * Attach clientId for internal validation in oauth.service.js 
   * to guard against cross-client token exchange attacks.
   */
  return {
    ...tokens,
    clientId: record.clientId
  };
}

export async function revokeUserTokens(userId) {
  if (!userId) return 0;
  const result = await AccessToken.updateMany({ userId, revoked: false }, { revoked: true });
  return result.modifiedCount || 0;
}