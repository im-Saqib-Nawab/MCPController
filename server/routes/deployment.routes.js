import { Router } from 'express';

import { requireAdmin, requireSuperAdmin, requireDeploymentManager } from '../middleware/auth.middleware.js';
import * as deploymentController from '../controllers/deployment.controller.js';

const router = Router();

router.use(requireAdmin);

router.get('/overview', deploymentController.overview);
router.get('/audits', deploymentController.audits);

router.use(requireDeploymentManager);

router.patch('/canary-target', deploymentController.setCanaryTarget);
router.patch('/percentage', deploymentController.setPercentage);
router.patch('/enabled', deploymentController.setEnabled);
router.post('/rollback', deploymentController.rollback);
router.post('/promote', deploymentController.promote);
router.post('/sync-production-version', deploymentController.syncProductionVersion);

router.use(requireSuperAdmin);

router.post('/managers/grant', deploymentController.grantManager);
router.post('/managers/revoke', deploymentController.revokeManager);

export default router;
