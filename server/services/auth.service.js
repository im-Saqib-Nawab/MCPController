import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { config } from '../config/env.js';
import { AppError } from '../middleware/error.middleware.js';

/**
 * Admin authentication (website session) is separate from MCP OAuth.
 *
 * Why a User document still exists:
 * OAuth codes/tokens/connections need a stable resource-owner id. We keep one
 * Admin User row in MongoDB, but credentials always come from .env — there is
 * no public registration and no multi-user account system.
 */

export function setSessionCookie(res, user) {
  const token = jwt.sign(
    { sub: String(user._id), email: user.email },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );

  res.cookie(config.cookieName, token, {
    httpOnly: true,
    // Lax lets the cookie ride along when ChatGPT redirects the browser here.
    sameSite: 'lax',
    secure: config.isProduction,
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(config.cookieName, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProduction,
    path: '/'
  });
}

/**
 * Ensure the single Admin document exists and matches ADMIN_* from .env.
 * Called on login so rotating the env password takes effect immediately.
 */
export async function ensureAdminUser() {
  const email = config.adminEmail.toLowerCase().trim();
  let user = await User.findOne({ email });

  if (!user) {
    user = await User.create({
      name: 'Admin',
      email,
      password: config.adminPassword
    });
  } else if (user.name !== 'Admin') {
    user.name = 'Admin';
    await user.save();
  }

  const safe = user.toObject();
  delete safe.password;
  return safe;
}

/**
 * Login only succeeds for ADMIN_EMAIL + ADMIN_PASSWORD from .env.
 * No other accounts can sign in.
 */
export async function loginAdmin({ email, password }) {
  const expectedEmail = config.adminEmail.toLowerCase().trim();
  const providedEmail = String(email || '')
    .toLowerCase()
    .trim();

  if (providedEmail !== expectedEmail || password !== config.adminPassword) {
    throw new AppError(401, 'invalid_credentials', 'Invalid email or password.');
  }

  return ensureAdminUser();
}
