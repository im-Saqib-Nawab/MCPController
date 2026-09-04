import { config } from '../config/env.js';
import { renderPrometheusMetrics } from '../lib/runtime-metrics.js';

export function metricsHandler(req, res) {
  const requiresAuth = config.isProduction || config.isStaging || Boolean(config.metricsToken);

  if (requiresAuth) {
    if (!config.metricsToken) {
      return res.status(503).json({
        error: 'metrics_unavailable',
        message: 'Metrics endpoint is not configured.'
      });
    }

    const auth = String(req.headers.authorization || '');
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : String(req.query.token || '');
    if (token !== config.metricsToken) {
      return res.status(401).json({ error: 'unauthorized', message: 'Invalid metrics token.' });
    }
  }

  res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  return res.status(200).send(renderPrometheusMetrics());
}
