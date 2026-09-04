import { z } from 'zod';
import * as appointmentService from '../services/appointment.service.js';
import { AppError } from '../middleware/error.middleware.js';
import { hasScope } from '../services/permission.service.js';
import { getEffectiveAllowedScopes } from '../services/auth.service.js';
import { logAudit } from '../lib/audit-log.js';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');

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

export async function listAppointments(req, res, next) {
  try {
    requireUserScope(req.user, 'appointment:read');
    const result = await appointmentService.listAppointments(req.user, {
      status: req.query.status,
      doctorId: req.query.doctorId,
      patientId: req.query.patientId,
      date: req.query.date,
      page: req.query.page,
      limit: req.query.limit
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getAppointment(req, res, next) {
  try {
    requireUserScope(req.user, 'appointment:read');
    const appointment = await appointmentService.getAppointment(req.params.appointmentId, req.user);
    res.json({ appointment });
  } catch (err) {
    next(err);
  }
}

export async function createAppointment(req, res, next) {
  req.auditAction = 'Book Appointment';
  try {
    requireUserScope(req.user, 'appointment:create');
    const parsed = parseOrThrow(
      z.object({ doctorId: z.string().min(1), date: dateSchema }),
      req.body || {}
    );
    const appointment = await appointmentService.requestAppointment(req.user, parsed);
    logAudit(req.user, req.auditAction, {
      status: 'success',
      metadata: {
        appointmentId: String(appointment._id || appointment.id),
        doctorId: parsed.doctorId,
        date: parsed.date
      }
    });
    res.status(201).json({ appointment });
  } catch (err) {
    next(err);
  }
}

export async function acceptAppointment(req, res, next) {
  req.auditAction = 'Accept Appointment';
  try {
    requireUserScope(req.user, 'appointment:update');
    const appointment = await appointmentService.acceptAppointment(req.params.appointmentId, req.user);
    logAudit(req.user, req.auditAction, {
      status: 'success',
      metadata: { appointmentId: req.params.appointmentId }
    });
    res.json({ appointment });
  } catch (err) {
    next(err);
  }
}

export async function rejectAppointment(req, res, next) {
  req.auditAction = 'Reject Appointment';
  try {
    requireUserScope(req.user, 'appointment:update');
    const parsed = parseOrThrow(
      z.object({
        reason: z.string().optional(),
        suggestedDates: z.array(dateSchema).optional()
      }),
      req.body || {}
    );
    const appointment = await appointmentService.rejectAppointment(
      req.params.appointmentId,
      req.user,
      parsed
    );
    logAudit(req.user, req.auditAction, {
      status: 'success',
      metadata: { appointmentId: req.params.appointmentId }
    });
    res.json({ appointment });
  } catch (err) {
    next(err);
  }
}

export async function suggestAlternative(req, res, next) {
  req.auditAction = 'Suggest Alternative Date';
  try {
    requireUserScope(req.user, 'appointment:update');
    const parsed = parseOrThrow(
      z.object({
        dates: z.array(dateSchema).min(1),
        note: z.string().optional()
      }),
      req.body || {}
    );
    const appointment = await appointmentService.suggestAlternativeDate(
      req.params.appointmentId,
      req.user,
      parsed
    );
    logAudit(req.user, req.auditAction, {
      status: 'success',
      metadata: { appointmentId: req.params.appointmentId, dates: parsed.dates }
    });
    res.json({ appointment });
  } catch (err) {
    next(err);
  }
}

export async function acceptAlternative(req, res, next) {
  req.auditAction = 'Accept Alternative Date';
  try {
    requireUserScope(req.user, 'appointment:update');
    const parsed = parseOrThrow(z.object({ date: dateSchema }), req.body || {});
    const appointment = await appointmentService.acceptAlternativeDate(
      req.params.appointmentId,
      req.user,
      parsed
    );
    logAudit(req.user, req.auditAction, {
      status: 'success',
      metadata: { appointmentId: req.params.appointmentId, date: parsed.date }
    });
    res.json({ appointment });
  } catch (err) {
    next(err);
  }
}

export async function cancelAppointment(req, res, next) {
  req.auditAction = 'Cancel Appointment';
  try {
    requireUserScope(req.user, 'appointment:update');
    const appointment = await appointmentService.cancelAppointment(req.params.appointmentId, req.user);
    logAudit(req.user, req.auditAction, {
      status: 'success',
      metadata: { appointmentId: req.params.appointmentId }
    });
    res.json({ appointment });
  } catch (err) {
    next(err);
  }
}

export async function completeAppointment(req, res, next) {
  req.auditAction = 'Complete Appointment';
  try {
    requireUserScope(req.user, 'appointment:update');
    const appointment = await appointmentService.completeAppointment(req.params.appointmentId, req.user);
    logAudit(req.user, req.auditAction, {
      status: 'success',
      metadata: { appointmentId: req.params.appointmentId }
    });
    res.json({ appointment });
  } catch (err) {
    next(err);
  }
}

export async function updateAppointment(req, res, next) {
  req.auditAction = 'Admin Update Appointment';
  try {
    requireUserScope(req.user, 'appointment:update');
    const appointment = await appointmentService.adminUpdateAppointment(
      req.params.appointmentId,
      req.body || {},
      req.user
    );
    logAudit(req.user, req.auditAction, {
      status: 'success',
      metadata: { appointmentId: req.params.appointmentId }
    });
    res.json({ appointment });
  } catch (err) {
    next(err);
  }
}
