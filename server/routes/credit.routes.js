import { Router } from 'express';
import { requireUser } from '../middleware/auth.middleware.js';
import * as creditController from '../controllers/credit.controller.js';

const router = Router();

router.get('/summary', requireUser, creditController.getSummary);
router.get('/history', requireUser, creditController.getHistory);
router.get('/plans', requireUser, creditController.listPlans);
router.post('/checkout', requireUser, creditController.createCheckout);
router.get('/payment/:orderId', requireUser, creditController.getPaymentStatus);
router.post('/purchase/complete', requireUser, creditController.getPurchaseResult);

export default router;
