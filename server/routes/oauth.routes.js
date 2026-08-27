import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import * as oauthController from '../controllers/oauth.controller.js';

import { requireUser } from '../middleware/auth.middleware.js';

const router = Router();

/* -------------------------------------------------------------------------- */
/* Rate limiting                                                              */
/* -------------------------------------------------------------------------- */

const oauthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,

  skip: () =>
    process.env.NODE_ENV === 'test'
});

/* -------------------------------------------------------------------------- */
/* OAuth Authorization Endpoint                                               */
/* -------------------------------------------------------------------------- */

/*
 * ChatGPT calls:
 *
 * GET /oauth/authorize
 *
 * Example:
 *
 * /oauth/authorize
 *   ?response_type=code
 *   &client_id=...
 *   &redirect_uri=...
 *   &scope=...
 *   &code_challenge=...
 *   &code_challenge_method=S256
 *   &resource=...
 *   &state=...
 *
 * This route MUST exist in production.
 *
 * Do not conditionally register it based on APP_URL/API_URL because
 * in production both normally use the same origin.
 */
router.get(
  '/authorize',
  oauthController.authorizeBridge
);

/* -------------------------------------------------------------------------- */
/* OAuth Token Endpoint                                                       */
/* -------------------------------------------------------------------------- */

/*
 * ChatGPT calls this endpoint after the user approves access.
 *
 * POST /oauth/token
 */
router.post(
  '/token',
  oauthLimiter,
  oauthController.token
);

/* -------------------------------------------------------------------------- */
/* Dynamic Client Registration                                                */
/* -------------------------------------------------------------------------- */

/*
 * POST /oauth/register
 */
router.post(
  '/register',
  oauthLimiter,
  oauthController.register
);

/* -------------------------------------------------------------------------- */
/* Token Revocation                                                           */
/* -------------------------------------------------------------------------- */

/*
 * POST /oauth/revoke
 */
router.post(
  '/revoke',
  oauthLimiter,
  oauthController.revoke
);

export default router;

/* -------------------------------------------------------------------------- */
/* Internal OAuth API                                                         */
/* -------------------------------------------------------------------------- */

/*
 * These endpoints are used by the React admin consent UI.
 *
 * They require the administrator to already be logged in.
 */

export const oauthApiRouter = Router();

/*
 * Preview OAuth authorization request.
 */
oauthApiRouter.get(
  '/request',
  requireUser,
  oauthController.preview
);

/*
 * Approve OAuth authorization request.
 */
oauthApiRouter.post(
  '/consent',
  requireUser,
  oauthController.consent
);