import mongoose from 'mongoose';
import { MEDICINE_CATEGORIES } from '../lib/medicines.js';

const medicineSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    usedFor: { type: String, required: true, trim: true },
    careTips: { type: String, trim: true, default: '' },
    warnings: { type: String, trim: true, default: '' },
    category: {
      type: String,
      enum: MEDICINE_CATEGORIES,
      default: 'Other'
    },
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Doctor',
      required: true,
      index: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    }
  },
  { timestamps: true }
);

medicineSchema.index({ name: 1, doctorId: 1 });
medicineSchema.index({ doctorId: 1, category: 1, name: 1 });

export const Medicine = mongoose.model('Medicine', medicineSchema);
