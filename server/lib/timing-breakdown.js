import { TIMING_PHASES } from './request-timings.js';

const PHASE_LABELS = {
  authentication: 'Authentication',
  business: 'Business Logic',
  database: 'Database',
  external: 'External API',
  response: 'Response'
};

const OPERATION_PHASE_MAP = [
  { prefix: 'mcp.auth.', phase: 'authentication' },
  { prefix: 'oauth.', phase: 'authentication' },
  { prefix: 'auth.', phase: 'authentication' },
  { prefix: 'db.', phase: 'database' },
  { prefix: 'deployment.proxy.', phase: 'external' },
  { prefix: 'external.', phase: 'external' },
  { prefix: 'audit.', phase: 'business' },
  { prefix: 'mcp.', phase: 'business' },
  { prefix: 'http.request.completed', phase: 'response' }
];

function mapOperationToPhase(operation = '') {
  for (const rule of OPERATION_PHASE_MAP) {
    if (operation.startsWith(rule.prefix)) {
      return rule.phase;
    }
  }
  return null;
}

/**
 * Build latency breakdown from explicit phase timings and/or trace log steps.
 */
export function buildTimingBreakdown({ totalDurationMs, phaseTimings, traceSteps = [] }) {
  const phases = {};
  const details = { database: [], external: [] };
  let hasExplicitTimings = false;

  if (phaseTimings?.phases) {
    hasExplicitTimings = Object.keys(phaseTimings.phases).length > 0;
    for (const phase of TIMING_PHASES) {
      if (phaseTimings.phases[phase]) {
        phases[phase] = phaseTimings.phases[phase];
      }
    }
    if (phaseTimings.details?.database?.length) {
      details.database = phaseTimings.details.database;
    }
    if (phaseTimings.details?.external?.length) {
      details.external = phaseTimings.details.external;
    }
  }

  if (!hasExplicitTimings && traceSteps.length) {
    for (const step of traceSteps) {
      const phase = mapOperationToPhase(step.operation || '');
      if (!phase || !step.durationMs) continue;
      phases[phase] = (phases[phase] || 0) + step.durationMs;

      if (phase === 'database') {
        details.database.push({
          label: step.operation,
          durationMs: step.durationMs
        });
      }
      if (phase === 'external') {
        details.external.push({
          label: step.operation,
          durationMs: step.durationMs
        });
      }
    }
  }

  const measuredTotal = Object.values(phases).reduce((sum, v) => sum + v, 0);
  const total = totalDurationMs || measuredTotal || 0;
  const uninstrumentedMs = Math.max(0, total - measuredTotal);

  const rows = TIMING_PHASES.map((phase) => ({
    phase,
    label: PHASE_LABELS[phase],
    durationMs: phases[phase] ?? null,
    instrumented: phases[phase] != null
  }));

  if (uninstrumentedMs > 0) {
    rows.push({
      phase: 'uninstrumented',
      label: 'Uninstrumented',
      durationMs: uninstrumentedMs,
      instrumented: false
    });
  }

  const instrumentedRows = rows.filter((r) => r.durationMs != null && r.phase !== 'uninstrumented');
  const bottleneck = instrumentedRows.length
    ? instrumentedRows.reduce((max, row) => (row.durationMs > max.durationMs ? row : max))
    : null;

  return {
    totalMs: total,
    rows,
    bottleneck: bottleneck
      ? { phase: bottleneck.phase, label: bottleneck.label, durationMs: bottleneck.durationMs }
      : null,
    details,
    hasExplicitTimings,
    uninstrumentedMs
  };
}
