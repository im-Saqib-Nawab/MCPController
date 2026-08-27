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
/* OAuth error helper                                                         */
/* -------------------------------------------------------------------------- */

function sendOAuthError(res, err) {
  const status =
    Number.isInteger(err?.status)
      ? err.status
      : 400;

  return res
    .status(status)
    .json({
      error:
        err?.code ||
        'invalid_request',

      error_description:
        err?.message ||
        'OAuth request failed.'
    });
}

/* -------------------------------------------------------------------------- */
/* Authorization Server Metadata                                              */
/* -------------------------------------------------------------------------- */

export function metadata(_req, res) {
  return res
    .status(200)
    .json(
      authorizationServerMetadata()
    );
}

/* -------------------------------------------------------------------------- */
/* Protected Resource Metadata                                                */
/* -------------------------------------------------------------------------- */

export function resourceMetadata(_req, res) {
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
    const data =
      await previewAuthorization(
        req.query
      );

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

/**
 * ChatGPT starts OAuth here:
 *
 * GET /oauth/authorize
 *
 * In production this endpoint must NOT redirect back to
 * /oauth/authorize because that creates an infinite redirect loop.
 *
 * Instead, it sends the user to the React login page while preserving
 * the complete OAuth request.
 *
 * Example:
 *
 * ChatGPT
 *   ↓
 * /oauth/authorize?...OAuth parameters...
 *   ↓
 * /login?...OAuth parameters...
 *   ↓
 * Admin logs in
 *   ↓
 * Consent screen
 *   ↓
 * Allow
 *   ↓
 * /api/oauth/consent
 *   ↓
 * Authorization code
 *   ↓
 * ChatGPT callback
 */

export function authorizeBridge(
  req,
  res
) {
  try {
    /*
     * The React application handles the login UI.
     *
     * IMPORTANT:
     *
     * Do NOT redirect to:
     *
     *   /oauth/authorize
     *
     * because that would redirect back into this same function forever.
     */
    const target =
      new URL(
        '/login',
        `${config.appUrl}/`
      );

    /*
     * Preserve every OAuth parameter supplied by ChatGPT.
     *
     * This includes:
     *
     * response_type
     * client_id
     * redirect_uri
     * scope
     * code_challenge
     * code_challenge_method
     * resource
     * state
     * ui_locales
     */
    for (
      const [key, value]
      of Object.entries(
        req.query || {}
      )
    ) {
      if (
        value === undefined ||
        value === null
      ) {
        continue;
      }

      if (Array.isArray(value)) {
        target.searchParams.set(
          key,
          String(value[0])
        );
      } else {
        target.searchParams.set(
          key,
          String(value)
        );
      }
    }

    /*
     * Tell the React application that this is an OAuth login.
     */
    target.searchParams.set(
      'oauth',
      '1'
    );

    return res.redirect(
      302,
      target.toString()
    );
  } catch (err) {
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