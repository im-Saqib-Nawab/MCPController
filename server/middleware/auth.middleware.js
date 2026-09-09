import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { config } from '../config/env.js';
import { AppError } from './error.middleware.js';
import { canManageDeployment, getRolloutConfig } from '../services/deployment.service.js';
import { isDeploymentControlPlane } from '../lib/deployment-routing.js';
import { recordPhaseTiming } from '../lib/request-timings.js';

export async function requireUser(req, res, next) {
  const authStarted = Date.now();
  try {
    const token = req.cookies?.[config.cookieName];
    if (!token) {
      throw new AppError(401, 'authentication_required', 'Authentication required');
    }

    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret);
    } catch {
      throw new AppError(401, 'authentication_required', 'Authentication required');
    }

    const user = await User.findById(payload.sub).lean();
    if (!user) {
      throw new AppError(401, 'authentication_required', 'Authentication required');
    }

    const tokenSessionVersion = Number.isInteger(payload.sv) ? payload.sv : -1;
    if (tokenSessionVersion !== (user.sessionVersion ?? 0)) {
      throw new AppError(401, 'authentication_required', 'Authentication required');
    }

    recordPhaseTiming('authentication', Date.now() - authStarted);
    req.user = user;
    next();
  } catch (err) {
    recordPhaseTiming('authentication', Date.now() - authStarted);
    next(err);
  }
}

export function isSuperAdminEmail(email) {
  return (
    Boolean(email) &&
    String(email).trim().toLowerCase() === String(config.adminEmail).trim().toLowerCase()
  );
}

export function requireAdmin(req, res, next) {
  requireUser(req, res, (err) => {
    if (err) return next(err);
    if (req.user?.role !== 'admin') {
      return next(new AppError(403, 'forbidden', 'Administrator access required.'));
    }
    next();
  });
}

export function requireSuperAdmin(req, res, next) {
  requireAdmin(req, res, (err) => {
    if (err) return next(err);
    if (!isSuperAdminEmail(req.user?.email)) {
      return next(
        new AppError(
          403,
          'forbidden',
          'Only the primary administrator can manage deployment routing.'
        )
      );
    }
    next();
  });
}

export function requireDeploymentManager(req, res, next) {
  requireAdmin(req, res, async (err) => {
    if (err) return next(err);

    try {
      if (!isDeploymentControlPlane(req)) {
        return next(
          new AppError(
            403,
            'forbidden',
            'Deployment changes are only available on the production router deployment.'
          )
        );
      }

      const rollout = await getRolloutConfig();
      if (!canManageDeployment(req.user?.email, rollout)) {
        return next(
          new AppError(
            403,
            'forbidden',
            'You do not have permission to change deployment routing.'
          )
        );
      }

      next();
    } catch (serviceErr) {
      next(serviceErr);
    }
  });
}

export async function optionalUser(req, res, next) {
  try {
    const token = req.cookies?.[config.cookieName];
    if (!token) {
      req.user = null;
      return next();
    }

    try {
      const payload = jwt.verify(token, config.jwtSecret);
      const user = await User.findById(payload.sub).lean();
      if (!user) {
        req.user = null;
        return next();
      }

      const tokenSessionVersion = Number.isInteger(payload.sv) ? payload.sv : -1;
      if (tokenSessionVersion !== (user.sessionVersion ?? 0)) {
        req.user = null;
        return next();
      }

      req.user = user;
    } catch {
      req.user = null;
    }

    next();
  } catch (err) {
    next(err);
  }
}
