import mongoose from 'mongoose';

const subscriptionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    planId: { type: String, required: true },
    planName: { type: String, required: true },
    billingCycle: { type: String, enum: ['monthly', 'yearly'], required: true },
    creditsIncluded: { type: Number, required: true, min: 0 },
    priceCents: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ['active', 'expired', 'cancelled', 'pending'],
      default: 'pending',
      index: true
    },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null, index: true },
    paymentOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentOrder', default: null },
    renewalCount: { type: Number, default: 0, min: 0 }
  },
  { timestamps: true }
);

subscriptionSchema.index({ userId: 1, status: 1 });
subscriptionSchema.index({ userId: 1, planId: 1, status: 1 });

export const Subscription = mongoose.model('Subscription', subscriptionSchema);
