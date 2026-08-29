import { AppError } from '../middleware/error.middleware.js';

export const SCOPE_LABELS = {
  'doctor:read': 'Read doctors',
  'doctor:create': 'Add/create doctors',
  'doctor:update': 'Update doctors',
  'doctor:delete': 'Delete doctors'
};

export const TOOL_SCOPES = {
  list_doctors: 'doctor:read',
  get_doctor: 'doctor:read',
  add_doctor: 'doctor:create',
  update_doctor: 'doctor:update',
  delete_doctor: 'doctor:delete'
};

export function hasScope(grantedScopes, required) {
  return Array.isArray(grantedScopes) && grantedScopes.includes(required);
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
  const allowed = new Set(userAllowedScopes || []);
  return requestedScopes.filter((scope) => allowed.has(scope));
}
