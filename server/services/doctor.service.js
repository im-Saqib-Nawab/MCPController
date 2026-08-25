import mongoose from 'mongoose';
import { Doctor } from '../models/Doctor.js';
import { AppError } from '../middleware/error.middleware.js';

function assertDoctorId(doctorId) {
  if (!mongoose.isValidObjectId(doctorId)) {
    throw new AppError(404, 'not_found', 'Doctor not found.');
  }
}

/**
 * Doctor CRUD used by MCP tools and the Admin dashboard.
 * Permission checks happen before these functions are called (MCP tools / routes).
 */

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

export async function addDoctor({ name, specialization }) {
  return Doctor.create({ name, specialization });
}

export async function updateDoctor(doctorId, { name, specialization }) {
  assertDoctorId(doctorId);
  const doctor = await Doctor.findById(doctorId);
  if (!doctor) {
    throw new AppError(404, 'not_found', 'Doctor not found.');
  }
  if (name !== undefined) doctor.name = name;
  if (specialization !== undefined) doctor.specialization = specialization;
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
    createdAt: doctor.createdAt,
    updatedAt: doctor.updatedAt
  };
}
