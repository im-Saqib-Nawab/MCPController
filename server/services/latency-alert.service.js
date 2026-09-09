import { computeLatencyStats } from '../lib/percentile.js';
import { LatencyAlert } from '../models/LatencyAlert.js';
import { LatencyMinuteBucket } from '../models/LatencyMinuteBucket.js';
import { getAllEnabledSlos } from './slo.service.js';

function alertDedupeKey({ endpoint, method, metric }) {
  return `${method || '*'}:${endpoint}:${metric}`;
}

function formatAlertMessage({ endpoint, metric, currentValue, budgetValue, deploymentVersion }) {
  return `Latency SLO Violation — ${endpoint} ${metric.toUpperCase()} ${currentValue}ms (budget ${budgetValue}ms)${
    deploymentVersion ? ` · version ${deploymentVersion}` : ''
  }`;
}

async function getRecentMinuteBuckets({ route, method, minutes }) {
  const since = new Date(Date.now() - minutes * 60 * 1000);
  const query = {
    route,
    minuteStart: { $gte: since }
  };

  if (method && method !== '*') {
    query.method = method;
  }

  return LatencyMinuteBucket.find(query).sort({ minuteStart: 1 }).lean();
}

function evaluateConsecutiveViolations(buckets, budgetMs, metric, requiredMinutes) {
  if (!buckets.length || !budgetMs) {
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

export async function evaluateLatencyAlerts() {
  const slos = await getAllEnabledSlos();
  const results = [];

  for (const slo of slos) {
    const metric = slo.primaryMetric;
    const buckets = await getRecentMinuteBuckets({
      route: slo.endpoint,
      method: slo.method,
      minutes: slo.alertConsecutiveMinutes + 2
    });

    let evaluation;
    if (metric === 'availability') {
      evaluation = evaluateAvailabilityViolation(
        buckets,
        slo.availabilityTarget,
        slo.alertConsecutiveMinutes
      );
    } else {
      const budgetMs = metric === 'p95' ? slo.p95BudgetMs : slo.p99BudgetMs;
      evaluation = evaluateConsecutiveViolations(
        buckets,
        budgetMs,
        metric,
        slo.alertConsecutiveMinutes
      );
    }

    const dedupeKey = alertDedupeKey({
      endpoint: slo.endpoint,
      method: slo.method,
      metric
    });

    const activeAlert = await LatencyAlert.findOne({
      dedupeKey,
      status: { $in: ['warning', 'violating'] }
    });

    const budgetValue =
      metric === 'availability'
        ? slo.availabilityTarget
        : metric === 'p95'
          ? slo.p95BudgetMs
          : slo.p99BudgetMs;

    if (evaluation.violating) {
      const deploymentVersion = buckets.at(-1)?.deploymentVersion || null;
      const sloTarget =
        metric === 'availability'
          ? `${slo.availabilityTarget}% availability`
          : `${metric.toUpperCase()} < ${budgetValue}ms`;

      if (activeAlert) {
        activeAlert.currentValue = evaluation.currentValue;
        activeAlert.deploymentVersion = deploymentVersion;
        activeAlert.status = 'violating';
        activeAlert.violationDurationMs = Date.now() - activeAlert.violationStartedAt.getTime();
        activeAlert.message = formatAlertMessage({
          endpoint: slo.endpoint,
          metric,
          currentValue: evaluation.currentValue,
          budgetValue,
          deploymentVersion
        });
        await activeAlert.save();
        results.push(activeAlert.toObject());
      } else {
        const alert = await LatencyAlert.create({
          dedupeKey,
          endpoint: slo.endpoint,
          method: slo.method,
          metric,
          status: 'violating',
          currentValue: evaluation.currentValue,
          budgetValue,
          sloTarget,
          deploymentVersion,
          violationStartedAt: new Date(),
          message: formatAlertMessage({
            endpoint: slo.endpoint,
            metric,
            currentValue: evaluation.currentValue,
            budgetValue,
            deploymentVersion
          })
        });
        results.push(alert.toObject());
      }
    } else if (activeAlert) {
      activeAlert.status = 'resolved';
      activeAlert.resolvedAt = new Date();
      activeAlert.violationDurationMs = Date.now() - activeAlert.violationStartedAt.getTime();
      await activeAlert.save();
      results.push(activeAlert.toObject());
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
    method: alert.method,
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
    method: alert.method,
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
