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
  try {
    const parsed = parseOrThrow(registerSchema, req.body);
    const user = await registerUser(parsed);
    setSessionCookie(res, user);
    res.status(201).json({ user });
  } catch (err) {
    next(err);
  }
}

export async function login(req, res, next) {
  try {
    const parsed = parseOrThrow(credentialsSchema, req.body);
    const user = await loginUser(parsed);
    setSessionCookie(res, user);
    res.json({ user });
  } catch (err) {
    next(err);
  }
}

export function logout(req, res) {
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
  try {
    const parsed = parseOrThrow(profileSchema, req.body || {});
    const user = await updateOwnProfile(req.user._id, parsed);
    res.json({ user });
  } catch (err) {
    next(err);
  }
}
