import {
  authorizationServerMetadata,
  createAuthorizationCode,
  denyAuthorization,
  exchangeToken,
  previewAuthorization,
  protectedResourceMetadata,
  registerClient,
  revokeToken
} from '../services/oauth.service.js';

import { config } from '../config/env.js';
import { AppError } from '../middleware/error.middleware.js';

/* -------------------------------------------------------------------------- */
/* OAuth Error Helper                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Formats and sends standard RFC 6749 OAuth JSON error responses.
 */
function sendOAuthError(res, err) {
  const status = Number.isInteger(err?.status) ? err.status : 400;

  return res.status(status).json({
    error: err?.code || 'invalid_request',
    error_description: err?.message || 'OAuth request failed.'
  });
}

/* -------------------------------------------------------------------------- */
/* Authorization Server Metadata                                              */
/* -------------------------------------------------------------------------- */

export function metadata(_req, res) {
  return res.status(200).json(authorizationServerMetadata());
}

/* -------------------------------------------------------------------------- */
/* Protected Resource Metadata                                                */
/* -------------------------------------------------------------------------- */

export function resourceMetadata(_req, res) {
  return res.status(200).json(protectedResourceMetadata());
}

/* -------------------------------------------------------------------------- */
/* Dynamic Client Registration                                                */
/* -------------------------------------------------------------------------- */

export async function register(req, res, next) {
  try {
    const created = await registerClient(req.body || {});

    return res.status(201).json(created);
  } catch (err) {
    return next(err);
  }
}

/* -------------------------------------------------------------------------- */
/* OAuth Token Revocation                                                     */
/* -------------------------------------------------------------------------- */

export async function revoke(req, res) {
  try {
    const result = await revokeToken(req);

    return res.status(200).json(result);
  } catch (err) {
    return sendOAuthError(res, err);
  }
}

/* -------------------------------------------------------------------------- */
/* OAuth Authorization Preview                                                */
/* -------------------------------------------------------------------------- */

/**
 * Called by the authenticated React admin UI.
 *
 * The browser reaches /oauth/authorize, which redirects to /login while
 * preserving query params. After login, the React app calls:
 *
 *   GET /api/oauth/request
 */
export async function preview(req, res, next) {
  try {
    const data = await previewAuthorization(req.query);

    return res.status(200).json(data);
  } catch (err) {
    return next(err);
  }
}

/* -------------------------------------------------------------------------- */
/* OAuth Consent                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Called by the Admin UI after the administrator chooses Allow or Deny.
 */
export async function consent(req, res, next) {
  try {
    const { decision, scopes, query } = req.body || {};

    if (!query || typeof query !== 'object' || Array.isArray(query)) {
      throw new AppError(
        400,
        'invalid_request',
        'Authorization query is required.'
      );
    }

    /* ---------------------------------------------------------------------- */
    /* Deny                                                                   */
    /* ---------------------------------------------------------------------- */

    if (decision === 'deny') {
      const denied = await denyAuthorization(query);

      return res.status(200).json(denied);
    }

    /* ---------------------------------------------------------------------- */
    /* Validate decision                                                      */
    /* ---------------------------------------------------------------------- */

    if (decision !== 'allow') {
      throw new AppError(
        400,
        'invalid_request',
        'decision must be allow or deny.'
      );
    }

    /* ---------------------------------------------------------------------- */
    /* Create authorization code                                              */
    /* ---------------------------------------------------------------------- */

    const result = await createAuthorizationCode({
      user: req.user,
      query,
      grantedScopes: scopes
    });

    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

/* -------------------------------------------------------------------------- */
/* OAuth Token Endpoint                                                       */
/* -------------------------------------------------------------------------- */

/**
 * OAuth client exchanges authorization code for access tokens here.
 *
 * Notes:
 * - Never store or return tokens in cookies.
 * - Set HTTP Cache-Control headers to prevent token response caching.
 */
export async function token(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');

  try {
    const tokens = await exchangeToken(req);

    return res.status(200).json(tokens);
  } catch (err) {
    return sendOAuthError(res, err);
  }
}

/* -------------------------------------------------------------------------- */
/* OAuth Authorization Bridge                                                */
/* -------------------------------------------------------------------------- */

/**
 * Entry point used by OAuth clients:
 *
 *   GET /oauth/authorize?...oauth parameters...
 *
 * Redirects user to the React login UI (/login) preserving all OAuth
 * query parameters to avoid redirect loops.
 */
export function authorizeBridge(req, res) {
  try {
    const target = new URL('/login', `${config.appUrl}/`);

    /*
     * Preserve all parameters supplied by the OAuth client.
     */
    for (const [key, value] of Object.entries(req.query || {})) {
      if (value === undefined || value === null) {
        continue;
      }

      if (Array.isArray(value)) {
        if (value.length > 0) {
          target.searchParams.set(key, String(value[0]));
        }
      } else {
        target.searchParams.set(key, String(value));
      }
    }

    /*
     * Flag used by the front-end to identify OAuth-driven logins.
     */
    target.searchParams.set('oauth', '1');

    return res.redirect(302, target.toString());
  } catch {
    return sendOAuthError(
      res,
      new AppError(
        400,
        'invalid_request',
        'Unable to start authorization.'
      )
    );
  }
}