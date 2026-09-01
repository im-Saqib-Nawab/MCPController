import { Router } from 'express';
import * as medicineController from '../controllers/medicine.controller.js';
import { requireUser } from '../middleware/auth.middleware.js';

const router = Router();

router.use(requireUser);
router.get('/', medicineController.listMedicines);
router.post('/', medicineController.createMedicine);
router.get('/:medicineId', medicineController.getMedicine);
router.patch('/:medicineId', medicineController.updateMedicine);
router.delete('/:medicineId', medicineController.deleteMedicine);

export default router;
