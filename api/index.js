/**
 * Vercel serverless entry point.
 *
 * The complete Express application handles:
 *
 * - REST API
 * - Admin authentication
 * - OAuth 2.1 endpoints
 * - MCP Streamable HTTP
 * - React production assets
 *
 * Everything runs from the same Vercel deployment/origin:
 *
 * https://mcpcontroller.vercel.app
 *
 * MongoDB connection management is handled by server/app.js and the
 * database connection helper, which reuses the connection between warm
 * Vercel invocations.
 */

import { initSentry } from '../server/lib/sentry.js';

initSentry();

import app from '../server/app.js';

/**
 * Vercel function configuration.
 *
 * MCP requests can take longer than ordinary API requests, so allow the
 * function to run for up to 60 seconds.
 */
export const config = {
  maxDuration: 60
};

export default app;