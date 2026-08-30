import { listUsers, updateUserPermissions } from '../services/auth.service.js';
import { dashboardStats } from '../services/appointment.service.js';
import { config } from '../config/env.js';
import { SCOPE_LABELS } from '../services/permission.service.js';
import { AppError } from '../middleware/error.middleware.js';

export async function listAllUsers(req, res, next) {
  try {
    const users = await listUsers();
    res.json({ users });
  } catch (err) {
    next(err);
  }
}

export async function updatePermissions(req, res, next) {
  try {
    const { allowedScopes } = req.body || {};
    if (!Array.isArray(allowedScopes)) {
      throw new AppError(400, 'invalid_request', 'allowedScopes must be an array.');
    }

    const user = await updateUserPermissions(req.params.userId, allowedScopes);
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
