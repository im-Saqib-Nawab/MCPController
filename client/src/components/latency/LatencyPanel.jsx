import { roleLabel } from '../../lib/roles.js';

function formatMs(value) {
  if (value == null) return '—';
  if (value >= 1000) return `${(value / 1000).toFixed(2)}s`;
  return `${Math.round(value)}ms`;
}

function formatTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

function StatusBadge({ status }) {
  const ok = status === 'success';
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${ok ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
      {ok ? 'Success' : 'Failed'}
    </span>
  );
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
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status] || styles.unknown}`}>
      {labels[status] || status}
    </span>
  );
}

function durationTone(ms) {
  if (ms == null) return 'bg-slate-300';
  if (ms >= 2000) return 'bg-rose-500';
  if (ms >= 1000) return 'bg-amber-500';
  if (ms >= 500) return 'bg-sky-500';
  return 'bg-emerald-500';
}

function DurationBar({ durationMs, maxMs }) {
  const width = maxMs > 0 ? Math.max(4, Math.min(100, (durationMs / maxMs) * 100)) : 0;
  return (
    <div className="flex min-w-[120px] items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${durationTone(durationMs)}`} style={{ width: `${width}%` }} />
      </div>
      <span className="w-16 text-right text-xs font-medium text-slate-700">{formatMs(durationMs)}</span>
    </div>
  );
}

function MetricCard({ label, value, hint }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-slate-900">{value}</p>
      {hint ? <p className="mt-2 text-xs leading-5 text-slate-500">{hint}</p> : null}
    </div>
  );
}

