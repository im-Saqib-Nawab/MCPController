import crypto from 'node:crypto';
import os from 'node:os';

import { config } from '../config/env.js';
import { AppError } from '../middleware/error.middleware.js';
import { BackgroundJob } from '../models/BackgroundJob.js';
import {
  getFeatureFlag,
  serializeFlag,
  updateFeatureFlag
} from './featureFlag.service.js';
import { setActiveLoadTestStatus } from './load-test-state.service.js';
import { MEDICINE_FEATURE_KEY } from '../lib/medicines.js';
import * as observabilityService from './observability.service.js';

let loadTestHarnessPromise = null;

async function getLoadTestHarness() {
  if (!loadTestHarnessPromise) {
    loadTestHarnessPromise = Promise.all([
      import('../../load-tests/lib/report.js'),
      import('../../load-tests/lib/metrics.js'),
      import('../../load-tests/lib/runner.js'),
      import('../../load-tests/lib/featureFlagTracker.js'),
      import('../../load-tests/lib/observability-verify.js')
    ]).then(([report, metrics, runner, featureFlagTracker, observabilityVerify]) => ({
      evaluateHealth: report.evaluateHealth,
      MetricsCollector: metrics.MetricsCollector,
      runManagedPlan: runner.runManagedPlan,
      runSpikePlan: runner.runSpikePlan,
      createFeatureFlagTracker: featureFlagTracker.createFeatureFlagTracker,
      buildExpectedFlagSummary: featureFlagTracker.buildExpectedFlagSummary,
      verifyObservability: observabilityVerify.verifyObservability
    }));
  }

  return loadTestHarnessPromise;
}

function normalizeRoleDistribution(input = {}) {
  const admin = Math.max(0, Number(input.admin) || 0);
  const doctor = Math.max(0, Number(input.doctor) || 0);
  const patient = Math.max(0, Number(input.patient) || 0);
  const total = admin + doctor + patient;

  if (total <= 0) {
    return { admin: 10, doctor: 50, patient: 40 };
  }

  return {
    admin: Math.round((admin / total) * 100),
    doctor: Math.round((doctor / total) * 100),
    patient: Math.max(
      0,
      100 - Math.round((admin / total) * 100) - Math.round((doctor / total) * 100)
    )
  };
}

const JOB_TYPE = 'load-test';
const INSTANCE_ID = `${os.hostname()}-${process.pid}`;
const onServerless = Boolean(process.env.VERCEL);
const MAX_VU = Number(process.env.TEST_CENTER_MAX_VU) || (onServerless ? 20 : 500);
const MAX_DURATION_SEC = Number(process.env.TEST_CENTER_MAX_DURATION_SEC) || (onServerless ? 45 : 3600);
const HISTORY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const SCENARIOS = {
  normal: {
    id: 'normal',
    label: 'Normal traffic',
    description: 'Steady mixed admin/doctor/patient workflows.',
    defaults: { vu: 20, durationSec: 60, rampUpSec: 10, targetRps: 0, includeFailures: false }
  },
  heavy: {
    id: 'heavy',
    label: 'Heavy traffic',
    description: 'Higher virtual-user count for sustained load.',
    defaults: { vu: 100, durationSec: 120, rampUpSec: 30, targetRps: 0, includeFailures: false }
  },
  spike: {
    id: 'spike',
    label: 'Spike traffic',
    description: 'Baseline, sudden spike, then recovery.',
    defaults: {
      baselineVu: 10,
      spikeVu: 100,
      baselineSec: 20,
      spikeSec: 15,
      recoverySec: 20,
      includeFailures: false
    }
  },
  errors: {
    id: 'errors',
    label: 'Error testing',
    description: 'Includes intentional 400/401/403/404/auth failures.',
    defaults: { vu: 10, durationSec: 60, rampUpSec: 5, targetRps: 0, includeFailures: true }
  },
  'feature-flags': {
    id: 'feature-flags',
    label: 'Feature-flag testing',
    description: 'Applies a flag configuration and compares expected vs actual access.',
    defaults: {
      vu: 15,
      durationSec: 90,
      rampUpSec: 10,
      targetRps: 0,
      includeFailures: false,
      featureFlag: {
        enabled: true,
        doctorAccess: 'percentage',
        percentage: 50,
        patientsEnabled: true
      }
    }
  }
};

let activeRun = null;

async function hasActiveJobInDatabase() {
  const job = await BackgroundJob.findOne({
    type: JOB_TYPE,
    status: { $in: ['running', 'starting', 'stopping'] }
  })
    .select('_id')
    .lean();
  return Boolean(job);
}

