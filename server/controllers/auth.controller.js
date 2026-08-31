import { z } from 'zod';
import {
  loginUser,
  registerUser,
  setSessionCookie,
  clearSessionCookie,
  serializeUserWithProfile,
  updateOwnProfile
} from '../services/auth.service.js';
import { AppError } from '../middleware/error.middleware.js';
import { logError } from '../lib/request-context.js';
import { logAudit } from '../lib/audit-log.js';

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Password is required.')
});

const registerSchema = z.object({
  name: z.string().min(1, 'Name is required.'),
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
  role: z.enum(['doctor', 'patient']).optional(),
  specialization: z.string().optional(),
  phone: z.string().optional(),
  age: z.coerce.number().int().min(0).max(130).optional(),
  gender: z.enum(['male', 'female', 'other', '']).optional(),
  bio: z.string().optional()
});

const profileSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().optional(),
  age: z.union([z.coerce.number().int().min(0).max(130), z.null()]).optional(),
  gender: z.enum(['male', 'female', 'other', '']).optional(),
  bio: z.string().optional(),
  specialization: z.string().optional()
});

function parseOrThrow(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new AppError(400, 'invalid_request', result.error.issues[0]?.message || 'Validation failed');
  }
  return result.data;
}

export async function register(req, res, next) {
  req.auditAction = 'Register';
  try {
    const parsed = parseOrThrow(registerSchema, req.body);
    const user = await registerUser(parsed);
    setSessionCookie(res, user);

    logAudit(user, 'Register', { status: 'success', metadata: { email: user.email } });

    res.status(201).json({ user });
  } catch (err) {
    logError(err, { operation: 'auth.register.failed' });
    next(err);
  }
}

export async function login(req, res, next) {
  req.auditAction = 'Login';
  try {
    const parsed = parseOrThrow(credentialsSchema, req.body);
    const user = await loginUser(parsed);
    setSessionCookie(res, user);

    logAudit(user, 'Login', { status: 'success', metadata: { email: user.email } });

    res.json({ user });
  } catch (err) {
    logError(err, { operation: 'auth.login.failed' });
    next(err);
  }
}

export function logout(req, res) {
  logAudit(req.user, 'Logout', { status: 'success' });

  clearSessionCookie(res);
  res.json({ ok: true });
}

export async function me(req, res, next) {
  try {
    res.json({ user: await serializeUserWithProfile(req.user) });
  } catch (err) {
    next(err);
  }
}

export async function updateMe(req, res, next) {
  req.auditAction = 'Update Profile';
  try {
    const parsed = parseOrThrow(profileSchema, req.body || {});
    const user = await updateOwnProfile(req.user._id, parsed);
    logAudit(req.user, req.auditAction, { status: 'success' });
    res.json({ user });
  } catch (err) {
    next(err);
  }
}
