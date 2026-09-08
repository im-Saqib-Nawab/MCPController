import {
  ANON_COOKIE_NAME,
  ROLLOUT_COOKIE_NAME,
  anonCookieOptions,
  computeAssignment,
  createAnonymousId,
  createAssignmentCookieValue,
  resolveStickyAssignment,
  rolloutCookieOptions
} from '../lib/deployment-assignment.js';
import { isRouterExcludedPath, proxyRequestToCanary } from '../lib/deployment-proxy.js';
import { getRolloutConfig } from '../services/deployment.service.js';
import { config } from '../config/env.js';
import { logOperation } from '../lib/request-context.js';
import { incrementMetric } from '../lib/runtime-metrics.js';
import { checkCanaryHealth } from '../services/deployment.service.js';

function attachDeploymentHeaders(res, { assignment, rollout, servedBy }) {
  const productionVersion = rollout.productionVersion || config.deploymentVersion;
  res.setHeader(
    'x-deployment-version',
    servedBy === 'canary' ? rollout.canaryVersion : productionVersion
  );
  res.setHeader('x-served-by', servedBy);
  res.setHeader('x-rollout-assignment', assignment);
}

const canaryHealthCache = {
  url: '',
  checkedAt: 0,
  healthy: false
};

const CANARY_HEALTH_CACHE_MS = 15000;

async function isCanaryHealthy(canaryDeploymentUrl) {
  const target = String(canaryDeploymentUrl || '').replace(/\/+$/, '');
  if (!target) {
    return false;
  }

  const now = Date.now();
  if (
    canaryHealthCache.url === target &&
    now - canaryHealthCache.checkedAt < CANARY_HEALTH_CACHE_MS
  ) {
    return canaryHealthCache.healthy;
  }

  const health = await checkCanaryHealth(target);
  canaryHealthCache.url = target;
  canaryHealthCache.checkedAt = now;
  canaryHealthCache.healthy = Boolean(health.healthy);
  return canaryHealthCache.healthy;
}

export function canaryRouterMiddleware() {
  return async function canaryRouter(req, res, next) {
    if (!config.isDeploymentRouter) {
      res.setHeader('x-deployment-version', config.deploymentVersion);
      res.setHeader('x-served-by', config.deploymentRole);
      return next();
    }

    if (isRouterExcludedPath(req.path)) {
      res.setHeader('x-deployment-version', config.deploymentVersion);
      res.setHeader('x-served-by', 'router');
      return next();
    }

    let rollout;

    try {
      rollout = await getRolloutConfig();
    } catch (err) {
      logOperation('error', 'deployment.rollout.load_failed', {
        errorMessage: err?.message
      });
      res.setHeader('x-deployment-version', config.deploymentVersion);
      res.setHeader('x-served-by', 'router');
      return next();
    }

    const sticky = resolveStickyAssignment(req, rollout);

    if (!sticky.subject && sticky.reason === 'anonymous_pending') {
      const anonId = createAnonymousId();
      res.cookie(ANON_COOKIE_NAME, anonId, anonCookieOptions());
      sticky.subject = `anon:${anonId}`;
      sticky.assignment = computeAssignment(
        sticky.subject,
        rollout.rolloutEnabled ? rollout.canaryPercentage : 0,
        sticky.epoch
      );
    }

    req.deploymentAssignment = sticky.assignment;
    req.deploymentSubject = sticky.subject;
    req.deploymentRollout = rollout;

    if (sticky.subject) {
      res.cookie(
        ROLLOUT_COOKIE_NAME,
        createAssignmentCookieValue({
          assignment: sticky.assignment,
          epoch: sticky.epoch,
          subject: sticky.subject
        }),
        rolloutCookieOptions()
      );
    }

    const shouldProxy =
      sticky.assignment === 'canary' &&
      rollout.rolloutEnabled &&
      rollout.canaryPercentage > 0 &&
      rollout.canaryDeploymentUrl &&
      rollout.canaryVersion;

    if (!shouldProxy) {
      incrementMetric('deployment_requests_production_total');
      attachDeploymentHeaders(res, {
        assignment: sticky.assignment,
        rollout,
        servedBy: 'production'
      });
      return next();
    }

    const canaryHealthy = await isCanaryHealthy(rollout.canaryDeploymentUrl);
    if (!canaryHealthy) {
      incrementMetric('deployment_proxy_failover_total');
      incrementMetric('deployment_requests_production_total');
      logOperation('warn', 'deployment.route.canary_failover', {
        route: req.path,
        method: req.method,
        canaryVersion: rollout.canaryVersion,
        reason: 'canary_unhealthy'
      });
      attachDeploymentHeaders(res, {
        assignment: 'production',
        rollout,
        servedBy: 'production-failover'
      });
      return next();
    }

    logOperation('info', 'deployment.route.canary', {
      route: req.path,
      method: req.method,
      assignment: sticky.assignment,
      subject: sticky.subject,
      canaryVersion: rollout.canaryVersion,
      reason: sticky.reason
    });

    incrementMetric('deployment_requests_canary_total');
    const proxied = await proxyRequestToCanary(req, res, {
      canaryDeploymentUrl: rollout.canaryDeploymentUrl,
      canaryVersion: rollout.canaryVersion
    });

    if (!proxied) {
      incrementMetric('deployment_proxy_failover_total');
      incrementMetric('deployment_requests_production_total');
      logOperation('warn', 'deployment.route.canary_failover', {
        route: req.path,
        method: req.method,
        canaryVersion: rollout.canaryVersion,
        reason: 'proxy_failed'
      });
      attachDeploymentHeaders(res, {
        assignment: 'production',
        rollout,
        servedBy: 'production-failover'
      });
      return next();
    }
  };
}

export function deploymentResponseHeadersMiddleware(req, res, next) {
  if (!config.isDeploymentRouter || res.getHeader('x-served-by')) {
    return next();
  }

  res.setHeader('x-deployment-version', config.deploymentVersion);
  res.setHeader('x-served-by', req.deploymentAssignment === 'canary' ? 'canary' : 'production');
  if (req.deploymentAssignment) {
    res.setHeader('x-rollout-assignment', req.deploymentAssignment);
  }
  next();
}
