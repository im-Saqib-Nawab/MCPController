import mongoose from 'mongoose';
import { Appointment, ACTIVE_REQUEST_STATUSES } from '../models/Appointment.js';
import { Doctor } from '../models/Doctor.js';
import { User } from '../models/User.js';
import { AppError } from '../middleware/error.middleware.js';
import { isAdmin, isDoctor, isPatient } from '../lib/roles.js';
import {
  isValidDateString,
  weekdayFromDate,
  weekdayLabel,
  todayUtcDateString,
  upcomingDates,
  normalizeWeeklyAvailability
} from '../lib/availability.js';
import { getDoctorByUserId, serializeDoctor } from './doctor.service.js';

function serializeDoctorBrief(doctor) {
  return {
    id: String(doctor._id),
    name: doctor.name,
    specialization: doctor.specialization
  };
}
import { paginateQuery } from '../lib/pagination.js';
import { withOptionalTransaction } from '../lib/transactions.js';

function assertId(id, label) {
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError(404, 'not_found', `${label} not found.`);
  }
}

function userId(user) {
  return String(user?._id || user?.id || '');
}

async function actorDoctor(actor) {
  if (!actor || !isDoctor(actor)) return null;
  return getDoctorByUserId(userId(actor));
}

export async function suggestAvailableDates(doctorId, excludeDate, limit = 3) {
  const doctor = await Doctor.findById(doctorId).lean();
  if (!doctor) return [];

  const weekly = normalizeWeeklyAvailability(doctor.weeklyAvailability);
  const accepted = await Appointment.find({
    doctorId,
    status: 'ACCEPTED',
    date: { $gte: todayUtcDateString() }
  })
    .select('date')
    .lean();
  const taken = new Set(accepted.map((row) => row.date));
  if (excludeDate) taken.add(excludeDate);

  return upcomingDates(28).filter((date) => {
    const weekday = weekdayFromDate(date);
    return weekly[weekday] === 'available' && !taken.has(date);
  }).slice(0, limit);
}

function serializeAppointmentRow(appointment, patientMap, doctorMap) {
  const patient = patientMap.get(String(appointment.patientId)) || null;
  const doctor = doctorMap.get(String(appointment.doctorId)) || null;

  return {
    id: String(appointment._id),
    patientId: String(appointment.patientId),
    doctorId: String(appointment.doctorId),
    date: appointment.date,
    weekday: appointment.weekday,
    weekdayLabel: weekdayLabel(appointment.weekday),
    status: appointment.status,
    suggestedDates: appointment.suggestedDates || [],
    rejectionReason: appointment.rejectionReason || '',
    responseNote: appointment.responseNote || '',
    requestedAt: appointment.requestedAt,
    createdAt: appointment.createdAt,
    updatedAt: appointment.updatedAt,
    patient: patient
      ? {
          id: String(patient._id),
          name: patient.name,
          email: patient.email,
          phone: patient.phone || ''
        }
      : null,
    doctor: doctor ? serializeDoctorBrief(doctor) : null
  };
}

async function serializeAppointment(appointment) {
  const [patient, doctor] = await Promise.all([
    User.findById(appointment.patientId).select('name email phone').lean(),
    Doctor.findById(appointment.doctorId).lean()
  ]);

  const patientMap = patient ? new Map([[String(patient._id), patient]]) : new Map();
  const doctorMap = doctor ? new Map([[String(doctor._id), doctor]]) : new Map();
  return serializeAppointmentRow(appointment, patientMap, doctorMap);
}

async function serializeAppointments(appointments) {
  if (!appointments.length) return [];

  const patientIds = [...new Set(appointments.map((row) => String(row.patientId)))];
  const doctorIds = [...new Set(appointments.map((row) => String(row.doctorId)))];

  const [patients, doctors] = await Promise.all([
    User.find({ _id: { $in: patientIds } }).select('name email phone').lean(),
    Doctor.find({ _id: { $in: doctorIds } }).lean()
  ]);

  const patientMap = new Map(patients.map((row) => [String(row._id), row]));
  const doctorMap = new Map(doctors.map((row) => [String(row._id), row]));

  return appointments.map((appointment) =>
    serializeAppointmentRow(appointment, patientMap, doctorMap)
  );
}

