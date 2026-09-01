import mongoose from 'mongoose';
import { DOCTOR_ACCESS_MODES, MEDICINE_FEATURE_KEY } from '../lib/medicines.js';

const featureFlagSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      default: MEDICINE_FEATURE_KEY
    },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    enabled: { type: Boolean, default: false },
    doctorAccess: {
      type: String,
      enum: DOCTOR_ACCESS_MODES,
      default: 'all'
    },
    doctorIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' }],
      default: []
    },
    percentage: { type: Number, min: 0, max: 100, default: 0 },
    patientsEnabled: { type: Boolean, default: false }
  },
  { timestamps: true }
);

export const FeatureFlag = mongoose.model('FeatureFlag', featureFlagSchema);
