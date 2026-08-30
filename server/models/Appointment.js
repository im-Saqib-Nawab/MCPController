import mongoose from 'mongoose';
import { WEEKDAYS } from '../lib/availability.js';

export const APPOINTMENT_STATUSES = [
  'REQUESTED',
  'ACCEPTED',
  'REJECTED',
  'ALTERNATIVE_OFFERED',
  'RESCHEDULED',
  'CANCELLED',
  'COMPLETED'
];

export const ACTIVE_REQUEST_STATUSES = ['REQUESTED', 'ALTERNATIVE_OFFERED', 'RESCHEDULED'];

const appointmentSchema = new mongoose.Schema(
  {
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true, index: true },
    date: {
      type: String,
      required: true,
      match: [/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD']
    },
    weekday: { type: String, required: true, enum: WEEKDAYS },
    status: {
      type: String,
      required: true,
      enum: APPOINTMENT_STATUSES,
      default: 'REQUESTED',
      index: true
    },
    suggestedDates: { type: [String], default: () => [] },
    rejectionReason: { type: String, trim: true, default: '' },
    responseNote: { type: String, trim: true, default: '' },
    requestedAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

appointmentSchema.index({ doctorId: 1, date: 1, status: 1 });
appointmentSchema.index({ patientId: 1, createdAt: -1 });
appointmentSchema.index({ doctorId: 1, createdAt: -1 });
appointmentSchema.index(
  { doctorId: 1, date: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'ACCEPTED' },
    name: 'unique_accepted_doctor_date'
  }
);

export const Appointment = mongoose.model('Appointment', appointmentSchema);
