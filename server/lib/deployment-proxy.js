import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { config } from '../config/env.js';
import { logOperation } from './request-context.js';
import { isRouterExcludedPath } from './deployment-routing.js';

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length'
]);

const FORWARD_REQUEST_HEADERS = [
  'accept',
  'accept-encoding',
  'accept-language',
  'authorization',
  'content-type',
  'cookie',
  'mcp-protocol-version',
  'mcp-session-id',
  'origin',
  'referer',
  'user-agent',
  'x-csrf-token',
  'x-request-id',
  'x-forwarded-for',
  'x-forwarded-proto',
  'x-forwarded-host'
];

function buildTargetUrl(canaryBaseUrl, req) {
  const base = String(canaryBaseUrl || '').replace(/\/+$/, '');
  const path = req.originalUrl || req.url || '/';
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

function pickForwardHeaders(req) {
  const headers = {};

  for (const name of FORWARD_REQUEST_HEADERS) {
    const value = req.headers[name];
    if (value !== undefined && value !== null && value !== '') {
      headers[name] = value;
    }
  }

  if (!headers['x-forwarded-host']) {
    headers['x-forwarded-host'] = req.headers.host || '';
  }

  if (!headers['x-forwarded-proto']) {
    headers['x-forwarded-proto'] = req.secure ? 'https' : 'http';
  }

  headers['x-deployment-router'] = 'true';
  headers['x-router-version'] = config.deploymentVersion;

  return headers;
}

function sanitizeResponseHeaders(rawHeaders) {
  const headers = {};

  for (const [key, value] of Object.entries(rawHeaders)) {
    if (HOP_BY_HOP_HEADERS.has(String(key).toLowerCase())) {
      continue;
    }
    headers[key] = value;
  }

  return headers;
}

function serializeBody(req) {
  if (req.method === 'GET' || req.method === 'HEAD') {
    return undefined;
  }

  if (req.rawBody !== undefined) {
    return req.rawBody;
  }

  if (req.body === undefined || req.body === null) {
    return undefined;
  }

  if (Buffer.isBuffer(req.body)) {
    return req.body;
  }

  if (typeof req.body === 'string') {
    return req.body;
  }

  if (typeof req.body === 'object') {
    const contentType = String(req.headers['content-type'] || '').toLowerCase();

    if (contentType.includes('application/x-www-form-urlencoded')) {
      return new URLSearchParams(req.body).toString();
    }

    return JSON.stringify(req.body);
  }

  return undefined;
}

export async function proxyRequestToCanary(req, res, { canaryDeploymentUrl, canaryVersion }) {
  const targetUrl = buildTargetUrl(canaryDeploymentUrl, req);
  const started = Date.now();
  const body = serializeBody(req);

  let upstream;

  try {
    upstream = await fetch(targetUrl, {
      method: req.method,
      headers: pickForwardHeaders(req),
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(55000)
    });
  } catch (err) {
    logOperation('error', 'deployment.proxy.failed', {
      route: req.path,
      method: req.method,
      targetUrl,
      canaryVersion,
      durationMs: Date.now() - started,
      errorMessage: err?.message
    });
    return false;
  }

  if (upstream.status >= 500 || upstream.status === 404) {
    logOperation('warn', 'deployment.proxy.unhealthy_response', {
      route: req.path,
      method: req.method,
      targetUrl,
      canaryVersion,
      statusCode: upstream.status,
      durationMs: Date.now() - started
    });
    return false;
  }

  const responseHeaders = sanitizeProxyResponseHeaders(Object.fromEntries(upstream.headers.entries()), {
    canaryDeploymentUrl,
    canaryVersion
  });

  res.status(upstream.status);

  for (const [key, value] of Object.entries(responseHeaders)) {
    if (value !== undefined) {
      res.setHeader(key, value);
    }
  }

  if (!upstream.body) {
    res.end();
    logOperation('info', 'deployment.proxy.completed', {
      route: req.path,
      method: req.method,
      statusCode: upstream.status,
      canaryVersion,
      durationMs: Date.now() - started
    });
    return true;
  }

  try {
    await pipeline(Readable.fromWeb(upstream.body), res);
  } catch (err) {
    logOperation('error', 'deployment.proxy.stream_failed', {
      route: req.path,
      method: req.method,
      canaryVersion,
      errorMessage: err?.message
    });
    return false;
  }

  logOperation('info', 'deployment.proxy.completed', {
    route: req.path,
    method: req.method,
    statusCode: upstream.status,
    canaryVersion,
    durationMs: Date.now() - started
  });
  return true;
}

export { isRouterExcludedPath, isCanaryProxyPath } from './deployment-routing.js';

function rewriteLocationHeader(location, canaryDeploymentUrl) {
  const value = String(location || '').trim();
  if (!value) {
    return value;
  }

  const publicOrigin = String(config.apiUrl || '').replace(/\/+$/, '');
  const canaryOrigin = String(canaryDeploymentUrl || '').replace(/\/+$/, '');

  if (!publicOrigin || !canaryOrigin) {
    return value;
  }

  if (value.startsWith(canaryOrigin)) {
    return `${publicOrigin}${value.slice(canaryOrigin.length)}`;
  }

  return value;
}

function sanitizeProxyResponseHeaders(rawHeaders, { canaryDeploymentUrl, canaryVersion }) {
  const headers = sanitizeResponseHeaders(rawHeaders);

  if (headers.location) {
    headers.location = rewriteLocationHeader(headers.location, canaryDeploymentUrl);
  }

  headers['x-served-by'] = 'canary';
  headers['x-deployment-version'] = canaryVersion;
  headers['x-canary-target'] = 'true';

  return headers;
}
