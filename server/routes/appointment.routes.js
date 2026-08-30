import { Router } from 'express';
import * as appointmentController from '../controllers/appointment.controller.js';
import { requireUser } from '../middleware/auth.middleware.js';

const router = Router();

router.use(requireUser);
router.get('/', appointmentController.listAppointments);
router.post('/', appointmentController.createAppointment);
router.get('/:appointmentId', appointmentController.getAppointment);
router.patch('/:appointmentId', appointmentController.updateAppointment);
router.post('/:appointmentId/accept', appointmentController.acceptAppointment);
router.post('/:appointmentId/reject', appointmentController.rejectAppointment);
router.post('/:appointmentId/suggest', appointmentController.suggestAlternative);
router.post('/:appointmentId/accept-alternative', appointmentController.acceptAlternative);
router.post('/:appointmentId/cancel', appointmentController.cancelAppointment);
router.post('/:appointmentId/complete', appointmentController.completeAppointment);

export default router;
