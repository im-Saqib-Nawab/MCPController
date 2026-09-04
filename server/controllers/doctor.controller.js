import { z } from 'zod';
import * as doctorService from '../services/doctor.service.js';
import { AppError } from '../middleware/error.middleware.js';
import { hasScope } from '../services/permission.service.js';
import { getEffectiveAllowedScopes } from '../services/auth.service.js';
import { logAudit } from '../lib/audit-log.js';

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
    const summary = req.query.summary === 'true' || req.query.summary === '1';
    const result = await doctorService.listDoctorsPublic(req.query, { summary });
    res.json(result);
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
  req.auditAction = 'Create Doctor';
  try {
    requireUserScope(req.user, 'doctor:create');
    const parsed = parseOrThrow(createSchema, req.body || {});
    const doctor = await doctorService.addDoctor(parsed, req.user);
    logAudit(req.user, req.auditAction, {
      status: 'success',
      metadata: { doctorId: String(doctor._id || doctor.id), name: parsed.name }
    });
    res.status(201).json({ doctor: await doctorService.getDoctorPublic(doctor._id) });
  } catch (err) {
    next(err);
  }
}

export async function updateDoctor(req, res, next) {
  req.auditAction = 'Update Doctor';
  try {
    requireUserScope(req.user, 'doctor:update');
    const parsed = parseOrThrow(updateSchema, req.body || {});
    await doctorService.updateDoctor(req.params.doctorId, parsed, req.user);
    logAudit(req.user, req.auditAction, {
      status: 'success',
      metadata: { doctorId: req.params.doctorId }
    });
    res.json({ doctor: await doctorService.getDoctorPublic(req.params.doctorId) });
  } catch (err) {
    next(err);
  }
}

export async function updateAvailability(req, res, next) {
  req.auditAction = 'Update Availability';
  try {
    requireUserScope(req.user, 'availability:update');
    const parsed = parseOrThrow(z.object({ weeklyAvailability: weeklySchema }), req.body || {});
    await doctorService.updateAvailability(req.params.doctorId, parsed.weeklyAvailability, req.user);
    logAudit(req.user, req.auditAction, {
      status: 'success',
      metadata: { doctorId: req.params.doctorId }
    });
    res.json({ doctor: await doctorService.getDoctorPublic(req.params.doctorId) });
  } catch (err) {
    next(err);
  }
}

export async function removeDoctor(req, res, next) {
  req.auditAction = 'Delete Doctor';
  try {
    requireUserScope(req.user, 'doctor:delete');
    await doctorService.deleteDoctor(req.params.doctorId, req.user);
    logAudit(req.user, req.auditAction, {
      status: 'success',
      metadata: { doctorId: req.params.doctorId }
    });
    res.json({ deleted: true, doctorId: req.params.doctorId });
  } catch (err) {
    next(err);
  }
}
