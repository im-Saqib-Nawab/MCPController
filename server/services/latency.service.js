import { computeLatencyStats } from '../lib/percentile.js';
import { buildTimingBreakdown } from '../lib/timing-breakdown.js';
import { RequestLatencySample } from '../models/RequestLatencySample.js';
import { getTrace } from './observability.service.js';

function sinceDate(filters = {}) {
  if (filters.sinceMinutes) {
    const since = Number(filters.sinceMinutes);
    if (Number.isFinite(since) && since > 0) {
      return new Date(Date.now() - since * 60 * 1000);
    }
  }

  if (filters.since) {
    const since = new Date(filters.since);
    if (!Number.isNaN(since.getTime())) {
      return since;
    }
  }

  return new Date(Date.now() - 24 * 60 * 60 * 1000);
}

function untilDate(filters = {}) {
  if (filters.until) {
    const until = new Date(filters.until);
    if (!Number.isNaN(until.getTime())) {
      return until;
    }
  }
  return new Date();
}

function buildSampleMatch(filters = {}) {
  const match = {
    createdAt: {
      $gte: sinceDate(filters),
      $lte: untilDate(filters)
    }
  };

  if (filters.route) {
    match.route = String(filters.route);
  }

  if (filters.method) {
    match.method = String(filters.method);
  }

  if (filters.statusCode) {
    match.statusCode = Number(filters.statusCode);
  }

  if (filters.deploymentVersion) {
    match.deploymentVersion = String(filters.deploymentVersion);
  }

  if (filters.role) {
    match.role = String(filters.role);
  }

  return match;
}

function sloStatus(actualMs, budgetMs) {
  if (!budgetMs || !actualMs) return 'unknown';
  if (actualMs <= budgetMs) return 'healthy';
  return 'violating';
}

function formatBudgetStatus(actualMs, budgetMs) {
  const status = sloStatus(actualMs, budgetMs);
  if (status === 'unknown') return { status, label: '—' };
  return { status, label: status === 'healthy' ? 'Healthy' : 'Violating' };
}

export async function getLatencyOverview(_user, filters = {}, sloConfigs = []) {
  const match = buildSampleMatch(filters);

  const [samples, endpointRows] = await Promise.all([
    RequestLatencySample.find(match).select('durationMs isError').lean(),
    RequestLatencySample.aggregate([
      { $match: match },
      {
        $group: {
          _id: { route: '$route', method: '$method' },
          durations: { $push: '$durationMs' },
          count: { $sum: 1 },
          errors: { $sum: { $cond: ['$isError', 1, 0] } },
          deploymentVersion: { $last: '$deploymentVersion' }
        }
      },
      { $sort: { count: -1 } }
    ])
  ]);

  const durations = samples.map((s) => s.durationMs);
  const errorCount = samples.filter((s) => s.isError).length;
  const summary = computeLatencyStats(durations);

  const sloByKey = new Map(
    sloConfigs.map((slo) => [`${slo.method}:${slo.endpoint}`, slo])
  );

  const endpoints = endpointRows.map((row) => {
    const route = row._id.route;
    const method = row._id.method;
    const stats = computeLatencyStats(row.durations);
    const slo =
      sloByKey.get(`${method}:${route}`) ||
      sloByKey.get(`*:${route}`) ||
      null;
    const budgetMs = slo?.p99BudgetMs || slo?.p95BudgetMs || null;
    const budgetMetric = slo?.primaryMetric === 'p95' ? stats.p95Ms : stats.p99Ms;

    return {
      endpoint: route,
      method,
      ...stats,
      errorRate: row.count ? Number(((row.errors / row.count) * 100).toFixed(1)) : 0,
      budgetMs,
      budgetMetric: slo?.primaryMetric || 'p99',
      deploymentVersion: row.deploymentVersion || null,
      sloId: slo?._id ? String(slo._id) : null,
      ...formatBudgetStatus(budgetMetric, budgetMs)
    };
  });

  return {
    window: { since: match.createdAt.$gte, until: match.createdAt.$lte },
    summary: {
      requestCount: summary.count,
      avgMs: summary.avgMs,
      p50Ms: summary.p50Ms,
      p95Ms: summary.p95Ms,
      p99Ms: summary.p99Ms,
      maxMs: summary.maxMs,
      errorRate: summary.count ? Number(((errorCount / summary.count) * 100).toFixed(1)) : 0
    },
    endpoints
  };
}

export async function getEndpointSlowRequests(_user, filters = {}) {
  const match = buildSampleMatch(filters);
  const metric = filters.metric === 'p95' ? 'p95' : 'p99';
  const limit = Math.min(Number(filters.limit) || 20, 100);

  const rows = await RequestLatencySample.find(match)
    .sort({ durationMs: -1 })
    .limit(limit)
    .select('requestId durationMs method route statusCode deploymentVersion createdAt')
    .lean();

  const stats = computeLatencyStats(rows.map((r) => r.durationMs));

  return {
    endpoint: filters.route,
    method: filters.method || null,
    metric,
    metricValueMs: metric === 'p95' ? stats.p95Ms : stats.p99Ms,
    slowestRequests: rows.map((row) => ({
      requestId: row.requestId,
      durationMs: row.durationMs,
      method: row.method,
      route: row.route,
      statusCode: row.statusCode,
      deploymentVersion: row.deploymentVersion,
      timestamp: row.createdAt
    }))
  };
}

export async function getRequestLatencyDetail(user, requestId) {
  const sample = await RequestLatencySample.findOne({ requestId }).lean();
  const trace = await getTrace(user, requestId);

  const breakdown = buildTimingBreakdown({
    totalDurationMs: sample?.durationMs || trace?.durationMs,
    phaseTimings: sample?.phaseTimings
      ? { phases: sample.phaseTimings, details: sample.timingDetails || {} }
      : null,
    traceSteps: trace?.steps || []
  });

  return {
    requestId,
    method: sample?.method || trace?.method,
    route: sample?.route || trace?.route,
    action: sample?.action || trace?.action,
    role: sample?.role || trace?.role,
    statusCode: sample?.statusCode || trace?.statusCode,
    durationMs: sample?.durationMs || trace?.durationMs,
    deploymentVersion: sample?.deploymentVersion || null,
    timestamp: sample?.createdAt || trace?.timestamp,
    breakdown,
    trace: trace
      ? {
          traceId: trace.traceId,
          status: trace.status,
          stepCount: trace.steps?.length || 0,
          steps: trace.steps
        }
      : null
  };
}

export async function getEndpointLatencyStats(filters = {}) {
  const match = buildSampleMatch(filters);
  const rows = await RequestLatencySample.find(match).select('durationMs isError deploymentVersion').lean();
  const stats = computeLatencyStats(rows.map((r) => r.durationMs));
  const errors = rows.filter((r) => r.isError).length;

  return {
    ...stats,
    errorRate: stats.count ? Number(((errors / stats.count) * 100).toFixed(2)) : 0,
    deploymentVersion: rows.length ? rows[rows.length - 1].deploymentVersion : null
  };
}

export { sloStatus, formatBudgetStatus, sinceDate, buildSampleMatch };
