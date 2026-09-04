import { Link } from 'react-router-dom';
import Button from '../components/Button.jsx';

function creditStatus(balance, lowThreshold = 10) {
  if (balance === 0) return { label: 'Credits exhausted', tone: 'text-red-700 bg-red-50 border-red-200' };
  if (balance <= lowThreshold) return { label: 'Low credits', tone: 'text-amber-800 bg-amber-50 border-amber-200' };
  return { label: 'Credits available', tone: 'text-emerald-800 bg-emerald-50 border-emerald-200' };
}

export default function CreditBalanceCard({ balance = 0, usedThisMonth = 0, subscription = null, compact = false }) {
  const status = creditStatus(balance);

  if (compact) {
    return (
      <Link
        to="/credits"
        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${status.tone}`}
      >
        <span>{balance} credits</span>
        {balance <= 10 && balance > 0 ? <span>⚠</span> : null}
      </Link>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">Credits Remaining</p>
          <p className="mt-1 text-4xl font-semibold text-slate-900">{balance}</p>
          <span className={`mt-2 inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${status.tone}`}>
            {status.label}
          </span>
        </div>
        {balance === 0 ? (
          <Link to="/plans">
            <Button>View Plans</Button>
          </Link>
        ) : balance <= 10 ? (
          <Link to="/plans">
            <Button variant="secondary">Upgrade</Button>
          </Link>
        ) : null}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg bg-slate-50 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Used This Month</p>
          <p className="mt-1 text-xl font-semibold text-slate-900">{usedThisMonth}</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Current Plan</p>
          <p className="mt-1 text-xl font-semibold text-slate-900">
            {subscription ? subscription.planName : 'None'}
          </p>
          {subscription?.endDate ? (
            <p className="mt-1 text-xs text-slate-500">
              Renews / expires: {new Date(subscription.endDate).toLocaleDateString()}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
