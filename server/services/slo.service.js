import { AppError } from '../middleware/error.middleware.js';
import { getRequestContext } from '../lib/request-context.js';
import { EndpointSlo } from '../models/EndpointSlo.js';
import { EndpointSloAudit } from '../models/EndpointSloAudit.js';
import { formatBudgetStatus, getEndpointLatencyStats } from './latency.service.js';

function normalizeEndpoint(endpoint = '') {
  const value = String(endpoint).trim();
  if (!value.startsWith('/')) {
    return `/${value}`;
  }
  return value;
}

function validateSloInput(input = {}) {
  const endpoint = normalizeEndpoint(input.endpoint);
  if (!endpoint || endpoint === '/') {
    throw new AppError(400, 'invalid_slo', 'Endpoint is required.');
  }

  const method = String(input.method || '*').trim().toUpperCase() || '*';
  const p95BudgetMs = input.p95BudgetMs != null ? Number(input.p95BudgetMs) : undefined;
  const p99BudgetMs = input.p99BudgetMs != null ? Number(input.p99BudgetMs) : undefined;
  const availabilityTarget =
    input.availabilityTarget != null ? Number(input.availabilityTarget) : undefined;

  if (p95BudgetMs != null && (!Number.isFinite(p95BudgetMs) || p95BudgetMs < 1)) {
    throw new AppError(400, 'invalid_slo', 'P95 budget must be a positive number.');
  }

  if (p99BudgetMs != null && (!Number.isFinite(p99BudgetMs) || p99BudgetMs < 1)) {
    throw new AppError(400, 'invalid_slo', 'P99 budget must be a positive number.');
  }

  if (
    availabilityTarget != null &&
    (!Number.isFinite(availabilityTarget) || availabilityTarget < 0 || availabilityTarget > 100)
  ) {
    throw new AppError(400, 'invalid_slo', 'Availability target must be between 0 and 100.');
  }

  if (p95BudgetMs == null && p99BudgetMs == null && availabilityTarget == null) {
    throw new AppError(400, 'invalid_slo', 'At least one budget or availability target is required.');
  }

  const primaryMetric = input.primaryMetric || 'p99';
  if (!['p95', 'p99', 'availability'].includes(primaryMetric)) {
    throw new AppError(400, 'invalid_slo', 'Primary metric must be p95, p99, or availability.');
  }

  const evaluationWindowDays = Number(input.evaluationWindowDays || 30);
  if (!Number.isFinite(evaluationWindowDays) || evaluationWindowDays < 1 || evaluationWindowDays > 90) {
    throw new AppError(400, 'invalid_slo', 'Evaluation window must be between 1 and 90 days.');
  }

  const alertConsecutiveMinutes = Number(input.alertConsecutiveMinutes || 5);
  if (
    !Number.isFinite(alertConsecutiveMinutes) ||
    alertConsecutiveMinutes < 1 ||
    alertConsecutiveMinutes > 60
  ) {
    throw new AppError(400, 'invalid_slo', 'Alert consecutive minutes must be between 1 and 60.');
  }

  return {
    endpoint,
    method,
    enabled: input.enabled !== false,
    p95BudgetMs,
    p99BudgetMs,
    availabilityTarget,
    primaryMetric,
    evaluationWindowDays,
    alertConsecutiveMinutes,
    description: String(input.description || '').trim()
  };
}

function sloToResponse(doc, current = null) {
  const budgetMs =
    doc.primaryMetric === 'p95'
      ? doc.p95BudgetMs
      : doc.primaryMetric === 'p99'
        ? doc.p99BudgetMs
        : doc.availabilityTarget;

  const currentValue =
    doc.primaryMetric === 'p95'
      ? current?.p95Ms
      : doc.primaryMetric === 'p99'
        ? current?.p99Ms
        : current?.availabilityPct;

  const budgetStatus =
    doc.primaryMetric === 'availability'
      ? currentValue != null && budgetMs != null
        ? currentValue >= budgetMs
          ? { status: 'healthy', label: 'Healthy' }
          : { status: 'violating', label: 'Violating' }
        : { status: 'unknown', label: '—' }
      : formatBudgetStatus(currentValue, budgetMs);

  return {
    id: String(doc._id),
    endpoint: doc.endpoint,
    method: doc.method,
    enabled: doc.enabled,
    p95BudgetMs: doc.p95BudgetMs ?? null,
    p99BudgetMs: doc.p99BudgetMs ?? null,
    availabilityTarget: doc.availabilityTarget ?? null,
    primaryMetric: doc.primaryMetric,
    evaluationWindowDays: doc.evaluationWindowDays,
    alertConsecutiveMinutes: doc.alertConsecutiveMinutes,
    description: doc.description || '',
    sloTarget:
      doc.primaryMetric === 'availability'
        ? `${doc.availabilityTarget}% availability`
        : `${doc.primaryMetric.toUpperCase()} < ${budgetMs}ms`,
    currentValue,
    budgetMs,
    budgetUsedPct:
      doc.primaryMetric !== 'availability' && currentValue != null && budgetMs
        ? Number(((currentValue / budgetMs) * 100).toFixed(1))
        : null,
    budgetDifferenceMs:
      doc.primaryMetric !== 'availability' && currentValue != null && budgetMs
        ? currentValue - budgetMs
        : null,
    status: budgetStatus.status,
    statusLabel: budgetStatus.label,
    deploymentVersion: current?.deploymentVersion || null,
    updatedAt: doc.updatedAt,
    createdAt: doc.createdAt
  };
}

