import { createAuthenticatedClient } from './personas.js';
import { runPersonaWorkflow } from './scenarios.js';
import { MetricsCollector } from './metrics.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function computeThinkTime({ targetRps, vu, observedRps }) {
  if (!targetRps || targetRps <= 0) return 250;
  const current = observedRps > 0 ? observedRps : targetRps;
  const ratio = current / targetRps;
  if (ratio <= 0) return 250;
  return Math.min(5000, Math.max(50, Math.round(250 * ratio)));
}

async function runVirtualUser({
  vuIndex,
  metrics,
  durationSec,
  rampUpSec,
  includeFailures,
  thinkTimeMs,
  targetRps,
  signal,
  roleDistribution,
  baseUrl,
  featureFlagTracker,
  expectedFlag
}) {
  const rampDelay = rampUpSec > 0 ? (vuIndex / Math.max(1, rampUpSec)) * 1000 : 0;
  if (rampDelay > 0) {
    await sleep(rampDelay);
  }

  let session;
  try {
    session = await createAuthenticatedClient(vuIndex, { roleDistribution, baseUrl });
  } catch (err) {
    metrics.record({
      scenario: 'setup.login',
      method: 'POST',
      path: '/api/auth/login',
      status: 0,
      durationMs: 0,
      requestId: null,
      ok: false,
      error: err.message
    });
    return;
  }

  const deadline = Date.now() + durationSec * 1000;

  while (Date.now() < deadline && !signal.aborted) {
    await runPersonaWorkflow({
      client: session.client,
      persona: session.persona,
      user: session.user,
      metrics,
      includeFailures,
      featureFlagTracker,
      expectedFlag
    });

    const pause =
      targetRps > 0
        ? computeThinkTime({ targetRps, vu: 1, observedRps: metrics.snapshot().totals.requestsPerSecond })
        : thinkTimeMs;

    if (pause > 0) {
      await sleep(pause);
    }
  }
}

export async function runManagedPlan(options = {}) {
  const {
    vu = 10,
    durationSec = 60,
    rampUpSec = 10,
    includeFailures = false,
    thinkTimeMs = 250,
    targetRps = 0,
    signal = new AbortController().signal,
    roleDistribution,
    baseUrl,
    featureFlagTracker = null,
    expectedFlag = null,
    metrics: externalMetrics = null,
    onProgress = null
  } = options;

  const metrics = externalMetrics || new MetricsCollector();
  const workers = [];

  for (let i = 0; i < vu; i += 1) {
    workers.push(
      runVirtualUser({
        vuIndex: i,
        metrics,
        durationSec,
        rampUpSec,
        includeFailures,
        thinkTimeMs,
        targetRps,
        signal,
        roleDistribution,
        baseUrl,
        featureFlagTracker,
        expectedFlag
      })
    );
  }

  const progressTimer = onProgress
    ? setInterval(() => {
        onProgress(metrics.snapshot());
      }, 2000)
    : null;

  try {
    await Promise.all(workers);
  } finally {
    if (progressTimer) clearInterval(progressTimer);
  }

  return metrics.summarize();
}

export async function runLoadPlan(options = {}) {
  return runManagedPlan(options);
}

export async function runSpikePlan({
  baselineVu = 10,
  spikeVu = 200,
  baselineSec = 30,
  spikeSec = 20,
  recoverySec = 30,
  includeFailures = false,
  signal = new AbortController().signal,
  metrics: externalMetrics = null,
  onProgress = null,
  ...rest
}) {
  const metrics = externalMetrics || new MetricsCollector();
  const phases = [
    { vu: baselineVu, durationSec: baselineSec, label: 'baseline', rampUpSec: 10 },
    { vu: spikeVu, durationSec: spikeSec, label: 'spike', rampUpSec: 2 },
    { vu: baselineVu, durationSec: recoverySec, label: 'recovery', rampUpSec: 10 }
  ];

  for (const phase of phases) {
    if (signal.aborted) break;
    await runManagedPlan({
      vu: phase.vu,
      durationSec: phase.durationSec,
      rampUpSec: phase.rampUpSec,
      includeFailures,
      signal,
      metrics,
      onProgress,
      thinkTimeMs: phase.label === 'spike' ? 50 : 200,
      ...rest
    });
  }

  return metrics.summarize();
}

export async function runStressPlan({
  vuStart = 10,
  vuMax = 500,
  stepVu = 50,
  stepDurationSec = 60,
  includeFailures = false,
  signal = new AbortController().signal,
  metrics: externalMetrics = null,
  onProgress = null,
  ...rest
}) {
  const metrics = externalMetrics || new MetricsCollector();

  for (let vu = vuStart; vu <= vuMax && !signal.aborted; vu += stepVu) {
    await runManagedPlan({
      vu,
      durationSec: stepDurationSec,
      rampUpSec: Math.min(30, stepDurationSec),
      includeFailures,
      signal,
      metrics,
      onProgress,
      thinkTimeMs: 100,
      ...rest
    });

    const live = metrics.snapshot();
    if (live.totals.errorRate > 25 || live.latency.p95Ms > 10000) {
      break;
    }
  }

  return metrics.summarize();
}

export async function runSoakPlan(options = {}) {
  return runManagedPlan({
    ...options,
    thinkTimeMs: options.thinkTimeMs ?? 1000
  });
}