function createRunId() {
  return crypto.randomUUID();
}

function getBaseUrl() {
  return (process.env.LOAD_TEST_URL || config.apiUrl || `http://127.0.0.1:${config.port}`).replace(/\/$/, '');
}

function clampConfig(input = {}) {
  const scenario = SCENARIOS[input.scenario] ? input.scenario : 'normal';
  const defaults = SCENARIOS[scenario].defaults;
  const merged = { ...defaults, ...input, scenario };

  merged.vu = Math.min(Math.max(Number(merged.vu) || defaults.vu || 10, 1), MAX_VU);
  merged.durationSec = Math.min(Math.max(Number(merged.durationSec) || defaults.durationSec || 60, 5), MAX_DURATION_SEC);
  merged.rampUpSec = Math.min(Math.max(Number(merged.rampUpSec) || defaults.rampUpSec || 10, 0), merged.durationSec);
  merged.targetRps = Math.max(Number(merged.targetRps) || 0, 0);
  merged.roleDistribution = normalizeRoleDistribution(merged.roleDistribution || { admin: 10, doctor: 50, patient: 40 });
  merged.includeFailures = Boolean(merged.includeFailures);

  if (scenario === 'spike') {
    merged.baselineVu = Math.min(Math.max(Number(merged.baselineVu) || 10, 1), MAX_VU);
    merged.spikeVu = Math.min(Math.max(Number(merged.spikeVu) || 100, 1), MAX_VU);
    merged.baselineSec = Math.min(Math.max(Number(merged.baselineSec) || 20, 5), MAX_DURATION_SEC);
    merged.spikeSec = Math.min(Math.max(Number(merged.spikeSec) || 15, 5), MAX_DURATION_SEC);
    merged.recoverySec = Math.min(Math.max(Number(merged.recoverySec) || 20, 5), MAX_DURATION_SEC);
  }

  return merged;
}

function computeVerdict({ summary, observability, featureFlags, includeFailures }, evaluateHealth) {
  const health = evaluateHealth(summary);
  const issues = [...health.issues];

  if (observability?.failed > 0) {
    issues.push(`${observability.failed} observability checks failed`);
  }

  if (featureFlags && featureFlags.mismatched > 0) {
    issues.push(`${featureFlags.mismatched} feature-flag mismatches`);
  }

  if (includeFailures && summary.totals.errorRate > 40) {
    issues.push('Unexpectedly high error rate for error-testing scenario');
  }

  let status = 'PASS';
  if (issues.length) {
    status = health.healthy && !featureFlags?.mismatched ? 'WARN' : 'FAIL';
    if (!health.healthy || featureFlags?.mismatched > 0 || observability?.failed > 0) {
      status = 'FAIL';
    }
  }

  return { status, issues, healthy: health.healthy };
}

async function syncJobProgress(run, extra = {}) {
  if (!run.jobId) return;

  await BackgroundJob.findByIdAndUpdate(run.jobId, {
    status: run.status,
    phase: run.phase || null,
    progress: {
      live: run.metrics.snapshot(),
      timeSeries: run.metrics.getTimeSeries(),
      recentRequests: run.metrics.getRecentRequests(80),
      featureFlags: run.featureFlagTracker?.summarize() || null,
      expectedFlag: run.expectedFlag || null,
      ...extra
    }
  });
}

export function getConfig() {
  return {
    enabled: config.testCenterEnabled,
    baseUrl: getBaseUrl(),
    limits: {
      maxVu: MAX_VU,
      maxDurationSec: MAX_DURATION_SEC,
      serverless: onServerless
    },
    scenarios: Object.values(SCENARIOS),
    defaultRoleDistribution: { admin: 10, doctor: 50, patient: 40 },
    personas: {
      note: 'Uses seeded demo accounts only (ahmed@clinic.example, patient.a@example.com, admin env credentials).'
    }
  };
}

export async function getStatus() {
  const history = await listRuns();

  return {
    active: activeRun
      ? {
          id: activeRun.id,
          status: activeRun.status,
          scenario: activeRun.config.scenario,
          startedAt: activeRun.startedAt,
          startedBy: activeRun.startedBy,
          config: activeRun.config,
          live: activeRun.metrics.snapshot(),
          timeSeries: activeRun.metrics.getTimeSeries(),
          recentRequests: activeRun.metrics.getRecentRequests(80),
          featureFlags: activeRun.featureFlagTracker?.summarize() || null,
          expectedFlag: activeRun.expectedFlag || null,
          phase: activeRun.phase || null
        }
      : null,
    history
  };
}

