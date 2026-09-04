import mongoose from 'mongoose';

const creditTransactionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: {
      type: String,
      enum: [
        'deduction',
        'grant',
        'refund',
        'subscription_grant',
        'initial_grant',
        'admin_bypass'
      ],
      required: true
    },
    amount: { type: Number, required: true },
    balanceBefore: { type: Number, required: true, min: 0 },
    balanceAfter: { type: Number, required: true, min: 0 },
    tool: { type: String, default: '' },
    action: { type: String, default: '' },
    status: {
      type: String,
      enum: ['success', 'failed', 'refunded', 'pending'],
      default: 'success'
    },
    description: { type: String, default: '' },
    requestId: { type: String, default: '', index: true },
    idempotencyKey: { type: String },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

creditTransactionSchema.index({ userId: 1, createdAt: -1 });
creditTransactionSchema.index({ tool: 1, createdAt: -1 });
creditTransactionSchema.index(
  { idempotencyKey: 1 },
  { unique: true, sparse: true }
);

export const CreditTransaction = mongoose.model('CreditTransaction', creditTransactionSchema);