async function writeAudit({ slo, action, admin, oldValues, newValues }) {
  const ctx = getRequestContext();
  await EndpointSloAudit.create({
    sloId: slo._id,
    endpoint: slo.endpoint,
    method: slo.method,
    action,
    adminId: String(admin._id),
    adminName: admin.name || admin.email,
    requestId: ctx?.requestId,
    oldValues,
    newValues
  });
}

function snapshotSlo(doc) {
  return {
    endpoint: doc.endpoint,
    method: doc.method,
    enabled: doc.enabled,
    p95BudgetMs: doc.p95BudgetMs ?? null,
    p99BudgetMs: doc.p99BudgetMs ?? null,
    availabilityTarget: doc.availabilityTarget ?? null,
    primaryMetric: doc.primaryMetric,
    evaluationWindowDays: doc.evaluationWindowDays,
    alertConsecutiveMinutes: doc.alertConsecutiveMinutes,
    description: doc.description || ''
  };
}

export async function listSlos(filters = {}) {
  const docs = await EndpointSlo.find({}).sort({ endpoint: 1, method: 1 }).lean();
  const sinceMinutes = filters.sinceMinutes || 24 * 60;

  const rows = await Promise.all(
    docs.map(async (doc) => {
      const stats = await getEndpointLatencyStats({
        route: doc.endpoint,
        method: doc.method === '*' ? undefined : doc.method,
        sinceMinutes
      });

      const availabilityPct =
        stats.count && stats.errorRate != null ? Number((100 - stats.errorRate).toFixed(2)) : null;

      return sloToResponse(doc, {
        ...stats,
        availabilityPct
      });
    })
  );

  return rows;
}

export async function createSlo(admin, input) {
  const data = validateSloInput(input);
  const existing = await EndpointSlo.findOne({ endpoint: data.endpoint, method: data.method });
  if (existing) {
    throw new AppError(409, 'slo_exists', 'An SLO already exists for this endpoint and method.');
  }

  const slo = await EndpointSlo.create(data);
  await writeAudit({
    slo,
    action: 'create',
    admin,
    oldValues: null,
    newValues: snapshotSlo(slo)
  });

  return sloToResponse(slo.toObject());
}

export async function updateSlo(admin, sloId, input) {
  const slo = await EndpointSlo.findById(sloId);
  if (!slo) {
    throw new AppError(404, 'not_found', 'SLO not found.');
  }

  const oldValues = snapshotSlo(slo);
  const data = validateSloInput({ ...snapshotSlo(slo), ...input, endpoint: input.endpoint ?? slo.endpoint });

  if (data.endpoint !== slo.endpoint || data.method !== slo.method) {
    const conflict = await EndpointSlo.findOne({
      _id: { $ne: slo._id },
      endpoint: data.endpoint,
      method: data.method
    });
    if (conflict) {
      throw new AppError(409, 'slo_exists', 'An SLO already exists for this endpoint and method.');
    }
  }

  Object.assign(slo, data);
  await slo.save();

  await writeAudit({
    slo,
    action: 'update',
    admin,
    oldValues,
    newValues: snapshotSlo(slo)
  });

  return sloToResponse(slo.toObject());
}

export async function deleteSlo(admin, sloId) {
  const slo = await EndpointSlo.findById(sloId);
  if (!slo) {
    throw new AppError(404, 'not_found', 'SLO not found.');
  }

  const oldValues = snapshotSlo(slo);
  await slo.deleteOne();
  await writeAudit({
    slo,
    action: 'delete',
    admin,
    oldValues,
    newValues: null
  });

  return { deleted: true, id: sloId };
}

export async function getSloAudit(sloId) {
  return EndpointSloAudit.find({ sloId }).sort({ createdAt: -1 }).limit(50).lean();
}

export async function getAllEnabledSlos() {
  return EndpointSlo.find({ enabled: true }).lean();
}

export { validateSloInput, sloToResponse };
