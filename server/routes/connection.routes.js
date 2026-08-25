import { Router } from 'express';
import { requireUser } from '../middleware/auth.middleware.js';
import * as connectionController from '../controllers/connection.controller.js';

const router = Router();
router.use(requireUser);
router.get('/', connectionController.listConnections);
router.delete('/:clientId', connectionController.revokeConnection);

export default router;
