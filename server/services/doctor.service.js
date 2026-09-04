import mongoose from 'mongoose';
import { Doctor } from '../models/Doctor.js';
import { User } from '../models/User.js';
import { Appointment } from '../models/Appointment.js';
import { AppError } from '../middleware/error.middleware.js';
import { isAdmin, isDoctor, isPatient } from '../lib/roles.js';
import { paginateQuery } from '../lib/pagination.js';
import {
  defaultWeeklyAvailability,
  normalizeWeeklyAvailability,
  summarizeAvailability,
  upcomingDates,
  weekdayFromDate,
  todayUtcDateString
} from '../lib/availability.js';
import { defaultScopesForRole } from './permission.service.js';

function assertDoctorId(doctorId) {
  if (!mongoose.isValidObjectId(doctorId)) {
    throw new AppError(404, 'not_found', 'Doctor not found.');
  }
}

function ownsDoctor(actor, doctor) {
  if (!actor || !doctor?.userId) return false;
  return String(doctor.userId) === String(actor._id || actor.id);
}

function assertCanMutateDoctor(actor, doctor) {
  if (!actor) return;
  if (isAdmin(actor)) return;
  if (isDoctor(actor) && ownsDoctor(actor, doctor)) return;
  throw new AppError(403, 'forbidden', 'You can only update your own doctor profile.');
}

export async function listDoctors(pagination = {}) {
  return paginateQuery(Doctor, {}, {
    sort: { createdAt: -1 },
    pagination
  });
}

export async function getDoctor(doctorId) {
  assertDoctorId(doctorId);
  const doctor = await Doctor.findById(doctorId).lean();
  if (!doctor) {
    throw new AppError(404, 'not_found', 'Doctor not found.');
  }
  return doctor;
}

export async function getDoctorByUserId(userId) {
  if (!userId) return null;
  return Doctor.findOne({ userId }).lean();
}

export async function addDoctor(
  { name, specialization, email, phone, availability, weeklyAvailability, password },
  actor = null
) {
  if (actor && !isAdmin(actor)) {
    throw new AppError(403, 'forbidden', 'Only an administrator can create doctors.');
  }

  const schedule = normalizeWeeklyAvailability(weeklyAvailability);
  const notes = availability || summarizeAvailability(schedule);
  const normalizedEmail = String(email || '').toLowerCase().trim();

  let userId = null;
  if (password && normalizedEmail) {
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      throw new AppError(409, 'email_in_use', 'An account with this email already exists.');
    }

    const user = await User.create({
      name: String(name || '').trim(),
      email: normalizedEmail,
      password,
      role: 'doctor',
      phone: String(phone || '').trim(),
      allowedScopes: defaultScopesForRole('doctor')
    });
    userId = user._id;
  }

  return Doctor.create({
    userId,
    name,
    specialization,
    email: normalizedEmail,
    phone: phone || '',
    availability: notes,
    weeklyAvailability: schedule
  });
}

export async function updateDoctor(doctorId, fields, actor = null) {
  assertDoctorId(doctorId);
  const doctor = await Doctor.findById(doctorId);
  if (!doctor) {
    throw new AppError(404, 'not_found', 'Doctor not found.');
  }

  if (actor && isPatient(actor)) {
    throw new AppError(403, 'forbidden', 'Patients cannot modify doctor information.');
  }

  assertCanMutateDoctor(actor, doctor);

  for (const key of ['name', 'specialization', 'email', 'phone', 'availability']) {
    if (fields[key] !== undefined) {
      doctor[key] = fields[key];
    }
  }

  if (fields.weeklyAvailability !== undefined) {
    doctor.weeklyAvailability = normalizeWeeklyAvailability({
      ...doctor.weeklyAvailability?.toObject?.(),
      ...fields.weeklyAvailability
    });
    if (fields.availability === undefined) {
      doctor.availability = summarizeAvailability(doctor.weeklyAvailability);
    }
  }

  await doctor.save();

  if (doctor.userId && (fields.name !== undefined || fields.phone !== undefined)) {
    const updates = {};
    if (fields.name !== undefined) updates.name = doctor.name;
    if (fields.phone !== undefined) updates.phone = doctor.phone;
    await User.findByIdAndUpdate(doctor.userId, updates);
  }

  return doctor;
}

