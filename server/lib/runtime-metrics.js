import mongoose from 'mongoose';
import { config } from '../config/env.js';
import { getLogQueueDepth } from './log-queue.js';

const globalCache = globalThis;

if (!globalCache.__mcpcontrollerRuntimeMetrics) {
  globalCache.__mcpcontrollerRuntimeMetrics = {
    startedAt: Date.now(),
    counters: new Map(),
    httpDurationMs: [],
    httpByRoute: new Map()
  };
}

const state = globalCache.__mcpcontrollerRuntimeMetrics;
const MAX_DURATION_SAMPLES = 5000;

export function incrementMetric(name, amount = 1) {
  state.counters.set(name, (state.counters.get(name) || 0) + amount);
}

export function recordHttpRequest({ method, route, statusCode, durationMs }) {
  incrementMetric('http_requests_total');

  if (statusCode >= 500) {
    incrementMetric('http_errors_5xx_total');
  } else if (statusCode >= 400) {
    incrementMetric('http_errors_4xx_total');
  }

  if (durationMs >= config.logSlowRequestMs) {
    incrementMetric('http_slow_requests_total');
  }

  state.httpDurationMs.push(durationMs);
  if (state.httpDurationMs.length > MAX_DURATION_SAMPLES) {
    state.httpDurationMs.splice(0, state.httpDurationMs.length - MAX_DURATION_SAMPLES);
  }

  const routeKey = `${method} ${route}`;
  const bucket = state.httpByRoute.get(routeKey) || { count: 0, errors: 0, totalDurationMs: 0 };
  bucket.count += 1;
  bucket.totalDurationMs += durationMs;
  if (statusCode >= 400) {
    bucket.errors += 1;
  }
  state.httpByRoute.set(routeKey, bucket);
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

export function getHttpRuntimeMetrics() {
  const durations = state.httpDurationMs;
  const total = state.counters.get('http_requests_total') || 0;
  const failed = (state.counters.get('http_errors_4xx_total') || 0) +
    (state.counters.get('http_errors_5xx_total') || 0);

  const topRoutes = [...state.httpByRoute.entries()]
    .map(([route, bucket]) => ({
      route,
      count: bucket.count,
      errors: bucket.errors,
      avgDurationMs: bucket.count ? Math.round(bucket.totalDurationMs / bucket.count) : 0
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    total,
    failed,
    successful: Math.max(total - failed, 0),
    errorRate: total ? Number(((failed / total) * 100).toFixed(1)) : 0,
    averageResponseMs: durations.length
      ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
      : 0,
    p95ResponseMs: Math.round(percentile(durations, 95)),
    slowRequests: state.counters.get('http_slow_requests_total') || 0,
    topRoutes
  };
}

function formatMetricLine(name, value, labels = {}) {
  const labelText = Object.entries(labels)
    .map(([key, val]) => `${key}="${String(val).replace(/"/g, '\\"')}"`)
    .join(',');

  return labelText ? `${name}{${labelText}} ${value}` : `${name} ${value}`;
}

export function renderPrometheusMetrics() {
  const uptimeSeconds = Math.floor((Date.now() - state.startedAt) / 1000);
  const http = getHttpRuntimeMetrics();
  const pool = mongoose.connection?.client?.topology?.s?.pool;
  const readyState = mongoose.connection.readyState;

  const lines = [
    formatMetricLine('process_uptime_seconds', uptimeSeconds),
    formatMetricLine('nodejs_heap_used_bytes', process.memoryUsage().heapUsed),
    formatMetricLine('http_requests_total', http.total),
    formatMetricLine('http_errors_4xx_total', state.counters.get('http_errors_4xx_total') || 0),
    formatMetricLine('http_errors_5xx_total', state.counters.get('http_errors_5xx_total') || 0),
    formatMetricLine('http_slow_requests_total', http.slowRequests),
    formatMetricLine('http_p95_response_ms', http.p95ResponseMs),
    formatMetricLine('log_persist_failed_total', state.counters.get('log_persist_failed_total') || 0),
    formatMetricLine('log_persist_success_total', state.counters.get('log_persist_success_total') || 0),
    formatMetricLine('log_queue_depth', getLogQueueDepth()),
    formatMetricLine('mongodb_ready_state', readyState),
    formatMetricLine('rate_limit_hits_total', state.counters.get('rate_limit_hits_total') || 0)
  ];

  if (pool?.totalConnectionCount !== undefined) {
    lines.push(formatMetricLine('mongodb_pool_connections', pool.totalConnectionCount));
  }

  if (pool?.availableConnectionCount !== undefined) {
    lines.push(formatMetricLine('mongodb_pool_available_connections', pool.availableConnectionCount));
  }

  return `${lines.join('\n')}\n`;
}

export function getRuntimeMetricsSnapshot() {
  return {
    uptimeMs: Date.now() - state.startedAt,
    counters: Object.fromEntries(state.counters.entries()),
    http: getHttpRuntimeMetrics(),
    logQueueDepth: getLogQueueDepth(),
    mongodb: {
      readyState: mongoose.connection.readyState
    }
  };
}