export async function startRun(actor, rawConfig = {}) {
  if (!config.testCenterEnabled) {
    throw new AppError(
      403,
      'forbidden',
      'Testing Center load runs are disabled in this environment. Set TEST_CENTER_ENABLED=true to enable them.'
    );
  }

  const harness = await getLoadTestHarness();

  if (activeRun && activeRun.status === 'running') {
    throw new AppError(409, 'conflict', 'A test run is already in progress.');
  }

  if (await hasActiveJobInDatabase()) {
    throw new AppError(409, 'conflict', 'A test run is already in progress on another instance.');
  }

  const runConfig = clampConfig(rawConfig);
  const runId = createRunId();
  const abortController = new AbortController();
  const metrics = new harness.MetricsCollector();
  const featureFlagTracker =
    runConfig.scenario === 'feature-flags' ? harness.createFeatureFlagTracker() : null;

  const job = await BackgroundJob.create({
    runKey: runId,
    type: JOB_TYPE,
    status: 'running',
    startedBy: {
      userId: String(actor._id),
      name: actor.name,
      email: actor.email
    },
    instanceId: INSTANCE_ID,
    config: runConfig,
    phase: 'starting',
    expiresAt: new Date(Date.now() + HISTORY_TTL_MS)
  });

  activeRun = {
    id: runId,
    jobId: job._id,
    status: 'running',
    startedAt: new Date().toISOString(),
    startedBy: {
      userId: String(actor._id),
      name: actor.name,
      email: actor.email
    },
    config: runConfig,
    metrics,
    featureFlagTracker,
    expectedFlag: null,
    previousFlagState: null,
    abortController,
    phase: 'starting',
    progressTimer: null
  };

  setActiveLoadTestStatus('running');

  activeRun.progressTimer = setInterval(() => {
    void syncJobProgress(activeRun);
  }, 5000);

  setImmediate(() => {
    executeRun(activeRun).catch((err) => {
      if (activeRun?.id === runId) {
        activeRun.status = 'failed';
        activeRun.error = err.message;
        finalizeRun(activeRun);
      }
    });
  });

  return {
    id: runId,
    status: 'running',
    config: runConfig
  };
}

async function executeRun(run) {
  const harness = await getLoadTestHarness();
  const baseUrl = getBaseUrl();

  if (run.config.scenario === 'feature-flags') {
    run.phase = 'configuring-feature-flag';
    await syncJobProgress(run);
    run.previousFlagState = serializeFlag(await getFeatureFlag(MEDICINE_FEATURE_KEY));

    const flagBody = {
      enabled: run.config.featureFlag?.enabled !== false,
      doctorAccess: run.config.featureFlag?.doctorAccess || 'percentage',
      percentage: Number(run.config.featureFlag?.percentage ?? 50),
      patientsEnabled: run.config.featureFlag?.patientsEnabled !== false,
      doctorIds: run.config.featureFlag?.doctorIds || []
    };

    const updated = await updateFeatureFlag(MEDICINE_FEATURE_KEY, flagBody, { _id: run.startedBy.userId, role: 'admin' });
    run.expectedFlag = harness.buildExpectedFlagSummary(updated);
  }

  run.phase = 'running';
  await syncJobProgress(run);

  const common = {
    signal: run.abortController.signal,
    metrics: run.metrics,
    includeFailures: run.config.includeFailures,
    roleDistribution: run.config.roleDistribution,
    baseUrl,
    targetRps: run.config.targetRps,
    featureFlagTracker: run.featureFlagTracker,
    expectedFlag: run.expectedFlag,
    onProgress: () => {}
  };

  let summary;
  if (run.config.scenario === 'spike') {
    summary = await harness.runSpikePlan({
      baselineVu: run.config.baselineVu,
      spikeVu: run.config.spikeVu,
      baselineSec: run.config.baselineSec,
      spikeSec: run.config.spikeSec,
      recoverySec: run.config.recoverySec,
      ...common
    });
  } else {
    summary = await harness.runManagedPlan({
      vu: run.config.vu,
      durationSec: run.config.durationSec,
      rampUpSec: run.config.rampUpSec,
      thinkTimeMs: run.config.scenario === 'heavy' ? 100 : 250,
      ...common
    });
  }

  run.phase = 'verifying';
  await syncJobProgress(run);
  run.summary = summary;
  run.featureFlagResults = run.featureFlagTracker?.summarize() || null;

  const sinceMinutes = Math.max(5, Math.ceil(summary.window.durationSec / 60) + 2);
  run.observability = await harness
    .verifyObservability({
      sinceMinutes,
      sampleRequestIds: summary.sampleRequestIds || []
    }).catch((err) => ({
    total: 0,
    passed: 0,
    failed: 1,
    checks: [],
    failures: [{ name: 'observability', details: err.message }]
  }));

  run.serverMetrics = await observabilityService.getMetrics(
    { _id: run.startedBy.userId, role: 'admin' },
    { sinceMinutes }
  );

  if (run.previousFlagState) {
    await updateFeatureFlag(
      MEDICINE_FEATURE_KEY,
      {
        enabled: run.previousFlagState.enabled,
        doctorAccess: run.previousFlagState.doctorAccess,
        percentage: run.previousFlagState.percentage,
        patientsEnabled: run.previousFlagState.patientsEnabled,
        doctorIds: run.previousFlagState.doctorIds
      },
      { _id: run.startedBy.userId, role: 'admin' }
    ).catch(() => {});
  }

  run.verdict = computeVerdict(
    {
      summary,
      observability: run.observability,
      featureFlags: run.featureFlagResults,
      includeFailures: run.config.includeFailures
    },
    harness.evaluateHealth
  );

  run.status = run.abortController.signal.aborted ? 'stopped' : 'completed';
  run.completedAt = new Date().toISOString();
  finalizeRun(run);
}

