import { computeLatencyStats } from '../lib/percentile.js';
import {
  buildSloMatch,
  formatSloEndpointLabel,
  formatSloMethodLabel
} from '../lib/slo-matching.js';
import { LatencyAlert } from '../models/LatencyAlert.js';
import { LatencyMinuteBucket } from '../models/LatencyMinuteBucket.js';
import { RequestLatencySample } from '../models/RequestLatencySample.js';
import { getAllEnabledSlos } from './slo.service.js';

function alertDedupeKey({ endpoint, method, metric }) {
  return `${method || '*'}:${endpoint}:${metric}`;
}

function formatAlertMessage({
  endpoint,
  method,
  metric,
  currentValue,
  budgetValue,
  deploymentVersion,
  status
}) {
  const endpointLabel = formatSloEndpointLabel(endpoint);
  const methodLabel = formatSloMethodLabel(method);
  const valueText =
    metric === 'availability' ? `${currentValue}%` : `${Math.round(currentValue)}ms`;
  const budgetText =
    metric === 'availability' ? `${budgetValue}%` : `${Math.round(budgetValue)}ms`;

  if (status === 'warning') {
    return `Latency SLO Warning — ${methodLabel} ${endpointLabel} ${metric.toUpperCase()} ${valueText} is above budget ${budgetText}`;
  }

  return `Latency SLO Violation — ${methodLabel} ${endpointLabel} ${metric.toUpperCase()} ${valueText} exceeded budget ${budgetText}${
    deploymentVersion ? ` · version ${deploymentVersion}` : ''
  }`;
}

async function getRecentSamplesForSlo({ endpoint, method, minutes }) {
  const since = new Date(Date.now() - minutes * 60 * 1000);
  const query = {
    createdAt: { $gte: since },
    ...buildSloMatch(endpoint, method)
  };

  return RequestLatencySample.find(query)
    .select('durationMs isError deploymentVersion createdAt route method')
    .sort({ createdAt: -1 })
    .lean();
}

async function getRecentMinuteBucketsForSlo({ endpoint, method, minutes }) {
  const since = new Date(Date.now() - minutes * 60 * 1000);
  const query = {
    minuteStart: { $gte: since },
    ...buildSloMatch(endpoint, method)
  };

  const rows = await LatencyMinuteBucket.find(query).sort({ minuteStart: 1 }).lean();
  const merged = new Map();

  for (const bucket of rows) {
    const key = bucket.minuteStart.toISOString();
    const existing = merged.get(key) || {
      minuteStart: bucket.minuteStart,
      count: 0,
      errorCount: 0,
      durationSamples: [],
      deploymentVersion: bucket.deploymentVersion
    };

    existing.count += bucket.count || 0;
    existing.errorCount += bucket.errorCount || 0;
    existing.durationSamples.push(...(bucket.durationSamples || []));
    existing.deploymentVersion = bucket.deploymentVersion || existing.deploymentVersion;
    merged.set(key, existing);
  }

  return [...merged.values()].sort((a, b) => a.minuteStart - b.minuteStart);
}

function evaluateSampleViolation({ samples, metric, budgetValue }) {
  if (!samples.length || budgetValue == null) {
    return {
      violating: false,
      warning: false,
      currentValue: null,
      maxMs: null,
      sampleCount: 0
    };
  }

  const durations = samples.map((sample) => sample.durationMs);
  const stats = computeLatencyStats(durations);
  const errors = samples.filter((sample) => sample.isError).length;
  const currentValue =
    metric === 'availability'
      ? Number(((((samples.length - errors) / samples.length) * 100)).toFixed(2))
      : metric === 'p95'
        ? stats.p95Ms
        : stats.p99Ms;

  const violating =
    metric === 'availability'
      ? currentValue < budgetValue
      : currentValue > budgetValue;

  const warning =
    !violating &&
    metric !== 'availability' &&
    stats.maxMs > budgetValue;

  return {
    violating,
    warning,
    currentValue,
    maxMs: stats.maxMs,
    sampleCount: stats.count,
    deploymentVersion: samples[0]?.deploymentVersion || null
  };
}

