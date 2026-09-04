import { config } from '../config/env.js';
import { Subscription } from '../models/Subscription.js';
import { AppError } from '../middleware/error.middleware.js';
import { addCredits } from './credit.service.js';
import { withOptionalTransaction } from '../lib/transactions.js';
import { logOperation } from '../lib/request-context.js';

export function getPlans() {
  return config.subscriptionPlans.map((plan) => ({
    id: plan.id,
    name: plan.name,
    billingCycle: plan.billingCycle,
    priceCents: plan.priceCents,
    priceDisplay: formatPrice(plan.priceCents, plan.billingCycle),
    credits: plan.credits,
    durationDays: plan.durationDays,
    description: plan.description
  }));
}

export function getPlanById(planId) {
  const plan = config.subscriptionPlans.find((p) => p.id === planId);
  if (!plan) {
    throw new AppError(404, 'plan_not_found', `Plan "${planId}" not found.`);
  }
  return plan;
}

function formatPrice(cents, cycle) {
  const dollars = (cents / 100).toFixed(2);
  return cycle === 'yearly' ? `$${dollars}/year` : `$${dollars}/month`;
}

export async function getActiveSubscription(userId) {
  const now = new Date();
  const sub = await Subscription.findOne({
    userId,
    status: 'active',
    endDate: { $gt: now }
  })
    .sort({ endDate: -1 })
    .lean();

  if (!sub) return null;

  return {
    id: String(sub._id),
    planId: sub.planId,
    planName: sub.planName,
    billingCycle: sub.billingCycle,
    creditsIncluded: sub.creditsIncluded,
    status: sub.status,
    startDate: sub.startDate,
    endDate: sub.endDate,
    renewsAt: sub.endDate
  };
}

export async function activateSubscription({
  userId,
  planId,
  paymentOrderId,
  idempotencyKey
}) {
  const plan = getPlanById(planId);

  return withOptionalTransaction(async (session) => {
    const options = session ? { session } : undefined;

    const existing = await Subscription.findOne({
      paymentOrderId,
      status: 'active'
    }).lean();

    if (existing) {
      return {
        subscription: formatSubscription(existing),
        duplicate: true
      };
    }

    const now = new Date();
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + plan.durationDays);

    const [subscription] = await Subscription.create(
      [
        {
          userId,
          planId: plan.id,
          planName: plan.name,
          billingCycle: plan.billingCycle,
          creditsIncluded: plan.credits,
          priceCents: plan.priceCents,
          status: 'active',
          startDate: now,
          endDate,
          paymentOrderId
        }
      ],
      options
    );

    const creditResult = await addCredits({
      userId,
      amount: plan.credits,
      type: 'subscription_grant',
      description: `${plan.name} subscription — ${plan.credits} credits`,
      idempotencyKey: idempotencyKey || `sub-${paymentOrderId}`,
      metadata: { planId: plan.id, subscriptionId: String(subscription._id) },
      session
    });

    logOperation('info', 'subscription.created', {
      userId: String(userId),
      planId: plan.id,
      credits: plan.credits,
      endDate
    });

    return {
      subscription: formatSubscription(subscription),
      credits: creditResult,
      duplicate: false
    };
  });
}

function formatSubscription(sub) {
  return {
    id: String(sub._id),
    planId: sub.planId,
    planName: sub.planName,
    billingCycle: sub.billingCycle,
    creditsIncluded: sub.creditsIncluded,
    status: sub.status,
    startDate: sub.startDate,
    endDate: sub.endDate
  };
}

export async function expireSubscriptions() {
  const now = new Date();
  const result = await Subscription.updateMany(
    { status: 'active', endDate: { $lte: now } },
    { $set: { status: 'expired' } }
  );

  if (result.modifiedCount > 0) {
    logOperation('info', 'subscription.expired', { count: result.modifiedCount });
  }

  return result.modifiedCount;
}

export async function getSubscriptionStats() {
  const now = new Date();
  const [active, expired, byPlan] = await Promise.all([
    Subscription.countDocuments({ status: 'active', endDate: { $gt: now } }),
    Subscription.countDocuments({ status: 'expired' }),
    Subscription.aggregate([
      { $match: { status: 'active', endDate: { $gt: now } } },
      { $group: { _id: '$planId', count: { $sum: 1 } } }
    ])
  ]);

  return { active, expired, byPlan };
}
