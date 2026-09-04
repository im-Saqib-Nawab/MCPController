import { User } from '../models/User.js';
import { CreditTransaction } from '../models/CreditTransaction.js';
import { config } from '../config/env.js';
import { getToolCreditCost, isFreeTool, EXPENSIVE_TOOL_THRESHOLD } from '../config/credit-costs.js';
import { AppError } from '../middleware/error.middleware.js';
import { logOperation } from '../lib/request-context.js';
import { isAdmin } from '../lib/roles.js';
import { withOptionalTransaction } from '../lib/transactions.js';
import { paginateQuery } from '../lib/pagination.js';
import { mcpActionLabel } from '../lib/audit-log.js';

export class InsufficientCreditsError extends AppError {
  constructor(required, available, details = {}) {
    super(
      402,
      'insufficient_credits',
      `Insufficient credits. This operation requires ${required} credit${required === 1 ? '' : 's'}, but you have ${available}.`,
      { required, available, ...details }
    );
  }
}

export class CreditConfirmationRequiredError extends AppError {
  constructor(required, available, details = {}) {
    super(
      409,
      'credit_confirmation_required',
      `This operation requires ${required} credit${required === 1 ? '' : 's'}. You have ${available} remaining. ` +
        'This will use a significant portion of your balance. Set confirm: true to proceed.',
      { required, available, ...details }
    );
  }
}

export function shouldBypassCredits(userOrRole) {
  const role = typeof userOrRole === 'string' ? userOrRole : userOrRole?.role;
  return role === 'admin';
}

export async function getBalance(userId) {
  const user = await User.findById(userId).select('creditBalance role').lean();
  if (!user) {
    throw new AppError(404, 'not_found', 'User not found.');
  }
  return user.creditBalance ?? 0;
}

export async function getCreditSummary(userId) {
  const user = await User.findById(userId).select('creditBalance role').lean();
  if (!user) {
    throw new AppError(404, 'not_found', 'User not found.');
  }

  const balance = user.creditBalance ?? 0;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [usedThisMonth, recentTransactions] = await Promise.all([
    CreditTransaction.aggregate([
      {
        $match: {
          userId: user._id,
          type: 'deduction',
          status: 'success',
          createdAt: { $gte: monthStart }
        }
      },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]),
    CreditTransaction.find({ userId: user._id })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean()
  ]);

  const used = usedThisMonth[0]?.total ?? 0;
  const lowCreditThreshold = config.credits.lowCreditThreshold;

  return {
    balance,
    usedThisMonth: used,
    lowCredit: balance > 0 && balance <= lowCreditThreshold,
    exhausted: balance === 0,
    isAdmin: isAdmin(user),
    recentTransactions: recentTransactions.map(formatTransaction)
  };
}

function formatTransaction(tx) {
  return {
    id: String(tx._id),
    type: tx.type,
    amount: tx.amount,
    balanceBefore: tx.balanceBefore,
    balanceAfter: tx.balanceAfter,
    tool: tx.tool,
    action: tx.action,
    status: tx.status,
    description: tx.description,
    createdAt: tx.createdAt
  };
}

export async function grantInitialCredits(userId, session = null) {
  const amount = config.credits.initialFreeCredits;
  if (amount <= 0) return null;

  const options = session ? { session } : undefined;
  const user = await User.findById(userId, null, options);
  if (!user) return null;

  if (user.creditBalance > 0) {
    return user.creditBalance;
  }

  const balanceBefore = user.creditBalance ?? 0;
  user.creditBalance = balanceBefore + amount;
  await user.save(options);

  await CreditTransaction.create(
    [
      {
        userId: user._id,
        type: 'initial_grant',
        amount,
        balanceBefore,
        balanceAfter: user.creditBalance,
        action: 'Welcome credits',
        description: `Initial free credits for new ${user.role} account`,
        status: 'success'
      }
    ],
    options
  );

  logOperation('info', 'credit.granted', {
    userId: String(userId),
    amount,
    type: 'initial_grant',
    balanceAfter: user.creditBalance
  });

  return user.creditBalance;
}

