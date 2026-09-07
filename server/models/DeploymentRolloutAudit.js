import mongoose from 'mongoose';

const deploymentRolloutAuditSchema = new mongoose.Schema(
  {
    adminUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    adminEmail: { type: String, trim: true, default: '' },
    role: { type: String, trim: true, default: '' },
    action: { type: String, required: true, trim: true },
    previousValue: { type: mongoose.Schema.Types.Mixed, default: null },
    newValue: { type: mongoose.Schema.Types.Mixed, default: null },
    requestId: { type: String, trim: true, default: '' }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

deploymentRolloutAuditSchema.index({ createdAt: -1 });
deploymentRolloutAuditSchema.index({ adminUserId: 1, createdAt: -1 });

export const DeploymentRolloutAudit = mongoose.model(
  'DeploymentRolloutAudit',
  deploymentRolloutAuditSchema
);
