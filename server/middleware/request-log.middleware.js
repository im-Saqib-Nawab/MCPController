import {
  createRequestContext,
  logOperation,
  runWithContext
} from '../lib/request-context.js';
import { recordLatencySample } from '../lib/latency-sampling.js';
import { recordHttpRequest } from '../lib/runtime-metrics.js';

function actorFromRequest(req) {
  const userId = req.user?._id ? String(req.user._id) : req.auth?.extra?.userId;
  const clientId = req.auth?.clientId;
  const role = req.user?.role || req.auth?.extra?.role;
  const actorName = req.user?.name || req.auth?.extra?.actorName;

  return {
    ...(userId ? { userId } : {}),
    ...(actorName ? { actorName } : {}),
    ...(clientId ? { clientId } : {}),
    ...(role ? { role } : {})
  };
}

function classifyRoute(pathname = '') {
  if (pathname === '/mcp' || pathname.startsWith('/mcp/')) {
    return 'mcp';
  }

  if (pathname.startsWith('/oauth/')) {
    return 'oauth';
  }

  if (pathname.startsWith('/.well-known/')) {
    return 'discovery';
  }

  if (pathname.startsWith('/api/oauth')) {
    return 'oauth-api';
  }

  if (pathname.startsWith('/api/auth')) {
    return 'auth';
  }

  if (pathname.startsWith('/api/')) {
    return 'api';
  }

  return 'other';
}

export function requestLogMiddleware(req, res, next) {
  const context = createRequestContext(req);

  req.requestId = context.requestId;
  req.log = context.log;
  res.setHeader('x-request-id', context.requestId);

  runWithContext(context, () => {
    const routeKind = classifyRoute(req.path);

    logOperation('debug', 'http.request.received', {
      method: req.method,
      route: req.path,
      routeKind,
      ...actorFromRequest(req)
    });

    res.on('finish', () => {
      const durationMs = Date.now() - context.startTime;
      const level =
        res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
      const deploymentVersion = res.getHeader('x-deployment-version') || undefined;
      const actor = actorFromRequest(req);

      recordHttpRequest({
        method: req.method,
        route: req.path,
        statusCode: res.statusCode,
        durationMs
      });

      void recordLatencySample({
        requestId: context.requestId,
        method: req.method,
        route: req.path,
        role: actor.role,
        statusCode: res.statusCode,
        durationMs,
        deploymentVersion
      });

      logOperation(level, 'http.request.completed', {
        method: req.method,
        route: req.path,
        routeKind,
        statusCode: res.statusCode,
        durationMs,
        deploymentVersion,
        servedBy: res.getHeader('x-served-by') || undefined,
        rolloutAssignment: res.getHeader('x-rollout-assignment') || req.deploymentAssignment || undefined,
        ...actor
      });
    });

    next();
  });
}
