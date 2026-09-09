import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { roleLabel } from '../lib/roles.js';
import { api, getErrorMessage } from '../services/api.js';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'logs', label: 'Logs' },
  { id: 'traces', label: 'Traces' },
  { id: 'metrics', label: 'Metrics' },
  { id: 'latency', label: 'Latency' },
  { id: 'alerts', label: 'Alerts' },
  { id: 'slo', label: 'SLO / Budgets' }
];

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
      {ok ? 'Success' : 'Failed'}
    </span>
  );
}

function formatMs(value) {
  if (value == null) return '—';
  if (value >= 1000) return `${(value / 1000).toFixed(1)}s`;
  return `${value}ms`;
}

function SloStatusBadge({ status }) {
  const styles = {
    healthy: 'bg-emerald-100 text-emerald-800',
    violating: 'bg-rose-100 text-rose-800',
    warning: 'bg-amber-100 text-amber-800',
    resolved: 'bg-slate-100 text-slate-700',
    unknown: 'bg-slate-100 text-slate-600'
  };
  const labels = {
    healthy: 'Healthy',
    violating: 'Violating',
    warning: 'Warning',
    resolved: 'Resolved',
    unknown: 'Unknown'
  };
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${styles[status] || styles.unknown}`}>
      {labels[status] || status}
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

function Section({ title, children }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-slate-900">{title}</h2>
      {children}
    </section>
  );
}

export default function Observability() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') || 'overview';
  const [sinceMinutes, setSinceMinutes] = useState(1440);
  const [level, setLevel] = useState('');
  const [status, setStatus] = useState('');
  const [role, setRole] = useState('');
  const [action, setAction] = useState('');
  const [userId, setUserId] = useState('');
  const [search, setSearch] = useState('');
  const [includeTechnical, setIncludeTechnical] = useState(false);
  const [minDurationMs, setMinDurationMs] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [overview, setOverview] = useState(null);
  const [logs, setLogs] = useState([]);
  const [traces, setTraces] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [latency, setLatency] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [slos, setSlos] = useState([]);
  const [selectedEndpoint, setSelectedEndpoint] = useState(null);
  const [slowRequests, setSlowRequests] = useState(null);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [sloForm, setSloForm] = useState(null);
  const [selectedLog, setSelectedLog] = useState(null);
  const [selectedTrace, setSelectedTrace] = useState(null);
  const [filterOptions, setFilterOptions] = useState({ actions: [], roles: [], statuses: [] });
  const [users, setUsers] = useState([]);

  useEffect(() => {
    Promise.all([api.get('/admin/observability/filters'), api.get('/admin/users')])
      .then(([filtersRes, usersRes]) => {
        setFilterOptions(filtersRes.data.filters || { actions: [], roles: [], statuses: [] });
        setUsers(usersRes.data.users || []);
      })
      .catch(() => {});
  }, []);

  const query = useMemo(
    () => ({
      sinceMinutes,
      ...(level ? { level } : {}),
      ...(status ? { status } : {}),
      ...(role ? { role } : {}),
      ...(action ? { action } : {}),
      ...(userId ? { userId } : {}),
      ...(search.trim() ? { search: search.trim() } : {}),
      ...(includeTechnical ? { includeTechnical: 'true' } : {}),
      ...(minDurationMs ? { minDurationMs } : {})
    }),
    [sinceMinutes, level, status, role, action, userId, search, includeTechnical, minDurationMs]
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
      } else if (tab === 'latency') {
        const { data } = await api.get('/admin/observability/latency', { params: query });
        setLatency(data.latency);
      } else if (tab === 'alerts') {
        const { data } = await api.get('/admin/observability/alerts', { params: query });
        setAlerts(data.alerts || []);
      } else if (tab === 'slo') {
        const { data } = await api.get('/admin/observability/slo', { params: query });
        setSlos(data.slos || []);
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
    setSelectedEndpoint(null);
    setSlowRequests(null);
    setSelectedRequest(null);
    setSloForm(null);
    setSearchParams({ tab: nextTab });
  }

  async function openEndpoint(endpoint, method) {
    setSelectedEndpoint({ endpoint, method });
    try {
      const { data } = await api.get('/admin/observability/latency/slow-requests', {
        params: { ...query, route: endpoint, method: method === '*' ? undefined : method }
      });
      setSlowRequests(data);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function openRequestDetail(requestId) {
    try {
      const { data } = await api.get(`/admin/observability/latency/requests/${encodeURIComponent(requestId)}`);
      setSelectedRequest(data.request);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function saveSlo(event) {
    event.preventDefault();
    try {
      if (sloForm.id) {
        await api.patch(`/admin/observability/slo/${sloForm.id}`, sloForm);
      } else {
        await api.post('/admin/observability/slo', sloForm);
      }
      setSloForm(null);
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function deleteSlo(id) {
    if (!window.confirm('Delete this SLO configuration?')) return;
    try {
      await api.delete(`/admin/observability/slo/${id}`);
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
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
            Audit logs for user and admin actions across the website and MCP tools.
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

      <div className="mb-6 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-3 lg:grid-cols-4">
        <label className="text-sm">
          <span className="mb-1 block text-slate-500">Time window</span>
          <select className="w-full rounded-lg border border-slate-200 px-3 py-2" value={sinceMinutes} onChange={(e) => setSinceMinutes(Number(e.target.value))}>
            {TIME_WINDOWS.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <span className="mb-1 block text-slate-500">User / Admin</span>
          <select className="w-full rounded-lg border border-slate-200 px-3 py-2" value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">All users</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>{user.name} ({user.role})</option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <span className="mb-1 block text-slate-500">Role</span>
          <select className="w-full rounded-lg border border-slate-200 px-3 py-2" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">All roles</option>
            {filterOptions.roles.map((item) => (
              <option key={item} value={item}>{roleLabel(item)}</option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <span className="mb-1 block text-slate-500">Action</span>
          <select className="w-full rounded-lg border border-slate-200 px-3 py-2" value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">All actions</option>
            {filterOptions.actions.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <span className="mb-1 block text-slate-500">Status</span>
          <select className="w-full rounded-lg border border-slate-200 px-3 py-2" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option value="success">Success</option>
            <option value="error">Failed</option>
          </select>
        </label>

        {(tab === 'logs' || tab === 'overview') && (
          <label className="text-sm">
            <span className="mb-1 block text-slate-500">Log level</span>
            <select className="w-full rounded-lg border border-slate-200 px-3 py-2" value={level} onChange={(e) => setLevel(e.target.value)}>
              <option value="">All levels</option>
              <option value="info">INFO</option>
              <option value="warn">WARN</option>
              <option value="error">ERROR</option>
              <option value="debug">DEBUG</option>
            </select>
          </label>
        )}

        {tab === 'traces' && (
          <label className="text-sm">
            <span className="mb-1 block text-slate-500">Min duration (ms)</span>
            <input className="w-full rounded-lg border border-slate-200 px-3 py-2" value={minDurationMs} onChange={(e) => setMinDurationMs(e.target.value)} placeholder="e.g. 100" />
          </label>
        )}

        {tab === 'logs' && (
          <label className="flex items-end gap-2 text-sm">
            <input type="checkbox" checked={includeTechnical} onChange={(e) => setIncludeTechnical(e.target.checked)} />
            <span className="pb-2 text-slate-600">Include technical HTTP logs</span>
          </label>
        )}

        <label className="text-sm md:col-span-2 lg:col-span-3">
          <span className="mb-1 block text-slate-500">Search</span>
          <input
            className="w-full rounded-lg border border-slate-200 px-3 py-2"
            placeholder="Search by name, action, request ID, trace ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>

      {error ? <p className="mb-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}
      {loading ? <p className="text-sm text-slate-500">Loading observability data…</p> : null}

      {!loading && tab === 'overview' && !overview ? (
        <p className="text-sm text-slate-500">No overview data available for the selected filters.</p>
      ) : null}

      {!loading && tab === 'overview' && overview ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="User actions" value={overview.metrics.audit.total} hint="Bookings, logins, updates…" />
            <MetricCard label="Successful actions" value={overview.metrics.audit.successful} />
            <MetricCard label="Failed actions" value={overview.metrics.audit.failed} />
            <MetricCard label="Action error rate" value={`${overview.metrics.audit.errorRate}%`} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Section title="Recent user & admin activity">
              <div className="space-y-2">
                {overview.logs.map((log) => (
                  <button key={log.id} type="button" onClick={() => openLog(log.id)} className="flex w-full flex-col gap-1 rounded-lg border border-slate-100 px-3 py-2 text-left hover:bg-slate-50">
                    <p className="text-sm font-medium text-slate-900">{log.message || log.summary}</p>
                    <p className="text-xs text-slate-500">{formatTime(log.time)} · {log.action || log.operation}</p>
                  </button>
                ))}
              </div>
            </Section>

            <Section title="Recent traces">
              <div className="space-y-2">
                {overview.traces.map((trace) => (
                  <button key={trace.traceId} type="button" onClick={() => openTrace(trace.traceId)} className="flex w-full items-start justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2 text-left hover:bg-slate-50">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{trace.message || trace.action}</p>
                      <p className="text-xs text-slate-500">{trace.actorName || 'Unknown'} · {formatTime(trace.timestamp)}</p>
                    </div>
                    <StatusBadge status={trace.status} />
                  </button>
                ))}
              </div>
            </Section>
          </div>
        </div>
      ) : null}

      {!loading && tab === 'logs' ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Activity</th>
                <th className="px-4 py-3">User / Role</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Trace ID</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50" onClick={() => openLog(log.id)}>
                  <td className="px-4 py-3 whitespace-nowrap">{formatTime(log.time)}</td>
                  <td className="px-4 py-3 max-w-md">{log.message || log.summary}</td>
                  <td className="px-4 py-3">{log.actorName || '—'}<br /><span className="text-xs text-slate-500">{roleLabel(log.role)}</span></td>
                  <td className="px-4 py-3">{log.action || log.operation}</td>
                  <td className="px-4 py-3"><StatusBadge status={log.status || (log.level === 'error' ? 'error' : 'success')} /></td>
                  <td className="px-4 py-3 font-mono text-xs">{log.traceId || '—'}</td>
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
                <th className="px-4 py-3">User / Role</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Duration</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {traces.map((trace) => (
                <tr key={trace.traceId} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50" onClick={() => openTrace(trace.traceId)}>
                  <td className="px-4 py-3 font-mono text-xs">{trace.traceId}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{formatTime(trace.timestamp)}</td>
                  <td className="px-4 py-3">{trace.actorName || '—'}<br /><span className="text-xs text-slate-500">{roleLabel(trace.role)}</span></td>
                  <td className="px-4 py-3">{trace.action}</td>
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
          <Section title="User & admin activity">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard label="Total actions" value={currentMetrics.audit.total} />
              <MetricCard label="Successful" value={currentMetrics.audit.successful} />
              <MetricCard label="Failed" value={currentMetrics.audit.failed} />
              <MetricCard label="Error rate" value={`${currentMetrics.audit.errorRate}%`} />
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Top actions</h3>
                <table className="min-w-full text-sm">
                  <tbody>
                    {currentMetrics.audit.byAction.map((row) => (
                      <tr key={row.action} className="border-t border-slate-100">
                        <td className="py-2">{row.action}</td>
                        <td className="py-2 text-right">{row.count}</td>
                        <td className="py-2 text-right text-rose-600">{row.failures} failed</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">By role</h3>
                <table className="min-w-full text-sm">
                  <tbody>
                    {currentMetrics.audit.byRole.map((row) => (
                      <tr key={row.role} className="border-t border-slate-100">
                        <td className="py-2">{roleLabel(row.role)}</td>
                        <td className="py-2 text-right">{row.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Section>

          <Section title="HTTP requests (technical)">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard label="Total requests" value={currentMetrics.http.total} />
              <MetricCard label="Successful" value={currentMetrics.http.successful} />
              <MetricCard label="Failed" value={currentMetrics.http.failed} />
              <MetricCard label="Avg response time" value={`${currentMetrics.http.averageResponseMs} ms`} />
            </div>
          </Section>

          <Section title="MCP tools">
            <div className="grid gap-4 sm:grid-cols-2">
              <MetricCard label="MCP actions logged" value={currentMetrics.mcp.toolCalls} />
              <MetricCard label="Uptime" value={currentMetrics.health.uptimeHuman} hint={currentMetrics.health.environment} />
            </div>
            <table className="mt-4 min-w-full text-sm">
              <thead className="text-left text-slate-500">
                <tr><th className="py-2">Tool</th><th className="py-2">Calls</th><th className="py-2">Failures</th><th className="py-2">Avg duration</th></tr>
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
          </Section>

          <Section title="Recent failed actions">
            <div className="space-y-2">
              {currentMetrics.audit.recentErrors.length ? currentMetrics.audit.recentErrors.map((item) => (
                <div key={item.id} className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-sm">
                  <p className="font-medium text-rose-800">{item.action} · {item.actorName}</p>
                  <p className="text-rose-700">{item.message}</p>
                  <p className="text-xs text-rose-600">{formatTime(item.time)} · {item.requestId || 'no trace id'}</p>
                </div>
              )) : <p className="text-sm text-slate-500">No failed actions in this window.</p>}
            </div>
          </Section>
        </div>
      ) : null}

      {!loading && tab === 'latency' && !latency ? (
        <p className="text-sm text-slate-500">No latency data recorded for the selected filters.</p>
      ) : null}

      {!loading && tab === 'latency' && latency ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <MetricCard label="Requests" value={latency.summary.requestCount} hint="Measured from real HTTP/MCP traffic" />
            <MetricCard label="P50" value={formatMs(latency.summary.p50Ms)} />
            <MetricCard label="P95" value={formatMs(latency.summary.p95Ms)} />
            <MetricCard label="P99" value={formatMs(latency.summary.p99Ms)} />
            <MetricCard label="Errors" value={`${latency.summary.errorRate}%`} />
          </div>

          <Section title="Recent requests">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-slate-500">
                  <tr>
                    <th className="py-2 pr-3">Time</th>
                    <th className="py-2 pr-3">User</th>
                    <th className="py-2 pr-3">Role</th>
                    <th className="py-2 pr-3">Action</th>
                    <th className="py-2 pr-3">Route</th>
                    <th className="py-2 pr-3">Duration</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2">Request ID</th>
                  </tr>
                </thead>
                <tbody>
                  {(latency.recentRequests || []).length ? latency.recentRequests.map((row) => (
                    <tr
                      key={row.requestId}
                      className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                      onClick={() => openRequestDetail(row.requestId)}
                    >
                      <td className="py-2 pr-3 whitespace-nowrap">{formatTime(row.timestamp)}</td>
                      <td className="py-2 pr-3">{row.actorName || '—'}</td>
                      <td className="py-2 pr-3">{row.role ? roleLabel(row.role) : '—'}</td>
                      <td className="py-2 pr-3">{row.action || '—'}</td>
                      <td className="py-2 pr-3 font-mono text-xs">{row.method} {row.route}</td>
                      <td className="py-2 pr-3 font-medium">{formatMs(row.durationMs)}</td>
                      <td className="py-2 pr-3"><StatusBadge status={row.status || (row.statusCode >= 400 ? 'error' : 'success')} /></td>
                      <td className="py-2 font-mono text-xs">{row.requestId}</td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={8} className="py-4 text-slate-500">No requests match the current filters.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="Endpoint Performance">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-slate-500">
                  <tr>
                    <th className="py-2">Endpoint</th>
                    <th className="py-2">Method</th>
                    <th className="py-2">P95</th>
                    <th className="py-2">P99</th>
                    <th className="py-2">Budget</th>
                    <th className="py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {latency.endpoints.map((row) => (
                    <tr
                      key={`${row.method}:${row.endpoint}`}
                      className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                      onClick={() => openEndpoint(row.endpoint, row.method)}
                    >
                      <td className="py-2 font-mono text-xs">{row.endpoint}</td>
                      <td className="py-2">{row.method}</td>
                      <td className="py-2">{formatMs(row.p95Ms)}</td>
                      <td className="py-2">{formatMs(row.p99Ms)}</td>
                      <td className="py-2">{row.budgetMs ? formatMs(row.budgetMs) : '—'}</td>
                      <td className="py-2"><SloStatusBadge status={row.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          {selectedEndpoint && slowRequests ? (
            <Section title={`Slow requests — ${selectedEndpoint.endpoint}`}>
              <p className="mb-3 text-sm text-slate-600">
                {slowRequests.metric.toUpperCase()}: {formatMs(slowRequests.metricValueMs)}
              </p>
              <table className="min-w-full text-sm">
                <thead className="text-left text-slate-500">
                  <tr>
                    <th className="py-2">Request ID</th>
                    <th className="py-2">User</th>
                    <th className="py-2">Action</th>
                    <th className="py-2">Duration</th>
                    <th className="py-2">Status</th>
                    <th className="py-2">Version</th>
                  </tr>
                </thead>
                <tbody>
                  {slowRequests.slowestRequests.map((row) => (
                    <tr
                      key={row.requestId}
                      className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                      onClick={() => openRequestDetail(row.requestId)}
                    >
                      <td className="py-2 font-mono text-xs">{row.requestId}</td>
                      <td className="py-2">{row.actorName || '—'}</td>
                      <td className="py-2">{row.action || '—'}</td>
                      <td className="py-2">{formatMs(row.durationMs)}</td>
                      <td className="py-2"><StatusBadge status={row.status || (row.statusCode >= 400 ? 'error' : 'success')} /></td>
                      <td className="py-2 text-xs">{row.deploymentVersion || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          ) : null}
        </div>
      ) : null}

      {!loading && tab === 'alerts' ? (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Alerts are evaluated from real minute-level latency buckets against configured SLO targets.
          </p>
          {alerts.length ? alerts.map((alert) => (
            <div
              key={alert.id}
              className={`rounded-xl border bg-white p-4 shadow-sm ${
                alert.status === 'violating' ? 'border-rose-200' : 'border-slate-200'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-slate-900">{alert.message}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {alert.method} {alert.endpoint} · {alert.metric.toUpperCase()} · {alert.sloTarget}
                  </p>
                </div>
                <SloStatusBadge status={alert.status} />
              </div>
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-5">
                <div><dt className="text-slate-500">Current value</dt><dd className="font-medium">{alert.metric === 'availability' ? `${alert.currentValue}%` : formatMs(alert.currentValue)}</dd></div>
                <div><dt className="text-slate-500">Budget</dt><dd>{alert.metric === 'availability' ? `${alert.budgetValue}%` : formatMs(alert.budgetValue)}</dd></div>
                <div><dt className="text-slate-500">Violation started</dt><dd>{formatTime(alert.violationStartedAt)}</dd></div>
                <div><dt className="text-slate-500">Duration</dt><dd>{alert.violationDurationMs ? formatMs(alert.violationDurationMs) : '—'}</dd></div>
                <div><dt className="text-slate-500">Deployment</dt><dd>{alert.deploymentVersion || '—'}</dd></div>
              </dl>
            </div>
          )) : <p className="text-sm text-slate-500">No latency alerts in this window.</p>}
        </div>
      ) : null}

      {!loading && tab === 'slo' ? (
        <div className="space-y-6">
          <p className="text-sm text-slate-600">
            SLO status and budget usage are calculated from recorded request latency over each SLO&apos;s evaluation window.
          </p>
          <div className="flex justify-end">
            <button
              type="button"
              className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white"
              onClick={() => setSloForm({ endpoint: '', method: '*', primaryMetric: 'p99', p99BudgetMs: 1500, evaluationWindowDays: 30, alertConsecutiveMinutes: 5 })}
            >
              Add SLO
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-4 py-3">Endpoint</th>
                  <th className="px-4 py-3">SLO Target</th>
                  <th className="px-4 py-3">Window</th>
                  <th className="px-4 py-3">Current</th>
                  <th className="px-4 py-3">Budget Used</th>
                  <th className="px-4 py-3">Remaining</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {slos.map((slo) => (
                  <tr key={slo.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-mono text-xs">{slo.method} {slo.endpoint}</td>
                    <td className="px-4 py-3">{slo.sloTarget}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{slo.evaluationWindowLabel || '30 days'}</td>
                    <td className="px-4 py-3">
                      {slo.primaryMetric === 'availability'
                        ? (slo.currentValue != null ? `${slo.currentValue}%` : '—')
                        : formatMs(slo.currentValue)}
                    </td>
                    <td className="px-4 py-3">
                      {slo.budgetUsedPct != null ? `${slo.budgetUsedPct}%` : '—'}
                      {slo.budgetDifferenceMs > 0 ? (
                        <span className="block text-xs text-rose-600">+{formatMs(slo.budgetDifferenceMs)} over budget</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      {slo.budgetRemainingPct != null ? `${slo.budgetRemainingPct}%` : '—'}
                    </td>
                    <td className="px-4 py-3"><SloStatusBadge status={slo.status} /></td>
                    <td className="px-4 py-3">
                      <button type="button" className="mr-2 text-slate-700 underline" onClick={() => setSloForm({ ...slo })}>Edit</button>
                      <button type="button" className="text-rose-700 underline" onClick={() => deleteSlo(slo.id)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {selectedRequest ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Request Latency Breakdown</h2>
                <p className="font-mono text-xs text-slate-500">{selectedRequest.requestId}</p>
                <p className="mt-1 text-sm text-slate-600">
                  {selectedRequest.method} {selectedRequest.route} · Total {formatMs(selectedRequest.durationMs)}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {selectedRequest.actorName || 'Unknown user'}
                  {selectedRequest.role ? ` · ${roleLabel(selectedRequest.role)}` : ''}
                  {selectedRequest.action ? ` · ${selectedRequest.action}` : ''}
                </p>
              </div>
              <button type="button" className="text-sm text-slate-500" onClick={() => setSelectedRequest(null)}>Close</button>
            </div>

            <div className="space-y-2">
              {selectedRequest.breakdown?.rows?.map((row) => (
                <div
                  key={row.phase}
                  className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                    selectedRequest.breakdown?.bottleneck?.phase === row.phase
                      ? 'bg-amber-50 ring-1 ring-amber-200'
                      : 'bg-slate-50'
                  }`}
                >
                  <span>
                    {row.label}
                    {selectedRequest.breakdown?.bottleneck?.phase === row.phase ? ' ← Bottleneck' : ''}
                    {!row.instrumented ? ' (estimated/uninstrumented)' : ''}
                  </span>
                  <span className="font-medium">{row.durationMs != null ? formatMs(row.durationMs) : '—'}</span>
                </div>
              ))}
            </div>

            {selectedRequest.breakdown?.details?.database?.length ? (
              <div className="mt-4">
                <h3 className="mb-2 text-sm font-semibold text-slate-900">Database</h3>
                {selectedRequest.breakdown.details.database.map((item) => (
                  <div key={`${item.label}-${item.durationMs}`} className="flex justify-between text-sm text-slate-600">
                    <span>{item.label}</span>
                    <span>{formatMs(item.durationMs)}</span>
                  </div>
                ))}
              </div>
            ) : null}

            {selectedRequest.breakdown?.details?.external?.length ? (
              <div className="mt-4">
                <h3 className="mb-2 text-sm font-semibold text-slate-900">External API</h3>
                {selectedRequest.breakdown.details.external.map((item) => (
                  <div key={`${item.label}-${item.durationMs}`} className="flex justify-between text-sm text-slate-600">
                    <span>{item.label}</span>
                    <span>{formatMs(item.durationMs)}</span>
                  </div>
                ))}
              </div>
            ) : null}

            {selectedRequest.trace?.traceId ? (
              <button
                type="button"
                className="mt-4 text-sm text-slate-700 underline"
                onClick={() => { setSelectedRequest(null); openTrace(selectedRequest.trace.traceId); }}
              >
                View full trace
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {sloForm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <form className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl" onSubmit={saveSlo}>
            <h2 className="mb-4 text-lg font-semibold text-slate-900">{sloForm.id ? 'Edit SLO' : 'Add SLO'}</h2>
            <div className="grid gap-3">
              <label className="text-sm">
                <span className="mb-1 block text-slate-500">Endpoint</span>
                <input className="w-full rounded-lg border border-slate-200 px-3 py-2" value={sloForm.endpoint} onChange={(e) => setSloForm({ ...sloForm, endpoint: e.target.value })} required />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-slate-500">Method</span>
                <input className="w-full rounded-lg border border-slate-200 px-3 py-2" value={sloForm.method || '*'} onChange={(e) => setSloForm({ ...sloForm, method: e.target.value })} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-slate-500">Primary metric</span>
                <select className="w-full rounded-lg border border-slate-200 px-3 py-2" value={sloForm.primaryMetric} onChange={(e) => setSloForm({ ...sloForm, primaryMetric: e.target.value })}>
                  <option value="p99">P99 latency</option>
                  <option value="p95">P95 latency</option>
                  <option value="availability">Availability</option>
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-slate-500">P95 budget (ms)</span>
                <input type="number" className="w-full rounded-lg border border-slate-200 px-3 py-2" value={sloForm.p95BudgetMs ?? ''} onChange={(e) => setSloForm({ ...sloForm, p95BudgetMs: e.target.value ? Number(e.target.value) : undefined })} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-slate-500">P99 budget (ms)</span>
                <input type="number" className="w-full rounded-lg border border-slate-200 px-3 py-2" value={sloForm.p99BudgetMs ?? ''} onChange={(e) => setSloForm({ ...sloForm, p99BudgetMs: e.target.value ? Number(e.target.value) : undefined })} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-slate-500">Availability target (%)</span>
                <input type="number" step="0.1" className="w-full rounded-lg border border-slate-200 px-3 py-2" value={sloForm.availabilityTarget ?? ''} onChange={(e) => setSloForm({ ...sloForm, availabilityTarget: e.target.value ? Number(e.target.value) : undefined })} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-slate-500">Alert after consecutive minutes</span>
                <input type="number" className="w-full rounded-lg border border-slate-200 px-3 py-2" value={sloForm.alertConsecutiveMinutes ?? 5} onChange={(e) => setSloForm({ ...sloForm, alertConsecutiveMinutes: Number(e.target.value) })} />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded-lg px-3 py-2 text-sm text-slate-600" onClick={() => setSloForm(null)}>Cancel</button>
              <button type="submit" className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white">Save</button>
            </div>
          </form>
        </div>
      ) : null}

      {selectedLog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{selectedLog.action || selectedLog.operation}</h2>
                <p className="text-sm text-slate-700">{selectedLog.message}</p>
              </div>
              <button type="button" className="text-sm text-slate-500" onClick={() => setSelectedLog(null)}>Close</button>
            </div>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-slate-500">User / Admin</dt><dd>{selectedLog.actorName || '—'}</dd></div>
              <div><dt className="text-slate-500">Role</dt><dd>{roleLabel(selectedLog.role)}</dd></div>
              <div><dt className="text-slate-500">Status</dt><dd><StatusBadge status={selectedLog.status || 'success'} /></dd></div>
              <div><dt className="text-slate-500">Time</dt><dd>{formatTime(selectedLog.time)}</dd></div>
              <div><dt className="text-slate-500">Trace / Request ID</dt><dd className="font-mono text-xs">{selectedLog.traceId || '—'}</dd></div>
              <div><dt className="text-slate-500">Level</dt><dd><LevelBadge level={selectedLog.level} /></dd></div>
              {selectedLog.tool ? <div><dt className="text-slate-500">MCP tool</dt><dd>{selectedLog.tool}</dd></div> : null}
              {selectedLog.route ? <div><dt className="text-slate-500">Route</dt><dd>{selectedLog.method} {selectedLog.route}</dd></div> : null}
            </dl>
            {selectedLog.traceId ? (
              <button type="button" className="mt-4 text-sm text-slate-700 underline" onClick={() => { setSelectedLog(null); openTrace(selectedLog.traceId); }}>
                View related trace
              </button>
            ) : null}
            {selectedLog.errorMessage ? <div className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{selectedLog.errorMessage}</div> : null}
            {selectedLog.metadata ? <pre className="mt-4 overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">{JSON.stringify(selectedLog.metadata, null, 2)}</pre> : null}
          </div>
        </div>
      ) : null}

      {selectedTrace ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{selectedTrace.action}</h2>
                <p className="text-sm text-slate-600">{selectedTrace.message}</p>
                <p className="mt-1 font-mono text-xs text-slate-500">{selectedTrace.traceId}</p>
              </div>
              <button type="button" className="text-sm text-slate-500" onClick={() => setSelectedTrace(null)}>Close</button>
            </div>
            <div className="mb-4 flex flex-wrap gap-3 text-sm">
              <StatusBadge status={selectedTrace.status} />
              <span className="text-slate-600">{selectedTrace.actorName || 'Unknown user'}</span>
              <span className="text-slate-600">{roleLabel(selectedTrace.role)}</span>
              <span className="text-slate-600">{formatTime(selectedTrace.timestamp)}</span>
              {selectedTrace.durationMs ? <span className="text-slate-600">{selectedTrace.durationMs} ms</span> : null}
            </div>
            {selectedTrace.errorMessage ? <div className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{selectedTrace.errorMessage}</div> : null}
            <ol className="space-y-3 border-l border-slate-200 pl-4">
              {selectedTrace.steps.map((step, index) => (
                <li key={`${step.operation}-${index}`} className="relative">
                  <span className="absolute -left-[1.05rem] top-1 h-2 w-2 rounded-full bg-slate-400" />
                  <p className="text-sm font-medium text-slate-900">{step.message || step.action || step.operation}</p>
                  <p className="text-xs text-slate-500">
                    {formatTime(step.time)}
                    {step.actorName ? ` · ${step.actorName}` : ''}
                    {step.durationMs ? ` · ${step.durationMs} ms` : ''}
                  </p>
                  {step.id ? (
                    <button type="button" className="text-xs text-slate-600 underline" onClick={() => openLog(step.id)}>Open log</button>
                  ) : null}
                </li>
              ))}
            </ol>
          </div>
        </div>
      ) : null}
    </main>
  );
}
