function formatMs(value) {
  if (value == null) return '—';
  if (value >= 1000) return `${(value / 1000).toFixed(2)}s`;
  return `${Math.round(value)}ms`;
}

function formatTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

function SloStatusBadge({ status }) {
  const styles = {
    healthy: 'bg-emerald-100 text-emerald-800',
    violating: 'bg-rose-100 text-rose-800',
    warning: 'bg-amber-100 text-amber-800',
    resolved: 'bg-slate-100 text-slate-700',
    no_data: 'bg-slate-100 text-slate-600',
    unknown: 'bg-slate-100 text-slate-600'
  };
  const labels = {
    healthy: 'Healthy',
    violating: 'Violating',
    warning: 'Warning',
    resolved: 'Resolved',
    no_data: 'No data',
    unknown: 'Unknown'
  };
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status] || styles.unknown}`}>
      {labels[status] || status}
    </span>
  );
}

export default function AlertsPanel({ alerts }) {
  const activeAlerts = alerts.filter((alert) => alert.status === 'violating' || alert.status === 'warning');
  const resolvedAlerts = alerts.filter((alert) => alert.status === 'resolved');

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-700">
        <h3 className="font-semibold text-slate-900">How alerts work</h3>
        <ul className="mt-3 list-disc space-y-2 pl-5 leading-6">
          <li>Alerts are generated from real recorded request latency samples and minute-level rollups.</li>
          <li>A <strong>Violating</strong> alert means the current P95/P99 or availability value is above the configured SLO budget in the alert window.</li>
          <li>A <strong>Warning</strong> alert means at least one request exceeded the budget, even if the percentile is still below the target.</li>
          <li>Use a specific endpoint such as <code className="rounded bg-white px-1">/api/appointments</code> or <code className="rounded bg-white px-1">*</code> for all traffic.</li>
        </ul>
      </div>

      <section className="space-y-4">
        <h3 className="text-base font-semibold text-slate-900">Active alerts</h3>
        {activeAlerts.length ? activeAlerts.map((alert) => (
          <div
            key={alert.id}
            className={`rounded-2xl border bg-white p-5 shadow-sm ${
              alert.status === 'violating' ? 'border-rose-200' : 'border-amber-200'
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium text-slate-900">{alert.message}</p>
                <p className="mt-1 text-sm text-slate-600">
                  {alert.methodLabel || alert.method} · {alert.endpointLabel || alert.endpoint} · {alert.sloTarget}
                </p>
              </div>
              <SloStatusBadge status={alert.status} />
            </div>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-5">
              <div><dt className="text-slate-500">Current value</dt><dd className="font-medium">{alert.metric === 'availability' ? `${alert.currentValue}%` : formatMs(alert.currentValue)}</dd></div>
              <div><dt className="text-slate-500">Budget</dt><dd>{alert.metric === 'availability' ? `${alert.budgetValue}%` : formatMs(alert.budgetValue)}</dd></div>
              <div><dt className="text-slate-500">Started</dt><dd>{formatTime(alert.violationStartedAt)}</dd></div>
              <div><dt className="text-slate-500">Duration</dt><dd>{alert.violationDurationMs ? formatMs(alert.violationDurationMs) : '—'}</dd></div>
              <div><dt className="text-slate-500">Deployment</dt><dd>{alert.deploymentVersion || '—'}</dd></div>
            </dl>
          </div>
        )) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-8 text-sm text-slate-600">
            No active alerts in this time window. If requests are slow but no alert appears, check that the SLO endpoint/method matches the recorded routes in the Latency tab.
          </div>
        )}
      </section>

      {resolvedAlerts.length ? (
        <section className="space-y-4">
          <h3 className="text-base font-semibold text-slate-900">Recently resolved</h3>
          {resolvedAlerts.map((alert) => (
            <div key={alert.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-slate-900">{alert.message}</p>
                  <p className="mt-1 text-sm text-slate-600">{alert.methodLabel || alert.method} · {alert.endpointLabel || alert.endpoint}</p>
                </div>
                <SloStatusBadge status={alert.status} />
              </div>
              <p className="mt-3 text-xs text-slate-500">Resolved {formatTime(alert.resolvedAt)}</p>
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}
