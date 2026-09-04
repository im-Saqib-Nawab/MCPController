import mongoose from 'mongoose';

const backgroundJobSchema = new mongoose.Schema(
  {
    runKey: { type: String, required: true, unique: true, index: true },
    type: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ['starting', 'running', 'stopping', 'completed', 'failed', 'stopped'],
      default: 'starting',
      index: true
    },
    startedBy: {
      userId: String,
      name: String,
      email: String
    },
    instanceId: { type: String, default: '' },
    config: { type: mongoose.Schema.Types.Mixed, default: {} },
    phase: { type: String, default: null },
    progress: { type: mongoose.Schema.Types.Mixed, default: {} },
    result: { type: mongoose.Schema.Types.Mixed, default: null },
    error: { type: String, default: '' },
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
    expiresAt: { type: Date }
  },
  { timestamps: true }
);

backgroundJobSchema.index({ type: 1, status: 1, createdAt: -1 });
backgroundJobSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const BackgroundJob =
  mongoose.models.BackgroundJob || mongoose.model('BackgroundJob', backgroundJobSchema);
