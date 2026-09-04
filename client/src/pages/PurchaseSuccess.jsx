import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, getErrorMessage } from '../services/api.js';
import Button from '../components/Button.jsx';

export default function PurchaseSuccess() {
  const [searchParams] = useSearchParams();
  const session = searchParams.get('session');
  const fromMcp = searchParams.get('from') === 'mcp';

  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(Boolean(session));
  const [error, setError] = useState('');

  useEffect(() => {
    if (!session) return;

    api
      .post('/credits/purchase/complete', null, { params: { session } })
      .then(({ data }) => setResult(data))
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [session]);

  if (loading) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16 text-center text-sm text-slate-500">
        Confirming your purchase...
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-16">
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        {error ? (
          <>
            <div className="text-4xl">✗</div>
            <h1 className="mt-4 text-xl font-semibold text-slate-900">Purchase Issue</h1>
            <p className="mt-2 text-sm text-red-600">{error}</p>
          </>
        ) : result ? (
          <>
            <div className="text-4xl">✓</div>
            <h1 className="mt-4 text-xl font-semibold text-slate-900">Purchase Successful</h1>
            {result.subscription ? (
              <p className="mt-2 text-sm text-slate-600">
                Plan: <strong>{result.subscription.planName}</strong>
              </p>
            ) : null}
            <p className="mt-2 text-sm text-slate-600">
              Credits added: <strong>{result.order?.creditsToGrant ?? '—'}</strong>
            </p>
            <p className="mt-1 text-sm text-slate-600">
              Current balance: <strong>{result.balance ?? '—'}</strong>
            </p>
            {fromMcp ? (
              <p className="mt-4 text-sm text-emerald-700">
                Return to ChatGPT and say &quot;continue&quot; to resume your previous request.
              </p>
            ) : null}
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold text-slate-900">Purchase Complete</h1>
            <p className="mt-2 text-sm text-slate-600">Your credits have been updated.</p>
          </>
        )}

        <div className="mt-6 flex flex-col gap-3">
          <Link to="/credits">
            <Button className="w-full">View Credits</Button>
          </Link>
          <Link to="/dashboard" className="text-sm text-slate-600 hover:text-slate-900">
            Go to Dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
