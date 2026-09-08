import { config } from '../config/env.js';

const STATIC_ASSET_PATTERN = /\.(?:js|css|map|ico|png|jpg|jpeg|gif|svg|webp|woff2?|ttf|json)$/i;

function normalizeHost(value = '') {
  return String(value || '').split(',')[0].trim().toLowerCase().replace(/:\d+$/, '');
}

export function publicEntryHost() {
  try {
    return new URL(config.apiUrl).hostname.toLowerCase();
  } catch {
    return '';
  }
}

export function requestHost(req) {
  const forwarded = normalizeHost(req.headers['x-forwarded-host']);
  return forwarded || normalizeHost(req.headers.host);
}

export function isPublicEntrypointRequest(req) {
  const expected = publicEntryHost();
  const current = requestHost(req);
  return Boolean(expected && current && expected === current);
}

export function isDeploymentControlPlane(req) {
  return config.isDeploymentRouter || isPublicEntrypointRequest(req);
}

function isHealthOrMetricsPath(pathname = '') {
  return (
    pathname === '/health' ||
    pathname === '/health/live' ||
    pathname === '/health/ready' ||
    pathname === '/metrics' ||
    pathname === '/api/health' ||
    pathname === '/api/health/live' ||
    pathname === '/api/health/ready' ||
    pathname === '/api/metrics'
  );
}

function isAuthBootstrapPath(pathname = '') {
  return pathname === '/api/auth/login' || pathname === '/api/auth/register';
}

function isAdminControlPath(pathname = '') {
  return pathname === '/api/admin' || pathname.startsWith('/api/admin/');
}

export function isRouterExcludedPath(pathname = '') {
  if (isHealthOrMetricsPath(pathname) || isAuthBootstrapPath(pathname) || isAdminControlPath(pathname)) {
    return true;
  }

  if (pathname.startsWith('/.well-known/')) {
    return true;
  }

  if (pathname.startsWith('/assets/') || STATIC_ASSET_PATTERN.test(pathname)) {
    return true;
  }

  return false;
}

export function isCanaryProxyPath(pathname = '') {
  if (isRouterExcludedPath(pathname)) {
    return false;
  }

  if (pathname === '/mcp' || pathname.startsWith('/mcp/')) {
    return true;
  }

  if (pathname.startsWith('/oauth/')) {
    return true;
  }

  if (pathname.startsWith('/api/')) {
    return true;
  }

  return false;
}

export function isBrowserDocumentRequest(req) {
  const method = String(req.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    return false;
  }

  const pathname = String(req.path || '');
  if (pathname.startsWith('/api/') || pathname.startsWith('/assets/') || STATIC_ASSET_PATTERN.test(pathname)) {
    return false;
  }

  return true;
}

export function isInternalDeploymentRequest(req) {
  return (
    req.headers['x-deployment-router'] === 'true' ||
    req.headers['x-canary-health-probe'] === 'true'
  );
}
