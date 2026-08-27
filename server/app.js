import express from 'express';
import path from 'node:path';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';

import { config } from './config/env.js';
import { connectDatabase } from './config/database.js';

import {
  errorMiddleware,
  AppError
} from './middleware/error.middleware.js';

import authRoutes from './routes/auth.routes.js';
import oauthRoutes, {
  oauthApiRouter
} from './routes/oauth.routes.js';

import connectionRoutes from './routes/connection.routes.js';
import doctorRoutes from './routes/doctor.routes.js';
import mcpRoutes from './routes/mcp.routes.js';

import * as oauthController from './controllers/oauth.controller.js';

const app = express();

app.set(
  'trust proxy',
  1
);

/* -------------------------------------------------------------------------- */
/* Security                                                                   */
/* -------------------------------------------------------------------------- */

app.use(
  helmet({
    contentSecurityPolicy: false,

    /*
     * OAuth authorization can be opened by ChatGPT
     * in a browser context.
     */
    crossOriginOpenerPolicy: false,

    crossOriginResourcePolicy: {
      policy: 'cross-origin'
    }
  })
);

/* -------------------------------------------------------------------------- */
/* Body parsers                                                               */
/* -------------------------------------------------------------------------- */

app.use(
  express.json({
    limit: '1mb'
  })
);

app.use(
  express.urlencoded({
    extended: false
  })
);

app.use(
  cookieParser()
);

/* -------------------------------------------------------------------------- */
/* Database                                                                   */
/* -------------------------------------------------------------------------- */

/*
 * Static files do not need a database connection.
 *
 * Everything else gets a database connection before
 * reaching the route.
 */
app.use(
  async (req, res, next) => {
    if (
      /\.(?:js|css|map|ico|png|jpg|jpeg|gif|svg|webp|woff2?|ttf)$/i.test(
        req.path
      )
    ) {
      return next();
    }

    try {
      await connectDatabase();
      return next();
    } catch (err) {
      return next(err);
    }
  }
);

/* -------------------------------------------------------------------------- */
/* CORS                                                                      */
/* -------------------------------------------------------------------------- */

const allowedOrigins =
  new Set(
    [
      config.appUrl,
      config.apiUrl
    ]
      .filter(Boolean)
      .map(String)
  );

function isOAuthOrMcpEndpoint(req) {
  const path =
    String(
      req.path || ''
    );

  return (
    path === '/mcp' ||
    path.startsWith('/mcp/') ||

    path === '/oauth/token' ||
    path === '/oauth/register' ||
    path === '/oauth/revoke' ||
    path === '/oauth/authorize' ||

    path ===
      '/.well-known/oauth-authorization-server' ||

    path ===
      '/.well-known/openid-configuration' ||

    path ===
      '/.well-known/oauth-protected-resource' ||

    path.startsWith(
      '/.well-known/oauth-protected-resource/'
    )
  );
}

app.use(
  cors((req, callback) => {
    const origin =
      req.headers.origin;

    /*
     * MCP/OAuth endpoints are consumed by external
     * clients such as ChatGPT.
     */
    if (
      isOAuthOrMcpEndpoint(req)
    ) {
      return callback(null, {
        origin: true,
        credentials: false,

        methods: [
          'GET',
          'POST',
          'OPTIONS'
        ],

        allowedHeaders: [
          'Content-Type',
          'Authorization',
          'Accept',
          'MCP-Protocol-Version',
          'Mcp-Protocol-Version',
          'mcp-session-id'
        ],

        exposedHeaders: [
          'WWW-Authenticate',
          'Mcp-Session-Id'
        ],

        maxAge: 86400
      });
    }

    /*
     * Normal React/API requests.
     */
    if (
      !origin ||
      allowedOrigins.has(origin)
    ) {
      return callback(null, {
        origin: true,
        credentials: true
      });
    }

    return callback(null, {
      origin: false,
      credentials: true
    });
  })
);

/* -------------------------------------------------------------------------- */
/* Routes                                                                     */
/* -------------------------------------------------------------------------- */

app.get(
  '/api/health',
  (_req, res) => {
    res.json({
      ok: true,

      name:
        config.mcpServerName,

      version:
        config.mcpServerVersion
    });
  }
);

app.use(
  '/api/auth',
  authRoutes
);

app.use(
  '/api/connections',
  connectionRoutes
);

app.use(
  '/api/doctors',
  doctorRoutes
);

app.use(
  '/api/oauth',
  oauthApiRouter
);

app.use(
  '/oauth',
  oauthRoutes
);

app.use(
  '/mcp',
  mcpRoutes
);

/* -------------------------------------------------------------------------- */
/* OAuth / MCP discovery                                                      */
/* -------------------------------------------------------------------------- */

app.get(
  '/.well-known/oauth-authorization-server',
  oauthController.metadata
);

app.get(
  '/.well-known/openid-configuration',
  oauthController.metadata
);

app.get(
  '/.well-known/oauth-protected-resource',
  oauthController.resourceMetadata
);

app.get(
  '/.well-known/oauth-protected-resource/mcp',
  oauthController.resourceMetadata
);

/* -------------------------------------------------------------------------- */
/* Zod errors                                                                 */
/* -------------------------------------------------------------------------- */

app.use(
  (err, req, res, next) => {
    if (
      err?.name ===
      'ZodError'
    ) {
      return next(
        new AppError(
          400,
          'invalid_request',
          'Validation failed',
          err.issues
        )
      );
    }

    return next(err);
  }
);

/* -------------------------------------------------------------------------- */
/* Production SPA                                                             */
/* -------------------------------------------------------------------------- */

if (config.isProduction) {
  app.use(
    express.static(
      config.clientDist
    )
  );

  app.get(
    '/{*splat}',
    (req, res, next) => {
      const requestPath =
        String(
          req.path || ''
        );

      /*
       * NEVER send index.html for these routes.
       *
       * Otherwise ChatGPT can receive HTML where it expects
       * JSON from OAuth/MCP endpoints.
       */
      const isBackendRoute =
        requestPath === '/mcp' ||
        requestPath.startsWith('/mcp/') ||

        requestPath.startsWith('/api/') ||

        requestPath === '/oauth' ||
        requestPath.startsWith('/oauth/') ||

        requestPath.startsWith(
          '/.well-known/'
        );

      if (isBackendRoute) {
        return next();
      }

      return res.sendFile(
        path.join(
          config.clientDist,
          'index.html'
        ),
        (err) => {
          if (err) {
            next(err);
          }
        }
      );
    }
  );
}

/* -------------------------------------------------------------------------- */
/* Error handler                                                              */
/* -------------------------------------------------------------------------- */

app.use(
  errorMiddleware
);

export default app;