export async function addCredits({
  userId,
  amount,
  type = 'grant',
  description = '',
  metadata = {},
  idempotencyKey = '',
  session = null
}) {
  if (amount <= 0) {
    throw new AppError(400, 'invalid_request', 'Credit amount must be positive.');
  }

  const options = session ? { session } : undefined;

  if (idempotencyKey) {
    const existing = await CreditTransaction.findOne({ idempotencyKey }).lean();
    if (existing && String(existing.userId) === String(userId)) {
      return { balance: existing.balanceAfter, transaction: formatTransaction(existing), duplicate: true };
    }
  }

  const user = await User.findById(userId, null, options);
  if (!user) {
    throw new AppError(404, 'not_found', 'User not found.');
  }

  const balanceBefore = user.creditBalance ?? 0;
  user.creditBalance = balanceBefore + amount;
  await user.save(options);

  const txData = {
        userId: user._id,
        type,
        amount,
        balanceBefore,
        balanceAfter: user.creditBalance,
        description,
        metadata,
        status: 'success'
      };
  if (idempotencyKey) txData.idempotencyKey = idempotencyKey;

  const [transaction] = await CreditTransaction.create([txData], options);

  logOperation('info', 'credit.granted', {
    userId: String(userId),
    amount,
    type,
    balanceAfter: user.creditBalance
  });

  return { balance: user.creditBalance, transaction: formatTransaction(transaction), duplicate: false };
}

/**
 * Atomically deduct credits. Uses conditional update to prevent negative balances
 * and concurrent overspend.
 */
export async function deductCredits({
  userId,
  amount,
  tool = '',
  action = '',
  description = '',
  requestId = '',
  idempotencyKey = '',
  metadata = {},
  session = null
}) {
  if (amount <= 0) {
    return { deducted: 0, balance: await getBalance(userId) };
  }

  if (idempotencyKey) {
    const existing = await CreditTransaction.findOne({
      idempotencyKey,
      type: 'deduction',
      status: 'success'
    }).lean();
    if (existing && String(existing.userId) === String(userId)) {
      return {
        deducted: 0,
        balance: existing.balanceAfter,
        transaction: formatTransaction(existing),
        duplicate: true
      };
    }
  }

  const options = session ? { session, new: true } : { new: true };
  const updated = await User.findOneAndUpdate(
    { _id: userId, creditBalance: { $gte: amount } },
    { $inc: { creditBalance: -amount } },
    options
  );

  if (!updated) {
    const current = await getBalance(userId);
    throw new InsufficientCreditsError(amount, current, { tool });
  }

  const balanceAfter = updated.creditBalance;
  const balanceBefore = balanceAfter + amount;

  const txOptions = session ? { session } : undefined;
  const txData = {
        userId,
        type: 'deduction',
        amount,
        balanceBefore,
        balanceAfter,
        tool,
        action,
        description,
        requestId,
        metadata,
        status: 'success'
      };
  if (idempotencyKey) txData.idempotencyKey = idempotencyKey;

  const [transaction] = await CreditTransaction.create([txData], txOptions);

  logOperation('info', 'credit.deducted', {
    userId: String(userId),
    amount,
    tool,
    balanceAfter
  });

  return {
    deducted: amount,
    balance: balanceAfter,
    transaction: formatTransaction(transaction),
    duplicate: false
  };
}

export async function refundCredits({
  userId,
  amount,
  originalTransactionId = null,
  reason = '',
  metadata = {},
  session = null
}) {
  if (amount <= 0) return null;

  const result = await addCredits({
    userId,
    amount,
    type: 'refund',
    description: reason || 'Credit refund',
    metadata: { ...metadata, originalTransactionId },
    session
  });

  if (originalTransactionId) {
    const options = session ? { session } : undefined;
    await CreditTransaction.findByIdAndUpdate(
      originalTransactionId,
      { status: 'refunded' },
      options
    );
  }

  logOperation('info', 'credit.refund', {
    userId: String(userId),
    amount,
    reason
  });

  return result;
}

