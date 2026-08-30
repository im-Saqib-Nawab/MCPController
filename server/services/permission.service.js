import { AppError } from '../middleware/error.middleware.js';
import { config } from '../config/env.js';
import { ROLES } from '../lib/roles.js';

/** ChatGPT and older clients still request this combined scope. */
export const LEGACY_WRITE_SCOPE = 'doctor:write';

export const SCOPE_LABELS = {
  'doctor:read': 'Read doctors',
  'doctor:create': 'Add/create doctors',
  'doctor:update': 'Update doctors',
  'doctor:delete': 'Delete doctors',
  'patient:read': 'Read patients',
  'patient:create': 'Create patients',
  'patient:update': 'Update patients',
  'patient:delete': 'Delete patients',
  'appointment:read': 'Read appointments',
  'appointment:create': 'Request appointments',
  'appointment:update': 'Update appointments',
  'appointment:delete': 'Delete appointments',
  'availability:read': 'Read availability',
  'availability:update': 'Update availability',
  'profile:read': 'Read own profile',
  'profile:update': 'Update own profile',
  [LEGACY_WRITE_SCOPE]: 'Add & update doctors'
};

export const ROLE_DEFAULT_SCOPES = {
  [ROLES.ADMIN]: [...config.scopes],
  [ROLES.DOCTOR]: [
    'doctor:read',
    'doctor:update',
    'patient:read',
    'appointment:read',
    'appointment:update',
    'availability:read',
    'availability:update',
    'profile:read',
    'profile:update'
  ],
  [ROLES.PATIENT]: [
    'doctor:read',
    'availability:read',
    'appointment:read',
    'appointment:create',
    'appointment:update',
    'profile:read',
    'profile:update'
  ]
};

export const TOOL_SCOPES = {
  list_doctors: 'doctor:read',
  get_doctor: 'doctor:read',
  add_doctor: 'doctor:create',
  update_doctor: 'doctor:update',
  delete_doctor: 'doctor:delete',
  list_patients: 'patient:read',
  get_patient: 'patient:read',
  add_patient: 'patient:create',
  update_patient: 'patient:update',
  delete_patient: 'patient:delete',
  list_appointments: 'appointment:read',
  request_appointment: 'appointment:create',
  accept_appointment: 'appointment:update',
  reject_appointment: 'appointment:update',
  suggest_alternative_date: 'appointment:update',
  accept_alternative_date: 'appointment:update',
  cancel_appointment: 'appointment:update',
  complete_appointment: 'appointment:update',
  update_availability: 'availability:update',
  get_my_profile: 'profile:read',
  update_my_profile: 'profile:update'
};

export const ACCEPTED_REQUEST_SCOPES = [...config.scopes, LEGACY_WRITE_SCOPE];

export function defaultScopesForRole(role) {
  if (role === ROLES.ADMIN) return [...ROLE_DEFAULT_SCOPES[ROLES.ADMIN]];
  if (role === ROLES.DOCTOR) return [...ROLE_DEFAULT_SCOPES[ROLES.DOCTOR]];
  return [...ROLE_DEFAULT_SCOPES[ROLES.PATIENT]];
}

export function expandLegacyScopes(scopes) {
  const expanded = [];

  for (const scope of scopes) {
    if (scope === LEGACY_WRITE_SCOPE) {
      expanded.push('doctor:create', 'doctor:update');
      continue;
    }
    if (config.scopes.includes(scope)) {
      expanded.push(scope);
    }
  }

  return [...new Set(expanded)];
}

export function expandUserAllowedScopes(scopes) {
  return expandLegacyScopes(scopes || []);
}

export function scopeWasRequested(rawScopes, scope) {
  if (rawScopes.includes(scope)) {
    return true;
  }

  if (
    (scope === 'doctor:create' || scope === 'doctor:update') &&
    rawScopes.includes(LEGACY_WRITE_SCOPE)
  ) {
    return true;
  }

  return false;
}

export function hasScope(grantedScopes, required) {
  if (!Array.isArray(grantedScopes)) {
    return false;
  }

  if (grantedScopes.includes(required)) {
    return true;
  }

  if (
    (required === 'doctor:create' || required === 'doctor:update') &&
    grantedScopes.includes(LEGACY_WRITE_SCOPE)
  ) {
    return true;
  }

  return false;
}

export function requireScope(grantedScopes, required) {
  if (!hasScope(grantedScopes, required)) {
    throw new AppError(
      403,
      'permission_denied',
      `Permission denied. This action requires the "${required}" scope.`
    );
  }
}

export function assertToolAllowed(toolName, grantedScopes) {
  const required = TOOL_SCOPES[toolName];
  if (!required) {
    throw new AppError(400, 'tool_not_allowed', `Unknown tool: ${toolName}`);
  }
  requireScope(grantedScopes, required);
}

export function filterScopesByUserAllowed(requestedScopes, userAllowedScopes) {
  const allowed = new Set(expandUserAllowedScopes(userAllowedScopes));
  return expandLegacyScopes(requestedScopes).filter((scope) => allowed.has(scope));
}

export function advertisedScopes() {
  return [...config.scopes, LEGACY_WRITE_SCOPE];
}
