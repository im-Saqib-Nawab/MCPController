import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../components/Button.jsx';
import { roleLabel } from '../lib/roles.js';
import { api, getErrorMessage } from '../services/api.js';

const TABS = [
  { id: 'live', label: 'Live requests' },
  { id: 'logs', label: 'Server logs' },
  { id: 'traces', label: 'Traces' },
  { id: 'flags', label: 'Feature flags' },
  { id: 'summary', label: 'Summary' }
];

function formatTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

function MetricCard({ label, value, hint, tone = 'default' }) {
  const tones = {
    default: 'text-slate-900',
    good: 'text-emerald-700',
    warn: 'text-amber-700',
    bad: 'text-rose-700'
  };
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${tones[tone] || tones.default}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-400">{hint}</p> : null}
    </div>
  );
}

function VerdictBadge({ status }) {
  const styles = {
    PASS: 'bg-emerald-100 text-emerald-800',
    WARN: 'bg-amber-100 text-amber-800',
    FAIL: 'bg-rose-100 text-rose-800',
    running: 'bg-sky-100 text-sky-800',
    completed: 'bg-slate-100 text-slate-700',
    stopped: 'bg-slate-100 text-slate-700',
    failed: 'bg-rose-100 text-rose-800'
  };
  return (
    <span className={`rounded px-3 py-1 text-sm font-semibold ${styles[status] || 'bg-slate-100 text-slate-700'}`}>
      {status}
    </span>
  );
}

function StatusBadge({ status }) {
  const ok = status === 'success';
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${ok ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
      {ok ? 'Success' : 'Failed'}
    </span>
  );
}

