import jwt from 'jsonwebtoken';
import { User, normalizeAllowedScopes } from '../models/User.js';
import { config } from '../config/env.js';
import { AppError } from '../middleware/error.middleware.js';

export function setSessionCookie(res, user) {
  const token = jwt.sign(
    {
      sub: String(user._id || user.id),
      email: user.email,
      role: user.role
    },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );

  res.cookie(config.cookieName, token, {
    httpOnly: true,
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

export function serializeUser(user) {
  return {
    id: String(user._id || user.id),
    name: user.name,
    email: user.email,
    role: user.role,
    allowedScopes: normalizeAllowedScopes(user.allowedScopes),
    createdAt: user.createdAt
  };
}

export async function ensureAdminUser() {
  const email = config.adminEmail.toLowerCase().trim();
  let user = await User.findOne({ email }).select('+password');

  if (!user) {
    user = await User.create({
      name: 'Admin',
      email,
      password: config.adminPassword,
      role: 'admin',
      allowedScopes: [...config.scopes]
    });
  } else {
    user.name = 'Admin';
    user.role = 'admin';
    user.allowedScopes = [...config.scopes];
    user.password = config.adminPassword;
    await user.save();
  }

  const safe = user.toObject();
  delete safe.password;
  return safe;
}

export async function registerUser({ name, email, password }) {
  const normalizedEmail = String(email || '').toLowerCase().trim();
  const adminEmail = config.adminEmail.toLowerCase().trim();

  if (normalizedEmail === adminEmail) {
    throw new AppError(
      409,
      'registration_not_allowed',
      'This email is reserved for the administrator account.'
    );
  }

  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) {
    throw new AppError(409, 'email_in_use', 'An account with this email already exists.');
  }

  const user = await User.create({
    name: String(name || '').trim(),
    email: normalizedEmail,
    password,
    role: 'user',
    allowedScopes: ['doctor:read']
  });

  return serializeUser(user);
}

export async function loginUser({ email, password }) {
  const normalizedEmail = String(email || '').toLowerCase().trim();
  const adminEmail = config.adminEmail.toLowerCase().trim();

  if (normalizedEmail === adminEmail) {
    if (password !== config.adminPassword) {
      throw new AppError(401, 'invalid_credentials', 'Invalid email or password.');
    }
    const admin = await ensureAdminUser();
    return serializeUser(admin);
  }

  const user = await User.findOne({ email: normalizedEmail }).select('+password');
  if (!user) {
    throw new AppError(401, 'invalid_credentials', 'Invalid email or password.');
  }

  const valid = await user.comparePassword(password);
  if (!valid) {
    throw new AppError(401, 'invalid_credentials', 'Invalid email or password.');
  }

  return serializeUser(user);
}

export async function listUsers() {
  const users = await User.find().sort({ createdAt: -1 }).lean();
  return users.map((user) => serializeUser(user));
}

export async function updateUserPermissions(userId, allowedScopes) {
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError(404, 'not_found', 'User not found.');
  }

  if (user.role === 'admin') {
    throw new AppError(400, 'invalid_request', 'Administrator permissions cannot be changed here.');
  }

  user.allowedScopes = normalizeAllowedScopes(allowedScopes);
  await user.save();
  return serializeUser(user);
}

export function getEffectiveAllowedScopes(user) {
  if (user.role === 'admin') {
    return [...config.scopes];
  }
  return normalizeAllowedScopes(user.allowedScopes);
}
