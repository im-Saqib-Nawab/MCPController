import crypto from 'node:crypto';
import { AccessToken } from '../models/AccessToken.js';
import { config } from '../config/env.js';

export function hashToken(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function randomToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export function pkceChallengeFromVerifier(verifier) {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

export async function issueTokens({ userId, clientId, scopes, resource }) {
  const accessToken = randomToken();
  const refreshToken = randomToken();
  const now = Date.now();

  await AccessToken.create({
    tokenHash: hashToken(accessToken),
    refreshTokenHash: hashToken(refreshToken),
    userId,
    clientId,
    scopes,
    resource,
    expiresAt: new Date(now + config.accessTokenTtlSeconds * 1000),
    refreshExpiresAt: new Date(now + config.refreshTokenTtlSeconds * 1000)
  });

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: 'Bearer',
    expires_in: config.accessTokenTtlSeconds,
    scope: scopes.join(' '),
    resource
  };
}

/**
 * MCP requests send Authorization: Bearer <access_token>.
 * We hash the presented token and look it up — the database never stores the raw token.
 */
export async function resolveAccessToken(rawToken) {
  if (!rawToken) return null;
  const record = await AccessToken.findOne({
    tokenHash: hashToken(rawToken),
    revoked: false
  });
  if (!record) return null;
  if (record.expiresAt.getTime() <= Date.now()) return null;
  return record;
}

export async function rotateRefreshToken(rawRefreshToken) {
  const record = await AccessToken.findOne({
    refreshTokenHash: hashToken(rawRefreshToken),
    revoked: false
  });
  if (!record) return null;
  if (!record.refreshExpiresAt || record.refreshExpiresAt.getTime() <= Date.now()) {
    return null;
  }

  record.revoked = true;
  await record.save();

  return issueTokens({
    userId: record.userId,
    clientId: record.clientId,
    scopes: record.scopes,
    resource: record.resource
  });
}