export async function logAdminBypass({
  userId,
  tool,
  requestId = '',
  metadata = {}
}) {
  const balance = await getBalance(userId);
  await CreditTransaction.create({
    userId,
    type: 'admin_bypass',
    amount: 0,
    balanceBefore: balance,
    balanceAfter: balance,
    tool,
    action: mcpActionLabel(tool),
    description: 'Admin bypass — no credits charged',
    requestId,
    metadata: { ...metadata, bypass: true },
    status: 'success'
  });

  logOperation('info', 'credit.admin_bypass', { userId: String(userId), tool });
}

export function checkCreditConfirmation(toolName, cost, balance, args = {}) {
  if (cost <= 0) {
    return null;
  }

  if (balance < cost) {
    return new InsufficientCreditsError(cost, balance, { tool: toolName });
  }

  if (args.confirm === true) {
    return null;
  }

  const depletesBalance = cost >= balance;
  const isExpensive = cost >= EXPENSIVE_TOOL_THRESHOLD;
  const lowBalance = balance <= config.credits.lowCreditThreshold;

  if (depletesBalance || (isExpensive && lowBalance)) {
    return new CreditConfirmationRequiredError(cost, balance, { tool: toolName });
  }

  return null;
}

export function buildInsufficientCreditsPayload(err, sessionContext = null) {
  const required = err.details?.required ?? 0;
  const available = err.details?.available ?? 0;
  const shortfall = Math.max(0, required - available);

  return {
    error: 'insufficient_credits',
    message: err.message,
    credits: {
      required,
      available,
      shortfall
    },
    completedSteps: sessionContext?.completedSteps?.map((s) => ({
      tool: s.tool,
      summary: s.summary,
      creditsUsed: s.creditsUsed
    })) ?? [],
    pendingStep: sessionContext?.pendingStep
      ? {
          tool: sessionContext.pendingStep.tool,
          description: sessionContext.pendingStep.description,
          requiredCredits: sessionContext.pendingStep.requiredCredits
        }
      : null,
    purchase: {
      message: 'Purchase a subscription plan to continue.',
      plansUrl: `${config.appUrl}/plans`,
      purchaseHint: 'Say "buy the monthly plan" or visit the plans page to purchase credits.'
    }
  };
}

export function buildConfirmationPayload(err) {
  return {
    error: 'credit_confirmation_required',
    message: err.message,
    credits: {
      required: err.details?.required,
      available: err.details?.available,
      tool: err.details?.tool
    },
    hint: 'Reply with confirmation or call this tool again with confirm: true to proceed.'
  };
}

export async function listTransactions(userId, pagination = {}, filters = {}) {
  const query = { userId };
  if (filters.type) query.type = filters.type;
  if (filters.tool) query.tool = filters.tool;
  if (filters.status) query.status = filters.status;

  const { items, pagination: meta } = await paginateQuery(CreditTransaction, query, {
    sort: { createdAt: -1 },
    pagination
  });

  return {
    transactions: items.map(formatTransaction),
    pagination: meta
  };
}

export async function getToolUsageStats({ sinceDays = 30 } = {}) {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);

  const [byTool, totals] = await Promise.all([
    CreditTransaction.aggregate([
      {
        $match: {
          type: { $in: ['deduction', 'admin_bypass'] },
          createdAt: { $gte: since }
        }
      },
      {
        $group: {
          _id: '$tool',
          count: { $sum: 1 },
          creditsUsed: {
            $sum: {
              $cond: [{ $eq: ['$type', 'deduction'] }, '$amount', 0]
            }
          },
          adminBypasses: {
            $sum: {
              $cond: [{ $eq: ['$type', 'admin_bypass'] }, 1, 0]
            }
          }
        }
      },
      { $sort: { creditsUsed: -1 } }
    ]),
    CreditTransaction.aggregate([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: '$type',
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ])
  ]);

  return { byTool, totals, sinceDays };
}

export { getToolCreditCost, isFreeTool };
