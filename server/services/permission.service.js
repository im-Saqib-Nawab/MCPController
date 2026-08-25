import { AppError } from '../middleware/error.middleware.js';

/**
 * MCP tool → required OAuth scope.
 *
 * ChatGPT may request all three scopes, but the Admin can grant a subset on
 * the consent screen. Only granted scopes are written onto the access token.
 * Every tool call checks the token again here — the UI never grants access alone.
 */
export const TOOL_SCOPES = {
  list_doctors: 'doctor:read',
  get_doctor: 'doctor:read',
  add_doctor: 'doctor:write',
  update_doctor: 'doctor:write',
  delete_doctor: 'doctor:delete'
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
