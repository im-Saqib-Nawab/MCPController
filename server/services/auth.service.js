import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { config } from '../config/env.js';
import { AppError } from '../middleware/error.middleware.js';

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

export async function registerUser({ name, email, password }) {
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    throw new AppError(409, 'email_in_use', 'An account with this email already exists.');
  }
  const user = await User.create({ name, email, password });
  return user.toObject();
}

export async function loginUser({ email, password }) {
  const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
  if (!user || !(await user.comparePassword(password))) {
    throw new AppError(401, 'invalid_credentials', 'Invalid email or password.');
  }
  const safe = user.toObject();
  delete safe.password;
  return safe;
}
