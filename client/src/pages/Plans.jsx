import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, getErrorMessage } from '../services/api.js';
import Button from '../components/Button.jsx';

export default function Plans() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadPlans = useCallback(async () => {
    try {
      const { data } = await api.get('/credits/plans');
      setPlans(data.plans || []);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  async function purchase(planId) {
    setProcessing(planId);
    setError('');
    setSuccess('');
    try {
      const { data } = await api.post('/credits/checkout', {
        planId,
        returnUrl: `${window.location.origin}/purchase/success?from=web`
      });
      if (data.provider === 'dev') {
        await api.post(`/payments/dev-complete?session=${data.sessionId}`);
        setSuccess(`Purchase successful! ${data.plan.credits} credits added to your account.`);
      } else {
        window.location.href = data.checkoutUrl;
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setProcessing('');
    }
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10 text-sm text-slate-500">
        Loading plans...
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-semibold text-slate-900">Choose Your Plan</h1>
        <p className="mt-2 text-sm text-slate-500">
          Purchase credits to use MCP tools in ChatGPT and the dashboard.
        </p>
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {success}{' '}
          <Link to="/credits" className="font-medium underline">
            View your balance
          </Link>
        </div>
      ) : null}

      <div className="grid gap-6 md:grid-cols-2">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={`rounded-xl border bg-white p-6 shadow-sm ${
              plan.billingCycle === 'yearly' ? 'border-emerald-300 ring-1 ring-emerald-100' : 'border-slate-200'
            }`}
          >
            {plan.billingCycle === 'yearly' ? (
              <span className="mb-3 inline-block rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
                Best value
              </span>
            ) : null}
            <h2 className="text-xl font-semibold text-slate-900">{plan.name}</h2>
            <p className="mt-2 text-3xl font-bold text-slate-900">{plan.priceDisplay}</p>
            <p className="mt-2 text-sm text-slate-600">{plan.credits} credits</p>
            <p className="mt-1 text-xs text-slate-500">{plan.description}</p>
            <div className="mt-6">
              <Button
                className="w-full"
                disabled={Boolean(processing)}
                onClick={() => purchase(plan.id)}
              >
                {processing === plan.id ? 'Processing...' : `Choose ${plan.billingCycle === 'yearly' ? 'Yearly' : 'Monthly'}`}
              </Button>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-8 text-center text-xs text-slate-500">
        Development mode uses simulated payments. Connect a real payment provider for production.
      </p>
    </main>
  );
}
