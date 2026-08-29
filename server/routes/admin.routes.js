import { Router } from 'express';
import { requireAdmin } from '../middleware/auth.middleware.js';
import * as adminController from '../controllers/admin.controller.js';

const router = Router();

router.use(requireAdmin);
router.get('/users', adminController.listAllUsers);
router.patch('/users/:userId/permissions', adminController.updatePermissions);
router.get('/scopes', adminController.listScopeOptions);

export default router;
