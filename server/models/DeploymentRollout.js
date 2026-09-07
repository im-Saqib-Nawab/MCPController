import mongoose from 'mongoose';

export const DEPLOYMENT_ROLLOUT_KEY = 'global';

export const ROLLOUT_STATUSES = ['idle', 'rolling', 'paused', 'promoted'];

const deploymentRolloutSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: DEPLOYMENT_ROLLOUT_KEY
    },
    productionVersion: {
      type: String,
      trim: true,
      default: 'production'
    },
    canaryVersion: {
      type: String,
      trim: true,
      default: ''
    },
    canaryDeploymentUrl: {
      type: String,
      trim: true,
      default: ''
    },
    canaryPercentage: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    rolloutEnabled: {
      type: Boolean,
      default: false
    },
    rolloutStatus: {
      type: String,
      enum: ROLLOUT_STATUSES,
      default: 'idle'
    },
    assignmentEpoch: {
      type: Number,
      default: 1,
      min: 1
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    updatedByEmail: {
      type: String,
      trim: true,
      default: ''
    }
  },
  { timestamps: true }
);

export const DeploymentRollout = mongoose.model('DeploymentRollout', deploymentRolloutSchema);
