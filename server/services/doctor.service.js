import mongoose from 'mongoose';
import { Doctor } from '../models/Doctor.js';
import { AppError } from '../middleware/error.middleware.js';

function assertDoctorId(doctorId) {
  if (!mongoose.isValidObjectId(doctorId)) {
    throw new AppError(404, 'not_found', 'Doctor not found.');
  }
}

export async function listDoctors() {
  return Doctor.find().sort({ createdAt: -1 }).lean();
}

export async function getDoctor(doctorId) {
  assertDoctorId(doctorId);
  const doctor = await Doctor.findById(doctorId).lean();
  if (!doctor) {
    throw new AppError(404, 'not_found', 'Doctor not found.');
  }
  return doctor;
}

export async function addDoctor({ name, specialization, email, phone, availability }) {
  return Doctor.create({
    name,
    specialization,
    email: email || '',
    phone: phone || '',
    availability: availability || ''
  });
}

export async function updateDoctor(doctorId, fields) {
  assertDoctorId(doctorId);
  const doctor = await Doctor.findById(doctorId);
  if (!doctor) {
    throw new AppError(404, 'not_found', 'Doctor not found.');
  }

  for (const key of ['name', 'specialization', 'email', 'phone', 'availability']) {
    if (fields[key] !== undefined) {
      doctor[key] = fields[key];
    }
  }

  await doctor.save();
  return doctor;
}

export async function deleteDoctor(doctorId) {
  assertDoctorId(doctorId);
  const doctor = await Doctor.findByIdAndDelete(doctorId);
  if (!doctor) {
    throw new AppError(404, 'not_found', 'Doctor not found.');
  }
  return doctor;
}

export function serializeDoctor(doctor) {
  return {
    id: String(doctor._id),
    name: doctor.name,
    specialization: doctor.specialization,
    email: doctor.email || '',
    phone: doctor.phone || '',
    availability: doctor.availability || '',
    createdAt: doctor.createdAt,
    updatedAt: doctor.updatedAt
  };
}
