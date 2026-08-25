/**
 * Vercel serverless entry. The entire Express app (API, OAuth, MCP, React
 * production files) is one function so the project deploys as a single origin.
 *
 * Streamable HTTP is configured in JSON response mode (stateless). That matches
 * Vercel: each invocation can run on a different instance, so we never keep
 * MCP sessions in process memory.
 */
import app from '../server/app.js';

export default app;
