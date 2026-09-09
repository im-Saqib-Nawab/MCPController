import { getRequestContext } from './request-context.js';

export const TIMING_PHASES = [
  'authentication',
  'business',
  'database',
  'external',
  'response'
];

function ensureTimings(ctx) {
  if (!ctx.timings) {
    ctx.timings = {
      phases: {},
      details: {
        database: [],
        external: []
      }
    };
  }
  return ctx.timings;
}

/**
 * Record elapsed time for a request phase (milliseconds).
 */
export function recordPhaseTiming(phase, durationMs, detail = null) {
  const ctx = getRequestContext();
  if (!ctx || !Number.isFinite(durationMs)) return;

  const timings = ensureTimings(ctx);
  timings.phases[phase] = (timings.phases[phase] || 0) + Math.round(durationMs);

  if (detail?.type === 'database' && detail.label) {
    timings.details.database.push({
      label: detail.label,
      durationMs: Math.round(durationMs)
    });
  }

  if (detail?.type === 'external' && detail.label) {
    timings.details.external.push({
      label: detail.label,
      durationMs: Math.round(durationMs)
    });
  }
}

/**
 * Run fn and record its duration under the given phase.
 */
export async function timedPhase(phase, fn, detail = null) {
  const started = Date.now();
  try {
    return await fn();
  } finally {
    recordPhaseTiming(phase, Date.now() - started, detail);
  }
}

export function getRequestTimings() {
  const ctx = getRequestContext();
  return ctx?.timings || null;
}

export function finalizeRequestTimings(totalDurationMs) {
  const ctx = getRequestContext();
  if (!ctx) return null;

  const timings = ensureTimings(ctx);

  return {
    phases: { ...timings.phases },
    details: {
      database: [...timings.details.database],
      external: [...timings.details.external]
    },
    totalDurationMs: Math.round(totalDurationMs)
  };
}
