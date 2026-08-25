/**
 * Vercel serverless entry. The entire Express app (API, OAuth, MCP, React
 * production files) is one function so the project deploys as a single origin.
 *
 * Streamable HTTP is configured in JSON response mode (stateless). That matches
 * Vercel: each invocation can run on a different instance, so we never keep
 * MCP sessions in process memory.
 *
 * MongoDB is opened by Express middleware in server/app.js so this handler can
 * stay a plain Express export (Vercel waits on the HTTP response, not on an
 * async wrapper that would resolve too early).
 */
import app from '../server/app.js';

export const config = {
  maxDuration: 60,
  api: {
    bodyParser: false
  }
};

export default app;
