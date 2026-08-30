import {
  createRequestContext,
  logOperation,
  runWithContext
} from '../lib/request-context.js';

function actorFromRequest(req) {
  const userId = req.user?._id ? String(req.user._id) : req.auth?.extra?.userId;
  const clientId = req.auth?.clientId;
  const role = req.user?.role || req.auth?.extra?.role;

  return {
    ...(userId ? { userId } : {}),
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

      context.log[level](
        {
          operation: 'http.request.completed',
          method: req.method,
          route: req.path,
          routeKind,
          statusCode: res.statusCode,
          durationMs,
          ...actorFromRequest(req)
        },
        `${req.method} ${req.path} ${res.statusCode}`
      );
    });

    next();
  });
}
