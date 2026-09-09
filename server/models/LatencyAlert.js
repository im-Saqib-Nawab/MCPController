import mongoose from 'mongoose';

const latencyAlertSchema = new mongoose.Schema(
  {
    dedupeKey: { type: String, required: true, index: true },
    endpoint: { type: String, required: true, index: true },
    method: { type: String, default: '*' },
    metric: {
      type: String,
      enum: ['p95', 'p99', 'availability'],
      required: true
    },
    status: {
      type: String,
      enum: ['healthy', 'warning', 'violating', 'resolved'],
      default: 'violating',
      index: true
    },
    currentValue: Number,
    budgetValue: Number,
    sloTarget: String,
    deploymentVersion: String,
    violationStartedAt: { type: Date, index: true },
    resolvedAt: Date,
    violationDurationMs: Number,
    message: String
  },
  { timestamps: true }
);

latencyAlertSchema.index({ status: 1, updatedAt: -1 });
latencyAlertSchema.index(
  { dedupeKey: 1, status: 1 },
  { partialFilterExpression: { status: { $in: ['warning', 'violating'] } } }
);

export const LatencyAlert =
  mongoose.models.LatencyAlert || mongoose.model('LatencyAlert', latencyAlertSchema);
