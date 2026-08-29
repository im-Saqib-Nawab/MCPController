import mongoose from 'mongoose';

const doctorSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    specialization: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    availability: { type: String, trim: true, default: '' }
  },
  { timestamps: true }
);

export const Doctor = mongoose.model('Doctor', doctorSchema);
