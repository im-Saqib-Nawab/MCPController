import { config } from '../config/env.js';
import { AppError } from './error.middleware.js';
import {
  CSRF_COOKIE,
  CSRF_HEADER,
  generateCsrfToken,
  timingSafeEqualStrings
} from '../lib/csrf.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const EXEMPT_PATHS = new Set(['/api/auth/login', '/api/auth/register']);

export function setCsrfCookie(res, token = generateCsrfToken()) {
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false,
    sameSite: 'lax',
    secure: config.isProduction,
    path: '/'
  });
  return token;
}

export function clearCsrfCookie(res) {
  res.clearCookie(CSRF_COOKIE, {
    httpOnly: false,
    sameSite: 'lax',
    secure: config.isProduction,
    path: '/'
  });
}

function ensureCsrfCookie(req, res) {
  if (!req.cookies?.[CSRF_COOKIE]) {
    setCsrfCookie(res);
  }
}

export function csrfProtection(req, res, next) {
  if (!config.csrfEnabled || !req.path.startsWith('/api')) {
    return next();
  }

  if (SAFE_METHODS.has(req.method)) {
    ensureCsrfCookie(req, res);
    return next();
  }

  if (EXEMPT_PATHS.has(req.path)) {
    return next();
  }

  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.headers[CSRF_HEADER] || req.headers['X-CSRF-Token'];

  if (!cookieToken || !headerToken || !timingSafeEqualStrings(cookieToken, headerToken)) {
    return next(new AppError(403, 'csrf_validation_failed', 'CSRF token validation failed.'));
  }

  return next();
}
