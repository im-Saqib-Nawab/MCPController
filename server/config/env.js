import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

// Load the repo-root .env so secrets never live in the React client.
dotenv.config({ path: path.join(root, '.env') });

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: (process.env.NODE_ENV || 'development') === 'production',
  port: Number(process.env.PORT) || 3000,
  appUrl: (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, ''),
  apiUrl: (process.env.API_URL || process.env.APP_URL || 'http://localhost:3000').replace(
    /\/$/,
    ''
  ),
  mongodbUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/mcpcontroller',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-change-me',
  sessionSecret: process.env.SESSION_SECRET || 'dev-only-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  authCodeTtlSeconds: Number(process.env.AUTH_CODE_TTL_SECONDS) || 120,
  accessTokenTtlSeconds: Number(process.env.ACCESS_TOKEN_TTL_SECONDS) || 3600,
  refreshTokenTtlSeconds: Number(process.env.REFRESH_TOKEN_TTL_SECONDS) || 2592000,
  mcpServerName: process.env.MCP_SERVER_NAME || 'MCPController',
  mcpServerVersion: process.env.MCP_SERVER_VERSION || '1.0.0',
  cookieName: 'mcpcontroller_session',
  scopes: ['read', 'write', 'delete'],
  rootDir: root,
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
