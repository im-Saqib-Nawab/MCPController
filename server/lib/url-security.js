import dns from 'node:dns/promises';
import { isIP } from 'node:net';

import { config } from '../config/env.js';

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata.google',
  'instance-data',
  'instance-data.ec2.internal'
]);

function isPrivateIpv4(address) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
    return true;
  }

  const [a, b] = parts;

  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;

  return false;
}

function isPrivateIpv6(address) {
  const normalized = address.toLowerCase();

  if (normalized === '::1') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  if (normalized.startsWith('fe80:')) return true;
  if (normalized.startsWith('::ffff:')) {
    const mapped = normalized.slice('::ffff:'.length);
    if (isIP(mapped) === 4) {
      return isPrivateIpv4(mapped);
    }
  }

  return false;
}

export function isPrivateIpAddress(address) {
  const version = isIP(address);
  if (version === 4) return isPrivateIpv4(address);
  if (version === 6) return isPrivateIpv6(address);
  return true;
}

export function isAllowedRedirectUri(uri) {
  const value = String(uri || '').trim();
  if (!value) return false;

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }

  if (parsed.protocol === 'https:') {
    return true;
  }

  if (parsed.protocol !== 'http:') {
    return false;
  }

  if (config.isProduction) {
    return false;
  }

  const host = parsed.hostname.toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
}

export async function assertSafeExternalHttpsUrl(urlString) {
  let parsed;

  try {
    parsed = new URL(String(urlString || '').trim());
  } catch {
    throw new Error('Invalid URL');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('Only HTTPS URLs are allowed');
  }

  if (parsed.username || parsed.password) {
    throw new Error('URL credentials are not allowed');
  }

  const host = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(host)) {
    throw new Error('Blocked hostname');
  }

  if (isIP(host)) {
    if (isPrivateIpAddress(host)) {
      throw new Error('Private IP addresses are not allowed');
    }
    return parsed;
  }

  let records;
  try {
    records = await dns.lookup(host, { all: true });
  } catch {
    throw new Error('Unable to resolve hostname');
  }

  for (const record of records) {
    if (isPrivateIpAddress(record.address)) {
      throw new Error('Hostname resolves to a private IP address');
    }
  }

  return parsed;
}
