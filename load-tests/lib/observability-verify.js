import { config } from '../config.js';
import { HttpClient } from './http-client.js';

function assertCondition(name, ok, details = '') {
  return { name, ok, details };
}

export async function verifyObservability({ sinceMinutes = 60, sampleRequestIds = [] } = {}) {
  const admin = new HttpClient();
  const login = await admin.login(config.adminEmail, config.adminPassword);
  if (!login.ok) {
    throw new Error(`Admin login failed: HTTP ${login.status}`);
  }

  const checks = [];
  const metricsRes = await admin.get(`/api/admin/observability/metrics?sinceMinutes=${sinceMinutes}`);
  checks.push(assertCondition('metrics endpoint', metricsRes.ok, `status=${metricsRes.status}`));

  const logsRes = await admin.get(`/api/admin/observability/logs?sinceMinutes=${sinceMinutes}&limit=50`);
  checks.push(assertCondition('logs endpoint', logsRes.ok, `status=${logsRes.status}`));

  const tracesRes = await admin.get(`/api/admin/observability/traces?sinceMinutes=${sinceMinutes}&limit=50`);
  checks.push(assertCondition('traces endpoint', tracesRes.ok, `status=${tracesRes.status}`));

  const metrics = metricsRes.data?.metrics;
  if (metrics) {
    checks.push(assertCondition('metrics audit total > 0', metrics.audit?.total > 0, `total=${metrics.audit?.total}`));
    checks.push(
      assertCondition('metrics http total > 0', metrics.http?.total > 0, `httpTotal=${metrics.http?.total}`)
    );
    checks.push(
      assertCondition('database connected', metrics.database?.connected === true, metrics.database?.state)
    );
  }

  const logs = logsRes.data?.logs || [];
  if (logs.length) {
    const sample = logs[0];
    checks.push(assertCondition('logs have requestId', Boolean(sample.requestId), sample.requestId || 'missing'));
    checks.push(assertCondition('logs have operation', Boolean(sample.operation), sample.operation || 'missing'));
    checks.push(assertCondition('logs have role or userId', Boolean(sample.role || sample.userId), sample.role || sample.userId || 'missing'));
  } else {
    checks.push(assertCondition('logs returned', false, 'No logs in window — was the server running with NODE_ENV != test?'));
  }

  const traces = tracesRes.data?.traces || [];
  if (traces.length) {
    const sample = traces[0];
    checks.push(assertCondition('traces have traceId', Boolean(sample.traceId), sample.traceId || 'missing'));
    checks.push(assertCondition('traces have steps', (sample.stepCount || 0) > 0, `steps=${sample.stepCount}`));
  }

  for (const requestId of sampleRequestIds.slice(0, 5)) {
    if (!requestId) continue;
    const traceRes = await admin.get(`/api/admin/observability/traces/${requestId}`);
    checks.push(
      assertCondition(
        `trace follow requestId ${requestId.slice(0, 8)}`,
        traceRes.ok && (traceRes.data?.trace?.steps?.length || 0) > 0,
        `status=${traceRes.status}`
      )
    );
  }

  const errorLogsRes = await admin.get(
    `/api/admin/observability/logs?sinceMinutes=${sinceMinutes}&status=error&limit=20`
  );
  checks.push(assertCondition('error logs queryable', errorLogsRes.ok, `count=${errorLogsRes.data?.logs?.length || 0}`));

  const passed = checks.filter((c) => c.ok).length;
  const failed = checks.filter((c) => !c.ok);

  return {
    total: checks.length,
    passed,
    failed: failed.length,
    checks,
    failures: failed,
    snapshot: {
      metrics: metricsRes.data?.metrics || null,
      recentLogs: logs.slice(0, 5),
      recentTraces: traces.slice(0, 5)
    }
  };
}

export function extractSampleRequestIds(loadSummary) {
  const ids = [...(loadSummary?.sampleRequestIds || [])];
  for (const err of loadSummary?.recentErrors || []) {
    if (err.requestId && !ids.includes(err.requestId)) {
      ids.push(err.requestId);
    }
  }
  return ids;
}
