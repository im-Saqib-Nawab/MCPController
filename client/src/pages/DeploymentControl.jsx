import { useCallback, useEffect, useMemo, useState } from 'react';
import Button from '../components/Button.jsx';
import { api, getErrorMessage } from '../services/api.js';

const PERCENTAGE_PRESETS = [0, 10, 25, 50, 75, 100];

function ConfirmDialog({ open, title, message, confirmLabel, onConfirm, onCancel, busy }) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        <p className="mt-2 text-sm text-slate-600">{message}</p>
        <div className="mt-5 flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" onClick={onConfirm} disabled={busy}>
            {busy ? 'Working…' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ label, tone = 'slate' }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700',
    green: 'bg-emerald-100 text-emerald-800',
    amber: 'bg-amber-100 text-amber-900',
    blue: 'bg-blue-100 text-blue-800'
  };

  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${tones[tone] || tones.slate}`}>
      {label}
    </span>
  );
}

export default function DeploymentControl({ user }) {
  const [overview, setOverview] = useState(null);
  const [audits, setAudits] = useState([]);
  const [canaryUrl, setCanaryUrl] = useState('');
  const [canaryVersion, setCanaryVersion] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState('');
  const [confirm, setConfirm] = useState(null);

  const canManage = Boolean(user?.isSuperAdmin && overview?.permissions?.canManage);

  const traffic = useMemo(() => {
    const pct = overview?.rollout?.rolloutEnabled ? overview.rollout.canaryPercentage : 0;
    return {
      production: 100 - pct,
      canary: pct
    };
  }, [overview]);

  const load = useCallback(async () => {
    setError('');
    try {
      const [overviewRes, auditsRes] = await Promise.all([
        api.get('/admin/deployment/overview'),
        api.get('/admin/deployment/audits', { params: { limit: 20 } })
      ]);
      setOverview(overviewRes.data);
      setCanaryUrl(overviewRes.data.rollout?.canaryDeploymentUrl || '');
      setCanaryVersion(overviewRes.data.rollout?.canaryVersion || '');
      setAudits(auditsRes.data.audits || []);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function runAction(actionKey, fn) {
    setBusyAction(actionKey);
    setError('');
    setSuccess('');
    try {
      await fn();
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusyAction('');
      setConfirm(null);
    }
  }

  function askConfirm(options) {
    setConfirm(options);
  }

  if (loading) {
    return <p className="px-4 py-16 text-center text-sm text-slate-500">Loading deployment control…</p>;
  }

  if (!overview) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error || 'Unable to load deployment overview.'}
        </div>
      </div>
    );
  }

  const rollout = overview.rollout;
  const router = overview.router;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Deployment Control</h1>
        <p className="mt-2 text-sm text-slate-600">
          Manage canary routing on the stable public entrypoint. Users and ChatGPT continue using{' '}
          <span className="font-medium text-slate-900">{router.publicUrl}</span>.
        </p>
      </div>

      {error ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}
      {success ? (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {success}
        </div>
      ) : null}

      {!canManage ? (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          You can view deployment status, but only the primary administrator can change rollout settings.
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Production</p>
              <h2 className="mt-1 text-xl font-semibold text-slate-900">{rollout.productionVersion || router.deploymentVersion}</h2>
            </div>
            <StatusBadge label="Live" tone="green" />
          </div>
          <dl className="mt-4 space-y-2 text-sm text-slate-600">
            <div className="flex justify-between gap-3">
              <dt>Router version</dt>
              <dd className="font-medium text-slate-900">{router.deploymentVersion}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Public URL</dt>
              <dd className="font-medium text-slate-900">{router.publicUrl}</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Canary</p>
              <h2 className="mt-1 text-xl font-semibold text-slate-900">
                {rollout.canaryVersion || 'Not configured'}
              </h2>
            </div>
            <StatusBadge label={rollout.rolloutEnabled ? 'Rolling' : 'Preview'} tone={rollout.rolloutEnabled ? 'amber' : 'blue'} />
          </div>
          <dl className="mt-4 space-y-2 text-sm text-slate-600">
            <div className="flex justify-between gap-3">
              <dt>Target URL</dt>
              <dd className="max-w-[14rem] truncate font-medium text-slate-900" title={rollout.canaryDeploymentUrl || '—'}>
                {rollout.canaryDeploymentUrl || '—'}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Rollout status</dt>
              <dd className="font-medium capitalize text-slate-900">{rollout.rolloutStatus}</dd>
            </div>
          </dl>
        </section>
      </div>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold text-slate-900">Traffic</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">Production</span>
              <span className="font-semibold text-slate-900">{traffic.production}%</span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-slate-100">
              <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${traffic.production}%` }} />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">Canary</span>
              <span className="font-semibold text-slate-900">{traffic.canary}%</span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-slate-100">
              <div className="h-2 rounded-full bg-amber-500" style={{ width: `${traffic.canary}%` }} />
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {PERCENTAGE_PRESETS.map((pct) => (
            <Button
              key={pct}
              type="button"
              variant={rollout.canaryPercentage === pct && (pct === 0 || rollout.rolloutEnabled) ? 'primary' : 'secondary'}
              disabled={!canManage || busyAction !== ''}
              onClick={() => {
                if (pct === 100) {
                  askConfirm({
                    title: 'Send 100% traffic to canary?',
                    message: 'Every sticky assignment will route to the preview deployment. Roll back immediately if anything breaks.',
                    confirmLabel: 'Set 100%',
                    action: () => runAction(`pct-${pct}`, async () => {
                      await api.patch('/admin/deployment/percentage', { percentage: pct });
                      setSuccess(`Canary traffic set to ${pct}%.`);
                    })
                  });
                  return;
                }

                runAction(`pct-${pct}`, async () => {
                  await api.patch('/admin/deployment/percentage', { percentage: pct });
                  setSuccess(`Canary traffic set to ${pct}%.`);
                });
              }}
            >
              {pct}%
            </Button>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <Button
            type="button"
            variant="secondary"
            disabled={!canManage || busyAction !== ''}
            onClick={() =>
              askConfirm({
                title: 'Rollback to production?',
                message: 'Traffic goes to 0% canary immediately and sticky assignments reset via a new assignment epoch.',
                confirmLabel: 'Rollback',
                action: () => runAction('rollback', async () => {
                  await api.post('/admin/deployment/rollback');
                  setSuccess('Rollback completed. All traffic is on production.');
                })
              })
            }
          >
            Rollback
          </Button>
          <Button
            type="button"
            disabled={!canManage || busyAction !== '' || !rollout.canaryVersion}
            onClick={() =>
              askConfirm({
                title: 'Promote canary to production?',
                message: 'This records the canary version as production, clears the canary target, and resets rollout traffic to 0%.',
                confirmLabel: 'Promote Canary',
                action: () => runAction('promote', async () => {
                  await api.post('/admin/deployment/promote');
                  setSuccess('Canary promoted to production.');
                })
              })
            }
          >
            Promote Canary
          </Button>
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold text-slate-900">Canary Target</h2>
        <p className="mt-1 text-sm text-slate-500">
          Set the internal Vercel Preview URL for your canary branch. It is never shown to end users as the public MCP URL.
        </p>
        <form
          className="mt-4 grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            askConfirm({
              title: 'Update canary deployment target?',
              message: 'Only trusted preview origins are accepted. Existing sticky assignments remain until rollback or promotion.',
              confirmLabel: 'Save Target',
              action: () => runAction('target', async () => {
                await api.patch('/admin/deployment/canary-target', {
                  canaryDeploymentUrl: canaryUrl,
                  canaryVersion: canaryVersion || undefined
                });
                setSuccess('Canary deployment target updated.');
              })
            });
          }}
        >
          <label className="block text-sm">
            <span className="font-medium text-slate-900">Preview deployment URL</span>
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={canaryUrl}
              onChange={(event) => setCanaryUrl(event.target.value)}
              placeholder="https://mcpcontroller-git-canary-yourteam.vercel.app"
              disabled={!canManage || busyAction !== ''}
              required
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-900">Canary version label</span>
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={canaryVersion}
              onChange={(event) => setCanaryVersion(event.target.value)}
              placeholder="v2 or git commit"
              disabled={!canManage || busyAction !== ''}
            />
          </label>
          <div>
            <Button type="submit" disabled={!canManage || busyAction !== ''}>
              Save Canary Target
            </Button>
          </div>
        </form>
      </section>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold text-slate-900">Rollout Metadata</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">Last changed by</dt>
            <dd className="font-medium text-slate-900">{rollout.updatedByEmail || '—'}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Last changed at</dt>
            <dd className="font-medium text-slate-900">
              {rollout.updatedAt ? new Date(rollout.updatedAt).toLocaleString() : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Assignment epoch</dt>
            <dd className="font-medium text-slate-900">{rollout.assignmentEpoch}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Expected bucket split</dt>
            <dd className="font-medium text-slate-900">
              {overview.assignmentPreview?.bucketProductionCount}% production /{' '}
              {overview.assignmentPreview?.bucketCanaryCount}% canary buckets
            </dd>
          </div>
        </dl>
      </section>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold text-slate-900">Recent Audit Events</h2>
        {audits.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No deployment changes recorded yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {audits.map((entry) => (
              <li key={entry.id} className="rounded-lg border border-slate-100 px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-slate-900">{entry.action}</span>
                  <span className="text-slate-500">{new Date(entry.createdAt).toLocaleString()}</span>
                </div>
                <p className="mt-1 text-slate-600">
                  {entry.adminEmail || 'Unknown admin'} · {entry.role || 'admin'}
                  {entry.requestId ? ` · ${entry.requestId}` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.title}
        message={confirm?.message}
        confirmLabel={confirm?.confirmLabel}
        busy={busyAction !== ''}
        onCancel={() => setConfirm(null)}
        onConfirm={() => confirm?.action?.()}
      />
    </div>
  );
}
