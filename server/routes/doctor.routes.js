import { Router } from 'express';
import * as doctorController from '../controllers/doctor.controller.js';
import { requireUser } from '../middleware/auth.middleware.js';

const router = Router();

router.use(requireUser);
router.get('/', doctorController.listDoctors);

export default router;
