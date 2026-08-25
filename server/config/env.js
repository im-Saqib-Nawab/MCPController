import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
// server/config → server → repo root (where .env and client/ live)
const serverDir = path.resolve(here, '..');
const root = path.resolve(serverDir, '..');

// Load the repo-root .env so secrets never live in the React client.
dotenv.config({ path: path.join(root, '.env') });

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

if (isProduction) {
  const required = ['MONGODB_URI', 'JWT_SECRET', 'ADMIN_EMAIL', 'ADMIN_PASSWORD', 'APP_URL', 'API_URL'];
  const missing = required.filter((name) => !String(process.env[name] || '').trim());
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  const weakSecrets = new Set(['change-this-secret', 'dev-only-change-me', 'change-this-to-a-long-random-secret']);
  if (weakSecrets.has(process.env.JWT_SECRET)) {
    throw new Error('JWT_SECRET must be a unique strong value in production.');
  }
}

/**
 * MCPController is a single-admin app.
 * ADMIN_EMAIL / ADMIN_PASSWORD come from .env — never hardcode them in React or tools.
 *
 * doctor:* scopes are what ChatGPT requests; the Admin chooses which ones to grant
 * on the consent screen. Only granted scopes are stored on the access token.
 *
 * Local `npm run dev`: APP_URL is the Vite origin (5173), API_URL is Express (3000).
 * Vercel: APP_URL and API_URL must both be the deployment origin (https://….vercel.app).
 */
export const config = {
  nodeEnv,
  isProduction,
  port: Number(process.env.PORT) || 3000,
  appUrl: (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, ''),
  apiUrl: (process.env.API_URL || process.env.APP_URL || 'http://localhost:3000').replace(
    /\/$/,
    ''
  ),
  mongodbUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/mcpcontroller',
  // Single Admin credentials (source of truth for login — not a multi-user registry).
  adminEmail: process.env.ADMIN_EMAIL || 'admin@example.com',
  adminPassword: process.env.ADMIN_PASSWORD || 'change-this-password',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  authCodeTtlSeconds: Number(process.env.AUTH_CODE_TTL_SECONDS) || 120,
  accessTokenTtlSeconds: Number(process.env.ACCESS_TOKEN_TTL_SECONDS) || 3600,
  refreshTokenTtlSeconds: Number(process.env.REFRESH_TOKEN_TTL_SECONDS) || 2592000,
  mcpServerName: process.env.MCP_SERVER_NAME || 'MCPController',
  mcpServerVersion: process.env.MCP_SERVER_VERSION || '1.0.0',
  cookieName: 'mcpcontroller_session',
  scopes: ['doctor:read', 'doctor:write', 'doctor:delete'],
  rootDir: root,
  serverDir,
  clientDist: path.join(root, 'client', 'dist')
};

export function issuerUrl() {
  // RFC 8414 issuer is the authorization server origin (this Express API).
  return config.apiUrl;
}

export function mcpResourceUrl() {
  // RFC 8707 resource indicator: the canonical MCP endpoint this token is for.
  return `${config.apiUrl}/mcp`;
}
