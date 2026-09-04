import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, getErrorMessage } from '../services/api.js';
import CreditBalanceCard from '../components/CreditBalanceCard.jsx';
import Button from '../components/Button.jsx';

function formatDate(value) {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function typeLabel(type) {
  const labels = {
    deduction: 'Used',
    grant: 'Added',
    initial_grant: 'Welcome credits',
    subscription_grant: 'Plan purchase',
    refund: 'Refund',
    admin_bypass: 'Admin (free)'
  };
  return labels[type] || type;
}

export default function Credits() {
  const [summary, setSummary] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [summaryRes, historyRes] = await Promise.all([
        api.get('/credits/summary'),
        api.get('/credits/history', { params: { limit: 20 } })
      ]);
      setSummary(summaryRes.data);
      setHistory(historyRes.data.transactions || []);
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
    return (
      <main className="mx-auto max-w-4xl px-4 py-10 text-sm text-slate-500">
        Loading credits...
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Credits</h1>
          <p className="mt-1 text-sm text-slate-500">Manage your MCP credit balance and usage.</p>
        </div>
        <Link to="/plans">
          <Button>Purchase Credits</Button>
        </Link>
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {summary ? (
        <CreditBalanceCard
          balance={summary.balance}
          usedThisMonth={summary.usedThisMonth}
          subscription={summary.subscription}
        />
      ) : null}

      <section className="mt-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Recent Activity</h2>
          <Link to="/credits/history" className="text-sm text-slate-600 hover:text-slate-900">
            View all history
          </Link>
        </div>

        {history.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            No credit activity yet.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Tool</th>
                  <th className="px-4 py-3 text-right">Credits</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {history.map((tx) => (
                  <tr key={tx.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 text-slate-600">{formatDate(tx.createdAt)}</td>
                    <td className="px-4 py-3 text-slate-900">{tx.description || typeLabel(tx.type)}</td>
                    <td className="px-4 py-3 text-slate-600">{tx.tool || '—'}</td>
                    <td className="px-4 py-3 text-right font-medium">
                      {tx.type === 'deduction' ? (
                        <span className="text-red-600">-{tx.amount}</span>
                      ) : tx.type === 'admin_bypass' ? (
                        <span className="text-slate-500">0</span>
                      ) : (
                        <span className="text-emerald-600">+{tx.amount}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          tx.status === 'success'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {tx.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
