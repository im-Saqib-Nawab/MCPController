import { config, mcpResourceUrl } from '../config/env.js';
import { resolveAccessToken } from '../services/token.service.js';
import { AppError } from '../middleware/error.middleware.js';

function challenge() {
  const metadata = `${config.apiUrl}/.well-known/oauth-protected-resource`;
  // RFC 9728: unauthenticated clients discover the authorization server from this header.
  return `Bearer realm="MCPController", resource_metadata="${metadata}", scope="read"`;
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

    // Shape expected by @modelcontextprotocol/node toNodeHandler (req.auth).
    req.auth = {
      token,
      clientId: record.clientId,
      scopes: record.scopes,
      expiresAt: Math.floor(record.expiresAt.getTime() / 1000),
      resource: new URL(record.resource),
      extra: { userId: String(record.userId) }
    };
    next();
  } catch (err) {
    next(err);
  }
}
