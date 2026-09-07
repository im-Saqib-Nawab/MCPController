import { Router } from 'express';

import { requireAdmin, requireSuperAdmin } from '../middleware/auth.middleware.js';
import * as deploymentController from '../controllers/deployment.controller.js';

const router = Router();

router.use(requireAdmin);

router.get('/overview', deploymentController.overview);
router.get('/audits', deploymentController.audits);

router.use(requireSuperAdmin);

router.patch('/canary-target', deploymentController.setCanaryTarget);
router.patch('/percentage', deploymentController.setPercentage);
router.patch('/enabled', deploymentController.setEnabled);
router.post('/rollback', deploymentController.rollback);
router.post('/promote', deploymentController.promote);
router.post('/sync-production-version', deploymentController.syncProductionVersion);

export default router;
