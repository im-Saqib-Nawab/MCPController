import express from 'express';
import path from 'node:path';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { config } from './config/env.js';
import { connectDatabase } from './config/database.js';
import { errorMiddleware, AppError } from './middleware/error.middleware.js';
import authRoutes from './routes/auth.routes.js';
import oauthRoutes, { oauthApiRouter } from './routes/oauth.routes.js';
import connectionRoutes from './routes/connection.routes.js';
import doctorRoutes from './routes/doctor.routes.js';
import mcpRoutes from './routes/mcp.routes.js';
import * as oauthController from './controllers/oauth.controller.js';

const app = express();

app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginOpenerPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' }
  })
);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

app.use(async (req, res, next) => {
  if (/\.(?:js|css|map|ico|png|svg|woff2?)$/i.test(req.path)) {
    return next();
  }
  try {
    await connectDatabase();
    next();
  } catch (err) {
    next(err);
  }
});

const allowedOrigins = new Set([config.appUrl, config.apiUrl]);

app.use(
  cors((req, callback) => {
    // Metadata, token, and MCP endpoints are called by MCP clients (not the
    // React origin). They need permissive CORS. The dashboard API keeps a
    // credentialed origin allow-list.
    const open =
      req.path.startsWith('/.well-known') ||
      req.path.startsWith('/oauth/token') ||
      req.path.startsWith('/oauth/register') ||
      req.path.startsWith('/oauth/revoke') ||
      req.path.startsWith('/mcp');
    if (open) {
      callback(null, { origin: true });
      return;
    }
    callback(null, {
      origin: (origin, cb) => {
        if (!origin || allowedOrigins.has(origin)) cb(null, true);
        else cb(new Error('Not allowed by CORS'));
      },
      credentials: true
    });
  })
);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, name: config.mcpServerName, version: config.mcpServerVersion });
});

app.use('/api/auth', authRoutes);
app.use('/api/connections', connectionRoutes);
app.use('/api/doctors', doctorRoutes);
app.use('/api/oauth', oauthApiRouter);
app.use('/oauth', oauthRoutes);
app.use('/mcp', mcpRoutes);

// RFC 8414 + RFC 9728 discovery. MCP clients start here after a 401 from /mcp.
app.get('/.well-known/oauth-authorization-server', oauthController.metadata);
app.get('/.well-known/openid-configuration', oauthController.metadata);
app.get('/.well-known/oauth-protected-resource', oauthController.resourceMetadata);
app.get('/.well-known/oauth-protected-resource/mcp', oauthController.resourceMetadata);

app.use((err, req, res, next) => {
  if (err.name === 'ZodError') {
    return next(new AppError(400, 'invalid_request', 'Validation failed', err.issues));
  }
  next(err);
});

if (config.isProduction) {
  app.use(express.static(config.clientDist));
  app.get('/{*splat}', (req, res, next) => {
    if (
      req.path.startsWith('/api') ||
      req.path.startsWith('/mcp') ||
      req.path.startsWith('/oauth/token') ||
      req.path.startsWith('/oauth/revoke')
    ) {
      return next();
    }
    res.sendFile(path.join(config.clientDist, 'index.html'), (err) => {
      if (err) next(err);
    });
  });
}

app.use(errorMiddleware);

export default app;
