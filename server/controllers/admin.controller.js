import { z } from 'zod';
import { listUsers, updateUserPermissions } from '../services/auth.service.js';
import { dashboardStats } from '../services/appointment.service.js';
import { config } from '../config/env.js';
import { SCOPE_LABELS } from '../services/permission.service.js';
import { AppError } from '../middleware/error.middleware.js';
import { logAudit } from '../lib/audit-log.js';
import {
  getFeatureFlag,
  listFeatureFlags,
  updateFeatureFlag
} from '../services/featureFlag.service.js';
import { DOCTOR_ACCESS_MODES } from '../lib/medicines.js';

export async function listAllUsers(req, res, next) {
  try {
    const result = await listUsers(req.query);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function updatePermissions(req, res, next) {
  req.auditAction = 'Update User Permissions';
  try {
    const { allowedScopes } = req.body || {};
    if (!Array.isArray(allowedScopes)) {
      throw new AppError(400, 'invalid_request', 'allowedScopes must be an array.');
    }

    const user = await updateUserPermissions(req.params.userId, allowedScopes);
    logAudit(req.user, req.auditAction, {
      status: 'success',
      metadata: { targetUserId: req.params.userId, scopeCount: allowedScopes.length }
    });
    res.json({ user });
  } catch (err) {
    next(err);
  }
}

export function listScopeOptions(_req, res) {
  res.json({
    scopes: config.scopes.map((value) => ({
      value,
      label: SCOPE_LABELS[value] || value
    }))
  });
}

export async function stats(req, res, next) {
  try {
    res.json({ stats: await dashboardStats() });
  } catch (err) {
    next(err);
  }
}

const featureFlagUpdateSchema = z.object({
  enabled: z.boolean().optional(),
  doctorAccess: z.enum(DOCTOR_ACCESS_MODES).optional(),
  doctorIds: z.array(z.string()).optional(),
  percentage: z.number().int().min(0).max(100).optional(),
  patientsEnabled: z.boolean().optional()
});

function parseOrThrow(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new AppError(400, 'invalid_request', result.error.issues[0]?.message || 'Validation failed');
  }
  return result.data;
}

export async function listFlags(req, res, next) {
  try {
    res.json({ flags: await listFeatureFlags() });
  } catch (err) {
    next(err);
  }
}

export async function getFlag(req, res, next) {
  try {
    res.json({ flag: await getFeatureFlag(req.params.key) });
  } catch (err) {
    next(err);
  }
}

export async function patchFlag(req, res, next) {
  req.auditAction = 'Update Feature Flag';
  try {
    const parsed = parseOrThrow(featureFlagUpdateSchema, req.body || {});
    const flag = await updateFeatureFlag(req.params.key, parsed, req.user);
    logAudit(req.user, req.auditAction, {
      status: 'success',
      metadata: { key: req.params.key, enabled: flag.enabled }
    });
    res.json({ flag });
  } catch (err) {
    next(err);
  }
}
