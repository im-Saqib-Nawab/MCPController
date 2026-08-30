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
import { logError, logOperation, getRequestContext } from '../lib/request-context.js';

/* -------------------------------------------------------------------------- */
/* OAuth error helper                                                         */
/* -------------------------------------------------------------------------- */

function sendOAuthError(res, err) {
  const status =
    Number.isInteger(err?.status)
      ? err.status
      : 400;

  const ctx = getRequestContext();

  logError(err, {
    operation: 'oauth.error',
    statusCode: status,
    errorCode: err?.code || 'invalid_request'
  });

  return res
    .status(status)
    .json({
      error:
        err?.code ||
        'invalid_request',

      error_description:
        err?.message ||
        'OAuth request failed.',

      request_id: ctx?.requestId
    });
}

/* -------------------------------------------------------------------------- */
/* Authorization Server Metadata                                              */
/* -------------------------------------------------------------------------- */

export function metadata(req, res) {
  logOperation('debug', 'oauth.discovery.authorization_server', {
    route: req.path
  });

  return res
    .status(200)
    .json(
      authorizationServerMetadata()
    );
}

/* -------------------------------------------------------------------------- */
/* Protected Resource Metadata                                                */
/* -------------------------------------------------------------------------- */

export function resourceMetadata(req, res) {
  logOperation('debug', 'oauth.discovery.protected_resource', {
    route: req.path
  });

  return res
    .status(200)
    .json(
      protectedResourceMetadata()
    );
}

/* -------------------------------------------------------------------------- */
/* Dynamic Client Registration                                                */
/* -------------------------------------------------------------------------- */

export async function register(
  req,
  res,
  next
) {
  try {
    const created =
      await registerClient(
        req.body || {}
      );

    logOperation('info', 'oauth.client.registered', {
      clientId: created.client_id
    });

    return res
      .status(201)
      .json(created);
  } catch (err) {
    return next(err);
  }
}

/* -------------------------------------------------------------------------- */
/* OAuth Token Revocation                                                     */
/* -------------------------------------------------------------------------- */

export async function revoke(
  req,
  res
) {
  try {
    const result =
      await revokeToken(req);

    logOperation('info', 'oauth.token.revoke.requested', {
      revoked: result.revoked
    });

    return res.json(result);
  } catch (err) {
    return sendOAuthError(
      res,
      err
    );
  }
}

/* -------------------------------------------------------------------------- */
/* OAuth Authorization Preview                                                */
/* -------------------------------------------------------------------------- */

export async function preview(
  req,
  res,
  next
) {
  try {
    const data = await previewAuthorization(req.query, req.user);

    return res.json(data);
  } catch (err) {
    return next(err);
  }
}

/* -------------------------------------------------------------------------- */
/* OAuth Consent                                                              */
/* -------------------------------------------------------------------------- */

export async function consent(
  req,
  res,
  next
) {
  try {
    const {
      decision,
      scopes,
      query
    } = req.body || {};

    if (
      !query ||
      typeof query !== 'object'
    ) {
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
      const denied =
        await denyAuthorization(
          query
        );

      logOperation('info', 'oauth.consent.denied', {
        userId: String(req.user._id),
        clientId: query?.client_id
      });

      return res.json(
        denied
      );
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

    const result =
      await createAuthorizationCode({
        user:
          req.user,

        query,

        grantedScopes:
          scopes
      });

    logOperation('info', 'oauth.consent.allowed', {
      userId: String(req.user._id),
      clientId: query?.client_id,
      scopeCount: Array.isArray(scopes) ? scopes.length : undefined
    });

    return res.json(
      result
    );
  } catch (err) {
    return next(err);
  }
}

/* -------------------------------------------------------------------------- */
/* OAuth Token Endpoint                                                       */
/* -------------------------------------------------------------------------- */

export async function token(
  req,
  res
) {
  res.setHeader(
    'Cache-Control',
    'no-store'
  );

  res.setHeader(
    'Pragma',
    'no-cache'
  );

  try {
    const tokens =
      await exchangeToken(req);

    logOperation('info', 'oauth.token.exchange.completed', {
      grantType: req.body?.grant_type
    });

    return res
      .status(200)
      .json(tokens);
  } catch (err) {
    return sendOAuthError(
      res,
      err
    );
  }
}

/* -------------------------------------------------------------------------- */
/* OAuth Authorization Bridge                                                */
/* -------------------------------------------------------------------------- */

function buildConsentPath(query = {}) {
  const target = new URL('/authorize', `${config.appUrl}/`);

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    target.searchParams.set(key, Array.isArray(value) ? String(value[0]) : String(value));
  }

  return `${target.pathname}${target.search}`;
}

function buildLoginPath(query = {}) {
  const returnTo = buildConsentPath(query);
  const target = new URL('/login', `${config.appUrl}/`);
  target.searchParams.set('returnTo', returnTo);
  return target.toString();
}

/**
 * OAuth authorization endpoint (RFC 6749).
 *
 * ChatGPT opens GET /oauth/authorize with PKCE parameters.
 * Authenticated users go to the React consent page (/authorize).
 * Unauthenticated users go to /login with a returnTo pointing back to consent.
 */
export function authorizeBridge(req, res) {
  try {
    const clientId = req.query?.client_id;

    if (req.user) {
      logOperation('info', 'oauth.authorize.redirect_consent', {
        userId: String(req.user._id),
        clientId
      });

      return res.redirect(302, buildConsentPath(req.query));
    }

    logOperation('info', 'oauth.authorize.redirect_login', {
      clientId
    });

    return res.redirect(302, buildLoginPath(req.query));
  } catch (err) {
    logError(err, { operation: 'oauth.authorize.failed' });

    return sendOAuthError(
      res,
      new AppError(400, 'invalid_request', 'Unable to start authorization.')
    );
  }
}