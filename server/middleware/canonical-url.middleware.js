import { config } from '../config/env.js';
import {
  isBrowserDocumentRequest,
  isInternalDeploymentRequest,
  isPublicEntrypointRequest
} from '../lib/deployment-routing.js';

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

export function canonicalUrlMiddleware() {
  return function canonicalUrl(req, res, next) {
    if (
      config.isDeploymentRouter ||
      isInternalDeploymentRequest(req) ||
      isPublicEntrypointRequest(req) ||
      isRedirectExcludedPath(req.path)
    ) {
      return next();
    }

    if (req.path.startsWith('/api/')) {
      return res.status(400).json({
        error: 'use_public_entrypoint',
        message: `This preview URL is internal only. Use ${config.apiUrl} instead.`,
        publicUrl: config.apiUrl
      });
    }

    if (!isBrowserDocumentRequest(req)) {
      return next();
    }

    const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    const target = `${config.apiUrl}${req.path}${query}`;

    res.setHeader('x-canonical-url', config.apiUrl);
    res.setHeader('x-redirect-reason', 'use-public-entrypoint');
    return res.redirect(307, target);
  };
}
