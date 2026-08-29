import { Router } from 'express';
import { requireUser, requireAdmin } from '../middleware/auth.middleware.js';
import * as connectionController from '../controllers/connection.controller.js';

const router = Router();

router.get('/admin/all', requireAdmin, connectionController.adminListConnections);
router.use(requireUser);
router.get('/', connectionController.listConnections);
router.delete('/:clientId', connectionController.revokeConnection);

export default router;
