import { Router } from 'express';
import { requireAdmin } from '../middleware/auth.middleware.js';
import * as adminController from '../controllers/admin.controller.js';
import * as observabilityController from '../controllers/observability.controller.js';

const router = Router();

router.use(requireAdmin);
router.get('/users', adminController.listAllUsers);
router.patch('/users/:userId/permissions', adminController.updatePermissions);
router.get('/scopes', adminController.listScopeOptions);
router.get('/stats', adminController.stats);

router.get('/observability/overview', observabilityController.overview);
router.get('/observability/filters', observabilityController.filters);
router.get('/observability/metrics', observabilityController.metrics);
router.get('/observability/logs', observabilityController.logs);
router.get('/observability/logs/:logId', observabilityController.logDetail);
router.get('/observability/traces', observabilityController.traces);
router.get('/observability/traces/:requestId', observabilityController.traceDetail);

export default router;