function canViewAppointment(actor, appointment, actorDoctorId) {
  if (!actor) return false;
  if (isAdmin(actor)) return true;
  if (isPatient(actor) && String(appointment.patientId) === userId(actor)) return true;
  if (isDoctor(actor) && actorDoctorId && String(appointment.doctorId) === String(actorDoctorId)) {
    return true;
  }
  return false;
}

export async function listMyAppointments(actor, filters = {}) {
  if (isAdmin(actor)) {
    throw new AppError(403, 'forbidden', 'Administrators should use list_appointments with filters.');
  }
  return listAppointments(actor, filters);
}

export async function listDoctorAppointmentRequests(actor, filters = {}) {
  if (!isDoctor(actor) && !isAdmin(actor)) {
    throw new AppError(403, 'forbidden', 'Only doctors can list appointment requests.');
  }

  const result = await listAppointments(actor, {
    ...filters,
    status: filters.status || { $in: ACTIVE_REQUEST_STATUSES }
  });

  return result;
}

export async function listAppointments(actor, filters = {}) {
  const { page, limit, status, doctorId, patientId, date } = filters;
  const query = {};
  let doctor = null;

  if (isPatient(actor) && !isAdmin(actor)) {
    query.patientId = userId(actor);
  } else if (isDoctor(actor) && !isAdmin(actor)) {
    doctor = await actorDoctor(actor);
    if (!doctor) {
      throw new AppError(404, 'not_found', 'Doctor profile not found.');
    }
    query.doctorId = doctor._id;
  }

  if (status) query.status = status;
  if (doctorId && isAdmin(actor)) query.doctorId = doctorId;
  if (patientId && isAdmin(actor)) query.patientId = patientId;
  if (date) query.date = date;

  const { items, pagination } = await paginateQuery(Appointment, query, {
    sort: { date: 1, createdAt: -1 },
    pagination: { page, limit }
  });

  return {
    appointments: await serializeAppointments(items),
    pagination
  };
}

export async function getAppointment(appointmentId, actor) {
  assertId(appointmentId, 'Appointment');
  const appointment = await Appointment.findById(appointmentId).lean();
  if (!appointment) {
    throw new AppError(404, 'not_found', 'Appointment not found.');
  }

  const doctor = await actorDoctor(actor);
  if (!canViewAppointment(actor, appointment, doctor?._id)) {
    throw new AppError(403, 'forbidden', 'You cannot access this appointment.');
  }

  return serializeAppointment(appointment);
}

function assertFutureDate(date) {
  if (!isValidDateString(date)) {
    throw new AppError(400, 'invalid_date', 'Date must be a valid YYYY-MM-DD value.');
  }
  if (date < todayUtcDateString()) {
    throw new AppError(400, 'date_unavailable', 'Appointments cannot be requested in the past.');
  }
}

function canRequestAppointments(actor) {
  return isPatient(actor) || isDoctor(actor) || isAdmin(actor);
}

function resolveBookingPatientId(actor, explicitPatientId) {
  if (explicitPatientId !== undefined && explicitPatientId !== null && String(explicitPatientId).trim()) {
    if (!isAdmin(actor)) {
      throw new AppError(403, 'forbidden', 'You cannot create an appointment for another patient.');
    }
    assertId(explicitPatientId, 'Patient');
    return String(explicitPatientId);
  }

  if (isAdmin(actor)) {
    throw new AppError(400, 'invalid_request', 'Administrators must specify patientId when requesting appointments.');
  }

  return userId(actor);
}

async function assertBookableSlot(doctorId, date) {
  const doctor = await Doctor.findById(doctorId).lean();
  if (!doctor) {
    throw new AppError(404, 'not_found', 'Doctor not found.');
  }

  const weekday = weekdayFromDate(date);
  const weekly = normalizeWeeklyAvailability(doctor.weeklyAvailability);
  if (weekly[weekday] !== 'available') {
    throw new AppError(400, 'doctor_unavailable', `The doctor is not available on ${weekdayLabel(weekday)}.`);
  }

  const existingAccepted = await Appointment.findOne({
    doctorId,
    date,
    status: 'ACCEPTED'
  }).lean();
  if (existingAccepted) {
    throw new AppError(
      409,
      'already_booked',
      `${weekdayLabel(weekday)} is no longer available because another patient was accepted.`
    );
  }

  return { doctor, weekday };
}

