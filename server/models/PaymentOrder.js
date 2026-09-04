import mongoose from 'mongoose';

const paymentOrderSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    planId: { type: String, required: true },
    amountCents: { type: Number, required: true, min: 0 },
    creditsToGrant: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'cancelled'],
      default: 'pending',
      index: true
    },
    provider: { type: String, default: 'dev' },
    providerSessionId: { type: String, default: '', index: true },
    providerPaymentId: { type: String, default: '', index: true },
    idempotencyKey: { type: String, required: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    completedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

paymentOrderSchema.index({ idempotencyKey: 1 }, { unique: true });
paymentOrderSchema.index({ userId: 1, status: 1, createdAt: -1 });

export const PaymentOrder = mongoose.model('PaymentOrder', paymentOrderSchema);
