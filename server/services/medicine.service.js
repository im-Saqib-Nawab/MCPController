import mongoose from 'mongoose';
import { Medicine } from '../models/Medicine.js';
import { Doctor } from '../models/Doctor.js';
import { AppError } from '../middleware/error.middleware.js';
import { isAdmin, isDoctor, isPatient } from '../lib/roles.js';
import { MEDICINE_CATEGORIES } from '../lib/medicines.js';
import {
  assertCanManageMedicines,
  assertCanViewMedicines,
  getOrCreateFlag,
  isDoctorIncluded,
  listAllowedDoctorIds
} from './featureFlag.service.js';
import { getDoctorByUserId } from './doctor.service.js';

export function serializeMedicine(medicine, doctor = null) {
  return {
    id: String(medicine._id),
    name: medicine.name,
    usedFor: medicine.usedFor,
    careTips: medicine.careTips || '',
    warnings: medicine.warnings || '',
    category: medicine.category,
    doctorId: String(medicine.doctorId),
    doctor: doctor
      ? {
          id: String(doctor._id || doctor.id),
          name: doctor.name,
          specialization: doctor.specialization
        }
      : undefined,
    createdAt: medicine.createdAt,
    updatedAt: medicine.updatedAt
  };
}

function assertMedicineId(id) {
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError(404, 'not_found', 'Medicine not found.');
  }
}

function assertCategory(category) {
  if (category !== undefined && !MEDICINE_CATEGORIES.includes(category)) {
    throw new AppError(400, 'invalid_request', 'Invalid medicine category.');
  }
}

async function assertCanViewDoctorMedicines(actor, doctorId) {
  await assertCanViewMedicines(actor);
  if (isAdmin(actor)) return;

  if (isPatient(actor)) {
    const flag = await getOrCreateFlag();
    if (!isDoctorIncluded(flag, doctorId)) {
      throw new AppError(
        403,
        'feature_disabled',
        'Medicines from this doctor are not available.'
      );
    }
  }
}

async function doctorRecordForActor(actor) {
  return getDoctorByUserId(actor._id || actor.id);
}

async function allowedDoctorFilter(actor) {
  if (isAdmin(actor)) return null;

  if (isDoctor(actor)) {
    const doctor = await doctorRecordForActor(actor);
    if (!doctor) {
      throw new AppError(403, 'feature_disabled', 'Doctor profile not found.');
    }
    return { doctorId: doctor._id };
  }

  if (isPatient(actor)) {
    const flag = await getOrCreateFlag();
    const doctorIds = await listAllowedDoctorIds(flag);
    return { doctorId: { $in: doctorIds } };
  }

  throw new AppError(403, 'feature_disabled', 'Medicine & Health Tips is not available for your account.');
}

export async function listMedicines(actor, { doctorId } = {}) {
  await assertCanViewMedicines(actor);

  const filter = (await allowedDoctorFilter(actor)) || {};

  if (doctorId) {
    assertMedicineId(doctorId);
    await assertCanViewDoctorMedicines(actor, doctorId);
    filter.doctorId = new mongoose.Types.ObjectId(String(doctorId));
  }

  const medicines = await Medicine.find(filter).sort({ category: 1, name: 1 }).lean();
  const doctorIds = [...new Set(medicines.map((item) => String(item.doctorId)))];
  const doctors = await Doctor.find({ _id: { $in: doctorIds } }).lean();
  const doctorMap = new Map(doctors.map((doctor) => [String(doctor._id), doctor]));

  return medicines.map((medicine) =>
    serializeMedicine(medicine, doctorMap.get(String(medicine.doctorId)) || null)
  );
}

export async function getMedicine(medicineId, actor) {
  assertMedicineId(medicineId);
  const medicine = await Medicine.findById(medicineId).lean();
  if (!medicine) {
    throw new AppError(404, 'not_found', 'Medicine not found.');
  }

  await assertCanViewDoctorMedicines(actor, medicine.doctorId);

  const doctor = await Doctor.findById(medicine.doctorId).lean();
  return serializeMedicine(medicine, doctor);
}

export async function createMedicine(actor, fields) {
  await assertCanManageMedicines(actor);
  assertCategory(fields.category);

  let doctorId = fields.doctorId;
  if (isDoctor(actor)) {
    const doctor = await doctorRecordForActor(actor);
    if (!doctor) {
      throw new AppError(403, 'forbidden', 'Doctor profile not found.');
    }
    doctorId = String(doctor._id);
  } else if (isAdmin(actor)) {
    if (!doctorId || !mongoose.isValidObjectId(doctorId)) {
      throw new AppError(400, 'invalid_request', 'doctorId is required.');
    }
    const doctor = await Doctor.findById(doctorId).lean();
    if (!doctor) {
      throw new AppError(404, 'not_found', 'Doctor not found.');
    }
  }

  const medicine = await Medicine.create({
    name: String(fields.name || '').trim(),
    usedFor: String(fields.usedFor || '').trim(),
    careTips: String(fields.careTips || '').trim(),
    warnings: String(fields.warnings || '').trim(),
    category: fields.category || 'Other',
    doctorId,
    createdBy: actor._id || actor.id || null
  });

  const doctor = await Doctor.findById(medicine.doctorId).lean();
  return serializeMedicine(medicine.toObject(), doctor);
}

export async function updateMedicine(medicineId, actor, fields) {
  assertMedicineId(medicineId);
  await assertCanManageMedicines(actor);
  assertCategory(fields.category);

  const medicine = await Medicine.findById(medicineId);
  if (!medicine) {
    throw new AppError(404, 'not_found', 'Medicine not found.');
  }

  if (isDoctor(actor)) {
    const doctor = await doctorRecordForActor(actor);
    if (!doctor || String(medicine.doctorId) !== String(doctor._id)) {
      throw new AppError(403, 'forbidden', 'You can only update your own medicines.');
    }
  }

  if (fields.name !== undefined) medicine.name = String(fields.name).trim();
  if (fields.usedFor !== undefined) medicine.usedFor = String(fields.usedFor).trim();
  if (fields.careTips !== undefined) medicine.careTips = String(fields.careTips).trim();
  if (fields.warnings !== undefined) medicine.warnings = String(fields.warnings).trim();
  if (fields.category !== undefined) medicine.category = fields.category;

  await medicine.save();

  const doctor = await Doctor.findById(medicine.doctorId).lean();
  return serializeMedicine(medicine.toObject(), doctor);
}

export async function deleteMedicine(medicineId, actor) {
  assertMedicineId(medicineId);
  await assertCanManageMedicines(actor);

  const medicine = await Medicine.findById(medicineId);
  if (!medicine) {
    throw new AppError(404, 'not_found', 'Medicine not found.');
  }

  if (isDoctor(actor)) {
    const doctor = await doctorRecordForActor(actor);
    if (!doctor || String(medicine.doctorId) !== String(doctor._id)) {
      throw new AppError(403, 'forbidden', 'You can only delete your own medicines.');
    }
  }

  await medicine.deleteOne();
  return { ok: true };
}
