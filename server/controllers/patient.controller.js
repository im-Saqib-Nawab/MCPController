import { z } from 'zod';
import * as patientService from '../services/patient.service.js';
import { AppError } from '../middleware/error.middleware.js';
import { hasScope } from '../services/permission.service.js';
import { getEffectiveAllowedScopes } from '../services/auth.service.js';

function parseOrThrow(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new AppError(400, 'invalid_request', result.error.issues[0]?.message || 'Validation failed');
  }
  return result.data;
}

function requireUserScope(user, scope) {
  if (!hasScope(getEffectiveAllowedScopes(user), scope)) {
    throw new AppError(403, 'permission_denied', `Permission denied. This action requires the "${scope}" scope.`);
  }
}

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  phone: z.string().optional(),
  age: z.coerce.number().int().min(0).max(130).optional(),
  gender: z.enum(['male', 'female', 'other', '']).optional(),
  bio: z.string().optional()
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().optional(),
  age: z.union([z.coerce.number().int().min(0).max(130), z.null()]).optional(),
  gender: z.enum(['male', 'female', 'other', '']).optional(),
  bio: z.string().optional()
});

export async function listPatients(req, res, next) {
  try {
    requireUserScope(req.user, 'patient:read');
    const patients = await patientService.listPatients(req.user);
    res.json({ patients });
  } catch (err) {
    next(err);
  }
}

export async function getPatient(req, res, next) {
  try {
    requireUserScope(req.user, 'patient:read');
    const patient = await patientService.getPatient(req.params.patientId, req.user);
    res.json({ patient });
  } catch (err) {
    next(err);
  }
}

export async function createPatient(req, res, next) {
  try {
    requireUserScope(req.user, 'patient:create');
    const parsed = parseOrThrow(createSchema, req.body || {});
    const patient = await patientService.addPatient(parsed, req.user);
    res.status(201).json({ patient });
  } catch (err) {
    next(err);
  }
}

export async function updatePatient(req, res, next) {
  try {
    requireUserScope(req.user, 'patient:update');
    const parsed = parseOrThrow(updateSchema, req.body || {});
    const patient = await patientService.updatePatient(req.params.patientId, parsed, req.user);
    res.json({ patient });
  } catch (err) {
    next(err);
  }
}

export async function removePatient(req, res, next) {
  try {
    requireUserScope(req.user, 'patient:delete');
    const result = await patientService.deletePatient(req.params.patientId, req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
}