function evaluateConsecutiveMinuteViolations(buckets, budgetMs, metric, requiredMinutes) {
  if (!buckets.length || budgetMs == null) {
    return { violating: false, currentValue: null, consecutiveMinutes: 0 };
  }

  const recent = buckets.slice(-requiredMinutes);
  if (recent.length < requiredMinutes) {
    return { violating: false, currentValue: null, consecutiveMinutes: recent.length };
  }

  const values = recent.map((bucket) => {
    const stats = computeLatencyStats(bucket.durationSamples || []);
    return metric === 'p95' ? stats.p95Ms : stats.p99Ms;
  });

  const allViolating = values.every((value) => value > budgetMs);
  return {
    violating: allViolating,
    currentValue: values[values.length - 1] ?? null,
    consecutiveMinutes: allViolating ? requiredMinutes : 0,
    values
  };
}

function evaluateAvailabilityViolation(buckets, targetPct, requiredMinutes) {
  const recent = buckets.slice(-requiredMinutes);
  if (recent.length < requiredMinutes) {
    return { violating: false, currentValue: null };
  }

  let total = 0;
  let errors = 0;
  for (const bucket of recent) {
    total += bucket.count || 0;
    errors += bucket.errorCount || 0;
  }

  const availabilityPct = total ? Number((((total - errors) / total) * 100).toFixed(2)) : 100;
  return {
    violating: availabilityPct < targetPct,
    currentValue: availabilityPct
  };
}

async function upsertAlert({
  slo,
  metric,
  budgetValue,
  evaluation,
  status
}) {
  const dedupeKey = alertDedupeKey({
    endpoint: slo.endpoint,
    method: slo.method,
    metric
  });

  const activeAlert = await LatencyAlert.findOne({
    dedupeKey,
    status: { $in: ['warning', 'violating'] }
  });

  const sloTarget =
    metric === 'availability'
      ? `${slo.availabilityTarget}% availability`
      : `${metric.toUpperCase()} < ${budgetValue}ms`;

  const message = formatAlertMessage({
    endpoint: slo.endpoint,
    method: slo.method,
    metric,
    currentValue: evaluation.currentValue,
    budgetValue,
    deploymentVersion: evaluation.deploymentVersion,
    status
  });

  if (activeAlert) {
    activeAlert.currentValue = evaluation.currentValue;
    activeAlert.deploymentVersion = evaluation.deploymentVersion;
    activeAlert.status = status;
    activeAlert.message = message;
    if (status === 'violating' || status === 'warning') {
      activeAlert.violationDurationMs = Date.now() - activeAlert.violationStartedAt.getTime();
    }
    if (status === 'resolved') {
      activeAlert.resolvedAt = new Date();
      activeAlert.violationDurationMs = Date.now() - activeAlert.violationStartedAt.getTime();
    }
    await activeAlert.save();
    return activeAlert.toObject();
  }

  if (status === 'resolved') {
    return null;
  }

  const alert = await LatencyAlert.create({
    dedupeKey,
    endpoint: slo.endpoint,
    method: slo.method,
    metric,
    status,
    currentValue: evaluation.currentValue,
    budgetValue,
    sloTarget,
    deploymentVersion: evaluation.deploymentVersion,
    violationStartedAt: new Date(),
    message
  });

  return alert.toObject();
}

