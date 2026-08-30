import { Router } from 'express';
import * as doctorController from '../controllers/doctor.controller.js';
import { requireUser } from '../middleware/auth.middleware.js';

const router = Router();

router.use(requireUser);
router.get('/', doctorController.listDoctors);
router.post('/', doctorController.createDoctor);
router.get('/:doctorId', doctorController.getDoctor);
router.patch('/:doctorId', doctorController.updateDoctor);
router.patch('/:doctorId/availability', doctorController.updateAvailability);
router.delete('/:doctorId', doctorController.removeDoctor);

export default router;
