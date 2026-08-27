import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import * as oauthController from '../controllers/oauth.controller.js';

import { requireUser } from '../middleware/auth.middleware.js';

import { config } from '../config/env.js';

const router = Router();

const oauthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,

  skip: () =>
    process.env.NODE_ENV === 'test'
});

/*
 * OAuth token endpoint.
 *
 * This must remain publicly reachable because ChatGPT
 * calls it directly after receiving the authorization code.
 */
router.post(
  '/token',
  oauthLimiter,
  oauthController.token
);

/*
 * Dynamic Client Registration.
 */
router.post(
  '/register',
  oauthLimiter,
  oauthController.register
);

/*
 * Token revocation.
 */
router.post(
  '/revoke',
  oauthLimiter,
  oauthController.revoke
);

/*
 * Local development only:
 *
 * Express API:
 *   http://localhost:3000/oauth/authorize
 *
 * React/Vite:
 *   http://localhost:5173/oauth/authorize
 *
 * In production both are normally the same origin.
 */
if (
  config.appUrl !==
  config.apiUrl
) {
  router.get(
    '/authorize',
    oauthController.authorizeBridge
  );
}

export default router;

/*
 * Internal API used by the React consent UI.
 *
 * These routes DO require the admin's logged-in session.
 */
export const oauthApiRouter =
  Router();

oauthApiRouter.get(
  '/request',
  requireUser,
  oauthController.preview
);

oauthApiRouter.post(
  '/consent',
  requireUser,
  oauthController.consent
);