import { config } from '../config/env.js';

const TECHNICAL_PREFIXES = ['http.', 'mcp.', 'oauth.', 'permission.', 'db.'];

/**
 * Decide whether a log entry should be written to MongoDB.
 * Audit logs and errors are always kept; routine request telemetry goes to stdout only.
 */
export function shouldPersistToDatabase({ level, operation, fields = {} }) {
  if (fields.category === 'audit') {
    return true;
  }

  if (level === 'error') {
    return true;
  }

  if (operation === 'http.request.completed') {
    if (Number(fields.statusCode) >= 500) {
      return true;
    }
    if (Number(fields.durationMs) >= config.logSlowRequestMs) {
      return true;
    }
    return false;
  }

  if (TECHNICAL_PREFIXES.some((prefix) => operation.startsWith(prefix))) {
    return false;
  }

  return level === 'warn';
}
