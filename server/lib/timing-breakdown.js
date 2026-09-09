import { TIMING_PHASES } from './request-timings.js';

const PHASE_LABELS = {
  authentication: 'Authentication',
  business: 'Business Logic',
  database: 'Database',
  external: 'External API',
  response: 'Response Serialization',
  uninstrumented: 'Unmeasured Handler Time'
};

const OPERATION_PHASE_MAP = [
  { prefix: 'mcp.auth.', phase: 'authentication' },
  { prefix: 'oauth.', phase: 'authentication' },
  { prefix: 'auth.', phase: 'authentication' },
  { prefix: 'db.', phase: 'database' },
  { prefix: 'deployment.proxy.', phase: 'external' },
  { prefix: 'external.', phase: 'external' },
  { prefix: 'audit.', phase: 'business' },
  { prefix: 'mcp.tool.', phase: 'business' },
  { prefix: 'mcp.', phase: 'business' },
  { prefix: 'http.request.completed', phase: 'response' },
  { prefix: 'http.request.received', phase: 'response' }
];

function mapOperationToPhase(operation = '') {
  for (const rule of OPERATION_PHASE_MAP) {
    if (operation.startsWith(rule.prefix)) {
      return rule.phase;
    }
  }
  return null;
}

function sumPhaseValues(phases = {}) {
  return Object.values(phases).reduce((sum, value) => sum + (Number(value) || 0), 0);
}

function inferStepDurationMs(step, nextStep) {
  if (Number.isFinite(step.durationMs) && step.durationMs > 0) {
    return step.durationMs;
  }

  if (!step.time || !nextStep?.time) {
    return null;
  }

  const current = new Date(step.time).getTime();
  const next = new Date(nextStep.time).getTime();
  if (!Number.isFinite(current) || !Number.isFinite(next) || next <= current) {
    return null;
  }

  return next - current;
}

function mergeTraceSteps(traceSteps = []) {
  const phases = {};
  const details = { database: [], external: [], business: [] };
  const timeline = [];

  const sorted = [...traceSteps].sort(
    (a, b) => new Date(a.time || 0).getTime() - new Date(b.time || 0).getTime()
  );

  for (let index = 0; index < sorted.length; index += 1) {
    const step = sorted[index];
    const nextStep = sorted[index + 1];
    const operation = step.operation || '';
    const phase = mapOperationToPhase(operation);
    const durationMs = inferStepDurationMs(step, nextStep);

    timeline.push({
      operation,
      phase,
      label: step.message || step.action || operation || 'Trace step',
      durationMs,
      time: step.time,
      actorName: step.actorName,
      status: step.status,
      level: step.level
    });

    if (!phase || !durationMs) {
      continue;
    }

    phases[phase] = (phases[phase] || 0) + durationMs;

    if (phase === 'database') {
      details.database.push({ label: operation, durationMs });
    } else if (phase === 'external') {
      details.external.push({ label: operation, durationMs });
    } else if (phase === 'business') {
      details.business.push({ label: step.action || operation, durationMs });
    }
  }

  return { phases, details, timeline };
}

/**
 * Build latency breakdown from explicit phase timings and/or trace log steps.
 */
export function buildTimingBreakdown({ totalDurationMs, phaseTimings, traceSteps = [] }) {
  const phases = {};
  const details = { database: [], external: [], business: [] };
  let timeline = [];

  if (phaseTimings?.phases) {
    for (const phase of TIMING_PHASES) {
      if (phaseTimings.phases[phase]) {
        phases[phase] = phaseTimings.phases[phase];
      }
    }
    if (phaseTimings.details?.database?.length) {
      details.database = [...phaseTimings.details.database];
    }
    if (phaseTimings.details?.external?.length) {
      details.external = [...phaseTimings.details.external];
    }
  }

  const traceDerived = mergeTraceSteps(traceSteps);
  timeline = traceDerived.timeline;

  for (const [phase, durationMs] of Object.entries(traceDerived.phases)) {
    if (!phases[phase]) {
      phases[phase] = durationMs;
    }
  }

  for (const key of ['database', 'external', 'business']) {
    if (!details[key].length && traceDerived.details[key]?.length) {
      details[key] = traceDerived.details[key];
    }
  }

  const total = totalDurationMs || sumPhaseValues(phases) || 0;
  const measuredTotal = sumPhaseValues(phases);
  const uninstrumentedMs = Math.max(0, total - measuredTotal);

  if (uninstrumentedMs > 0) {
    phases.uninstrumented = uninstrumentedMs;
  }

  const orderedPhases = [...TIMING_PHASES, 'uninstrumented'];
  const rows = orderedPhases
    .map((phase) => ({
      phase,
      label: PHASE_LABELS[phase] || phase,
      durationMs: phases[phase] ?? null,
      instrumented: phases[phase] != null && phase !== 'uninstrumented',
      sharePct:
        phases[phase] != null && total > 0
          ? Number(((phases[phase] / total) * 100).toFixed(1))
          : null
    }))
    .filter((row) => row.durationMs != null);

  const instrumentedRows = rows.filter((row) => row.instrumented);
  const bottleneck = instrumentedRows.length
    ? instrumentedRows.reduce((max, row) => (row.durationMs > max.durationMs ? row : max))
    : rows.length
      ? rows.reduce((max, row) => (row.durationMs > max.durationMs ? row : max))
      : null;

  return {
    totalMs: total,
    rows,
    bottleneck: bottleneck
      ? { phase: bottleneck.phase, label: bottleneck.label, durationMs: bottleneck.durationMs }
      : null,
    details,
    timeline,
    hasExplicitTimings: Boolean(phaseTimings?.phases && Object.keys(phaseTimings.phases).length),
    uninstrumentedMs
  };
}
