import {
  authorizationServerMetadata,
  createAuthorizationCode,
  denyAuthorization,
  exchangeToken,
  previewAuthorization,
  protectedResourceMetadata,
  queryFromConsent,
  registerClient,
  revokeToken
} from '../services/oauth.service.js';
import { config } from '../config/env.js';
import { AppError } from '../middleware/error.middleware.js';

function sendOAuthError(res, err) {
  const status = err.status || 400;
  res.status(status).json({
    error: err.code || 'invalid_request',
    error_description: err.message
  });
}

export function metadata(_req, res) {
  res.json(authorizationServerMetadata());
}

export function resourceMetadata(_req, res) {
  res.json(protectedResourceMetadata());
}

export async function register(req, res, next) {
  try {
    const created = await registerClient(req.body || {});
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
}

export async function revoke(req, res, next) {
  try {
    const token = req.body?.token || req.body?.access_token || req.body?.refresh_token;
    const result = await revokeToken(token);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function preview(req, res, next) {
  try {
    const data = await previewAuthorization(req.query);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function consent(req, res, next) {
  try {
    const { decision, scopes, query } = req.body || {};
    if (decision === 'deny') {
      const denied = await denyAuthorization(query);
      return res.json(denied);
    }
    if (decision !== 'allow') {
      throw new AppError(400, 'invalid_request', 'decision must be allow or deny.');
    }
    const result = await createAuthorizationCode({
      user: req.user,
      query,
      grantedScopes: scopes
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function token(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  try {
    const tokens = await exchangeToken(req);
    res.json(tokens);
  } catch (err) {
    sendOAuthError(res, err);
  }
}

export function authorizeBridge(req, res) {
  // ChatGPT opens the authorization_endpoint in a browser. The consent UI is
  // the React page. In development that page lives on Vite (APP_URL); in
  // production Express serves the same path from the built SPA.
  const target = new URL('/oauth/authorize', `${config.appUrl}/`);
  for (const [key, value] of Object.entries(req.query)) {
    if (value !== undefined) target.searchParams.set(key, String(value));
  }
  res.redirect(target.toString());
}
