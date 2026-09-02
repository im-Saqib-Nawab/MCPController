import { Router } from 'express';
import { requireAdmin } from '../middleware/auth.middleware.js';
import * as adminController from '../controllers/admin.controller.js';
import * as observabilityController from '../controllers/observability.controller.js';
import * as testCenterController from '../controllers/testCenter.controller.js';

const router = Router();

router.use(requireAdmin);
router.get('/users', adminController.listAllUsers);
router.patch('/users/:userId/permissions', adminController.updatePermissions);
router.get('/scopes', adminController.listScopeOptions);
router.get('/stats', adminController.stats);
router.get('/feature-flags', adminController.listFlags);
router.get('/feature-flags/:key', adminController.getFlag);
router.patch('/feature-flags/:key', adminController.patchFlag);

router.get('/observability/overview', observabilityController.overview);
router.get('/observability/filters', observabilityController.filters);
router.get('/observability/metrics', observabilityController.metrics);
router.get('/observability/logs', observabilityController.logs);
router.get('/observability/logs/:logId', observabilityController.logDetail);
router.get('/observability/traces', observabilityController.traces);
router.get('/observability/traces/:requestId', observabilityController.traceDetail);

router.get('/testing/config', testCenterController.config);
router.get('/testing/status', testCenterController.status);
router.post('/testing/start', testCenterController.start);
router.post('/testing/stop', testCenterController.stop);
router.get('/testing/runs', testCenterController.runs);
router.get('/testing/runs/:runId', testCenterController.runDetail);
router.get('/testing/live-observability', testCenterController.liveObservability);
router.get('/testing/traces/:requestId', testCenterController.traceDetail);

export default router;
