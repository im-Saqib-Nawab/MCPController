import { config, mcpResourceUrl } from '../config/env.js';
import { advertisedScopes, hasScope } from '../services/permission.service.js';
import { resolveAccessToken } from '../services/token.service.js';
import { getEffectiveAllowedScopes } from '../services/auth.service.js';
import { User } from '../models/User.js';
import { AppError } from '../middleware/error.middleware.js';
import { logError, logOperation } from '../lib/request-context.js';

function challenge() {
  const metadata = `${config.apiUrl}/.well-known/oauth-protected-resource`;
  // RFC 9728: unauthenticated clients discover the authorization server from this header.
  // ChatGPT copies this `scope` into the authorize request, so it must list every
  // permission we want on the consent screen — not only doctor:read.
  const scope = advertisedScopes().join(' ');
  return `Bearer realm="MCPController", resource_metadata="${metadata}", scope="${scope}"`;
}

/**
 * MCP authentication is NOT the login cookie.
 * ChatGPT (and any MCP client) must send:
 *   Authorization: Bearer <access_token>
 * We hash that token, load the MongoDB row, and attach the user, client, and
 * granted scopes to req.auth. Tools then check those scopes.
 */
export async function requireMcpBearer(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      res.setHeader('WWW-Authenticate', challenge());
      throw new AppError(401, 'mcp_authentication_required', 'MCP authentication required');
    }

    const record = await resolveAccessToken(token);
    if (!record) {
      res.setHeader('WWW-Authenticate', challenge());
      throw new AppError(401, 'invalid_token', 'Token expired');
    }

    if (record.resource !== mcpResourceUrl()) {
      res.setHeader('WWW-Authenticate', challenge());
      throw new AppError(401, 'invalid_token', 'Token was not issued for this MCP resource.');
    }

    const user = await User.findById(record.userId).lean();
    if (!user) {
      res.setHeader('WWW-Authenticate', challenge());
      throw new AppError(401, 'invalid_token', 'The user for this token no longer exists.');
    }

    const allowed = getEffectiveAllowedScopes(user);
    const liveScopes = (record.scopes || []).filter((scope) => hasScope(allowed, scope));

    // Shape expected by @modelcontextprotocol/node toNodeHandler (req.auth).
    req.auth = {
      token,
      clientId: record.clientId,
      scopes: liveScopes,
      expiresAt: Math.floor(record.expiresAt.getTime() / 1000),
      resource: new URL(record.resource),
      extra: { userId: String(record.userId), role: user.role }
    };

    logOperation('info', 'mcp.auth.validated', {
      userId: String(record.userId),
      clientId: record.clientId,
      role: user.role,
      scopeCount: liveScopes.length
    });

    next();
  } catch (err) {
    if (!(err instanceof AppError)) {
      logError(err, { operation: 'mcp.auth.failed' });
    } else {
      logOperation('warn', 'mcp.auth.rejected', {
        errorCode: err.code,
        message: err.message
      });
    }
    next(err);
  }
}
