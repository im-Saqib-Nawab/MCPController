import { config } from '../config/env.js';
import { RequestLatencySample } from '../models/RequestLatencySample.js';
import { upsertLatencyMinuteBucket } from '../models/LatencyMinuteBucket.js';
import { finalizeRequestTimings } from './request-timings.js';

function shouldSampleRequest({ statusCode, durationMs, userId, action }) {
  if (process.env.NODE_ENV === 'test') {
    return true;
  }

  if (userId || action) {
    return true;
  }

  if (Number(statusCode) >= 400) {
    return true;
  }

  if (Number(durationMs) >= config.logSlowRequestMs) {
    return true;
  }

  return Math.random() < config.latencySampleRate;
}

/**
 * Persist a lightweight latency sample for admin metrics.
 */
export async function recordLatencySample({
  requestId,
  method,
  route,
  action,
  userId,
  actorName,
  role,
  statusCode,
  durationMs,
  deploymentVersion
}) {
  if (!shouldSampleRequest({ statusCode, durationMs, userId, action })) {
    return;
  }

  const timings = finalizeRequestTimings(durationMs);
  const isError = Number(statusCode) >= 400;

  const doc = {
    requestId,
    method,
    route,
    action,
    userId,
    actorName,
    role,
    statusCode,
    durationMs: Math.round(durationMs),
    deploymentVersion,
    isError,
    ...(timings?.phases ? { phaseTimings: timings.phases } : {}),
    ...(timings?.details?.database?.length || timings?.details?.external?.length
      ? { timingDetails: timings.details }
      : {})
  };

  try {
    await RequestLatencySample.create(doc);
    await upsertLatencyMinuteBucket({
      route,
      method,
      durationMs,
      isError,
      deploymentVersion
    });
  } catch {
    // Observability must not break request handling.
  }
}