export async function updateAvailability(doctorId, weeklyAvailability, actor = null) {
  return updateDoctor(doctorId, { weeklyAvailability }, actor);
}

export async function deleteDoctor(doctorId, actor = null) {
  assertDoctorId(doctorId);
  if (actor && !isAdmin(actor)) {
    throw new AppError(403, 'forbidden', 'Only an administrator can delete doctors.');
  }

  const doctor = await Doctor.findByIdAndDelete(doctorId);
  if (!doctor) {
    throw new AppError(404, 'not_found', 'Doctor not found.');
  }

  await Appointment.updateMany(
    { doctorId: doctor._id, status: { $in: ['REQUESTED', 'ACCEPTED', 'ALTERNATIVE_OFFERED', 'RESCHEDULED'] } },
    { status: 'CANCELLED', rejectionReason: 'Doctor account was removed.' }
  );

  return doctor;
}

export async function acceptedDatesByDoctor(doctorIds, from = todayUtcDateString()) {
  const ids = doctorIds.map((id) => new mongoose.Types.ObjectId(String(id)));
  const rows = await Appointment.find({
    doctorId: { $in: ids },
    status: 'ACCEPTED',
    date: { $gte: from }
  })
    .select('doctorId date')
    .lean();

  const map = new Map();
  for (const row of rows) {
    const key = String(row.doctorId);
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(row.date);
  }
  return map;
}

export function buildSchedule(doctor, acceptedDates = new Set(), days = 21) {
  const weekly = normalizeWeeklyAvailability(doctor.weeklyAvailability);
  return upcomingDates(days).map((date) => {
    const weekday = weekdayFromDate(date);
    const standing = weekly[weekday];
    let status = 'not_available';
    if (standing === 'available') {
      status = acceptedDates.has(date) ? 'busy' : 'available';
    }
    return { date, weekday, standing, status };
  });
}

export function nextAvailableDate(schedule) {
  return schedule.find((item) => item.status === 'available')?.date || null;
}

export function serializeDoctor(doctor, extras = {}) {
  const weekly = normalizeWeeklyAvailability(doctor.weeklyAvailability);
  return {
    id: String(doctor._id),
    userId: doctor.userId ? String(doctor.userId) : null,
    name: doctor.name,
    specialization: doctor.specialization,
    email: doctor.email || '',
    phone: doctor.phone || '',
    availability: doctor.availability || summarizeAvailability(weekly),
    weeklyAvailability: weekly,
    createdAt: doctor.createdAt,
    updatedAt: doctor.updatedAt,
    ...extras
  };
}

export function serializeDoctorPublic(doctor, acceptedDates = new Set()) {
  const weekly = normalizeWeeklyAvailability(doctor.weeklyAvailability);
  const schedule = buildSchedule(doctor, acceptedDates);
  return serializeDoctor(doctor, {
    availableDays: Object.entries(weekly)
      .filter(([, value]) => value === 'available')
      .map(([day]) => day),
    nextAvailableDate: nextAvailableDate(schedule),
    schedule
  });
}

export async function listDoctorsPublic(pagination = {}) {
  const { items: doctors, pagination: meta } = await listDoctors(pagination);
  const accepted = await acceptedDatesByDoctor(doctors.map((doctor) => doctor._id));
  return {
    doctors: doctors.map((doctor) =>
      serializeDoctorPublic(doctor, accepted.get(String(doctor._id)) || new Set())
    ),
    pagination: meta
  };
}

export async function getDoctorPublic(doctorId) {
  const doctor = await getDoctor(doctorId);
  const accepted = await acceptedDatesByDoctor([doctor._id]);
  return serializeDoctorPublic(doctor, accepted.get(String(doctor._id)) || new Set());
}
