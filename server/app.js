import path from 'node:path';
import fs from 'node:fs';

import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import { connectDatabase, pingDatabase } from './config/database.js';
import { config, deploymentConfigErrors } from './config/env.js';
import { createMongoRateLimitOptions } from './lib/mongo-rate-limit-store.js';
import { metricsHandler } from './routes/metrics.routes.js';

import authRoutes from './routes/auth.routes.js';
import adminRoutes from './routes/admin.routes.js';
import connectionRoutes from './routes/connection.routes.js';
import doctorRoutes from './routes/doctor.routes.js';
import patientRoutes from './routes/patient.routes.js';
import appointmentRoutes from './routes/appointment.routes.js';
import medicineRoutes from './routes/medicine.routes.js';
import creditRoutes from './routes/credit.routes.js';
import paymentRoutes from './routes/payment.routes.js';
import mcpRoutes from './routes/mcp.routes.js';
import oauthRoutes, {
  oauthApiRouter
} from './routes/oauth.routes.js';

import {
  metadata as oauthMetadata,
  resourceMetadata
} from './controllers/oauth.controller.js';

import { errorMiddleware, AppError } from './middleware/error.middleware.js';
import { requestLogMiddleware } from './middleware/request-log.middleware.js';
import { csrfProtection } from './middleware/csrf.middleware.js';
import { shouldSkipRateLimit } from './lib/rate-limit-policy.js';

const app = express();

/* -------------------------------------------------------------------------- */
/* Trust Proxy                                                                */
/* -------------------------------------------------------------------------- */

if (config.isProduction) {
  app.set('trust proxy', 1);
}

/* -------------------------------------------------------------------------- */
/* Vercel path normalization                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Vercel rewrites can leave `req.url` as `/api` while `req.originalUrl` keeps
 * the public path (for example `/api/auth/login`). Express routes match `req.url`,
 * so restore the original pathname before any routing middleware runs.
 */
function vercelRequestPathMiddleware(req, res, next) {
  if (!process.env.VERCEL) {
    return next();
  }

  const originalPath = req.originalUrl?.split('?')[0] || '';
  const currentPath = req.url?.split('?')[0] || '';

  if (originalPath && currentPath && originalPath !== currentPath) {
    const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    req.url = `${originalPath}${query}`;
  }

  next();
}

app.use(vercelRequestPathMiddleware);

/* -------------------------------------------------------------------------- */
/* Security Headers                                                           */
/* -------------------------------------------------------------------------- */

