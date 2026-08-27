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

function sendOAuthError(res, err) {
  const status =
    Number.isInteger(err?.status)
      ? err.status
      : 400;

  res
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

export function metadata(_req, res) {
  res
    .status(200)
    .json(
      authorizationServerMetadata()
    );
}

export function resourceMetadata(
  _req,
  res
) {
  res
    .status(200)
    .json(
      protectedResourceMetadata()
    );
}

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

    res
      .status(201)
      .json(created);
  } catch (err) {
    next(err);
  }
}

export async function revoke(
  req,
  res
) {
  try {
    const result =
      await revokeToken(req);

    res.json(result);
  } catch (err) {
    sendOAuthError(
      res,
      err
    );
  }
}

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

    res.json(data);
  } catch (err) {
    next(err);
  }
}

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

    if (!query || typeof query !== 'object') {
      throw new AppError(
        400,
        'invalid_request',
        'Authorization query is required.'
      );
    }

    if (decision === 'deny') {
      const denied =
        await denyAuthorization(
          query
        );

      return res.json(
        denied
      );
    }

    if (decision !== 'allow') {
      throw new AppError(
        400,
        'invalid_request',
        'decision must be allow or deny.'
      );
    }

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
    next(err);
  }
}

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

    res
      .status(200)
      .json(tokens);
  } catch (err) {
    sendOAuthError(
      res,
      err
    );
  }
}

export function authorizeBridge(
  req,
  res
) {
  try {
    /*
     * In local development:
     *
     * ChatGPT -> Express /oauth/authorize
     *          -> Vite /oauth/authorize
     */
    const target =
      new URL(
        '/oauth/authorize',
        `${config.appUrl}/`
      );

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