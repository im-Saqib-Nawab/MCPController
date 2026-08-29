import path from 'node:path';
import fs from 'node:fs';

import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';

import { connectDatabase } from './config/database.js';
import { config } from './config/env.js';

import authRoutes from './routes/auth.routes.js';
import adminRoutes from './routes/admin.routes.js';
import connectionRoutes from './routes/connection.routes.js';
import doctorRoutes from './routes/doctor.routes.js';
import mcpRoutes from './routes/mcp.routes.js';
import oauthRoutes, {
  oauthApiRouter
} from './routes/oauth.routes.js';

import {
  metadata as oauthMetadata,
  resourceMetadata
} from './controllers/oauth.controller.js';

import { errorMiddleware } from './middleware/error.middleware.js';

const app = express();

/* -------------------------------------------------------------------------- */
/* Trust Proxy                                                                */
/* -------------------------------------------------------------------------- */

if (config.isProduction) {
  app.set('trust proxy', 1);
}

/* -------------------------------------------------------------------------- */
/* Security Headers                                                           */
/* -------------------------------------------------------------------------- */

app.use(
  helmet({
    contentSecurityPolicy: false,
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
          'X-Requested-With'
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

/* -------------------------------------------------------------------------- */
/* Database Middleware (Runs before all routes)                                */
/* -------------------------------------------------------------------------- */

app.use(async (req, _res, next) => {
  /*
   * Bypass DB connection check for static assets.
   */
  if (
    /\.(?:js|css|map|ico|png|jpg|jpeg|gif|svg|webp|woff2?|ttf)$/i.test(
      req.path
    )
  ) {
    return next();
  }

  try {
    await connectDatabase();
    next();
  } catch (err) {
    next(err);
  }
});

/* -------------------------------------------------------------------------- */
/* Health Check Endpoint                                                      */
/* -------------------------------------------------------------------------- */

app.get('/health', (_req, res) => {
  res.status(200).json({
    ok: true,
    service: config.mcpServerName,
    version: config.mcpServerVersion,
    environment: config.nodeEnv
  });
});

app.get('/api/health', (_req, res) => {
  res.status(200).json({
    ok: true,
    name: config.mcpServerName,
    version: config.mcpServerVersion
  });
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