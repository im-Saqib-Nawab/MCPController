import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(here, '..');
const root = path.resolve(serverDir, '..');

const nodeEnv = process.env.NODE_ENV || 'development';
const isDevelopment = nodeEnv === 'development';
const isStaging = nodeEnv === 'staging';
const isProduction = nodeEnv === 'production';
const isTest = nodeEnv === 'test';
const onVercel = Boolean(process.env.VERCEL);

dotenv.config({ path: path.join(root, '.env') });
dotenv.config({ path: path.join(root, `.env.${nodeEnv}`), override: true });

const weakSecrets = new Set([
  'change-this-secret',
  'dev-only-change-me',
  'change-this-to-a-long-random-secret'
]);

const weakAdminPasswords = new Set([
  'change-this-password',
  'password',
  'admin',
  'administrator',
  '12345678',
  'password123'
]);

function collectDeployedEnvironmentErrors() {
  if (!isProduction && !isStaging) {
    return [];
  }

  const errors = [];
  const required = ['MONGODB_URI', 'JWT_SECRET', 'ADMIN_EMAIL', 'ADMIN_PASSWORD', 'APP_URL', 'API_URL'];
  const missing = required.filter((name) => !String(process.env[name] || '').trim());

  if (missing.length) {
    errors.push(`Missing required environment variables: ${missing.join(', ')}`);
  }

  if (isProduction) {
    if (weakSecrets.has(process.env.JWT_SECRET)) {
      errors.push('JWT_SECRET must be a unique strong value in production.');
    }
    const adminPassword = String(process.env.ADMIN_PASSWORD || '');
    if (adminPassword.length < 12 || weakAdminPasswords.has(adminPassword)) {
      errors.push('ADMIN_PASSWORD must be at least 12 characters and not a common default in production.');
    }
    if (process.env.TEST_CENTER_ENABLED === 'true') {
      errors.push('TEST_CENTER_ENABLED must not be true in production.');
    }
  }

  if (isStaging && process.env.STAGING_ALLOW_WEAK_SECRETS !== 'true') {
    if (weakSecrets.has(process.env.JWT_SECRET)) {
      errors.push('JWT_SECRET must not use development defaults in staging.');
    }
  }

  return errors;
}

export const deploymentConfigErrors = collectDeployedEnvironmentErrors();

export function assertDeployedEnvironment() {
  if (deploymentConfigErrors.length) {
    throw new Error(deploymentConfigErrors[0]);
  }
}