export async function checkDoctorAvailability(doctorId, date) {
  assertId(doctorId, 'Doctor');
  if (!isValidDateString(date)) {
    throw new AppError(400, 'invalid_date', 'Date must be a valid YYYY-MM-DD value.');
  }

  const doctor = await Doctor.findById(doctorId).lean();
  if (!doctor) {
    throw new AppError(404, 'not_found', 'Doctor not found.');
  }

  const weekday = weekdayFromDate(date);
  const weekly = normalizeWeeklyAvailability(doctor.weeklyAvailability);
  const base = {
    doctorId: String(doctorId),
    doctorName: doctor.name,
    date,
    weekday,
    weekdayLabel: weekdayLabel(weekday),
    weeklyStanding: weekly[weekday]
  };

  if (date < todayUtcDateString()) {
    return { ...base, available: false, reason: 'past_date', message: 'Appointments cannot be booked in the past.' };
  }

  if (weekly[weekday] !== 'available') {
    return {
      ...base,
      available: false,
      reason: 'doctor_unavailable',
      message: `The doctor is marked unavailable on ${weekdayLabel(weekday)}.`
    };
  }

  const existingAccepted = await Appointment.findOne({
    doctorId,
    date,
    status: 'ACCEPTED'
  }).lean();
  if (existingAccepted) {
    return {
      ...base,
      available: false,
      reason: 'already_booked',
      message: 'This day is already booked with another accepted appointment.'
    };
  }

  return {
    ...base,
    available: true,
    reason: null,
    message: 'This day is available for a new appointment request.'
  };
}

export async function requestAppointment(actor, { doctorId, date, patientId: explicitPatientId }) {
  if (!canRequestAppointments(actor)) {
    throw new AppError(403, 'forbidden', 'You cannot request appointments.');
  }

  assertId(doctorId, 'Doctor');
  assertFutureDate(date);

  if (isDoctor(actor)) {
    const ownDoctor = await getDoctorByUserId(userId(actor));
    if (ownDoctor && String(ownDoctor._id) === String(doctorId)) {
      throw new AppError(403, 'forbidden', 'You cannot book an appointment with yourself.');
    }
  }

  const patientId = resolveBookingPatientId(actor, explicitPatientId);
  if (isAdmin(actor)) {
    const patientUser = await User.findById(patientId).lean();
    if (!patientUser || !['patient', 'user'].includes(patientUser.role)) {
      throw new AppError(404, 'not_found', 'Patient not found.');
    }
  }

  const { weekday } = await assertBookableSlot(doctorId, date);

  const duplicate = await Appointment.findOne({
    doctorId,
    patientId,
    date,
    status: { $in: [...ACTIVE_REQUEST_STATUSES, 'ACCEPTED'] }
  }).lean();
  if (duplicate) {
    throw new AppError(409, 'already_requested', 'You already have an appointment request for this day.');
  }

  const appointment = await Appointment.create({
    patientId,
    doctorId,
    date,
    weekday,
    status: 'REQUESTED',
    requestedAt: new Date()
  });

  return serializeAppointment(appointment);
}

async function loadManagedAppointment(appointmentId, actor) {
  assertId(appointmentId, 'Appointment');
  const appointment = await Appointment.findById(appointmentId);
  if (!appointment) {
    throw new AppError(404, 'not_found', 'Appointment not found.');
  }

  const doctor = await actorDoctor(actor);
  if (!isAdmin(actor)) {
    if (!isDoctor(actor) || !doctor || String(appointment.doctorId) !== String(doctor._id)) {
      throw new AppError(403, 'forbidden', 'You can only manage your own appointments.');
    }
  }

  return appointment;
}