app.use(
  helmet({
    contentSecurityPolicy: config.isProduction
      ? {
          directives: {
            defaultSrc: ["'self'"],
            baseUri: ["'self'"],
            fontSrc: ["'self'"],
            formAction: ["'self'"],
            frameAncestors: ["'none'"],
            imgSrc: ["'self'", 'data:', 'blob:'],
            objectSrc: ["'none'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            connectSrc: ["'self'"]
          }
        }
      : false,
    crossOriginOpenerPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' }
  })
);

/* -------------------------------------------------------------------------- */
/* CORS Configuration                                                         */
/* -------------------------------------------------------------------------- */

const allowedOrigins = new Set(
  [
    config.appUrl,
    config.apiUrl,
    'http://localhost:5173',
    'http://127.0.0.1:5173'
  ].filter(Boolean)
);

function isOAuthOrMcpEndpoint(req) {
  const pathname = String(req.path || '');
  return (
    pathname === '/mcp' ||
    pathname.startsWith('/mcp/') ||
    pathname === '/oauth/token' ||
    pathname === '/oauth/register' ||
    pathname === '/oauth/revoke' ||
    pathname === '/oauth/authorize' ||
    pathname === '/.well-known/oauth-authorization-server' ||
    pathname === '/.well-known/openid-configuration' ||
    pathname === '/.well-known/oauth-protected-resource' ||
    pathname.startsWith('/.well-known/oauth-protected-resource/')
  );
}

app.use(
  cors((req, callback) => {
    const origin = req.headers.origin;

    /*
     * External clients (ChatGPT, MCP clients, curl, server-to-server)
     */
    if (isOAuthOrMcpEndpoint(req) || !origin) {
      return callback(null, {
        origin: true,
        credentials: false,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: [
          'Content-Type',
          'Authorization',
          'Accept',
          'Origin',
          'X-Requested-With',
          'MCP-Protocol-Version',
          'Mcp-Protocol-Version',
          'mcp-session-id'
        ],
        exposedHeaders: [
          'WWW-Authenticate',
          'Mcp-Session-Id',
          'MCP-Protocol-Version'
        ],
        maxAge: 86400
      });
    }

    /*
     * Internal React Dashboard / API requests
     */
    if (allowedOrigins.has(origin)) {
      return callback(null, {
        origin: true,
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: [
          'Content-Type',
          'Authorization',
          'Accept',
          'Origin',
          'X-Requested-With',
          'X-CSRF-Token'
        ]
      });
    }

    return callback(null, {
      origin: false,
      credentials: true
    });
  })
);

/* -------------------------------------------------------------------------- */
/* Request Body & Cookie Parsing                                              */
/* -------------------------------------------------------------------------- */

app.use(
  express.urlencoded({
    extended: false,
    limit: '100kb'
  })
);

app.use(
  express.json({
    limit: '100kb'
  })
);

app.use(cookieParser());

function isStaticAsset(pathname) {
  return /\.(?:js|css|map|ico|png|jpg|jpeg|gif|svg|webp|woff2?|ttf)$/i.test(pathname);
}

function isLivenessRoute(pathname) {
  return pathname === '/health/live' || pathname === '/api/health/live';
}

function livenessPayload() {
  return {
    ok: true,
    service: config.mcpServerName,
    version: config.mcpServerVersion,
    environment: config.nodeEnv
  };
}

/* -------------------------------------------------------------------------- */
/* Health Check Endpoints (before rate limits and DB middleware)              */
/* -------------------------------------------------------------------------- */

app.get('/health/live', (_req, res) => {
  res.status(200).json(livenessPayload());
});

app.get('/api/health/live', (_req, res) => {
  res.status(200).json(livenessPayload());
});

app.get('/health', (_req, res) => {
  res.status(200).json(livenessPayload());
});

app.get('/api/health', (_req, res) => {
  if (deploymentConfigErrors.length) {
    return res.status(503).json({
      ok: false,
      name: config.mcpServerName,
      version: config.mcpServerVersion,
      configErrors: deploymentConfigErrors
    });
  }

  res.status(200).json({
    ok: true,
    name: config.mcpServerName,
    version: config.mcpServerVersion
  });
});

app.get('/health/ready', async (_req, res) => {
  try {
    await connectDatabase();
    const database = (await pingDatabase()) ? 'connected' : 'disconnected';
    if (database !== 'connected') {
      return res.status(503).json({ ok: false, database });
    }
    return res.status(200).json({ ok: true, database, environment: config.nodeEnv });
  } catch {
    return res.status(503).json({ ok: false, database: 'disconnected' });
  }
});

app.get('/api/health/ready', async (_req, res) => {
  try {
    await connectDatabase();
    const database = (await pingDatabase()) ? 'connected' : 'disconnected';
    if (database !== 'connected') {
      return res.status(503).json({ ok: false, database });
    }
    return res.status(200).json({ ok: true, database, environment: config.nodeEnv });
  } catch {
    return res.status(503).json({ ok: false, database: 'disconnected' });
  }
});

app.get('/metrics', metricsHandler);
app.get('/api/metrics', metricsHandler);

const apiLimiter = rateLimit({
  ...createMongoRateLimitOptions({ windowMs: 15 * 60 * 1000, limit: 300 }),
  skip: shouldSkipRateLimit
});

app.use('/api', apiLimiter);
app.use(csrfProtection);

/* -------------------------------------------------------------------------- */
/* Request logging & correlation IDs                                          */
/* -------------------------------------------------------------------------- */

app.use(requestLogMiddleware);

function isConfigDiagnosticRoute(pathname) {
  return (
    pathname === '/health/live' ||
    pathname === '/api/health/live' ||
    pathname === '/health' ||
    pathname === '/api/health'
  );
}

app.use((req, res, next) => {
  if (!deploymentConfigErrors.length || isConfigDiagnosticRoute(req.path)) {
    return next();
  }

  return res.status(503).json({
    error: 'misconfigured',
    message: deploymentConfigErrors[0],
    configErrors: deploymentConfigErrors
  });
});

/* -------------------------------------------------------------------------- */
/* Database Middleware (Runs before all routes)                                */
/* -------------------------------------------------------------------------- */

app.use(async (req, _res, next) => {
  /*
   * Bypass DB connection check for static assets and liveness probes.
   */
  if (isStaticAsset(req.path) || isLivenessRoute(req.path)) {
    return next();
  }

  try {
    await connectDatabase();
    next();
  } catch (err) {
    next(
      new AppError(
        503,
        'service_unavailable',
        'Database connection failed. Verify MONGODB_URI is set and reachable from Vercel.'
      )
    );
  }
});

/* -------------------------------------------------------------------------- */
/* OAuth / MCP Discovery Endpoints                                            */
/* -------------------------------------------------------------------------- */

app.get(
  '/.well-known/oauth-authorization-server',
  oauthMetadata
);

app.get(
  '/.well-known/openid-configuration',
  oauthMetadata
);

app.get(
  '/.well-known/oauth-protected-resource',
  resourceMetadata
);

app.get(
  '/.well-known/oauth-protected-resource/mcp',
  resourceMetadata
);

/* -------------------------------------------------------------------------- */
/* Application & OAuth Routes                                                 */
/* -------------------------------------------------------------------------- */

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/connections', connectionRoutes);
app.use('/api/doctors', doctorRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/medicines', medicineRoutes);
app.use('/api/credits', creditRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/oauth', oauthApiRouter);

app.use('/oauth', oauthRoutes);
app.use('/mcp', mcpRoutes);

/* -------------------------------------------------------------------------- */
/* Root Route                                                                 */
/* -------------------------------------------------------------------------- */

app.get('/', (_req, res) => {
  if (!config.isProduction) {
    return res.json({
      name: config.mcpServerName,
      version: config.mcpServerVersion,
      status: 'running'
    });
  }

  return res.sendFile(path.join(config.clientDist, 'index.html'));
});

/* -------------------------------------------------------------------------- */
/* Production Static Files & SPA Fallback                                      */
/* -------------------------------------------------------------------------- */

if (fs.existsSync(config.clientDist)) {
  app.use(
    express.static(config.clientDist, {
      index: false,
      fallthrough: true,
      maxAge: config.isProduction ? '1h' : 0
    })
  );
}

app.get('/{*splat}', (req, res, next) => {
  const pathname = req.path;

  /*
   * Express 5 & path-to-regexp safe wildcard handler.
   * Ensures backend routes never serve index.html.
   */
  if (
    pathname.startsWith('/api/') ||
    pathname === '/api' ||
    pathname.startsWith('/oauth/') ||
    pathname === '/oauth' ||
    pathname === '/mcp' ||
    pathname.startsWith('/mcp/') ||
    pathname.startsWith('/.well-known/')
  ) {
    return next();
  }

  const indexFile = path.join(config.clientDist, 'index.html');

  if (!fs.existsSync(indexFile)) {
    return next();
  }

  return res.sendFile(indexFile, (err) => {
    if (err) {
      next(err);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Error Handlers                                                             */
/* -------------------------------------------------------------------------- */

/* 404 Catch-All Handler */
app.use((req, res) => {
  res.status(404).json({
    error: 'not_found',
    message: `Route not found: ${req.method} ${req.path}`
  });
});

/* Central Error Handler */
app.use(errorMiddleware);

export default app;