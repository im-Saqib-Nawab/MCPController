function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

export class MetricsCollector {
  constructor(maxRequests = 10000) {
    this.maxRequests = maxRequests;
    this.reset();
  }

  reset() {
    this.requests = [];
    this.byScenario = new Map();
    this.byStatus = new Map();
    this.errors = [];
    this.startedAt = Date.now();
    this.endedAt = null;
  }

  record({ scenario, method, path, status, durationMs, requestId, ok, error, role, meta }) {
    const entry = {
      scenario,
      method,
      path,
      status,
      durationMs,
      requestId,
      ok,
      error: error || null,
      role: role || null,
      meta: meta || null,
      time: Date.now()
    };

    this.requests.push(entry);
    if (this.requests.length > this.maxRequests) {
      this.requests.splice(0, this.requests.length - this.maxRequests);
    }

    if (!this.byScenario.has(scenario)) {
      this.byScenario.set(scenario, []);
    }
    this.byScenario.get(scenario).push(entry);

    const statusKey = String(status);
    this.byStatus.set(statusKey, (this.byStatus.get(statusKey) || 0) + 1);

    if (!ok) {
      this.errors.push(entry);
    }
  }

  finish() {
    this.endedAt = Date.now();
  }

  snapshot() {
    const endedAt = Date.now();
    const durations = this.requests.map((r) => r.durationMs).sort((a, b) => a - b);
    const total = this.requests.length;
    const failed = this.errors.length;
    const elapsedSec = Math.max((endedAt - this.startedAt) / 1000, 0.001);

    return {
      totals: {
        requests: total,
        failed,
        successful: total - failed,
        errorRate: total ? Number(((failed / total) * 100).toFixed(2)) : 0,
        requestsPerSecond: Number((total / elapsedSec).toFixed(2))
      },
      latency: {
        avgMs: durations.length ? Math.round(durations.reduce((s, v) => s + v, 0) / durations.length) : 0,
        p50Ms: Math.round(percentile(durations, 50)),
        p95Ms: Math.round(percentile(durations, 95)),
        p99Ms: Math.round(percentile(durations, 99))
      },
      elapsedSec: Number(elapsedSec.toFixed(2))
    };
  }

  getRecentRequests(limit = 50) {
    return this.requests.slice(-limit).reverse().map((entry) => ({
      time: new Date(entry.time).toISOString(),
      scenario: entry.scenario,
      method: entry.method,
      path: entry.path,
      status: entry.status,
      durationMs: Math.round(entry.durationMs),
      requestId: entry.requestId,
      ok: entry.ok,
      role: entry.role,
      error: entry.error,
      meta: entry.meta
    }));
  }

  getTimeSeries(bucketSec = 5) {
    if (!this.requests.length) return [];

    const start = this.startedAt;
    const end = this.endedAt || Date.now();
    const bucketMs = bucketSec * 1000;
    const buckets = [];

    for (let t = start; t <= end; t += bucketMs) {
      const slice = this.requests.filter((r) => r.time >= t && r.time < t + bucketMs);
      if (!slice.length) continue;

      const durations = slice.map((r) => r.durationMs).sort((a, b) => a - b);
      const failed = slice.filter((r) => !r.ok).length;
      buckets.push({
        time: new Date(t).toISOString(),
        label: new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        requests: slice.length,
        failed,
        rps: Number((slice.length / bucketSec).toFixed(2)),
        avgMs: durations.length ? Math.round(durations.reduce((s, v) => s + v, 0) / durations.length) : 0,
        p95Ms: Math.round(percentile(durations, 95))
      });
    }

    return buckets.slice(-40);
  }

  summarize() {
    this.finish();

    const durations = this.requests.map((r) => r.durationMs).sort((a, b) => a - b);
    const total = this.requests.length;
    const failed = this.errors.length;
    const elapsedSec = Math.max((this.endedAt - this.startedAt) / 1000, 0.001);

    const byScenario = {};
    for (const [name, entries] of this.byScenario.entries()) {
      const times = entries.map((e) => e.durationMs).sort((a, b) => a - b);
      const scenarioFailed = entries.filter((e) => !e.ok).length;
      byScenario[name] = {
        count: entries.length,
        failed: scenarioFailed,
        errorRate: entries.length ? Number(((scenarioFailed / entries.length) * 100).toFixed(2)) : 0,
        avgLatencyMs: times.length ? Math.round(times.reduce((s, v) => s + v, 0) / times.length) : 0,
        p50LatencyMs: Math.round(percentile(times, 50)),
        p95LatencyMs: Math.round(percentile(times, 95)),
        p99LatencyMs: Math.round(percentile(times, 99))
      };
    }

    return {
      window: {
        startedAt: new Date(this.startedAt).toISOString(),
        endedAt: new Date(this.endedAt).toISOString(),
        durationSec: Number(elapsedSec.toFixed(2))
      },
      totals: {
        requests: total,
        failed,
        successful: total - failed,
        errorRate: total ? Number(((failed / total) * 100).toFixed(2)) : 0,
        requestsPerSecond: Number((total / elapsedSec).toFixed(2))
      },
      latency: {
        avgMs: durations.length ? Math.round(durations.reduce((s, v) => s + v, 0) / durations.length) : 0,
        p50Ms: Math.round(percentile(durations, 50)),
        p95Ms: Math.round(percentile(durations, 95)),
        p99Ms: Math.round(percentile(durations, 99)),
        minMs: durations.length ? Math.round(durations[0]) : 0,
        maxMs: durations.length ? Math.round(durations[durations.length - 1]) : 0
      },
      byStatus: Object.fromEntries(this.byStatus.entries()),
      byScenario,
      sampleRequestIds: [...new Set(this.requests.map((r) => r.requestId).filter(Boolean))].slice(0, 20),
      recentErrors: this.errors.slice(-10).map((e) => ({
        scenario: e.scenario,
        method: e.method,
        path: e.path,
        status: e.status,
        requestId: e.requestId,
        error: e.error
      }))
    };
  }
}
