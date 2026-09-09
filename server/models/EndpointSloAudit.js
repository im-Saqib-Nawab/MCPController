import mongoose from 'mongoose';

const endpointSloAuditSchema = new mongoose.Schema(
  {
    sloId: { type: mongoose.Schema.Types.ObjectId, ref: 'EndpointSlo', index: true },
    endpoint: { type: String, required: true },
    method: { type: String, default: '*' },
    action: {
      type: String,
      enum: ['create', 'update', 'delete'],
      required: true
    },
    adminId: { type: String, required: true },
    adminName: { type: String, required: true },
    requestId: String,
    oldValues: mongoose.Schema.Types.Mixed,
    newValues: mongoose.Schema.Types.Mixed
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

endpointSloAuditSchema.index({ createdAt: -1 });

export const EndpointSloAudit =
  mongoose.models.EndpointSloAudit ||
  mongoose.model('EndpointSloAudit', endpointSloAuditSchema);
