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

function attachDeploymentHeaders(res, { assignment, rollout, servedBy }) {
  const productionVersion = rollout.productionVersion || config.deploymentVersion;
  res.setHeader(
    'x-deployment-version',
    servedBy === 'canary' ? rollout.canaryVersion : productionVersion
  );
  res.setHeader('x-served-by', servedBy);
  res.setHeader('x-rollout-assignment', assignment);
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
      attachDeploymentHeaders(res, {
        assignment: sticky.assignment,
        rollout,
        servedBy: 'production'
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

    await proxyRequestToCanary(req, res, {
      canaryDeploymentUrl: rollout.canaryDeploymentUrl,
      canaryVersion: rollout.canaryVersion
    });
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
