import mongoose from 'mongoose';

/**
 * Stores multi-step MCP task progress so users can continue after purchasing credits.
 * TTL: 7 days.
 */
const mcpSessionContextSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    clientId: { type: String, default: '' },
    originalRequest: { type: String, default: '' },
    completedSteps: [
      {
        tool: String,
        summary: String,
        resultSnapshot: mongoose.Schema.Types.Mixed,
        creditsUsed: Number,
        completedAt: { type: Date, default: Date.now }
      }
    ],
    pendingStep: {
      tool: String,
      args: mongoose.Schema.Types.Mixed,
      requiredCredits: Number,
      description: String
    },
    status: {
      type: String,
      enum: ['active', 'completed', 'expired'],
      default: 'active'
    },
    expiresAt: { type: Date, required: true }
  },
  { timestamps: true }
);

mcpSessionContextSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
mcpSessionContextSchema.index({ userId: 1, status: 1, updatedAt: -1 });

export const McpSessionContext = mongoose.model('McpSessionContext', mcpSessionContextSchema);
