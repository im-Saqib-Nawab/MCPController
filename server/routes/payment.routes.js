import { Router } from 'express';
import { requireUser } from '../middleware/auth.middleware.js';
import * as creditController from '../controllers/credit.controller.js';

const router = Router();

router.post('/dev-complete', requireUser, creditController.completeDevPayment);

export default router;
