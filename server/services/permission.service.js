import { AppError } from '../middleware/error.middleware.js';

export const TOOL_SCOPES = {
  get_profile: 'read',
  get_data: 'read',
  create_data: 'write',
  update_data: 'write',
  delete_data: 'delete'
};

/**
 * Permission checks always run on the server. The consent checkboxes only decide
 * which scopes are written onto the access token. A client cannot grant itself
 * extra scopes by editing the frontend.
 */
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
