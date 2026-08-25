import mongoose from 'mongoose';

/**
 * Doctor Management domain model — intentionally minimal for this MCP practice app.
 * Doctors are owned by the single Admin's system (not partitioned per ChatGPT user).
 */
const doctorSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    specialization: { type: String, required: true, trim: true }
  },
  { timestamps: true }
);

export const Doctor = mongoose.model('Doctor', doctorSchema);
