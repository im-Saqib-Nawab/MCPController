import { AppError } from '../middleware/error.middleware.js';
import { config } from '../config/env.js';

/** ChatGPT and older clients still request this combined scope. */
export const LEGACY_WRITE_SCOPE = 'doctor:write';

export const SCOPE_LABELS = {
  'doctor:read': 'Read doctors',
  'doctor:create': 'Add/create doctors',
  'doctor:update': 'Update doctors',
  'doctor:delete': 'Delete doctors',
  [LEGACY_WRITE_SCOPE]: 'Add & update doctors'
};

export const TOOL_SCOPES = {
  list_doctors: 'doctor:read',
  get_doctor: 'doctor:read',
  add_doctor: 'doctor:create',
  update_doctor: 'doctor:update',
  delete_doctor: 'doctor:delete'
};

export const ACCEPTED_REQUEST_SCOPES = [...config.scopes, LEGACY_WRITE_SCOPE];

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
