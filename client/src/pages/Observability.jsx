import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, getErrorMessage } from '../services/api.js';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'logs', label: 'Logs' },
  { id: 'traces', label: 'Traces' },
  { id: 'metrics', label: 'Metrics' }
];

const LEVELS = ['', 'debug', 'info', 'warn', 'error'];
const TIME_WINDOWS = [
  { label: 'Last hour', value: 60 },
  { label: 'Last 6 hours', value: 360 },
  { label: 'Last 24 hours', value: 1440 },
  { label: 'Last 7 days', value: 10080 }
];

function formatTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
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

function StatusBadge({ status }) {
  const ok = status === 'success';
  return (
    <span
      className={`rounded px-2 py-0.5 text-xs font-medium ${ok ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}
    >
      {status}
    </span>
  );
}

function MetricCard({ label, value, hint }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-400">{hint}</p> : null}
    </div>
  );
}

export default function Observability() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') || 'overview';
  const [sinceMinutes, setSinceMinutes] = useState(1440);
  const [level, setLevel] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [overview, setOverview] = useState(null);
  const [logs, setLogs] = useState([]);
  const [traces, setTraces] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [selectedLog, setSelectedLog] = useState(null);
  const [selectedTrace, setSelectedTrace] = useState(null);

  const query = useMemo(
    () => ({
      sinceMinutes,
      ...(level ? { level } : {}),
      ...(status ? { status } : {}),
      ...(search.trim() ? { search: search.trim() } : {})
    }),
    [sinceMinutes, level, status, search]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (tab === 'overview') {
        const { data } = await api.get('/admin/observability/overview', { params: query });
        setOverview(data.overview);
      } else if (tab === 'logs') {
        const { data } = await api.get('/admin/observability/logs', { params: { ...query, limit: 100 } });
        setLogs(data.logs || []);
      } else if (tab === 'traces') {
        const { data } = await api.get('/admin/observability/traces', { params: { ...query, limit: 100 } });
        setTraces(data.traces || []);
      } else if (tab === 'metrics') {
        const { data } = await api.get('/admin/observability/metrics', { params: query });
        setMetrics(data.metrics);
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [tab, query]);

  useEffect(() => {
    load();
  }, [load]);

  function setTab(nextTab) {
    setSelectedLog(null);
    setSelectedTrace(null);
    setSearchParams({ tab: nextTab });
  }

  async function openLog(logId) {
    try {
      const { data } = await api.get(`/admin/observability/logs/${logId}`);
      setSelectedLog(data.log);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function openTrace(traceId) {
    try {
      const { data } = await api.get(`/admin/observability/traces/${encodeURIComponent(traceId)}`);
      setSelectedTrace(data.trace);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  const currentMetrics = tab === 'overview' ? overview?.metrics : metrics;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">Admin</p>
          <h1 className="text-2xl font-semibold text-slate-900">Observability</h1>
          <p className="mt-1 text-sm text-slate-600">
            Monitor logs, request traces, and basic metrics for this deployment.
          </p>
        </div>
        <Link to="/dashboard" className="text-sm text-slate-600 hover:text-slate-900">
          ← Back to dashboard
        </Link>
      </div>

      <div className="mb-6 flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              tab === item.id ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="mb-6 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-4">
        <label className="text-sm">
          <span className="mb-1 block text-slate-500">Time window</span>
          <select
            className="w-full rounded-lg border border-slate-200 px-3 py-2"
            value={sinceMinutes}
            onChange={(event) => setSinceMinutes(Number(event.target.value))}
          >
            {TIME_WINDOWS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        {(tab === 'logs' || tab === 'overview') && (
          <label className="text-sm">
            <span className="mb-1 block text-slate-500">Log level</span>
            <select
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
              value={level}
              onChange={(event) => setLevel(event.target.value)}
            >
              <option value="">All levels</option>
              {LEVELS.filter(Boolean).map((item) => (
                <option key={item} value={item}>
                  {item.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
        )}

        {(tab === 'traces' || tab === 'overview') && (
          <label className="text-sm">
            <span className="mb-1 block text-slate-500">Trace status</span>
            <select
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="">All</option>
              <option value="success">Success</option>
              <option value="error">Error</option>
            </select>
          </label>
        )}

        <label className="text-sm md:col-span-2">
          <span className="mb-1 block text-slate-500">Search</span>
          <input
            className="w-full rounded-lg border border-slate-200 px-3 py-2"
            placeholder="Search logs, routes, tools, request IDs…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      </div>

      {error ? <p className="mb-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}
      {loading ? <p className="text-sm text-slate-500">Loading observability data…</p> : null}

      {!loading && tab === 'overview' && overview ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="Total requests" value={overview.metrics.requests.total} />
            <MetricCard label="Failed requests" value={overview.metrics.requests.failed} />
            <MetricCard label="Error rate" value={`${overview.metrics.requests.errorRate}%`} />
            <MetricCard
              label="Avg response time"
              value={`${overview.metrics.responseTime.averageMs} ms`}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">Recent logs</h2>
              <div className="space-y-2">
                {overview.logs.map((log) => (
                  <button
                    key={log.id}
                    type="button"
                    onClick={() => openLog(log.id)}
                    className="flex w-full items-start justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2 text-left hover:bg-slate-50"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-900">{log.operation}</p>
                      <p className="text-xs text-slate-500">{formatTime(log.time)}</p>
                    </div>
                    <LevelBadge level={log.level} />
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">Recent traces</h2>
              <div className="space-y-2">
                {overview.traces.map((trace) => (
                  <button
                    key={trace.traceId}
                    type="button"
                    onClick={() => openTrace(trace.traceId)}
                    className="flex w-full items-start justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2 text-left hover:bg-slate-50"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-900">{trace.action || trace.traceId}</p>
                      <p className="text-xs text-slate-500">{formatTime(trace.timestamp)}</p>
                    </div>
                    <StatusBadge status={trace.status} />
                  </button>
                ))}
              </div>
            </section>
          </div>
        </div>
      ) : null}

      {!loading && tab === 'logs' ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Level</th>
                <th className="px-4 py-3">Operation</th>
                <th className="px-4 py-3">User / Role</th>
                <th className="px-4 py-3">Tool / Route</th>
                <th className="px-4 py-3">Error</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr
                  key={log.id}
                  className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                  onClick={() => openLog(log.id)}
                >
                  <td className="px-4 py-3 whitespace-nowrap">{formatTime(log.time)}</td>
                  <td className="px-4 py-3"><LevelBadge level={log.level} /></td>
                  <td className="px-4 py-3">{log.operation}</td>
                  <td className="px-4 py-3">{log.role || '—'}{log.userId ? ` · ${log.userId.slice(-6)}` : ''}</td>
                  <td className="px-4 py-3">{log.tool || log.route || '—'}</td>
                  <td className="px-4 py-3 text-rose-700">{log.errorMessage || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {!loading && tab === 'traces' ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3">Trace ID</th>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">User / Role</th>
                <th className="px-4 py-3">Duration</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {traces.map((trace) => (
                <tr
                  key={trace.traceId}
                  className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                  onClick={() => openTrace(trace.traceId)}
                >
                  <td className="px-4 py-3 font-mono text-xs">{trace.traceId}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{formatTime(trace.timestamp)}</td>
                  <td className="px-4 py-3">{trace.action || '—'}</td>
                  <td className="px-4 py-3">{trace.role || '—'}</td>
                  <td className="px-4 py-3">{trace.durationMs ? `${trace.durationMs} ms` : '—'}</td>
                  <td className="px-4 py-3"><StatusBadge status={trace.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {!loading && tab === 'metrics' && currentMetrics ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="Total requests" value={currentMetrics.requests.total} />
            <MetricCard label="Successful requests" value={currentMetrics.requests.successful} />
            <MetricCard label="Failed requests" value={currentMetrics.requests.failed} />
            <MetricCard label="Error rate" value={`${currentMetrics.requests.errorRate}%`} />
            <MetricCard label="Avg response time" value={`${currentMetrics.responseTime.averageMs} ms`} />
            <MetricCard label="MCP tool calls" value={currentMetrics.mcp.toolCalls} />
            <MetricCard label="DB operations" value={currentMetrics.database.operations} />
            <MetricCard label="Uptime" value={currentMetrics.health.uptimeHuman} hint={currentMetrics.health.environment} />
          </div>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Most-used MCP tools</h2>
            <table className="min-w-full text-sm">
              <thead className="text-left text-slate-500">
                <tr>
                  <th className="py-2">Tool</th>
                  <th className="py-2">Calls</th>
                  <th className="py-2">Failures</th>
                  <th className="py-2">Avg duration</th>
                </tr>
              </thead>
              <tbody>
                {currentMetrics.mcp.topTools.map((row) => (
                  <tr key={row.tool} className="border-t border-slate-100">
                    <td className="py-2">{row.tool}</td>
                    <td className="py-2">{row.calls}</td>
                    <td className="py-2">{row.failures}</td>
                    <td className="py-2">{row.avgDurationMs} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Recent errors</h2>
            <div className="space-y-2">
              {currentMetrics.recentErrors.length ? (
                currentMetrics.recentErrors.map((item) => (
                  <div key={item.id} className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-sm">
                    <p className="font-medium text-rose-800">{item.operation}</p>
                    <p className="text-rose-700">{item.message}</p>
                    <p className="text-xs text-rose-600">{formatTime(item.time)} · {item.requestId || 'no request id'}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">No errors in this window.</p>
              )}
            </div>
          </section>
        </div>
      ) : null}

      {selectedLog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{selectedLog.operation}</h2>
                <p className="text-sm text-slate-500">{formatTime(selectedLog.time)}</p>
              </div>
              <button type="button" className="text-sm text-slate-500" onClick={() => setSelectedLog(null)}>
                Close
              </button>
            </div>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-slate-500">Level</dt><dd><LevelBadge level={selectedLog.level} /></dd></div>
              <div><dt className="text-slate-500">Request ID</dt><dd className="font-mono text-xs">{selectedLog.requestId || '—'}</dd></div>
              <div><dt className="text-slate-500">User / Role</dt><dd>{selectedLog.role || '—'} {selectedLog.userId || ''}</dd></div>
              <div><dt className="text-slate-500">Tool</dt><dd>{selectedLog.tool || '—'}</dd></div>
              <div><dt className="text-slate-500">Route</dt><dd>{selectedLog.method || ''} {selectedLog.route || '—'}</dd></div>
              <div><dt className="text-slate-500">Duration</dt><dd>{selectedLog.durationMs ? `${selectedLog.durationMs} ms` : '—'}</dd></div>
            </dl>
            {selectedLog.errorMessage ? (
              <div className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">
                {selectedLog.errorMessage}
              </div>
            ) : null}
            {selectedLog.metadata ? (
              <pre className="mt-4 overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">
                {JSON.stringify(selectedLog.metadata, null, 2)}
              </pre>
            ) : null}
          </div>
        </div>
      ) : null}

      {selectedTrace ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Trace {selectedTrace.traceId}</h2>
                <p className="text-sm text-slate-500">{selectedTrace.action}</p>
              </div>
              <button type="button" className="text-sm text-slate-500" onClick={() => setSelectedTrace(null)}>
                Close
              </button>
            </div>
            <div className="mb-4 flex flex-wrap gap-3 text-sm">
              <StatusBadge status={selectedTrace.status} />
              <span className="text-slate-600">{formatTime(selectedTrace.timestamp)}</span>
              <span className="text-slate-600">{selectedTrace.role || 'unknown role'}</span>
              {selectedTrace.durationMs ? <span className="text-slate-600">{selectedTrace.durationMs} ms</span> : null}
            </div>
            {selectedTrace.errorMessage ? (
              <div className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">
                {selectedTrace.errorMessage}
              </div>
            ) : null}
            <ol className="space-y-3 border-l border-slate-200 pl-4">
              {selectedTrace.steps.map((step, index) => (
                <li key={`${step.operation}-${index}`} className="relative">
                  <span className="absolute -left-[1.05rem] top-1 h-2 w-2 rounded-full bg-slate-400" />
                  <p className="text-sm font-medium text-slate-900">{step.operation}</p>
                  <p className="text-xs text-slate-500">
                    {formatTime(step.time)}
                    {step.tool ? ` · ${step.tool}` : ''}
                    {step.durationMs ? ` · ${step.durationMs} ms` : ''}
                  </p>
                  {step.errorMessage ? <p className="text-xs text-rose-700">{step.errorMessage}</p> : null}
                </li>
              ))}
            </ol>
          </div>
        </div>
      ) : null}
    </main>
  );
}
