import { z } from 'zod';
import {
  loginUser,
  registerUser,
  setSessionCookie,
  clearSessionCookie,
  serializeUser
} from '../services/auth.service.js';
import { AppError } from '../middleware/error.middleware.js';

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters.')
});

const registerSchema = z.object({
  name: z.string().min(1, 'Name is required.'),
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters.')
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

export function me(req, res) {
  res.json({ user: serializeUser(req.user) });
}
