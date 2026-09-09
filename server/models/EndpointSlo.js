import mongoose from 'mongoose';

const endpointSloSchema = new mongoose.Schema(
  {
    endpoint: { type: String, required: true, trim: true },
    method: { type: String, default: '*', trim: true },
    enabled: { type: Boolean, default: true },
    p95BudgetMs: { type: Number, min: 1 },
    p99BudgetMs: { type: Number, min: 1 },
    availabilityTarget: { type: Number, min: 0, max: 100 },
    primaryMetric: {
      type: String,
      enum: ['p95', 'p99', 'availability'],
      default: 'p99'
    },
    evaluationWindowDays: { type: Number, default: 30, min: 1, max: 90 },
    alertConsecutiveMinutes: { type: Number, default: 5, min: 1, max: 60 },
    description: { type: String, default: '' }
  },
  { timestamps: true }
);

endpointSloSchema.index({ endpoint: 1, method: 1 }, { unique: true });

export const EndpointSlo =
  mongoose.models.EndpointSlo || mongoose.model('EndpointSlo', endpointSloSchema);
