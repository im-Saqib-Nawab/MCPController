import crypto from 'node:crypto';
import { PaymentOrder } from '../models/PaymentOrder.js';
import { config } from '../config/env.js';
import { AppError } from '../middleware/error.middleware.js';
import { activateSubscription, getPlanById } from './subscription.service.js';
import { logOperation } from '../lib/request-context.js';

/**
 * Payment service abstraction.
 *
 * Development: simulated checkout sessions verified server-side.
 * Production: connect a real provider (Stripe, etc.) via PAYMENT_PROVIDER env
 * and implement verifyWebhook / completeCheckout for that provider.
 */

export async function createCheckoutSession({ userId, planId, returnUrl = '' }) {
  const plan = getPlanById(planId);
  const idempotencyKey = `checkout-${userId}-${planId}-${Date.now()}`;

  const existingPending = await PaymentOrder.findOne({
    userId,
    planId,
    status: 'pending',
    createdAt: { $gte: new Date(Date.now() - 30 * 60 * 1000) }
  }).lean();

  if (existingPending) {
    return buildCheckoutResponse(existingPending, returnUrl);
  }

  const sessionId = crypto.randomBytes(16).toString('hex');

  const order = await PaymentOrder.create({
    userId,
    planId: plan.id,
    amountCents: plan.priceCents,
    creditsToGrant: plan.credits,
    status: 'pending',
    provider: config.payment.provider,
    providerSessionId: sessionId,
    idempotencyKey
  });

  logOperation('info', 'payment.checkout_created', {
    userId: String(userId),
    planId,
    orderId: String(order._id),
    provider: config.payment.provider
  });

  return buildCheckoutResponse(order, returnUrl);
}

function buildCheckoutResponse(order, returnUrl) {
  const plan = getPlanById(order.planId);
  const baseUrl = config.appUrl;
  const successUrl =
    returnUrl ||
    `${baseUrl}/purchase/success?session=${order.providerSessionId}&order=${order._id}`;

  if (config.payment.provider === 'dev') {
    return {
      orderId: String(order._id),
      sessionId: order.providerSessionId,
      plan: {
        id: plan.id,
        name: plan.name,
        priceDisplay: plan.billingCycle === 'yearly'
          ? `$${(plan.priceCents / 100).toFixed(2)}/year`
          : `$${(plan.priceCents / 100).toFixed(2)}/month`,
        credits: plan.credits
      },
      checkoutUrl: `${baseUrl}/plans?checkout=${order.providerSessionId}&order=${order._id}`,
      devCompleteUrl: `${baseUrl}/api/payments/dev-complete?session=${order.providerSessionId}`,
      successUrl,
      provider: 'dev',
      message:
        config.isProduction && config.payment.provider === 'dev'
          ? 'Development payment mode. Connect a real payment provider for production.'
          : 'Complete payment on the plans page to receive credits.'
    };
  }

  throw new AppError(
    501,
    'payment_not_configured',
    `Payment provider "${config.payment.provider}" is not fully implemented. Use PAYMENT_PROVIDER=dev for testing.`
  );
}

export async function completeDevPayment(sessionId) {
  if (config.payment.provider !== 'dev') {
    throw new AppError(403, 'forbidden', 'Dev payment completion is only available in dev mode.');
  }

  const order = await PaymentOrder.findOne({
    providerSessionId: sessionId,
    status: 'pending'
  });

  if (!order) {
    const completed = await PaymentOrder.findOne({ providerSessionId: sessionId, status: 'completed' }).lean();
    if (completed) {
      return { order: formatOrder(completed), alreadyCompleted: true };
    }
    throw new AppError(404, 'not_found', 'Checkout session not found or already processed.');
  }

  return finalizePayment(order, `dev-${sessionId}`);
}

export async function verifyAndCompletePayment({ sessionId, providerPaymentId = '' }) {
  const order = await PaymentOrder.findOne({
    providerSessionId: sessionId,
    status: 'pending'
  });

  if (!order) {
    const completed = await PaymentOrder.findOne({ providerSessionId: sessionId, status: 'completed' }).lean();
    if (completed) {
      return { order: formatOrder(completed), subscription: null, alreadyCompleted: true };
    }
    throw new AppError(404, 'not_found', 'Payment session not found.');
  }

  return finalizePayment(order, providerPaymentId || `verified-${sessionId}`);
}

async function finalizePayment(order, providerPaymentId) {
  if (order.status === 'completed') {
    return { order: formatOrder(order), alreadyCompleted: true };
  }

  order.status = 'completed';
  order.providerPaymentId = providerPaymentId;
  order.completedAt = new Date();
  await order.save();

  const activation = await activateSubscription({
    userId: order.userId,
    planId: order.planId,
    paymentOrderId: order._id,
    idempotencyKey: `payment-${order._id}`
  });

  logOperation('info', 'payment.verified', {
    userId: String(order.userId),
    orderId: String(order._id),
    planId: order.planId,
    credits: order.creditsToGrant
  });

  return {
    order: formatOrder(order),
    subscription: activation.subscription,
    credits: activation.credits,
    alreadyCompleted: activation.duplicate
  };
}

function formatOrder(order) {
  return {
    id: String(order._id),
    planId: order.planId,
    amountCents: order.amountCents,
    creditsToGrant: order.creditsToGrant,
    status: order.status,
    completedAt: order.completedAt
  };
}

export async function getPaymentOrder(orderId, userId) {
  const order = await PaymentOrder.findOne({ _id: orderId, userId }).lean();
  if (!order) {
    throw new AppError(404, 'not_found', 'Payment order not found.');
  }
  return formatOrder(order);
}
