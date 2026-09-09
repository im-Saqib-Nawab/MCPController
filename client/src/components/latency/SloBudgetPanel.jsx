function formatMs(value) {
  if (value == null) return '—';
  if (value >= 1000) return `${(value / 1000).toFixed(2)}s`;
  return `${Math.round(value)}ms`;
}

function SloStatusBadge({ status, label }) {
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
      {label || labels[status] || status}
    </span>
  );
}

function HelpCard() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-700">
      <h3 className="font-semibold text-slate-900">How SLO / Budget works</h3>
      <dl className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <dt className="font-medium text-slate-900">Endpoint</dt>
          <dd className="mt-1 leading-6">
            The API route this SLO applies to. Use <code className="rounded bg-white px-1">*</code> for all endpoints,
            or a path like <code className="rounded bg-white px-1">/api/appointments</code> to include that route and its sub-paths.
          </dd>
        </div>
        <div>
          <dt className="font-medium text-slate-900">Method</dt>
          <dd className="mt-1 leading-6">
            HTTP method to monitor. Use <code className="rounded bg-white px-1">*</code> for all methods,
            or a specific one such as <code className="rounded bg-white px-1">POST</code>.
          </dd>
        </div>
        <div>
          <dt className="font-medium text-slate-900">Window</dt>
          <dd className="mt-1 leading-6">
            How far back measured requests are included when calculating the current P95/P99 or availability value.
          </dd>
        </div>
        <div>
          <dt className="font-medium text-slate-900">Current</dt>
          <dd className="mt-1 leading-6">
            The live value from recorded request latency in the evaluation window. For latency SLOs this is usually P99.
          </dd>
        </div>
        <div>
          <dt className="font-medium text-slate-900">Budget used</dt>
          <dd className="mt-1 leading-6">
            How much of the latency budget is consumed. At 100% you are exactly at the target. Above 100% means the SLO is being violated.
          </dd>
        </div>
        <div>
          <dt className="font-medium text-slate-900">Availability</dt>
          <dd className="mt-1 leading-6">
            Percentage of successful requests in the window. A 99.9% target means at most 0.1% of requests may fail.
          </dd>
        </div>
      </dl>
    </div>
  );
}

export default function SloBudgetPanel({ slos, onAdd, onEdit, onDelete }) {
  return (
    <div className="space-y-6">
      <HelpCard />

      <div className="flex justify-end">
        <button type="button" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white" onClick={onAdd}>
          Add SLO
        </button>
      </div>

      {!slos.length ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-sm text-slate-600">
          No SLO budgets configured yet. Add one to track latency or availability against a target.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Scope</th>
                <th className="px-5 py-3">SLO target</th>
                <th className="px-5 py-3">Window</th>
                <th className="px-5 py-3">Samples</th>
                <th className="px-5 py-3">Current</th>
                <th className="px-5 py-3">Budget used</th>
                <th className="px-5 py-3">Remaining</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {slos.map((slo) => (
                <tr key={slo.id} className="border-t border-slate-100 align-top">
                  <td className="px-5 py-4">
                    <p className="font-medium text-slate-900">{slo.endpointLabel || slo.endpoint}</p>
                    <p className="mt-1 text-xs text-slate-500">{slo.methodLabel || slo.method}</p>
                  </td>
                  <td className="px-5 py-4">{slo.sloTarget}</td>
                  <td className="px-5 py-4 text-slate-600">{slo.evaluationWindowLabel || `${slo.evaluationWindowDays || 30} days`}</td>
                  <td className="px-5 py-4">{slo.sampleCount ?? 0}</td>
                  <td className="px-5 py-4">
                    {slo.sampleCount > 0 ? (
                      slo.primaryMetric === 'availability'
                        ? `${slo.currentValue}%`
                        : formatMs(slo.currentValue)
                    ) : (
                      <span className="text-slate-500">No samples</span>
                    )}
                    {slo.maxMs != null && slo.primaryMetric !== 'availability' && slo.sampleCount > 0 ? (
                      <p className="mt-1 text-xs text-slate-500">Max {formatMs(slo.maxMs)}</p>
                    ) : null}
                  </td>
                  <td className="px-5 py-4">
                    {slo.budgetUsedPct != null ? `${slo.budgetUsedPct}%` : '—'}
                    {slo.budgetDifferenceMs > 0 ? (
                      <p className="mt-1 text-xs text-rose-600">+{formatMs(slo.budgetDifferenceMs)} over budget</p>
                    ) : null}
                  </td>
                  <td className="px-5 py-4">{slo.budgetRemainingPct != null ? `${slo.budgetRemainingPct}%` : '—'}</td>
                  <td className="px-5 py-4"><SloStatusBadge status={slo.status} label={slo.statusLabel} /></td>
                  <td className="px-5 py-4 whitespace-nowrap">
                    <button type="button" className="mr-3 text-slate-700 underline" onClick={() => onEdit(slo)}>Edit</button>
                    <button type="button" className="text-rose-700 underline" onClick={() => onDelete(slo.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
