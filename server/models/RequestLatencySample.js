import mongoose from 'mongoose';

const phaseTimingsSchema = new mongoose.Schema(
  {
    authentication: Number,
    business: Number,
    database: Number,
    external: Number,
    response: Number
  },
  { _id: false }
);

const timingDetailSchema = new mongoose.Schema(
  {
    label: String,
    durationMs: Number
  },
  { _id: false }
);

const requestLatencySampleSchema = new mongoose.Schema(
  {
    requestId: { type: String, required: true, index: true },
    method: { type: String, required: true, index: true },
    route: { type: String, required: true, index: true },
    action: String,
    role: { type: String, index: true },
    statusCode: { type: Number, index: true },
    durationMs: { type: Number, required: true, index: true },
    deploymentVersion: { type: String, index: true },
    isError: { type: Boolean, default: false, index: true },
    phaseTimings: phaseTimingsSchema,
    timingDetails: {
      database: [timingDetailSchema],
      external: [timingDetailSchema]
    }
  },
  {
    timestamps: { createdAt: true, updatedAt: false }
  }
);

requestLatencySampleSchema.index({ createdAt: -1 });
requestLatencySampleSchema.index({ route: 1, createdAt: -1 });
requestLatencySampleSchema.index({ route: 1, method: 1, createdAt: -1 });
requestLatencySampleSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 7 });

export const RequestLatencySample =
  mongoose.models.RequestLatencySample ||
  mongoose.model('RequestLatencySample', requestLatencySampleSchema);