export async function acceptAppointment(appointmentId, actor) {
  const appointment = await loadManagedAppointment(appointmentId, actor);

  if (!['REQUESTED', 'ALTERNATIVE_OFFERED', 'RESCHEDULED'].includes(appointment.status)) {
    throw new AppError(400, 'invalid_request', 'Only pending requests can be accepted.');
  }

  const alreadyAccepted = await Appointment.findOne({
    doctorId: appointment.doctorId,
    date: appointment.date,
    status: 'ACCEPTED'
  }).lean();
  if (alreadyAccepted) {
    throw new AppError(
      409,
      'already_booked',
      'This day is no longer available because another patient was accepted.'
    );
  }

  let accepted;
  try {
    accepted = await Appointment.findOneAndUpdate(
      {
        _id: appointment._id,
        status: { $in: ['REQUESTED', 'ALTERNATIVE_OFFERED', 'RESCHEDULED'] }
      },
      {
        $set: {
          status: 'ACCEPTED',
          rejectionReason: '',
          suggestedDates: []
        }
      },
      { new: true }
    );
  } catch (err) {
    if (err?.code === 11000) {
      throw new AppError(
        409,
        'already_booked',
        'This day is no longer available because another patient was accepted.'
      );
    }
    throw err;
  }

  if (!accepted) {
    throw new AppError(400, 'invalid_request', 'Only pending requests can be accepted.');
  }

  const suggestions = await suggestAvailableDates(accepted.doctorId, accepted.date);
  const reason = `${weekdayLabel(accepted.weekday)} is no longer available because another patient was accepted.`;
  const nextStatus = suggestions.length ? 'ALTERNATIVE_OFFERED' : 'REJECTED';

  await withOptionalTransaction(async (session) => {
    const options = session ? { session } : undefined;
    await Appointment.updateMany(
      {
        doctorId: accepted.doctorId,
        date: accepted.date,
        _id: { $ne: accepted._id },
        status: { $in: ACTIVE_REQUEST_STATUSES }
      },
      {
        $set: {
          status: nextStatus,
          rejectionReason: reason,
          suggestedDates: suggestions
        }
      },
      options
    );
  });

  return serializeAppointment(accepted);
}

export async function rejectAppointment(appointmentId, actor, { reason, suggestedDates } = {}) {
  const appointment = await loadManagedAppointment(appointmentId, actor);

  if (!ACTIVE_REQUEST_STATUSES.includes(appointment.status)) {
    throw new AppError(
      400,
      'invalid_request',
      'Only pending requests can be rejected. Cancel confirmed appointments instead.'
    );
  }

  const suggestions =
    Array.isArray(suggestedDates) && suggestedDates.length
      ? suggestedDates.filter(isValidDateString)
      : await suggestAvailableDates(appointment.doctorId, appointment.date);

  appointment.status = suggestions.length ? 'ALTERNATIVE_OFFERED' : 'REJECTED';
  appointment.rejectionReason = reason || 'The doctor declined this appointment request.';
  appointment.suggestedDates = suggestions;
  await appointment.save();
  return serializeAppointment(appointment);
}

export async function suggestAlternativeDate(appointmentId, actor, { dates, note } = {}) {
  const appointment = await loadManagedAppointment(appointmentId, actor);
  const suggestions = (Array.isArray(dates) ? dates : [])
    .filter(isValidDateString)
    .filter((date) => date >= todayUtcDateString());

  if (!suggestions.length) {
    throw new AppError(400, 'invalid_date', 'Provide at least one valid alternative date.');
  }

  appointment.status = 'ALTERNATIVE_OFFERED';
  appointment.suggestedDates = [...new Set(suggestions)];
  appointment.responseNote = note || '';
  appointment.rejectionReason =
    appointment.rejectionReason || 'The doctor suggested another available day.';
  await appointment.save();
  return serializeAppointment(appointment);
}

export async function acceptAlternativeDate(appointmentId, actor, { date }) {
  assertId(appointmentId, 'Appointment');
  assertFutureDate(date);

  const appointment = await Appointment.findById(appointmentId);
  if (!appointment) {
    throw new AppError(404, 'not_found', 'Appointment not found.');
  }

  if (!isAdmin(actor) && String(appointment.patientId) !== userId(actor)) {
    throw new AppError(403, 'forbidden', 'You can only update your own appointments.');
  }

  if (appointment.status !== 'ALTERNATIVE_OFFERED' && appointment.status !== 'REJECTED') {
    throw new AppError(400, 'invalid_request', 'There is no alternative date to accept.');
  }

  if (appointment.suggestedDates?.length && !appointment.suggestedDates.includes(date)) {
    throw new AppError(400, 'invalid_date', 'Select one of the suggested dates.');
  }

  const doctor = await Doctor.findById(appointment.doctorId).lean();
  const weekday = weekdayFromDate(date);
  const weekly = normalizeWeeklyAvailability(doctor?.weeklyAvailability);
  if (weekly[weekday] !== 'available') {
    throw new AppError(400, 'doctor_unavailable', `The doctor is not available on ${weekdayLabel(weekday)}.`);
  }

  const taken = await Appointment.findOne({
    doctorId: appointment.doctorId,
    date,
    status: 'ACCEPTED'
  }).lean();
  if (taken) {
    throw new AppError(409, 'already_booked', 'That suggested day is no longer available.');
  }

  appointment.date = date;
  appointment.weekday = weekday;
  appointment.status = 'REQUESTED';
  appointment.suggestedDates = [];
  appointment.rejectionReason = '';
  appointment.responseNote = '';
  await appointment.save();
  return serializeAppointment(appointment);
}

