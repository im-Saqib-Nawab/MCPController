import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { config } from '../config/env.js';
import { AppError } from './error.middleware.js';

export async function requireUser(req, res, next) {
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

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
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

export async function optionalUser(req, res, next) {
  try {
    const token = req.cookies?.[config.cookieName];
    if (!token) {
      req.user = null;
      return next();
    }

    try {
      const payload = jwt.verify(token, config.jwtSecret);
      req.user = await User.findById(payload.sub).lean();
    } catch {
      req.user = null;
    }

    next();
  } catch (err) {
    next(err);
  }
}
