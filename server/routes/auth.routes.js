import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as authController from '../controllers/auth.controller.js';
import { requireUser } from '../middleware/auth.middleware.js';
import { createMongoRateLimitOptions } from '../lib/mongo-rate-limit-store.js';
import { shouldSkipRateLimit } from '../lib/rate-limit-policy.js';

const router = Router();

const authLimiter = rateLimit({
  ...createMongoRateLimitOptions({ windowMs: 15 * 60 * 1000, limit: 30 }),
  skip: shouldSkipRateLimit
});

router.post('/register', authLimiter, authController.register);
router.post('/login', authLimiter, authController.login);
router.post('/logout', requireUser, authController.logout);
router.get('/me', requireUser, authController.me);
router.patch('/me', requireUser, authController.updateMe);

export default router;
