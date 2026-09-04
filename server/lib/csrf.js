import crypto from 'node:crypto';

export const CSRF_COOKIE = 'mcpcontroller_csrf';
export const CSRF_HEADER = 'x-csrf-token';

export function generateCsrfToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export function timingSafeEqualStrings(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }

  const left = Buffer.from(a);
  const right = Buffer.from(b);

  if (left.length !== right.length) {
    return false;
  }

  return crypto.timingSafeEqual(left, right);
}
