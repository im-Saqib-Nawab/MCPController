import { config } from '../../config/env.js';
import { getActor, toolResult } from '../actor.js';
import * as creditService from '../../services/credit.service.js';
import * as subscriptionService from '../../services/subscription.service.js';
import * as paymentService from '../../services/payment.service.js';
import * as mcpSessionService from '../../services/mcp-session.service.js';
import { CREDIT_COSTS } from '../../config/credit-costs.js';

export function getCreditBalanceTool(authInfo) {
  return async () => {
    await getActor(authInfo);
    const userId = authInfo.extra.userId;
    const [summary, subscription] = await Promise.all([
      creditService.getCreditSummary(userId),
      subscriptionService.getActiveSubscription(userId)
    ]);

    return toolResult({
      credits: summary.balance,
      usedThisMonth: summary.usedThisMonth,
      lowCredit: summary.lowCredit,
      exhausted: summary.exhausted,
      subscription,
      message: summary.exhausted
        ? 'You have no credits remaining. Purchase a plan to continue using MCP tools.'
        : summary.lowCredit
          ? `You have ${summary.balance} credits remaining — consider purchasing a plan soon.`
          : `You have ${summary.balance} credits remaining.`
    });
  };
}

export function listSubscriptionPlansTool(authInfo) {
  return async () => {
    await getActor(authInfo);
    const plans = subscriptionService.getPlans();
    return toolResult({
      plans,
      purchaseUrl: `${config.appUrl}/plans`,
      message: 'Visit the plans page or say "buy the monthly plan" to purchase credits.'
    });
  };
}

export function getCreditUsageSummaryTool(authInfo) {
  return async () => {
    const userId = authInfo.extra.userId;
    await getActor(authInfo);
    const summary = await creditService.getCreditSummary(userId);
    const { transactions } = await creditService.listTransactions(userId, { limit: 10 });

    return toolResult({
      balance: summary.balance,
      usedThisMonth: summary.usedThisMonth,
      recentUsage: transactions.filter((t) => t.type === 'deduction'),
      recentGrants: transactions.filter((t) =>
        ['grant', 'initial_grant', 'subscription_grant', 'refund'].includes(t.type)
      )
    });
  };
}

export function getPurchaseLinkTool(authInfo) {
  return async ({ planId = 'monthly' } = {}) => {
    await getActor(authInfo);
    const userId = authInfo.extra.userId;
    const checkout = await paymentService.createCheckoutSession({
      userId,
      planId,
      returnUrl: `${config.appUrl}/purchase/success?from=mcp`
    });

    return toolResult({
      plan: checkout.plan,
      checkoutUrl: checkout.checkoutUrl,
      message: `Open ${checkout.checkoutUrl} to purchase the ${checkout.plan.name}. After payment, return to ChatGPT and say "continue" to resume your previous task.`,
      devNote: config.payment.provider === 'dev'
        ? 'Development mode: complete payment on the plans page.'
        : undefined
    });
  };
}

export function explainCreditsTool(authInfo) {
  return async () => {
    await getActor(authInfo);
    const costs = Object.entries(CREDIT_COSTS)
      .filter(([, cost]) => cost > 0)
      .map(([tool, cost]) => ({ tool, cost }))
      .sort((a, b) => a.cost - b.cost || a.tool.localeCompare(b.tool));

    return toolResult({
      howItWorks: [
        'Each MCP tool action consumes credits based on its complexity.',
        'Read operations cost 1–2 credits. Writes cost 3–10 credits.',
        'Credits are checked before each step — if you run out mid-task, completed steps are preserved.',
        'Administrators use tools without consuming credits.',
        'Purchase a monthly or yearly plan to add credits to your balance.'
      ],
      freeTools: Object.entries(CREDIT_COSTS)
        .filter(([, cost]) => cost === 0)
        .map(([tool]) => tool),
      paidTools: costs,
      initialFreeCredits: config.credits.initialFreeCredits,
      plansUrl: `${config.appUrl}/plans`
    });
  };
}

export function continuePreviousTaskTool(authInfo) {
  return async () => {
    const userId = authInfo.extra.userId;
    await getActor(authInfo);
    const session = await mcpSessionService.getActiveSession(userId);

    if (!session?.pendingStep) {
      return toolResult({
        message: 'No pending task to continue. All previous steps were completed or no multi-step task is in progress.',
        session: mcpSessionService.formatSessionForResponse(session)
      });
    }

    const balance = await creditService.getBalance(userId);
    const required = session.pendingStep.requiredCredits;

    if (balance < required) {
      return toolResult({
        error: 'insufficient_credits',
        message: `Cannot continue yet. "${session.pendingStep.description}" requires ${required} credits, but you have ${balance}.`,
        completedSteps: session.completedSteps,
        pendingStep: session.pendingStep,
        purchaseUrl: `${config.appUrl}/plans`,
        shortfall: required - balance
      });
    }

    return toolResult({
      message: `Ready to continue: ${session.pendingStep.description} (${required} credits).`,
      completedSteps: session.completedSteps,
      pendingStep: {
        tool: session.pendingStep.tool,
        args: session.pendingStep.args,
        requiredCredits: required,
        hint: `Call the "${session.pendingStep.tool}" tool with the stored arguments to complete this step.`
      },
      credits: { available: balance, required }
    });
  };
}
