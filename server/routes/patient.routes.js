import { Router } from 'express';
import * as patientController from '../controllers/patient.controller.js';
import { requireUser } from '../middleware/auth.middleware.js';

const router = Router();

router.use(requireUser);
router.get('/', patientController.listPatients);
router.post('/', patientController.createPatient);
router.get('/:patientId', patientController.getPatient);
router.patch('/:patientId', patientController.updatePatient);
router.delete('/:patientId', patientController.removePatient);

export default router;
