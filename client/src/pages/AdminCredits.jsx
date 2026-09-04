import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, getErrorMessage } from '../services/api.js';

function MetricCard({ label, value, tone = 'slate' }) {
  const tones = {
    slate: 'text-slate-900',
    emerald: 'text-emerald-700',
    amber: 'text-amber-700',
    red: 'text-red-700'
  };
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${tones[tone] || tones.slate}`}>{value}</p>
    </div>
  );
}

export default function AdminCredits() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const { data: overview } = await api.get('/admin/credits/overview');
      setData(overview);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return <div className="text-sm text-slate-500">Loading credit analytics...</div>;
  }

  if (error) {
    return <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>;
  }

  const { totals, toolUsage, recentTransactions } = data;

  return (
    <section className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Credit & Usage Monitoring</h2>
          <p className="text-sm text-slate-500">System-wide credit analytics and MCP tool usage.</p>
        </div>
        <Link to="/admin/credits/users" className="text-sm text-slate-600 hover:text-slate-900">
          View all users →
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total Users" value={totals.users} />
        <MetricCard label="Credits Issued" value={totals.creditsIssued} tone="emerald" />
        <MetricCard label="Used This Month" value={totals.creditsUsedThisMonth} />
        <MetricCard label="Active Subscriptions" value={totals.activeSubscriptions} tone="emerald" />
        <MetricCard label="Low Credit Users" value={totals.lowCreditUsers} tone="amber" />
        <MetricCard label="Zero Credit Users" value={totals.zeroCreditUsers} tone="red" />
        <MetricCard label="Expired Subscriptions" value={totals.expiredSubscriptions} />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-base font-semibold text-slate-900">Most-Used MCP Tools (30 days)</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="pb-2 pr-4">Tool</th>
                <th className="pb-2 pr-4 text-right">Calls</th>
                <th className="pb-2 pr-4 text-right">Credits Used</th>
                <th className="pb-2 text-right">Admin Bypasses</th>
              </tr>
            </thead>
            <tbody>
              {(toolUsage?.byTool || []).slice(0, 10).map((row) => (
                <tr key={row._id} className="border-t border-slate-100">
                  <td className="py-2 pr-4 font-medium text-slate-900">{row._id || 'unknown'}</td>
                  <td className="py-2 pr-4 text-right text-slate-600">{row.count}</td>
                  <td className="py-2 pr-4 text-right text-slate-600">{row.creditsUsed}</td>
                  <td className="py-2 text-right text-slate-600">{row.adminBypasses}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-base font-semibold text-slate-900">Recent Transactions</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="pb-2 pr-4">User</th>
                <th className="pb-2 pr-4">Type</th>
                <th className="pb-2 pr-4">Tool</th>
                <th className="pb-2 pr-4 text-right">Amount</th>
                <th className="pb-2">Time</th>
              </tr>
            </thead>
            <tbody>
              {(recentTransactions || []).map((tx) => (
                <tr key={tx.id} className="border-t border-slate-100">
                  <td className="py-2 pr-4">
                    <div className="font-medium text-slate-900">{tx.user?.name || '—'}</div>
                    <div className="text-xs text-slate-500">{tx.user?.email}</div>
                  </td>
                  <td className="py-2 pr-4 text-slate-600">{tx.type}</td>
                  <td className="py-2 pr-4 text-slate-600">{tx.tool || '—'}</td>
                  <td className="py-2 pr-4 text-right font-medium">
                    {tx.type === 'deduction' ? `-${tx.amount}` : tx.type === 'admin_bypass' ? '0' : `+${tx.amount}`}
                  </td>
                  <td className="py-2 text-slate-500">{new Date(tx.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
