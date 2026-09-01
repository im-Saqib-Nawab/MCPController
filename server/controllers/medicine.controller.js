import { z } from 'zod';
import * as medicineService from '../services/medicine.service.js';
import { AppError } from '../middleware/error.middleware.js';
import { MEDICINE_CATEGORIES } from '../lib/medicines.js';
import { logAudit } from '../lib/audit-log.js';

const categorySchema = z.enum(MEDICINE_CATEGORIES);

const createSchema = z.object({
  name: z.string().min(1, 'Name is required.'),
  usedFor: z.string().min(1, 'Used for is required.'),
  careTips: z.string().optional(),
  warnings: z.string().optional(),
  category: categorySchema.optional(),
  doctorId: z.string().optional()
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  usedFor: z.string().min(1).optional(),
  careTips: z.string().optional(),
  warnings: z.string().optional(),
  category: categorySchema.optional()
});

function parseOrThrow(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new AppError(400, 'invalid_request', result.error.issues[0]?.message || 'Validation failed');
  }
  return result.data;
}

export async function listMedicines(req, res, next) {
  try {
    const medicines = await medicineService.listMedicines(req.user, {
      doctorId: req.query.doctorId
    });
    res.json({ medicines });
  } catch (err) {
    next(err);
  }
}

export async function getMedicine(req, res, next) {
  try {
    const medicine = await medicineService.getMedicine(req.params.medicineId, req.user);
    res.json({ medicine });
  } catch (err) {
    next(err);
  }
}

export async function createMedicine(req, res, next) {
  req.auditAction = 'Create Medicine';
  try {
    const parsed = parseOrThrow(createSchema, req.body);
    const medicine = await medicineService.createMedicine(req.user, parsed);
    logAudit(req.user, req.auditAction, { status: 'success', metadata: { medicineId: medicine.id } });
    res.status(201).json({ medicine });
  } catch (err) {
    next(err);
  }
}

export async function updateMedicine(req, res, next) {
  req.auditAction = 'Update Medicine';
  try {
    const parsed = parseOrThrow(updateSchema, req.body);
    const medicine = await medicineService.updateMedicine(req.params.medicineId, req.user, parsed);
    logAudit(req.user, req.auditAction, { status: 'success', metadata: { medicineId: medicine.id } });
    res.json({ medicine });
  } catch (err) {
    next(err);
  }
}

export async function deleteMedicine(req, res, next) {
  req.auditAction = 'Delete Medicine';
  try {
    await medicineService.deleteMedicine(req.params.medicineId, req.user);
    logAudit(req.user, req.auditAction, { status: 'success', metadata: { medicineId: req.params.medicineId } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}
