import mongoose from 'mongoose';

const systemLogSchema = new mongoose.Schema(
  {
    level: {
      type: String,
      enum: ['debug', 'info', 'warn', 'error'],
      required: true,
      index: true
    },
    operation: {
      type: String,
      required: true,
      index: true
    },
    message: {
      type: String,
      default: ''
    },
    requestId: {
      type: String,
      index: true
    },
    method: String,
    route: String,
    statusCode: Number,
    durationMs: Number,
    userId: {
      type: String,
      index: true
    },
    clientId: String,
    role: String,
    tool: String,
    errorCode: String,
    errorName: String,
    errorMessage: String,
    errorStack: String,
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: undefined
    }
  },
  {
    timestamps: { createdAt: true, updatedAt: false }
  }
);

systemLogSchema.index({ createdAt: -1 });
systemLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });

export const SystemLog = mongoose.models.SystemLog || mongoose.model('SystemLog', systemLogSchema);
