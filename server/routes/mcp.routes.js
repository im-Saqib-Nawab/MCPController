import { Router } from 'express';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { requireMcpBearer } from '../mcp/auth.js';
import { buildMcpServer } from '../mcp/server.js';
import { logOperation } from '../lib/request-context.js';

/**
 * Streamable HTTP at POST/GET/DELETE /mcp (current MCP transport).
 * responseMode: 'json' avoids long-lived SSE connections so the same code
 * works on a local Node process and on Vercel serverless.
 */
const handler = createMcpHandler(
  ({ authInfo }) => buildMcpServer(authInfo),
  { responseMode: 'json' }
);

const node = toNodeHandler(handler);
const router = Router();

router.all('/', requireMcpBearer, (req, res, next) => {
  logOperation('info', 'mcp.request.received', {
    method: req.method,
    userId: req.auth?.extra?.userId,
    clientId: req.auth?.clientId,
    role: req.auth?.extra?.role
  });

  Promise.resolve(node(req, res, req.body)).catch(next);
});

export default router;
