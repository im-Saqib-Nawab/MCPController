import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { Appointment } from '../models/Appointment.js';
import { AppError } from '../middleware/error.middleware.js';
import { isAdmin, isDoctor, isPatient, normalizeRole, ROLES } from '../lib/roles.js';
import { defaultScopesForRole } from './permission.service.js';
import { serializeUser } from './auth.service.js';
import { getDoctorByUserId } from './doctor.service.js';
import { config } from '../config/env.js';

function assertPatientId(patientId) {
  if (!mongoose.isValidObjectId(patientId)) {
    throw new AppError(404, 'not_found', 'Patient not found.');
  }
}

function userId(user) {
  return String(user?._id || user?.id || '');
}

function serializePatient(user) {
  return serializeUser(user);
}

export async function listPatients(actor) {
  if (isAdmin(actor)) {
    const users = await User.find({ role: { $in: ['patient', 'user'] } }).sort({ createdAt: -1 }).lean();
    return users.map(serializePatient);
  }

  if (isDoctor(actor)) {
    const doctor = await getDoctorByUserId(userId(actor));
    if (!doctor) return [];
    const rows = await Appointment.find({ doctorId: doctor._id }).select('patientId').lean();
    const ids = [...new Set(rows.map((row) => String(row.patientId)))];
    if (!ids.length) return [];
    const users = await User.find({ _id: { $in: ids } }).sort({ name: 1 }).lean();
    return users.map(serializePatient);
  }

  throw new AppError(403, 'forbidden', 'You cannot list patients.');
}

export async function getPatient(patientId, actor) {
  assertPatientId(patientId);
  const user = await User.findById(patientId).lean();
  if (!user || !['patient', 'user'].includes(user.role)) {
    throw new AppError(404, 'not_found', 'Patient not found.');
  }

  if (isAdmin(actor) || (isPatient(actor) && userId(actor) === String(user._id))) {
    return serializePatient(user);
  }

  if (isDoctor(actor)) {
    const doctor = await getDoctorByUserId(userId(actor));
    const related = doctor
      ? await Appointment.exists({ doctorId: doctor._id, patientId: user._id })
      : null;
    if (related) return serializePatient(user);
  }

  throw new AppError(403, 'forbidden', 'You cannot access this patient.');
}

export async function addPatient({ name, email, password, phone, age, gender, bio }, actor = null) {
  if (actor && !isAdmin(actor)) {
    throw new AppError(403, 'forbidden', 'Only an administrator can create patients.');
  }

  const normalizedEmail = String(email || '').toLowerCase().trim();
  if (normalizedEmail === config.adminEmail.toLowerCase().trim()) {
    throw new AppError(409, 'registration_not_allowed', 'This email is reserved for the administrator account.');
  }

  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) {
    throw new AppError(409, 'email_in_use', 'An account with this email already exists.');
  }

  const user = await User.create({
    name: String(name || '').trim(),
    email: normalizedEmail,
    password,
    role: ROLES.PATIENT,
    phone: String(phone || '').trim(),
    age: age === undefined || age === null || age === '' ? null : Number(age),
    gender: ['male', 'female', 'other'].includes(String(gender || '')) ? gender : '',
    bio: String(bio || '').trim(),
    allowedScopes: defaultScopesForRole(ROLES.PATIENT)
  });

  return serializePatient(user);
}

export async function updatePatient(patientId, fields, actor) {
  assertPatientId(patientId);
  const user = await User.findById(patientId);
  if (!user || !['patient', 'user'].includes(user.role)) {
    throw new AppError(404, 'not_found', 'Patient not found.');
  }

  const self = isPatient(actor) && userId(actor) === String(user._id);
  if (!isAdmin(actor) && !self) {
    throw new AppError(403, 'forbidden', 'You can only update your own patient profile.');
  }

  for (const key of ['name', 'phone', 'bio']) {
    if (fields[key] !== undefined) {
      user[key] = String(fields[key] || '').trim();
    }
  }

  if (fields.age !== undefined) {
    user.age = fields.age === null || fields.age === '' ? null : Number(fields.age);
  }

  if (fields.gender !== undefined) {
    user.gender = ['male', 'female', 'other', ''].includes(fields.gender) ? fields.gender : user.gender;
  }

  await user.save();
  return serializePatient(user);
}

export async function deletePatient(patientId, actor) {
  if (!isAdmin(actor)) {
    throw new AppError(403, 'forbidden', 'Only an administrator can delete patients.');
  }

  assertPatientId(patientId);
  const user = await User.findById(patientId);
  if (!user || normalizeRole(user.role) !== ROLES.PATIENT) {
    throw new AppError(404, 'not_found', 'Patient not found.');
  }

  await Appointment.updateMany(
    { patientId: user._id, status: { $in: ['REQUESTED', 'ACCEPTED', 'ALTERNATIVE_OFFERED', 'RESCHEDULED'] } },
    { status: 'CANCELLED', rejectionReason: 'Patient account was removed.' }
  );
  await user.deleteOne();
  return { deleted: true, patientId: String(user._id) };
}