function parseAllowlist(value, fallback) {
  const raw = String(value || fallback || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  return raw.length ? raw : fallback;
}

const deploymentRole = String(process.env.DEPLOYMENT_ROLE || '').trim().toLowerCase();
const explicitRouterFlag = process.env.IS_DEPLOYMENT_ROUTER;
const vercelEnv = String(process.env.VERCEL_ENV || '').trim().toLowerCase();
const inferredRouterRole =
  deploymentRole === 'router' || deploymentRole === 'production' || deploymentRole === 'control-plane';
const inferredCanaryRole = deploymentRole === 'canary' || deploymentRole === 'preview' || deploymentRole === 'target';
const isPreviewDeployment = vercelEnv === 'preview';

function resolvePublicHost() {
  try {
    return new URL((process.env.API_URL || process.env.APP_URL || '').trim()).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function resolveDeploymentHost() {
  const vercelUrl = String(process.env.VERCEL_URL || '').trim().toLowerCase();
  if (vercelUrl) {
    return vercelUrl;
  }

  try {
    return new URL((process.env.VERCEL_BRANCH_URL || '').trim()).hostname.toLowerCase();
  } catch {
    return '';
  }
}

const publicHost = resolvePublicHost();
const deploymentHost = resolveDeploymentHost();
const isPrimaryPublicHost =
  Boolean(publicHost && deploymentHost) &&
  (publicHost === deploymentHost || publicHost.endsWith(`.${deploymentHost}`));

const isDeploymentRouter =
  explicitRouterFlag === 'true'
    ? true
    : inferredCanaryRole || (isPreviewDeployment && !isPrimaryPublicHost)
      ? false
      : explicitRouterFlag === 'false' && isPreviewDeployment
        ? false
        : inferredRouterRole ||
          isPrimaryPublicHost ||
          vercelEnv === 'production' ||
          isStaging ||
          isDevelopment ||
          isTest;

export const config = {
  nodeEnv,
  isDevelopment,
  isStaging,
  isProduction,
  isTest,
  deploymentRole: deploymentRole || (isDeploymentRouter ? 'router' : 'canary'),
  isDeploymentRouter,
  deploymentVersion:
    process.env.DEPLOYMENT_VERSION?.trim() ||
    process.env.VERCEL_GIT_COMMIT_SHA?.trim()?.slice(0, 12) ||
    process.env.VERCEL_GIT_COMMIT_REF?.trim()?.slice(0, 40) ||
    (isProduction ? 'production' : 'local'),
  canaryUrlAllowlist: parseAllowlist(process.env.CANARY_URL_ALLOWLIST, ['*.vercel.app']),
  deploymentRolloutCacheTtlMs: Number(process.env.DEPLOYMENT_ROLLOUT_CACHE_TTL_MS) || 5000,
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
  logLevel: process.env.LOG_LEVEL || (isProduction || isStaging ? 'info' : 'debug'),
  logSlowRequestMs: Number(process.env.LOG_SLOW_REQUEST_MS) || 2000,
  latencySampleRate: Number(process.env.LATENCY_SAMPLE_RATE) || 0.1,
  metricsToken: process.env.METRICS_TOKEN || '',
  sentryDsn: process.env.SENTRY_DSN || '',
  testCenterEnabled: process.env.TEST_CENTER_ENABLED === 'true' || isDevelopment || isTest,
  mongodbMaxPoolSize:
    Number(process.env.MONGODB_MAX_POOL_SIZE) ||
    (onVercel ? 10 : isProduction || isStaging ? 30 : 50),
  mongodbMinPoolSize: Number(process.env.MONGODB_MIN_POOL_SIZE) || (onVercel ? 0 : 5),
  mongodbWaitQueueTimeoutMS: Number(process.env.MONGODB_WAIT_QUEUE_TIMEOUT_MS) || 10000,
  featureFlagCacheTtlMs: Number(process.env.FEATURE_FLAG_CACHE_TTL_MS) || 60000,
  syncIndexesOnStartup: process.env.SYNC_INDEXES_ON_STARTUP === 'true' || isDevelopment || isTest,
  cookieName: 'mcpcontroller_session',
  csrfEnabled: process.env.CSRF_ENABLED !== 'false' && !isTest,
  oauthDcrEnabled:
    isProduction || isStaging
      ? process.env.OAUTH_DCR_ENABLED === 'true'
      : process.env.OAUTH_DCR_ENABLED !== 'false',
  passwordMaxLength: Number(process.env.PASSWORD_MAX_LENGTH) || 128,
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
    'profile:update'
  ],
  rootDir: root,
  serverDir,
  clientDist: path.join(root, 'client', 'dist'),
  credits: {
    initialFreeCredits: Number(process.env.INITIAL_FREE_CREDITS) || 100,
    lowCreditThreshold: Number(process.env.LOW_CREDIT_THRESHOLD) || 10
  },
  payment: {
    provider: process.env.PAYMENT_PROVIDER || 'dev'
  },
  subscriptionPlans: [
    {
      id: 'monthly',
      name: 'Monthly Plan',
      billingCycle: 'monthly',
      priceCents: Number(process.env.MONTHLY_PLAN_PRICE_CENTS) || 999,
      credits: Number(process.env.MONTHLY_PLAN_CREDITS) || 100,
      durationDays: Number(process.env.MONTHLY_PLAN_DURATION_DAYS) || 30,
      description: '100 credits renewed every month'
    },
    {
      id: 'yearly',
      name: 'Yearly Plan',
      billingCycle: 'yearly',
      priceCents: Number(process.env.YEARLY_PLAN_PRICE_CENTS) || 9999,
      credits: Number(process.env.YEARLY_PLAN_CREDITS) || 1500,
      durationDays: Number(process.env.YEARLY_PLAN_DURATION_DAYS) || 365,
      description: '1500 credits for the full year — best value'
    }
  ]
};

export function issuerUrl() {
  return config.apiUrl;
}

export function mcpResourceUrl() {
  return `${config.apiUrl}/mcp`;
}
