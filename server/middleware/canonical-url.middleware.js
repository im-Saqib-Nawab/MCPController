import { config } from '../config/env.js';

function isInternalRequest(req) {
  return (
    req.headers['x-deployment-router'] === 'true' ||
    req.headers['x-canary-health-probe'] === 'true'
  );
}

function isRedirectExcludedPath(pathname = '') {
  return (
    pathname === '/health' ||
    pathname === '/health/live' ||
    pathname === '/health/ready' ||
    pathname === '/api/health' ||
    pathname === '/api/health/live' ||
    pathname === '/api/health/ready' ||
    pathname === '/metrics' ||
    pathname === '/api/metrics'
  );
}

function requestHost(req) {
  const forwarded = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
  return (forwarded || req.headers.host || '').toLowerCase();
}

function publicHost() {
  try {
    return new URL(config.apiUrl).hostname.toLowerCase();
  } catch {
    return '';
  }
}

export function canonicalUrlMiddleware() {
  return function canonicalUrl(req, res, next) {
    if (config.isDeploymentRouter || isInternalRequest(req) || isRedirectExcludedPath(req.path)) {
      return next();
    }

    const canonical = publicHost();
    const current = requestHost(req);

    if (!canonical || !current || current === canonical) {
      return next();
    }

    const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    const target = `${config.apiUrl}${req.path}${query}`;

    res.setHeader('x-canonical-url', config.apiUrl);
    res.setHeader('x-redirect-reason', 'use-public-entrypoint');
    return res.redirect(307, target);
  };
}
