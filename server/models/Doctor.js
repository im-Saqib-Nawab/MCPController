import mongoose from 'mongoose';
import { WEEKDAYS, DAY_STATES, defaultWeeklyAvailability } from '../lib/availability.js';

const weekdayField = {
  type: String,
  enum: DAY_STATES,
  default: 'available'
};

const doctorSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    name: { type: String, required: true, trim: true },
    specialization: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    availability: { type: String, trim: true, default: '' },
    weeklyAvailability: {
      monday: { ...weekdayField, default: 'available' },
      tuesday: { ...weekdayField, default: 'available' },
      wednesday: { ...weekdayField, default: 'available' },
      thursday: { ...weekdayField, default: 'available' },
      friday: { ...weekdayField, default: 'available' },
      saturday: { ...weekdayField, default: 'unavailable' },
      sunday: { ...weekdayField, default: 'unavailable' }
    }
  },
  { timestamps: true }
);

doctorSchema.index(
  { userId: 1 },
  {
    unique: true,
    partialFilterExpression: { userId: { $type: 'objectId' } },
    name: 'unique_doctor_user'
  }
);
doctorSchema.index({ createdAt: -1 });

doctorSchema.pre('validate', function applyDefaultSchedule() {
  if (!this.weeklyAvailability) {
    this.weeklyAvailability = defaultWeeklyAvailability();
    return;
  }

  const defaults = defaultWeeklyAvailability();
  for (const day of WEEKDAYS) {
    if (!this.weeklyAvailability[day]) {
      this.weeklyAvailability[day] = defaults[day];
    }
  }
});

export const Doctor = mongoose.model('Doctor', doctorSchema);
