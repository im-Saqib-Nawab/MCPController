import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { config } from '../config/env.js';
import { AppError } from './error.middleware.js';

/**
 * Admin dashboard/login authentication is separate from MCP OAuth.
 *
 * 1. The Admin logs in through the React UI (credentials from .env).
 * 2. Express sets an HTTP-only cookie containing a JWT (admin user id + email).
 * 3. This middleware reads that cookie on /api/* routes such as /api/auth/me
 *    and /api/oauth/consent — so only the logged-in Admin can grant ChatGPT access.
 *
 * ChatGPT never uses this cookie. ChatGPT uses a Bearer access token on /mcp.
 */
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
