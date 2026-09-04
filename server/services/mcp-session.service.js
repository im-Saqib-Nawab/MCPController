import { McpSessionContext } from '../models/McpSessionContext.js';
import { getToolCreditCost } from '../config/credit-costs.js';
import { mcpActionLabel } from '../lib/audit-log.js';

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function getActiveSession(userId) {
  return McpSessionContext.findOne({
    userId,
    status: 'active',
    expiresAt: { $gt: new Date() }
  })
    .sort({ updatedAt: -1 })
    .lean();
}

export async function recordCompletedStep({
  userId,
  clientId = '',
  tool,
  summary = '',
  resultSnapshot = null,
  creditsUsed = 0,
  originalRequest = ''
}) {
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  let session = await McpSessionContext.findOne({
    userId,
    status: 'active',
    expiresAt: { $gt: new Date() }
  });

  if (!session) {
    session = new McpSessionContext({
      userId,
      clientId,
      originalRequest,
      completedSteps: [],
      status: 'active',
      expiresAt
    });
  }

  session.completedSteps.push({
    tool,
    summary: summary || mcpActionLabel(tool),
    resultSnapshot,
    creditsUsed,
    completedAt: new Date()
  });
  session.expiresAt = expiresAt;
  if (originalRequest) session.originalRequest = originalRequest;
  if (clientId) session.clientId = clientId;

  session.pendingStep = undefined;
  await session.save();
  return session;
}

export async function setPendingStep({
  userId,
  clientId = '',
  tool,
  args = {},
  originalRequest = ''
}) {
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const requiredCredits = getToolCreditCost(tool);

  let session = await McpSessionContext.findOne({
    userId,
    status: 'active',
    expiresAt: { $gt: new Date() }
  });

  if (!session) {
    session = new McpSessionContext({
      userId,
      clientId,
      originalRequest,
      completedSteps: [],
      status: 'active',
      expiresAt
    });
  }

  session.pendingStep = {
    tool,
    args,
    requiredCredits,
    description: mcpActionLabel(tool)
  };
  session.expiresAt = expiresAt;
  if (originalRequest) session.originalRequest = originalRequest;
  await session.save();
  return session;
}

export async function clearPendingStep(userId) {
  const session = await McpSessionContext.findOne({
    userId,
    status: 'active'
  });
  if (session) {
    session.pendingStep = undefined;
    session.status = 'completed';
    await session.save();
  }
}

export function formatSessionForResponse(session) {
  if (!session) return null;
  return {
    originalRequest: session.originalRequest,
    completedSteps: (session.completedSteps || []).map((s) => ({
      tool: s.tool,
      summary: s.summary,
      creditsUsed: s.creditsUsed,
      completedAt: s.completedAt
    })),
    pendingStep: session.pendingStep
      ? {
          tool: session.pendingStep.tool,
          description: session.pendingStep.description,
          requiredCredits: session.pendingStep.requiredCredits,
          args: session.pendingStep.args
        }
      : null
  };
}
