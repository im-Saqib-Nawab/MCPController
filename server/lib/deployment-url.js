import { URL } from 'node:url';

import { config } from '../config/env.js';
import { assertSafeExternalHttpsUrl } from './url-security.js';

function stripSlash(value) {
  return String(value || '')
    .trim()
    .replace(/\/+$/, '');
}

function hostnameMatchesAllowlist(hostname) {
  const allowlist = config.canaryUrlAllowlist;
  const host = String(hostname || '').toLowerCase();

  for (const pattern of allowlist) {
    const normalized = String(pattern || '')
      .trim()
      .toLowerCase();

    if (!normalized) {
      continue;
    }

    if (normalized.startsWith('*.')) {
      const suffix = normalized.slice(1);
      if (host.endsWith(suffix) || host === normalized.slice(2)) {
        return true;
      }
      continue;
    }

    if (host === normalized) {
      return true;
    }
  }

  return false;
}

export async function validateCanaryDeploymentUrl(urlString) {
  const parsed = await assertSafeExternalHttpsUrl(urlString);
  const normalized = stripSlash(parsed.toString());

  const productionOrigin = stripSlash(config.apiUrl);
  if (normalized === productionOrigin) {
    throw new Error('Canary deployment URL cannot be the production URL.');
  }

  if (!hostnameMatchesAllowlist(parsed.hostname)) {
    throw new Error('Canary deployment URL is not in the trusted allowlist.');
  }

  return normalized;
}

export function normalizeVersionIdentifier(value, fallback = '') {
  const normalized = String(value || fallback || '')
    .trim()
    .slice(0, 120);

  if (!normalized) {
    return '';
  }

  if (!/^[a-zA-Z0-9._-]+$/.test(normalized)) {
    throw new Error('Version identifier contains invalid characters.');
  }

  return normalized;
}

export function deploymentVersionFromEnv() {
  const explicit = process.env.DEPLOYMENT_VERSION?.trim();
  if (explicit) {
    return explicit.slice(0, 120);
  }

  const gitSha = process.env.VERCEL_GIT_COMMIT_SHA?.trim();
  if (gitSha) {
    return gitSha.slice(0, 12);
  }

  const gitBranch = process.env.VERCEL_GIT_COMMIT_REF?.trim();
  if (gitBranch) {
    return gitBranch.slice(0, 40);
  }

  return config.isProduction ? 'production' : 'local';
}

export function isTrustedCanaryPreviewUrl(urlString) {
  try {
    const parsed = new URL(String(urlString || '').trim());
    return parsed.protocol === 'https:' && hostnameMatchesAllowlist(parsed.hostname);
  } catch {
    return false;
  }
}
