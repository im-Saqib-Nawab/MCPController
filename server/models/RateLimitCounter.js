import mongoose from 'mongoose';

const rateLimitSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    hits: { type: Number, default: 0 },
    resetAt: { type: Date, required: true }
  },
  { timestamps: false }
);

rateLimitSchema.index({ resetAt: 1 }, { expireAfterSeconds: 0 });

export const RateLimitCounter =
  mongoose.models.RateLimitCounter || mongoose.model('RateLimitCounter', rateLimitSchema);