function LevelBadge({ level }) {
  const colors = {
    debug: 'bg-slate-100 text-slate-700',
    info: 'bg-sky-100 text-sky-800',
    warn: 'bg-amber-100 text-amber-800',
    error: 'bg-rose-100 text-rose-800'
  };
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium uppercase ${colors[level] || colors.info}`}>
      {level}
    </span>
  );
}

function TimeSeriesChart({ points, valueKey, label, unit = '', color = 'bg-sky-500' }) {
  const values = points.map((p) => Number(p[valueKey]) || 0);
  const max = Math.max(...values, 1);
  const latest = values[values.length - 1] ?? 0;
  const avg = values.length ? (values.reduce((sum, v) => sum + v, 0) / values.length).toFixed(2) : '0';
  const chartHeight = 112;

  if (!points.length) {
    return (
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <div className="flex h-28 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-400">
          No chart data yet — start a test to populate this graph.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <p className="text-xs text-slate-500">
          Latest <strong className="text-slate-800">{latest}{unit}</strong> · Avg {avg}{unit} · Max {max}{unit}
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-100 bg-slate-50 p-3">
        <div className="flex min-w-[320px] items-end gap-1" style={{ height: chartHeight }}>
          {points.map((point, index) => {
            const value = Number(point[valueKey]) || 0;
            const heightPx = Math.max(4, Math.round((value / max) * (chartHeight - 18)));
            return (
              <div key={`${point.time}-${index}`} className="group flex min-w-[18px] flex-1 flex-col items-center justify-end">
                <span className="mb-1 text-[10px] font-medium text-slate-600 opacity-0 transition group-hover:opacity-100">
                  {value}{unit}
                </span>
                <div
                  className={`w-full rounded-t ${color} transition hover:opacity-80`}
                  style={{ height: heightPx }}
                  title={`${point.label || formatTime(point.time)}: ${value}${unit}`}
                />
                <span className="mt-1 truncate text-[9px] text-slate-400">{point.label || ''}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StatusCode({ status }) {
  const ok = status >= 200 && status < 400;
  return (
    <span className={`font-mono text-xs ${ok ? 'text-emerald-700' : 'text-rose-700'}`}>{status || '—'}</span>
  );
}

function EmptyRow({ message }) {
  return <p className="py-8 text-center text-sm text-slate-500">{message}</p>;
}

export default function TestingCenter() {
  const [config, setConfig] = useState(null);
  const [status, setStatus] = useState(null);
  const [observability, setObservability] = useState(null);
  const [selectedRun, setSelectedRun] = useState(null);
  const [tab, setTab] = useState('live');
  const [selectedTraceId, setSelectedTraceId] = useState(null);
  const [traceDetail, setTraceDetail] = useState(null);
  const [traceLoading, setTraceLoading] = useState(false);
  const [selectedLog, setSelectedLog] = useState(null);
  const [logLoading, setLogLoading] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const detailRef = useRef(null);

  const [scenario, setScenario] = useState('normal');
  const [vu, setVu] = useState(20);
  const [durationSec, setDurationSec] = useState(60);
  const [targetRps, setTargetRps] = useState(0);
  const [roleAdmin, setRoleAdmin] = useState(10);
  const [roleDoctor, setRoleDoctor] = useState(50);
  const [rolePatient, setRolePatient] = useState(40);
  const [flagEnabled, setFlagEnabled] = useState(true);
  const [flagDoctorAccess, setFlagDoctorAccess] = useState('percentage');
  const [flagPercentage, setFlagPercentage] = useState(50);
  const [flagPatientsEnabled, setFlagPatientsEnabled] = useState(true);

  const active = status?.active;
  const isRunning = active?.status === 'running' || active?.status === 'starting' || active?.status === 'stopping';
  const displayRun = active || selectedRun;
  const summaryRun = displayRun;

  const loadConfig = useCallback(async () => {
    const { data } = await api.get('/admin/testing/config');
    setConfig(data.testing);
  }, []);

  const loadRunDetail = useCallback(async (runId) => {
    const { data } = await api.get(`/admin/testing/runs/${runId}`);
    setSelectedRun(data.run);
    setTab('summary');
  }, []);

  const refresh = useCallback(async () => {
    try {
      const { data: statusData } = await api.get('/admin/testing/status');
      setStatus(statusData);

      const runForObs = statusData.active || selectedRun;
      const obsParams = {
        includeTechnical: 'true',
        limit: 100
      };

      if (runForObs?.startedAt) {
        obsParams.since = runForObs.startedAt;
      } else {
        obsParams.sinceMinutes = 15;
      }

      const obsRes = await api.get('/admin/testing/live-observability', { params: obsParams }).catch(() => ({ data: null }));
      if (obsRes.data) setObservability(obsRes.data);

      setError('');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [selectedRun?.id, selectedRun?.startedAt]);

  useEffect(() => {
    loadConfig().catch((err) => setError(getErrorMessage(err)));
  }, [loadConfig]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, isRunning ? 2000 : 8000);
    return () => clearInterval(interval);
  }, [refresh, isRunning]);

  useEffect(() => {
    if (!isRunning && status?.history?.[0] && !selectedRun && !active) {
      loadRunDetail(status.history[0].id);
    }
  }, [isRunning, status, selectedRun, active, loadRunDetail]);

  useEffect(() => {
    const selected = config?.scenarios?.find((item) => item.id === scenario);
    if (selected?.defaults && !isRunning) {
      setVu(selected.defaults.vu || 20);
      setDurationSec(selected.defaults.durationSec || 60);
      setTargetRps(selected.defaults.targetRps || 0);
    }
  }, [scenario, config, isRunning]);

  async function startTest() {
    setStarting(true);
    setError('');
    setSelectedRun(null);
    try {
      const body = {
        scenario,
        vu,
        durationSec,
        targetRps,
        roleDistribution: { admin: roleAdmin, doctor: roleDoctor, patient: rolePatient }
      };

      if (scenario === 'feature-flags') {
        body.featureFlag = {
          enabled: flagEnabled,
          doctorAccess: flagDoctorAccess,
          percentage: flagPercentage,
          patientsEnabled: flagPatientsEnabled
        };
      }

      if (scenario === 'spike') {
        body.baselineVu = 10;
        body.spikeVu = Math.max(vu, 50);
        body.baselineSec = 20;
        body.spikeSec = 15;
        body.recoverySec = 20;
      }

      if (scenario === 'errors') {
        body.includeFailures = true;
      }

      await api.post('/admin/testing/start', body);
      setTab('live');
      await refresh();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setStarting(false);
    }
  }

  async function stopTest() {
    try {
      await api.post('/admin/testing/stop');
      await refresh();
      setTab('summary');
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function openTrace(requestId) {
    if (!requestId) return;
    setSelectedTraceId(requestId);
    setTraceLoading(true);
    setTraceDetail(null);
    setTab('traces');
    try {
      const { data } = await api.get(`/admin/testing/traces/${encodeURIComponent(requestId)}`);
      setTraceDetail(data.trace);
      setTimeout(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setTraceLoading(false);
    }
  }

  async function openLog(logId) {
    if (!logId) return;
    setLogLoading(true);
    try {
      const { data } = await api.get(`/admin/observability/logs/${logId}`);
      setSelectedLog(data.log);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLogLoading(false);
    }
  }

  const metrics = useMemo(() => {
    if (!displayRun) return null;
    if (displayRun.live) return displayRun.live;
    if (displayRun.summary) {
      return {
        totals: displayRun.summary.totals,
        latency: displayRun.summary.latency
      };
    }
    return null;
  }, [displayRun]);

  const timeSeries = displayRun?.timeSeries || [];
  const recentRequests = displayRun?.recentRequests || [];
  const featureFlags = displayRun?.featureFlags || null;
  const expectedFlag = displayRun?.expectedFlag || null;
  const verdict = displayRun?.verdict || null;

  const scenarioMeta = useMemo(
    () => config?.scenarios?.find((item) => item.id === scenario),
    [config, scenario]
  );

  if (loading && !config) {
    return <div className="mx-auto max-w-7xl px-4 py-10 text-sm text-slate-500">Loading Testing Center...</div>;
  }

  if (config && !config.enabled) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-semibold text-slate-900">Testing Center</h1>
        <p className="mt-3 text-sm text-slate-600">
          Testing Center is disabled in production. Set <code className="rounded bg-slate-100 px-1">ENABLE_TEST_CENTER=true</code>{' '}
          to enable it.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">
            <Link to="/dashboard" className="hover:text-slate-800">
              Dashboard
            </Link>{' '}
            / Testing Center
          </p>
          <h1 className="mt-1 text-3xl font-semibold text-slate-900">Testing Center</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Generate fake traffic against your real APIs. Logs, metrics, and traces flow into your existing observability system.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isRunning ? <VerdictBadge status="running" /> : verdict ? <VerdictBadge status={verdict.status} /> : null}
          <Link to="/admin/observability" className="text-sm text-slate-600 hover:text-slate-900">
            Open Observability
          </Link>
        </div>
      </div>

      {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Test controls</h2>

          <label className="block text-sm">
            <span className="text-slate-600">Scenario</span>
            <select
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              value={scenario}
              onChange={(e) => setScenario(e.target.value)}
              disabled={isRunning}
            >
              {config?.scenarios?.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          {scenarioMeta ? <p className="text-xs text-slate-500">{scenarioMeta.description}</p> : null}

          {scenario !== 'spike' ? (
            <>
              <label className="block text-sm">
                <span className="text-slate-600">Virtual users</span>
                <input type="number" min="1" max={config?.limits?.maxVu || 500} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={vu} onChange={(e) => setVu(Number(e.target.value))} disabled={isRunning} />
              </label>
              <label className="block text-sm">
                <span className="text-slate-600">Duration (seconds)</span>
                <input type="number" min="5" max={config?.limits?.maxDurationSec || 3600} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={durationSec} onChange={(e) => setDurationSec(Number(e.target.value))} disabled={isRunning} />
              </label>
            </>
          ) : (
            <p className="text-xs text-slate-500">Spike uses baseline 10 VUs, spike at the VU count above, then recovery.</p>
          )}

          <label className="block text-sm">
            <span className="text-slate-600">Target RPS (0 = auto)</span>
            <input type="number" min="0" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" value={targetRps} onChange={(e) => setTargetRps(Number(e.target.value))} disabled={isRunning} />
          </label>

          <div>
            <p className="text-sm text-slate-600">Role distribution (%)</p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {[
                ['Admin', roleAdmin, setRoleAdmin],
                ['Doctor', roleDoctor, setRoleDoctor],
                ['Patient', rolePatient, setRolePatient]
              ].map(([label, value, setter]) => (
                <label key={label} className="text-xs">
                  {label}
                  <input type="number" min="0" className="mt-1 w-full rounded border border-slate-300 px-2 py-1" value={value} onChange={(e) => setter(Number(e.target.value))} disabled={isRunning} />
                </label>
              ))}
            </div>
          </div>

          {scenario === 'feature-flags' ? (
            <div className="space-y-2 rounded-lg border border-violet-200 bg-violet-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">Feature flag config</p>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={flagEnabled} onChange={(e) => setFlagEnabled(e.target.checked)} disabled={isRunning} />
                Enabled
              </label>
              <label className="block text-sm">
                Doctor access
                <select className="mt-1 w-full rounded border border-slate-300 px-2 py-1" value={flagDoctorAccess} onChange={(e) => setFlagDoctorAccess(e.target.value)} disabled={isRunning}>
                  <option value="all">100% (all doctors)</option>
                  <option value="percentage">Percentage rollout</option>
                  <option value="specific">Specific doctors</option>
                </select>
              </label>
              {flagDoctorAccess === 'percentage' ? (
                <label className="block text-sm">
                  Percentage
                  <select className="mt-1 w-full rounded border border-slate-300 px-2 py-1" value={flagPercentage} onChange={(e) => setFlagPercentage(Number(e.target.value))} disabled={isRunning}>
                    {[10, 25, 50, 100].map((pct) => (
                      <option key={pct} value={pct}>{pct}%</option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={flagPatientsEnabled} onChange={(e) => setFlagPatientsEnabled(e.target.checked)} disabled={isRunning} />
                Patients enabled
              </label>
            </div>
          ) : null}

          <div className="flex gap-2 pt-2">
            <Button onClick={startTest} disabled={isRunning || starting}>{starting ? 'Starting...' : 'Start test'}</Button>
            <Button variant="secondary" onClick={stopTest} disabled={!isRunning}>Stop</Button>
          </div>

          <p className="text-xs text-slate-400">{config?.personas?.note}</p>
        </section>

        <div className="space-y-6">
          {displayRun ? (
            <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
              Viewing {isRunning ? 'live run' : 'completed run'} · <strong>{displayRun.scenario}</strong>
              {displayRun.startedAt ? ` · started ${formatTime(displayRun.startedAt)}` : ''}
              {!isRunning && displayRun.completedAt ? ` · finished ${formatTime(displayRun.completedAt)}` : ''}
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Requests" value={metrics?.totals?.requests ?? 0} hint={isRunning ? 'Live' : 'Selected run'} />
            <MetricCard label="Success / Errors" value={`${metrics?.totals?.successful ?? 0} / ${metrics?.totals?.failed ?? 0}`} hint={`${metrics?.totals?.errorRate ?? 0}% error rate`} tone={(metrics?.totals?.errorRate || 0) > 5 ? 'warn' : 'good'} />
            <MetricCard label="RPS" value={metrics?.totals?.requestsPerSecond ?? 0} />
            <MetricCard label="Latency p95" value={`${metrics?.latency?.p95Ms ?? 0} ms`} hint={`p50 ${metrics?.latency?.p50Ms ?? 0} · p99 ${metrics?.latency?.p99Ms ?? 0}`} tone={(metrics?.latency?.p95Ms || 0) > 2000 ? 'warn' : 'default'} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <TimeSeriesChart points={timeSeries} valueKey="rps" label="Requests per second" unit="" color="bg-sky-500" />
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <TimeSeriesChart points={timeSeries} valueKey="p95Ms" label="p95 latency" unit="ms" color="bg-violet-500" />
            </div>
          </div>

          {observability?.metrics ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <MetricCard label="Server audit logs" value={observability.metrics.audit?.total ?? 0} hint="During selected run window" />
              <MetricCard label="HTTP completed" value={observability.metrics.http?.total ?? 0} hint="Includes technical HTTP logs" />
              <MetricCard label="Database" value={observability.metrics.database?.connected ? 'Connected' : 'Disconnected'} tone={observability.metrics.database?.connected ? 'good' : 'bad'} />
            </div>
          ) : null}

          <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap gap-2 border-b border-slate-200 px-4 py-3">
              {TABS.map((item) => (
                <button key={item.id} type="button" onClick={() => setTab(item.id)} className={`rounded-lg px-3 py-1.5 text-sm ${tab === item.id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                  {item.label}
                </button>
              ))}
            </div>

            <div className="max-h-[480px] overflow-auto p-4">
              {tab === 'live' ? (
                recentRequests.length ? (
                  <table className="min-w-full text-left text-sm">
                    <thead className="sticky top-0 bg-white text-xs uppercase text-slate-500">
                      <tr>
                        <th className="pb-2 pr-3">Time</th>
                        <th className="pb-2 pr-3">Role</th>
                        <th className="pb-2 pr-3">Request</th>
                        <th className="pb-2 pr-3">Status</th>
                        <th className="pb-2 pr-3">ms</th>
                        <th className="pb-2">Trace</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentRequests.map((row) => (
                        <tr key={`${row.time}-${row.requestId}-${row.path}`} className={`border-t border-slate-100 ${selectedTraceId === row.requestId ? 'bg-sky-50' : ''}`}>
                          <td className="py-2 pr-3 text-xs text-slate-500">{new Date(row.time).toLocaleTimeString()}</td>
                          <td className="py-2 pr-3">{row.role || '—'}</td>
                          <td className="py-2 pr-3 font-mono text-xs">{row.method} {row.path}<div className="text-slate-400">{row.scenario}</div></td>
                          <td className="py-2 pr-3"><StatusCode status={row.status} /></td>
                          <td className="py-2 pr-3">{row.durationMs}</td>
                          <td className="py-2">{row.requestId ? <button type="button" className="text-xs font-medium text-sky-700 hover:underline" onClick={() => openTrace(row.requestId)}>{row.requestId.slice(0, 8)}…</button> : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <EmptyRow message="No live requests yet. Start a test to populate this table." />
                )
              ) : null}

              {tab === 'logs' ? (
                observability?.logs?.length ? (
                  <table className="min-w-full text-left text-sm">
                    <thead className="sticky top-0 bg-white text-xs uppercase text-slate-500">
                      <tr>
                        <th className="pb-2 pr-3">Time</th>
                        <th className="pb-2 pr-3">Level</th>
                        <th className="pb-2 pr-3">Activity</th>
                        <th className="pb-2 pr-3">User / Role</th>
                        <th className="pb-2 pr-3">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {observability.logs.map((log) => (
                        <tr key={log.id || `${log.requestId}-${log.time}`} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50" onClick={() => openLog(log.id)}>
                          <td className="py-2 pr-3 text-xs text-slate-500">{formatTime(log.time)}</td>
                          <td className="py-2 pr-3"><LevelBadge level={log.level} /></td>
                          <td className="py-2 pr-3">{log.message || log.action || log.operation}</td>
                          <td className="py-2 pr-3">{log.actorName || '—'}<br /><span className="text-xs text-slate-500">{roleLabel(log.role)}</span></td>
                          <td className="py-2 pr-3"><StatusBadge status={log.status || (log.level === 'error' ? 'error' : 'success')} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <EmptyRow message="No server logs in this run window yet. They appear as audit actions and HTTP requests complete." />
                )
              ) : null}

              {tab === 'traces' ? (
                <div className="space-y-4">
                  {observability?.traces?.length ? (
                    <table className="min-w-full text-left text-sm">
                      <thead className="sticky top-0 bg-white text-xs uppercase text-slate-500">
                        <tr>
                          <th className="pb-2 pr-3">Time</th>
                          <th className="pb-2 pr-3">Action</th>
                          <th className="pb-2 pr-3">User / Role</th>
                          <th className="pb-2 pr-3">Duration</th>
                          <th className="pb-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {observability.traces.map((trace) => (
                          <tr key={trace.traceId} className={`cursor-pointer border-t border-slate-100 hover:bg-slate-50 ${selectedTraceId === trace.traceId ? 'bg-sky-50 ring-1 ring-inset ring-sky-200' : ''}`} onClick={() => openTrace(trace.traceId)}>
                            <td className="py-2 pr-3 text-xs text-slate-500">{formatTime(trace.timestamp)}</td>
                            <td className="py-2 pr-3 font-medium text-slate-900">{trace.action}</td>
                            <td className="py-2 pr-3">{trace.actorName || '—'}<br /><span className="text-xs text-slate-500">{roleLabel(trace.role)}</span></td>
                            <td className="py-2 pr-3">{trace.durationMs ? `${trace.durationMs} ms` : '—'}</td>
                            <td className="py-2"><StatusBadge status={trace.status} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <EmptyRow message="No traces in this run window yet." />
                  )}

                  <div ref={detailRef} className={`rounded-lg border p-4 transition ${selectedTraceId ? 'border-sky-300 bg-sky-50' : 'border-dashed border-slate-200 bg-slate-50'}`}>
                    {traceLoading ? (
                      <p className="text-sm text-slate-600">Loading trace details…</p>
                    ) : traceDetail ? (
                      <>
                        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Selected trace</p>
                            <h3 className="mt-1 text-base font-semibold text-slate-900">{traceDetail.action}</h3>
                            <p className="mt-1 font-mono text-xs text-slate-500">{traceDetail.traceId}</p>
                          </div>
                          <StatusBadge status={traceDetail.status} />
                        </div>
                        <div className="mb-4 flex flex-wrap gap-3 text-sm text-slate-600">
                          <span>{traceDetail.actorName || 'Unknown user'}</span>
                          <span>{roleLabel(traceDetail.role)}</span>
                          <span>{formatTime(traceDetail.timestamp)}</span>
                          {traceDetail.durationMs ? <span>{traceDetail.durationMs} ms total</span> : null}
                        </div>
                        {traceDetail.errorMessage ? <div className="mb-4 rounded-lg bg-rose-100 px-3 py-2 text-sm text-rose-800">{traceDetail.errorMessage}</div> : null}
                        <ol className="space-y-2 border-l-2 border-sky-200 pl-4">
                          {traceDetail.steps?.map((step, index) => (
                            <li key={`${step.operation}-${index}`} className="relative rounded-lg border border-white bg-white px-3 py-2 text-sm shadow-sm">
                              <span className="absolute -left-[1.3rem] top-3 h-2.5 w-2.5 rounded-full bg-sky-500" />
                              <p className="font-medium text-slate-900">{step.message || step.action || step.operation}</p>
                              <p className="mt-1 text-xs text-slate-500">
                                {formatTime(step.time)}
                                {step.durationMs ? ` · ${step.durationMs} ms` : ''}
                                {step.status ? ` · ${step.status}` : ''}
                              </p>
                              {step.errorMessage ? <p className="mt-1 text-xs text-rose-700">{step.errorMessage}</p> : null}
                              {step.id ? (
                                <button type="button" className="mt-1 text-xs text-sky-700 underline" onClick={() => openLog(step.id)}>
                                  Open log entry
                                </button>
                              ) : null}
                            </li>
                          ))}
                        </ol>
                      </>
                    ) : (
                      <p className="text-sm text-slate-500">Select a trace above to inspect each step, duration, and errors.</p>
                    )}
                  </div>
                </div>
              ) : null}

              {tab === 'flags' ? (
                <div className="space-y-4">
                  {expectedFlag ? (
                    <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm">
                      <p className="font-medium text-violet-900">Expected configuration</p>
                      <p className="mt-1 text-violet-800">{expectedFlag.doctorAccess} · {expectedFlag.percentage}% · patients {expectedFlag.patientsEnabled ? 'on' : 'off'}</p>
                    </div>
                  ) : null}
                  {featureFlags ? (
                    <>
                      <p className="text-sm text-slate-600">Match rate: <strong>{featureFlags.matchRate}%</strong> ({featureFlags.matched}/{featureFlags.total})</p>
                      <table className="min-w-full text-left text-sm">
                        <thead className="text-xs uppercase text-slate-500">
                          <tr>
                            <th className="pb-2 pr-3">User</th>
                            <th className="pb-2 pr-3">Role</th>
                            <th className="pb-2 pr-3">Expected</th>
                            <th className="pb-2 pr-3">Actual</th>
                            <th className="pb-2">Match</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(featureFlags.recentResults || []).map((row) => (
                            <tr key={`${row.email}-${row.time}`} className={`border-t border-slate-100 ${row.match ? '' : 'bg-rose-50'}`}>
                              <td className="py-2 pr-3">{row.email}</td>
                              <td className="py-2 pr-3">{row.role}</td>
                              <td className="py-2 pr-3">{String(row.expectedCanView)}</td>
                              <td className="py-2 pr-3">{String(row.actualCanView)}</td>
                              <td className="py-2">{row.match ? '✓' : '✗'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  ) : (
                    <EmptyRow message="Run a feature-flag scenario to compare expected vs actual access." />
                  )}
                </div>
              ) : null}

              {tab === 'summary' ? (
                <div className="space-y-4">
                  {summaryRun?.verdict ? (
                    <>
                      <div className="flex flex-wrap items-center gap-3">
                        <VerdictBadge status={summaryRun.verdict.status} />
                        <span className="text-sm text-slate-600">{summaryRun.scenario} scenario</span>
                      </div>
                      {summaryRun.verdict.issues?.length ? (
                        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
                          {summaryRun.verdict.issues.map((issue) => (
                            <li key={issue}>{issue}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-emerald-700">All checks passed within configured thresholds.</p>
                      )}
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-lg border border-slate-200 p-3 text-sm">
                          <p className="font-medium">Load summary</p>
                          <p className="mt-1 text-slate-600">{summaryRun.summary?.totals?.requests} requests · {summaryRun.summary?.totals?.requestsPerSecond} RPS · p95 {summaryRun.summary?.latency?.p95Ms} ms</p>
                        </div>
                        <div className="rounded-lg border border-slate-200 p-3 text-sm">
                          <p className="font-medium">Observability checks</p>
                          <p className="mt-1 text-slate-600">{summaryRun.observability?.passed}/{summaryRun.observability?.total} passed</p>
                        </div>
                      </div>
                    </>
                  ) : isRunning ? (
                    <EmptyRow message="Test running — summary will appear when complete." />
                  ) : (
                    <EmptyRow message="Start a test or select a recent run below." />
                  )}

                  {status?.history?.length ? (
                    <div>
                      <p className="mb-2 text-sm font-medium text-slate-900">Recent runs</p>
                      <div className="space-y-2">
                        {status.history.slice(0, 8).map((run) => (
                          <button
                            key={run.id}
                            type="button"
                            onClick={() => loadRunDetail(run.id)}
                            className={`flex w-full flex-wrap items-center justify-between gap-2 rounded border px-3 py-2 text-left text-sm transition hover:bg-slate-50 ${selectedRun?.id === run.id ? 'border-sky-300 bg-sky-50 ring-1 ring-sky-200' : 'border-slate-200'}`}
                          >
                            <span className="font-medium capitalize">{run.scenario}</span>
                            <span className="text-slate-500">{formatTime(run.startedAt)}</span>
                            <VerdictBadge status={run.verdict?.status || run.status} />
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </div>

      {selectedLog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Log detail</p>
                <h2 className="text-lg font-semibold text-slate-900">{selectedLog.action || selectedLog.operation}</h2>
                <p className="text-sm text-slate-700">{selectedLog.message}</p>
              </div>
              <button type="button" className="text-sm text-slate-500" onClick={() => setSelectedLog(null)}>Close</button>
            </div>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-slate-500">User</dt><dd>{selectedLog.actorName || '—'}</dd></div>
              <div><dt className="text-slate-500">Role</dt><dd>{roleLabel(selectedLog.role)}</dd></div>
              <div><dt className="text-slate-500">Status</dt><dd><StatusBadge status={selectedLog.status || 'success'} /></dd></div>
              <div><dt className="text-slate-500">Time</dt><dd>{formatTime(selectedLog.time)}</dd></div>
              <div><dt className="text-slate-500">Trace / Request ID</dt><dd className="font-mono text-xs">{selectedLog.traceId || selectedLog.requestId || '—'}</dd></div>
              <div><dt className="text-slate-500">Level</dt><dd><LevelBadge level={selectedLog.level} /></dd></div>
              {selectedLog.route ? <div className="sm:col-span-2"><dt className="text-slate-500">Route</dt><dd>{selectedLog.method} {selectedLog.route}</dd></div> : null}
              {selectedLog.durationMs ? <div><dt className="text-slate-500">Duration</dt><dd>{selectedLog.durationMs} ms</dd></div> : null}
            </dl>
            {selectedLog.traceId || selectedLog.requestId ? (
              <button type="button" className="mt-4 text-sm text-sky-700 underline" onClick={() => { setSelectedLog(null); openTrace(selectedLog.traceId || selectedLog.requestId); }}>
                View related trace
              </button>
            ) : null}
            {selectedLog.errorMessage ? <div className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{selectedLog.errorMessage}</div> : null}
            {selectedLog.metadata ? <pre className="mt-4 overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">{JSON.stringify(selectedLog.metadata, null, 2)}</pre> : null}
          </div>
        </div>
      ) : null}

      {logLoading ? <div className="fixed bottom-4 right-4 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">Loading log…</div> : null}
    </div>
  );
}
