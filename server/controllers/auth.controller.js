import { z } from 'zod';
import { loginUser, registerUser, setSessionCookie, clearSessionCookie } from '../services/auth.service.js';
import { AppError } from '../middleware/error.middleware.js';

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).optional()
});

function parseOrThrow(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new AppError(400, 'invalid_request', 'Validation failed', result.error.issues);
  }
  return result.data;
}

export async function register(req, res, next) {
  try {
    const parsed = parseOrThrow(credentialsSchema, { ...req.body, name: req.body.name || 'User' });
    const user = await registerUser(parsed);
    setSessionCookie(res, user);
    res.status(201).json({
      user: { id: user._id, name: user.name, email: user.email }
    });
  } catch (err) {
    next(err);
  }
}

export async function login(req, res, next) {
  try {
    const parsed = parseOrThrow(credentialsSchema.pick({ email: true, password: true }), req.body);
    const user = await loginUser(parsed);
    setSessionCookie(res, user);
    res.json({
      user: { id: user._id, name: user.name, email: user.email }
    });
  } catch (err) {
    next(err);
  }
}

export function logout(req, res) {
  clearSessionCookie(res);
  res.json({ ok: true });
}

export function me(req, res) {
  res.json({
    user: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      createdAt: req.user.createdAt
    }
  });
}
