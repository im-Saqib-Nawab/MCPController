import * as creditService from '../services/credit.service.js';
import * as subscriptionService from '../services/subscription.service.js';
import * as paymentService from '../services/payment.service.js';
import { paginateQuery } from '../lib/pagination.js';
import { User } from '../models/User.js';
import { CreditTransaction } from '../models/CreditTransaction.js';
import { config } from '../config/env.js';

export async function getSummary(req, res, next) {
  try {
    const summary = await creditService.getCreditSummary(req.user._id);
    const subscription = await subscriptionService.getActiveSubscription(req.user._id);
    res.json({ ...summary, subscription });
  } catch (err) {
    next(err);
  }
}

export async function getHistory(req, res, next) {
  try {
    const result = await creditService.listTransactions(req.user._id, {
      page: req.query.page,
      limit: req.query.limit
    }, {
      type: req.query.type,
      tool: req.query.tool,
      status: req.query.status
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function listPlans(req, res, next) {
  try {
    res.json({ plans: subscriptionService.getPlans() });
  } catch (err) {
    next(err);
  }
}

export async function createCheckout(req, res, next) {
  try {
    const { planId, returnUrl } = req.body;
    const checkout = await paymentService.createCheckoutSession({
      userId: req.user._id,
      planId,
      returnUrl
    });
    res.json(checkout);
  } catch (err) {
    next(err);
  }
}

export async function completeDevPayment(req, res, next) {
  try {
    const { session } = req.query;
    const result = await paymentService.completeDevPayment(session);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getPaymentStatus(req, res, next) {
  try {
    const order = await paymentService.getPaymentOrder(req.params.orderId, req.user._id);
    res.json({ order });
  } catch (err) {
    next(err);
  }
}

export async function getPurchaseResult(req, res, next) {
  try {
    const session = req.query.session || req.body?.session;
    if (!session) {
      return res.status(400).json({ error: 'missing_session', message: 'Session ID required.' });
    }
    const result = await paymentService.verifyAndCompletePayment({ sessionId: session });
    const balance = await creditService.getBalance(req.user._id);
    res.json({ ...result, balance });
  } catch (err) {
    next(err);
  }
}

export async function adminOverview(req, res, next) {
  try {
    const lowThreshold = config.credits.lowCreditThreshold;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalUsers,
      totalCreditsIssued,
      totalCreditsUsed,
      activeSubscriptions,
      expiredSubscriptions,
      lowCreditUsers,
      zeroCreditUsers,
      toolStats,
      recentTransactions
    ] = await Promise.all([
      User.countDocuments({ role: { $in: ['patient', 'doctor'] } }),
      CreditTransaction.aggregate([
        { $match: { type: { $in: ['initial_grant', 'subscription_grant', 'grant'] } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      CreditTransaction.aggregate([
        { $match: { type: 'deduction', status: 'success', createdAt: { $gte: monthStart } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      subscriptionService.getSubscriptionStats(),
      subscriptionService.getSubscriptionStats().then((s) => s.expired),
      User.countDocuments({
        role: { $in: ['patient', 'doctor'] },
        creditBalance: { $gt: 0, $lte: lowThreshold }
      }),
      User.countDocuments({ role: { $in: ['patient', 'doctor'] }, creditBalance: 0 }),
      creditService.getToolUsageStats({ sinceDays: 30 }),
      CreditTransaction.find()
        .sort({ createdAt: -1 })
        .limit(20)
        .populate('userId', 'name email role')
        .lean()
    ]);

    res.json({
      totals: {
        users: totalUsers,
        creditsIssued: totalCreditsIssued[0]?.total ?? 0,
        creditsUsedThisMonth: totalCreditsUsed[0]?.total ?? 0,
        activeSubscriptions: activeSubscriptions.active,
        expiredSubscriptions,
        lowCreditUsers,
        zeroCreditUsers
      },
      subscriptionsByPlan: activeSubscriptions.byPlan,
      toolUsage: toolStats,
      recentTransactions: recentTransactions.map((tx) => ({
        id: String(tx._id),
        user: tx.userId
          ? { id: String(tx.userId._id), name: tx.userId.name, email: tx.userId.email, role: tx.userId.role }
          : null,
        type: tx.type,
        amount: tx.amount,
        tool: tx.tool,
        status: tx.status,
        description: tx.description,
        createdAt: tx.createdAt
      }))
    });
  } catch (err) {
    next(err);
  }
}

export async function adminUserCredits(req, res, next) {
  try {
    const { items, pagination } = await paginateQuery(
      User,
      { role: { $in: ['patient', 'doctor', 'user'] } },
      {
        sort: { creditBalance: 1, createdAt: -1 },
        pagination: { page: req.query.page, limit: req.query.limit },
        select: 'name email role creditBalance createdAt'
      }
    );

    res.json({
      users: items.map((u) => ({
        id: String(u._id),
        name: u.name,
        email: u.email,
        role: u.role,
        creditBalance: u.creditBalance ?? 0
      })),
      pagination
    });
  } catch (err) {
    next(err);
  }
}
