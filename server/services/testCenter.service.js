import crypto from 'node:crypto';

import { config } from '../config/env.js';
import { AppError } from '../middleware/error.middleware.js';
import { evaluateHealth } from '../../load-tests/lib/report.js';
import { MetricsCollector } from '../../load-tests/lib/metrics.js';
import { runManagedPlan, runSpikePlan } from '../../load-tests/lib/runner.js';
import { createFeatureFlagTracker, buildExpectedFlagSummary } from '../../load-tests/lib/featureFlagTracker.js';
import { normalizeRoleDistribution } from '../../load-tests/lib/personas.js';
import { verifyObservability } from '../../load-tests/lib/observability-verify.js';
import {
  getFeatureFlag,
  serializeFlag,
  updateFeatureFlag
} from './featureFlag.service.js';
import { MEDICINE_FEATURE_KEY } from '../lib/medicines.js';
import * as observabilityService from './observability.service.js';

const onServerless = Boolean(process.env.VERCEL);
const MAX_VU = Number(process.env.TEST_CENTER_MAX_VU) || (onServerless ? 20 : 500);
const MAX_DURATION_SEC = Number(process.env.TEST_CENTER_MAX_DURATION_SEC) || (onServerless ? 45 : 3600);

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
const history = [];

/** True while the Testing Center is driving load-test logins (relaxes auth rate limits). */
export function isLoadTestRunning() {
  if (!activeRun) return false;
  return ['running', 'starting', 'stopping'].includes(activeRun.status);
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

function computeVerdict({ summary, observability, featureFlags, includeFailures }) {
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

export function getConfig() {
  return {
    enabled: true,
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

export function getStatus() {
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
    history: history.slice(0, 20)
  };
}

export async function startRun(actor, rawConfig = {}) {
  if (activeRun && activeRun.status === 'running') {
    throw new AppError(409, 'conflict', 'A test run is already in progress.');
  }

  const runConfig = clampConfig(rawConfig);
  const runId = createRunId();
  const abortController = new AbortController();
  const metrics = new MetricsCollector();
  const featureFlagTracker = runConfig.scenario === 'feature-flags' ? createFeatureFlagTracker() : null;
  let expectedFlag = null;

  activeRun = {
    id: runId,
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
    phase: 'starting'
  };

  executeRun(activeRun).catch((err) => {
    if (activeRun?.id === runId) {
      activeRun.status = 'failed';
      activeRun.error = err.message;
      finalizeRun(activeRun);
    }
  });

  return {
    id: runId,
    status: 'running',
    config: runConfig
  };
}

async function executeRun(run) {
  const baseUrl = getBaseUrl();

  if (run.config.scenario === 'feature-flags') {
    run.phase = 'configuring-feature-flag';
    run.previousFlagState = serializeFlag(await getFeatureFlag(MEDICINE_FEATURE_KEY));

    const flagBody = {
      enabled: run.config.featureFlag?.enabled !== false,
      doctorAccess: run.config.featureFlag?.doctorAccess || 'percentage',
      percentage: Number(run.config.featureFlag?.percentage ?? 50),
      patientsEnabled: run.config.featureFlag?.patientsEnabled !== false,
      doctorIds: run.config.featureFlag?.doctorIds || []
    };

    const updated = await updateFeatureFlag(MEDICINE_FEATURE_KEY, flagBody, { _id: run.startedBy.userId, role: 'admin' });
    run.expectedFlag = buildExpectedFlagSummary(updated);
  }

  run.phase = 'running';

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
    summary = await runSpikePlan({
      baselineVu: run.config.baselineVu,
      spikeVu: run.config.spikeVu,
      baselineSec: run.config.baselineSec,
      spikeSec: run.config.spikeSec,
      recoverySec: run.config.recoverySec,
      ...common
    });
  } else {
    summary = await runManagedPlan({
      vu: run.config.vu,
      durationSec: run.config.durationSec,
      rampUpSec: run.config.rampUpSec,
      thinkTimeMs: run.config.scenario === 'heavy' ? 100 : 250,
      ...common
    });
  }

  run.phase = 'verifying';
  run.summary = summary;
  run.featureFlagResults = run.featureFlagTracker?.summarize() || null;

  const sinceMinutes = Math.max(5, Math.ceil(summary.window.durationSec / 60) + 2);
  run.observability = await verifyObservability({
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

  run.verdict = computeVerdict({
    summary,
    observability: run.observability,
    featureFlags: run.featureFlagResults,
    includeFailures: run.config.includeFailures
  });

  run.status = run.abortController.signal.aborted ? 'stopped' : 'completed';
  run.completedAt = new Date().toISOString();
  finalizeRun(run);
}

function finalizeRun(run) {
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

  history.unshift(record);
  if (history.length > 20) history.pop();

  if (activeRun?.id === run.id) {
    activeRun = null;
  }
}

export function stopRun() {
  if (!activeRun || activeRun.status !== 'running') {
    throw new AppError(404, 'not_found', 'No active test run.');
  }

  activeRun.abortController.abort();
  activeRun.status = 'stopping';
  return { id: activeRun.id, status: 'stopping' };
}

export function getRun(runId) {
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

  const found = history.find((run) => run.id === runId);
  if (!found) {
    throw new AppError(404, 'not_found', 'Test run not found.');
  }
  return found;
}

export function listRuns() {
  return history;
}