export async function cancelAppointment(appointmentId, actor) {
  assertId(appointmentId, 'Appointment');
  const appointment = await Appointment.findById(appointmentId);
  if (!appointment) {
    throw new AppError(404, 'not_found', 'Appointment not found.');
  }

  const doctor = await actorDoctor(actor);
  const isOwnerPatient = isPatient(actor) && String(appointment.patientId) === userId(actor);
  const isOwnerDoctor = isDoctor(actor) && doctor && String(appointment.doctorId) === String(doctor._id);

  if (!isAdmin(actor) && !isOwnerPatient && !isOwnerDoctor) {
    throw new AppError(403, 'forbidden', 'You cannot cancel this appointment.');
  }

  if (appointment.status === 'COMPLETED' || appointment.status === 'CANCELLED') {
    throw new AppError(400, 'invalid_request', 'This appointment cannot be cancelled.');
  }

  appointment.status = 'CANCELLED';
  await appointment.save();
  return serializeAppointment(appointment);
}

export async function completeAppointment(appointmentId, actor) {
  const appointment = await loadManagedAppointment(appointmentId, actor);
  if (appointment.status !== 'ACCEPTED') {
    throw new AppError(400, 'invalid_request', 'Only confirmed appointments can be marked completed.');
  }
  appointment.status = 'COMPLETED';
  await appointment.save();
  return serializeAppointment(appointment);
}

export async function adminUpdateAppointment(appointmentId, fields, actor) {
  if (!isAdmin(actor)) {
    throw new AppError(403, 'forbidden', 'Administrator access required.');
  }

  assertId(appointmentId, 'Appointment');
  const appointment = await Appointment.findById(appointmentId);
  if (!appointment) {
    throw new AppError(404, 'not_found', 'Appointment not found.');
  }

  if (fields.date !== undefined) {
    assertFutureDate(fields.date);
    appointment.date = fields.date;
    appointment.weekday = weekdayFromDate(fields.date);
  }

  if (fields.status !== undefined) {
    const allowed = ['REQUESTED', 'ACCEPTED', 'REJECTED', 'ALTERNATIVE_OFFERED', 'RESCHEDULED', 'CANCELLED', 'COMPLETED'];
    if (!allowed.includes(fields.status)) {
      throw new AppError(400, 'invalid_request', 'Invalid appointment status.');
    }
    appointment.status = fields.status;
  }

  if (fields.responseNote !== undefined) {
    appointment.responseNote = String(fields.responseNote || '');
  }

  try {
    await appointment.save();
  } catch (err) {
    if (err?.code === 11000) {
      throw new AppError(409, 'already_booked', 'Another patient is already confirmed for that day.');
    }
    throw err;
  }

  return serializeAppointment(appointment);
}

export async function dashboardStats() {
  const today = todayUtcDateString();
  const [doctors, patients, pendingAppointments, todayAppointments] = await Promise.all([
    Doctor.countDocuments(),
    User.countDocuments({ role: { $in: ['patient', 'user'] } }),
    Appointment.countDocuments({ status: { $in: ACTIVE_REQUEST_STATUSES } }),
    Appointment.countDocuments({ date: today, status: { $in: ['ACCEPTED', 'REQUESTED'] } })
  ]);

  return { doctors, patients, pendingAppointments, todayAppointments };
}

export async function adminDashboardStats(actor) {
  if (!isAdmin(actor)) {
    throw new AppError(403, 'forbidden', 'Administrator access required.');
  }
  return dashboardStats();
}
