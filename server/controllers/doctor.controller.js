import { z } from 'zod';
import * as doctorService from '../services/doctor.service.js';
import { AppError } from '../middleware/error.middleware.js';
import { hasScope } from '../services/permission.service.js';
import { getEffectiveAllowedScopes } from '../services/auth.service.js';

const weeklySchema = z
  .object({
    monday: z.enum(['available', 'unavailable']).optional(),
    tuesday: z.enum(['available', 'unavailable']).optional(),
    wednesday: z.enum(['available', 'unavailable']).optional(),
    thursday: z.enum(['available', 'unavailable']).optional(),
    friday: z.enum(['available', 'unavailable']).optional(),
    saturday: z.enum(['available', 'unavailable']).optional(),
    sunday: z.enum(['available', 'unavailable']).optional()
  })
  .optional();

const createSchema = z.object({
  name: z.string().min(1),
  specialization: z.string().min(1),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  availability: z.string().optional(),
  weeklyAvailability: weeklySchema,
  password: z.string().min(8).optional()
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  specialization: z.string().min(1).optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  availability: z.string().optional(),
  weeklyAvailability: weeklySchema
});

function parseOrThrow(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new AppError(400, 'invalid_request', result.error.issues[0]?.message || 'Validation failed');
  }
  return result.data;
}

function requireUserScope(user, scope) {
  requireScopeForUser(user, scope);
}

function requireScopeForUser(user, scope) {
  if (!hasScope(getEffectiveAllowedScopes(user), scope)) {
    throw new AppError(403, 'permission_denied', `Permission denied. This action requires the "${scope}" scope.`);
  }
}

export async function listDoctors(req, res, next) {
  try {
    requireUserScope(req.user, 'doctor:read');
    const doctors = await doctorService.listDoctorsPublic();
    res.json({ doctors });
  } catch (err) {
    next(err);
  }
}

export async function getDoctor(req, res, next) {
  try {
    requireUserScope(req.user, 'doctor:read');
    const doctor = await doctorService.getDoctorPublic(req.params.doctorId);
    res.json({ doctor });
  } catch (err) {
    next(err);
  }
}

export async function createDoctor(req, res, next) {
  try {
    requireUserScope(req.user, 'doctor:create');
    const parsed = parseOrThrow(createSchema, req.body || {});
    const doctor = await doctorService.addDoctor(parsed, req.user);
    res.status(201).json({ doctor: await doctorService.getDoctorPublic(doctor._id) });
  } catch (err) {
    next(err);
  }
}

export async function updateDoctor(req, res, next) {
  try {
    requireUserScope(req.user, 'doctor:update');
    const parsed = parseOrThrow(updateSchema, req.body || {});
    await doctorService.updateDoctor(req.params.doctorId, parsed, req.user);
    res.json({ doctor: await doctorService.getDoctorPublic(req.params.doctorId) });
  } catch (err) {
    next(err);
  }
}

export async function updateAvailability(req, res, next) {
  try {
    requireUserScope(req.user, 'availability:update');
    const parsed = parseOrThrow(z.object({ weeklyAvailability: weeklySchema }), req.body || {});
    await doctorService.updateAvailability(req.params.doctorId, parsed.weeklyAvailability, req.user);
    res.json({ doctor: await doctorService.getDoctorPublic(req.params.doctorId) });
  } catch (err) {
    next(err);
  }
}

export async function removeDoctor(req, res, next) {
  try {
    requireUserScope(req.user, 'doctor:delete');
    await doctorService.deleteDoctor(req.params.doctorId, req.user);
    res.json({ deleted: true, doctorId: req.params.doctorId });
  } catch (err) {
    next(err);
  }
}