function PhaseBar({ row, totalMs, isBottleneck }) {
  const width = totalMs > 0 && row.durationMs ? Math.max(2, (row.durationMs / totalMs) * 100) : 0;
  return (
    <div className={`rounded-xl border p-4 ${isBottleneck ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'}`}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-900">
            {row.label}
            {isBottleneck ? <span className="ml-2 text-xs font-semibold uppercase tracking-wide text-amber-700">Bottleneck</span> : null}
          </p>
          <p className="text-xs text-slate-500">
            {row.instrumented ? 'Measured' : 'Estimated from request total'}
            {row.sharePct != null ? ` · ${row.sharePct}% of total` : ''}
          </p>
        </div>
        <p className="text-lg font-semibold text-slate-900">{formatMs(row.durationMs)}</p>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${durationTone(row.durationMs)}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function RequestDetailModal({ request, onClose, onOpenTrace }) {
  if (!request) return null;

  const maxDuration = Math.max(
    request.durationMs || 0,
    ...(request.breakdown?.rows || []).map((row) => row.durationMs || 0)
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="border-b border-slate-200 px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Request detail</p>
              <h2 className="mt-1 text-xl font-semibold text-slate-900">{request.action || 'HTTP Request'}</h2>
              <p className="mt-2 font-mono text-xs text-slate-500">{request.requestId}</p>
            </div>
            <button type="button" className="rounded-lg px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        <div className="grid gap-4 border-b border-slate-200 px-6 py-5 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">User</p>
            <p className="mt-1 text-sm font-medium text-slate-900">{request.actorName || 'Unknown'}</p>
            <p className="text-xs text-slate-500">{request.role ? roleLabel(request.role) : '—'}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Route</p>
            <p className="mt-1 font-mono text-sm text-slate-900">{request.method} {request.route}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Total latency</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{formatMs(request.durationMs)}</p>
            <p className="text-xs text-slate-500">{formatTime(request.timestamp)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Status</p>
            <div className="mt-1"><StatusBadge status={request.status || 'success'} /></div>
            <p className="mt-1 text-xs text-slate-500">HTTP {request.statusCode || '—'} · {request.deploymentVersion || 'local'}</p>
          </div>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Latency breakdown</h3>
            <p className="mt-1 text-sm text-slate-600">
              Phase timings combine middleware measurements with trace-derived activity when available.
            </p>
          </div>

          <div className="grid gap-3">
            {(request.breakdown?.rows || []).map((row) => (
              <PhaseBar
                key={row.phase}
                row={row}
                totalMs={request.breakdown?.totalMs || request.durationMs}
                isBottleneck={request.breakdown?.bottleneck?.phase === row.phase}
              />
            ))}
          </div>

          {request.breakdown?.details?.business?.length ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h4 className="text-sm font-semibold text-slate-900">Business activity</h4>
              <div className="mt-3 space-y-2">
                {request.breakdown.details.business.map((item) => (
                  <div key={`${item.label}-${item.durationMs}`} className="flex items-center justify-between text-sm">
                    <span className="text-slate-700">{item.label}</span>
                    <span className="font-medium text-slate-900">{formatMs(item.durationMs)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {request.breakdown?.details?.database?.length ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h4 className="text-sm font-semibold text-slate-900">Database operations</h4>
              <div className="mt-3 space-y-2">
                {request.breakdown.details.database.map((item) => (
                  <div key={`${item.label}-${item.durationMs}`} className="flex items-center justify-between text-sm">
                    <span className="font-mono text-xs text-slate-700">{item.label}</span>
                    <span className="font-medium text-slate-900">{formatMs(item.durationMs)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {request.breakdown?.timeline?.length ? (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h4 className="text-sm font-semibold text-slate-900">Trace timeline</h4>
              <ol className="mt-4 space-y-3 border-l border-slate-200 pl-4">
                {request.breakdown.timeline.map((step, index) => (
                  <li key={`${step.operation}-${index}`} className="relative">
                    <span className="absolute -left-[1.05rem] top-1.5 h-2 w-2 rounded-full bg-slate-400" />
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{step.label}</p>
                        <p className="text-xs text-slate-500">
                          {step.operation}
                          {step.actorName ? ` · ${step.actorName}` : ''}
                          {step.time ? ` · ${formatTime(step.time)}` : ''}
                        </p>
                      </div>
                      <span className="text-sm font-medium text-slate-900">{step.durationMs != null ? formatMs(step.durationMs) : '—'}</span>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          {request.trace?.traceId ? (
            <button type="button" className="text-sm font-medium text-slate-700 underline hover:text-slate-900" onClick={() => onOpenTrace(request.trace.traceId)}>
              Open full trace view
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function LatencyPanel({
  latency,
  selectedEndpoint,
  endpointStats,
  slowRequests,
  selectedRequest,
  onOpenRequest,
  onCloseRequest,
  onOpenEndpoint,
  onCloseEndpoint,
  onOpenTrace
}) {
  const recentRequests = latency?.recentRequests || [];
  const maxRecentDuration = Math.max(...recentRequests.map((row) => row.durationMs || 0), 1);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-900 to-slate-800 p-6 text-white shadow-sm">
        <p className="text-sm text-slate-300">Real request latency from measured HTTP and MCP traffic</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {[
            ['Requests', latency.summary.requestCount],
            ['P50', formatMs(latency.summary.p50Ms)],
            ['P95', formatMs(latency.summary.p95Ms)],
            ['P99', formatMs(latency.summary.p99Ms)],
            ['Error rate', `${latency.summary.errorRate}%`]
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl bg-white/10 p-4 backdrop-blur">
              <p className="text-xs uppercase tracking-wide text-slate-300">{label}</p>
              <p className="mt-1 text-2xl font-semibold">{value}</p>
            </div>
          ))}
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h3 className="text-base font-semibold text-slate-900">Recent requests</h3>
          <p className="mt-1 text-sm text-slate-600">Click a row to inspect latency phases, trace steps, and request metadata.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Time</th>
                <th className="px-5 py-3">User</th>
                <th className="px-5 py-3">Action</th>
                <th className="px-5 py-3">Route</th>
                <th className="px-5 py-3">Latency</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Request ID</th>
              </tr>
            </thead>
            <tbody>
              {recentRequests.length ? recentRequests.map((row) => (
                <tr key={row.requestId} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50" onClick={() => onOpenRequest(row.requestId)}>
                  <td className="px-5 py-3 whitespace-nowrap text-slate-600">{formatTime(row.timestamp)}</td>
                  <td className="px-5 py-3">
                    <p className="font-medium text-slate-900">{row.actorName || '—'}</p>
                    <p className="text-xs text-slate-500">{row.role ? roleLabel(row.role) : 'Unknown role'}</p>
                  </td>
                  <td className="px-5 py-3 text-slate-700">{row.action || '—'}</td>
                  <td className="px-5 py-3 font-mono text-xs text-slate-700">{row.method} {row.route}</td>
                  <td className="px-5 py-3"><DurationBar durationMs={row.durationMs} maxMs={maxRecentDuration} /></td>
                  <td className="px-5 py-3"><StatusBadge status={row.status || (row.statusCode >= 400 ? 'error' : 'success')} /></td>
                  <td className="px-5 py-3 font-mono text-xs text-slate-500">{row.requestId.slice(0, 8)}…</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-slate-500">No requests match the current filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h3 className="text-base font-semibold text-slate-900">Endpoint performance</h3>
          <p className="mt-1 text-sm text-slate-600">Aggregated latency per route. Select an endpoint to inspect its slowest requests.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Endpoint</th>
                <th className="px-5 py-3">Requests</th>
                <th className="px-5 py-3">Avg</th>
                <th className="px-5 py-3">P95</th>
                <th className="px-5 py-3">P99</th>
                <th className="px-5 py-3">Errors</th>
                <th className="px-5 py-3">Budget</th>
                <th className="px-5 py-3">SLO</th>
              </tr>
            </thead>
            <tbody>
              {latency.endpoints.map((row) => (
                <tr
                  key={`${row.method}:${row.endpoint}`}
                  className={`cursor-pointer border-t border-slate-100 hover:bg-slate-50 ${selectedEndpoint?.endpoint === row.endpoint && selectedEndpoint?.method === row.method ? 'bg-sky-50' : ''}`}
                  onClick={() => onOpenEndpoint(row.endpoint, row.method)}
                >
                  <td className="px-5 py-3">
                    <p className="font-mono text-xs text-slate-900">{row.endpoint}</p>
                    <p className="text-xs text-slate-500">{row.method}</p>
                  </td>
                  <td className="px-5 py-3">{row.requestCount ?? row.count ?? '—'}</td>
                  <td className="px-5 py-3">{formatMs(row.avgMs)}</td>
                  <td className="px-5 py-3">{formatMs(row.p95Ms)}</td>
                  <td className="px-5 py-3">{formatMs(row.p99Ms)}</td>
                  <td className="px-5 py-3">{row.errorRate}%</td>
                  <td className="px-5 py-3">{row.budgetMs ? formatMs(row.budgetMs) : '—'}</td>
                  <td className="px-5 py-3"><SloStatusBadge status={row.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {selectedEndpoint && endpointStats ? (
        <section className="rounded-2xl border border-sky-200 bg-sky-50/40 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-sky-100 px-5 py-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Endpoint drill-down</p>
              <h3 className="mt-1 text-lg font-semibold text-slate-900">
                {selectedEndpoint.method} {selectedEndpoint.endpoint}
              </h3>
            </div>
            <button type="button" className="rounded-lg bg-white px-3 py-1.5 text-sm text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50" onClick={onCloseEndpoint}>
              Close
            </button>
          </div>

          <div className="grid gap-4 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="Requests sampled" value={endpointStats.requestCount ?? endpointStats.count ?? '—'} />
            <MetricCard label={`${slowRequests?.metric?.toUpperCase() || 'P99'} for endpoint`} value={formatMs(slowRequests?.metricValueMs)} />
            <MetricCard label="Average latency" value={formatMs(endpointStats.avgMs)} />
            <MetricCard label="Error rate" value={`${endpointStats.errorRate ?? 0}%`} />
          </div>

          {slowRequests?.slowestRequests?.length ? (
            <div className="overflow-x-auto border-t border-sky-100">
              <table className="min-w-full text-sm">
                <thead className="bg-white/70 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3">User</th>
                    <th className="px-5 py-3">Action</th>
                    <th className="px-5 py-3">Latency</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Time</th>
                    <th className="px-5 py-3">Request ID</th>
                  </tr>
                </thead>
                <tbody>
                  {slowRequests.slowestRequests.map((row) => (
                    <tr key={row.requestId} className="cursor-pointer border-t border-sky-100 bg-white/50 hover:bg-white" onClick={() => onOpenRequest(row.requestId)}>
                      <td className="px-5 py-3">{row.actorName || '—'}</td>
                      <td className="px-5 py-3">{row.action || '—'}</td>
                      <td className="px-5 py-3 font-medium text-slate-900">{formatMs(row.durationMs)}</td>
                      <td className="px-5 py-3"><StatusBadge status={row.status || (row.statusCode >= 400 ? 'error' : 'success')} /></td>
                      <td className="px-5 py-3 whitespace-nowrap text-slate-600">{formatTime(row.timestamp)}</td>
                      <td className="px-5 py-3 font-mono text-xs text-slate-500">{row.requestId.slice(0, 8)}…</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-5 py-6 text-sm text-slate-600">No slow requests recorded for this endpoint in the selected window.</p>
          )}
        </section>
      ) : null}

      <RequestDetailModal
        request={selectedRequest}
        onClose={onCloseRequest}
        onOpenTrace={onOpenTrace}
      />
    </div>
  );
}
