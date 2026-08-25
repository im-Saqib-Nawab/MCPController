/**
 * HTTP-layer permission helper. MCP tools call requireScope from the service
 * because tool calls are JSON-RPC, not Express routes. This middleware exists
 * so REST routes can reuse the same rule: the access token's scopes are the
 * only source of truth.
 */
export { requireScope, hasScope, assertToolAllowed } from '../services/permission.service.js';
