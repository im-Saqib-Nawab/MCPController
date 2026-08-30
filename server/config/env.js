import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(here, '..');
const root = path.resolve(serverDir, '..');

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

export const config = {
  nodeEnv,
  isProduction,
  port: Number(process.env.PORT) || 3000,
  appUrl: (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, ''),
  apiUrl: (process.env.API_URL || process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, ''),
  mongodbUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/mcpcontroller',
  adminEmail: process.env.ADMIN_EMAIL || 'admin@example.com',
  adminPassword: process.env.ADMIN_PASSWORD || 'change-this-password',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  authCodeTtlSeconds: Number(process.env.AUTH_CODE_TTL_SECONDS) || 600,
  accessTokenTtlSeconds: Number(process.env.ACCESS_TOKEN_TTL_SECONDS) || 3600,
  refreshTokenTtlSeconds: Number(process.env.REFRESH_TOKEN_TTL_SECONDS) || 2592000,
  mcpServerName: process.env.MCP_SERVER_NAME || 'MCPController',
  mcpServerVersion: process.env.MCP_SERVER_VERSION || '1.1.0',
  logLevel: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
  cookieName: 'mcpcontroller_session',
  scopes: [
    'doctor:read',
    'doctor:create',
    'doctor:update',
    'doctor:delete',
    'patient:read',
    'patient:create',
    'patient:update',
    'patient:delete',
    'appointment:read',
    'appointment:create',
    'appointment:update',
    'appointment:delete',
    'availability:read',
    'availability:update',
  'profile:read',
  'profile:update',
  'logs:read'
  ],
  rootDir: root,
  serverDir,
  clientDist: path.join(root, 'client', 'dist')
};

export function issuerUrl() {
  return config.apiUrl;
}

export function mcpResourceUrl() {
  return `${config.apiUrl}/mcp`;
}