async function finalizeRun(run) {
  if (run.progressTimer) {
    clearInterval(run.progressTimer);
    run.progressTimer = null;
  }

  const record = {
    id: run.id,
    status: run.status,
    scenario: run.config.scenario,
    startedAt: run.startedAt,
    completedAt: run.completedAt || new Date().toISOString(),
    startedBy: run.startedBy,
    config: run.config,
    summary: run.summary || run.metrics.summarize(),
    timeSeries: run.metrics.getTimeSeries(),
    recentRequests: run.metrics.getRecentRequests(100),
    featureFlags: run.featureFlagResults || run.featureFlagTracker?.summarize() || null,
    expectedFlag: run.expectedFlag || null,
    observability: run.observability || null,
    serverMetrics: run.serverMetrics || null,
    verdict: run.verdict || { status: 'FAIL', issues: [run.error || 'Run did not complete'] },
    error: run.error || null
  };

  if (run.jobId) {
    await BackgroundJob.findByIdAndUpdate(run.jobId, {
      status: run.status,
      phase: run.phase || null,
      completedAt: new Date(record.completedAt),
      result: record,
      error: run.error || '',
      expiresAt: new Date(Date.now() + HISTORY_TTL_MS)
    });
  }

  if (activeRun?.id === run.id) {
    activeRun = null;
  }

  setActiveLoadTestStatus(null);
}

export async function stopRun() {
  if (!activeRun || activeRun.status !== 'running') {
    throw new AppError(404, 'not_found', 'No active test run.');
  }

  activeRun.abortController.abort();
  activeRun.status = 'stopping';
  setActiveLoadTestStatus('stopping');
  await syncJobProgress(activeRun);
  return { id: activeRun.id, status: 'stopping' };
}

export async function getRun(runId) {
  if (activeRun?.id === runId) {
    return {
      id: activeRun.id,
      status: activeRun.status,
      scenario: activeRun.config.scenario,
      startedAt: activeRun.startedAt,
      config: activeRun.config,
      live: activeRun.metrics.snapshot(),
      timeSeries: activeRun.metrics.getTimeSeries(),
      recentRequests: activeRun.metrics.getRecentRequests(100),
      featureFlags: activeRun.featureFlagTracker?.summarize() || null,
      expectedFlag: activeRun.expectedFlag || null,
      summary: activeRun.summary || null,
      observability: activeRun.observability || null,
      serverMetrics: activeRun.serverMetrics || null,
      verdict: activeRun.verdict || null
    };
  }

  const job = await BackgroundJob.findOne({ runKey: runId, type: JOB_TYPE }).lean();
  if (!job) {
    throw new AppError(404, 'not_found', 'Test run not found.');
  }

  if (job.result) {
    return job.result;
  }

  return {
    id: String(job.runKey),
    status: job.status,
    scenario: job.config?.scenario,
    startedAt: job.startedAt,
    config: job.config,
    progress: job.progress || null,
    error: job.error || null
  };
}

export async function listRuns() {
  const jobs = await BackgroundJob.find({ type: JOB_TYPE, result: { $ne: null } })
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();

  return jobs.map((job) => job.result);
}