export async function evaluateLatencyAlerts() {
  const slos = await getAllEnabledSlos();
  const results = [];

  for (const slo of slos) {
    const metric = slo.primaryMetric;
    const budgetValue =
      metric === 'availability'
        ? slo.availabilityTarget
        : metric === 'p95'
          ? slo.p95BudgetMs
          : slo.p99BudgetMs;

    const [samples, buckets] = await Promise.all([
      getRecentSamplesForSlo({
        endpoint: slo.endpoint,
        method: slo.method,
        minutes: slo.alertConsecutiveMinutes
      }),
      getRecentMinuteBucketsForSlo({
        endpoint: slo.endpoint,
        method: slo.method,
        minutes: slo.alertConsecutiveMinutes + 2
      })
    ]);

    const sampleEvaluation = evaluateSampleViolation({
      samples,
      metric,
      budgetValue
    });

    let sustainedViolation = { violating: false };
    if (metric === 'availability') {
      sustainedViolation = evaluateAvailabilityViolation(
        buckets,
        slo.availabilityTarget,
        slo.alertConsecutiveMinutes
      );
    } else if (budgetValue != null) {
      sustainedViolation = evaluateConsecutiveMinuteViolations(
        buckets,
        budgetValue,
        metric,
        slo.alertConsecutiveMinutes
      );
    }

    const evaluation = {
      currentValue: sampleEvaluation.currentValue ?? sustainedViolation.currentValue,
      deploymentVersion: sampleEvaluation.deploymentVersion || buckets.at(-1)?.deploymentVersion || null,
      maxMs: sampleEvaluation.maxMs,
      sampleCount: sampleEvaluation.sampleCount
    };

    let status = 'resolved';
    if (sampleEvaluation.violating || sustainedViolation.violating) {
      status = 'violating';
    } else if (sampleEvaluation.warning) {
      status = 'warning';
    }

    if (status === 'violating' || status === 'warning') {
      const alert = await upsertAlert({ slo, metric, budgetValue, evaluation, status });
      if (alert) results.push(alert);
    } else {
      const resolved = await upsertAlert({
        slo,
        metric,
        budgetValue,
        evaluation,
        status: 'resolved'
      });
      if (resolved) results.push(resolved);
    }
  }

  return results;
}

function sinceDateFromFilters(filters = {}) {
  if (filters.sinceMinutes) {
    const sinceMinutes = Number(filters.sinceMinutes);
    if (Number.isFinite(sinceMinutes) && sinceMinutes > 0) {
      return new Date(Date.now() - sinceMinutes * 60 * 1000);
    }
  }

  return new Date(Date.now() - 24 * 60 * 60 * 1000);
}

export async function listAlerts(filters = {}) {
  await evaluateLatencyAlerts();

  const query = {
    updatedAt: { $gte: sinceDateFromFilters(filters) }
  };
  if (filters.status) {
    query.status = String(filters.status);
  }

  const alerts = await LatencyAlert.find(query).sort({ updatedAt: -1 }).limit(100).lean();
  return alerts.map((alert) => ({
    id: String(alert._id),
    endpoint: alert.endpoint,
    endpointLabel: formatSloEndpointLabel(alert.endpoint),
    method: alert.method,
    methodLabel: formatSloMethodLabel(alert.method),
    metric: alert.metric,
    status: alert.status,
    currentValue: alert.currentValue,
    budgetValue: alert.budgetValue,
    sloTarget: alert.sloTarget,
    deploymentVersion: alert.deploymentVersion,
    violationStartedAt: alert.violationStartedAt,
    resolvedAt: alert.resolvedAt,
    violationDurationMs: alert.violationDurationMs,
    message: alert.message,
    updatedAt: alert.updatedAt
  }));
}

export async function getAlert(alertId) {
  await evaluateLatencyAlerts();
  const alert = await LatencyAlert.findById(alertId).lean();
  if (!alert) return null;
  return {
    id: String(alert._id),
    endpoint: alert.endpoint,
    endpointLabel: formatSloEndpointLabel(alert.endpoint),
    method: alert.method,
    methodLabel: formatSloMethodLabel(alert.method),
    metric: alert.metric,
    status: alert.status,
    currentValue: alert.currentValue,
    budgetValue: alert.budgetValue,
    sloTarget: alert.sloTarget,
    deploymentVersion: alert.deploymentVersion,
    violationStartedAt: alert.violationStartedAt,
    resolvedAt: alert.resolvedAt,
    violationDurationMs: alert.violationDurationMs,
    message: alert.message,
    updatedAt: alert.updatedAt
  };
}
