import crypto from 'node:crypto';
import { issuerUrl } from '../config/env.js';

function b64urlToBuffer(value) {
  const padded = String(value).replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (String(value).length % 4)) % 4);
  return Buffer.from(padded, 'base64');
}

export function decodeJwtPayload(token) {
  const parts = String(token || '').split('.');
  if (parts.length < 2) return null;
  try {
    return JSON.parse(b64urlToBuffer(parts[1]).toString('utf8'));
  } catch {
    return null;
  }
}

export function clientIdFromJwt(token) {
  const payload = decodeJwtPayload(token);
  const id = payload?.sub || payload?.iss;
  return id ? String(id) : undefined;
}

function allowedAudiences(tokenEndpoint) {
  const issuer = issuerUrl().replace(/\/$/, '');
  const token = String(tokenEndpoint || `${issuer}/oauth/token`).replace(/\/$/, '');
  return new Set([
    issuer,
    `${issuer}/`,
    token,
    `${token}/`,
    `${issuer}/oauth/token`,
    `${issuer}/oauth/token/`,
    `${issuer}/token`,
    `${issuer}/token/`
  ]);
}

function audienceMatches(aud, tokenEndpoint) {
  const allowed = allowedAudiences(tokenEndpoint);
  const values = Array.isArray(aud) ? aud : [aud];
  return values.some((value) => value && allowed.has(String(value)));
}

async function fetchJwks(jwksUri) {
  const response = await fetch(jwksUri, {
    redirect: 'error',
    signal: AbortSignal.timeout(8000),
    headers: { accept: 'application/json', 'user-agent': 'MCPController/1.0' }
  });
  if (!response.ok) return null;
  return response.json();
}

function publicKeyFromJwk(jwk) {
  return crypto.createPublicKey({ key: jwk, format: 'jwk' });
}

/**
 * Verifies ChatGPT CIMD `private_key_jwt` assertions (RFC 7523) against the
 * client's JWKS. Audience matching is deliberately wide because ChatGPT and
 * some proxies send the issuer, `/oauth/token`, or `/token`.
 */
export async function verifyClientAssertion(token, { clientId, jwksUri, tokenEndpoint }) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3 || !jwksUri) return false;

  let header;
  let payload;
  try {
    header = JSON.parse(b64urlToBuffer(parts[0]).toString('utf8'));
    payload = JSON.parse(b64urlToBuffer(parts[1]).toString('utf8'));
  } catch {
    return false;
  }

  if (payload.iss && payload.iss !== clientId) return false;
  if (payload.sub && payload.sub !== clientId) return false;
  if (!audienceMatches(payload.aud, tokenEndpoint)) return false;
  if (payload.exp && Number(payload.exp) + 60 < Date.now() / 1000) return false;

  const jwks = await fetchJwks(jwksUri);
  const keys = jwks?.keys || [];
  const jwk = keys.find((key) => key.kid && key.kid === header.kid) || keys[0];
  if (!jwk) return false;

  try {
    const key = publicKeyFromJwk(jwk);
    return crypto.verify(
      'RSA-SHA256',
      Buffer.from(`${parts[0]}.${parts[1]}`),
      key,
      b64urlToBuffer(parts[2])
    );
  } catch {
    return false;
  }
}
