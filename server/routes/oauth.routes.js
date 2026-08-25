import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as oauthController from '../controllers/oauth.controller.js';
import { requireUser } from '../middleware/auth.middleware.js';
import { config } from '../config/env.js';

const router = Router();

const tokenLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false
});

router.post('/token', tokenLimiter, oauthController.token);
router.post('/register', tokenLimiter, oauthController.register);

// Only used in local development, when the React UI runs on Vite (APP_URL)
// and Express runs on another origin (API_URL). In production they are the
// same origin, so GET /oauth/authorize is the React page served as the SPA.
if (config.appUrl !== config.apiUrl) {
  router.get('/authorize', oauthController.authorizeBridge);
}

export default router;

export const oauthApiRouter = Router();
oauthApiRouter.get('/request', requireUser, oauthController.preview);
oauthApiRouter.post('/consent', requireUser, oauthController.consent);
