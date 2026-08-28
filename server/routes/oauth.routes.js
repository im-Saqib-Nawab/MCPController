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
  skip: () => process.env.NODE_ENV === 'test'
});

/* -------------------------------------------------------------------------- */
/* Public OAuth 2.0 Protocol Endpoints                                        */
/* -------------------------------------------------------------------------- */

// Public: ChatGPT/MCP client initiates authorization
router.get('/authorize', oauthController.authorizeBridge);

// Public: Code exchange validated via PKCE inside service
router.post('/token', oauthLimiter, oauthController.token);

// Public: Dynamic Client Registration
router.post('/register', oauthLimiter, oauthController.register);

// Public: Token Revocation
router.post('/revoke', oauthLimiter, oauthController.revoke);

export default router;

/* -------------------------------------------------------------------------- */
/* Internal Admin API (Session Cookie Authenticated)                           */
/* -------------------------------------------------------------------------- */

export const oauthApiRouter = Router();

// Internal: Fetch OAuth request metadata for React Consent UI
oauthApiRouter.get('/request', requireUser, oauthController.preview);

// Internal: Admin approves or denies scope access
oauthApiRouter.post('/consent', requireUser, oauthController.consent);