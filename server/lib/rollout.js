import crypto from 'node:crypto';

/**
 * Stable 0–99 bucket for a doctor + feature key.
 * The same doctor always lands in the same bucket so percentage
 * rollouts do not flip users on and off between requests.
 */
export function doctorRolloutBucket(featureKey, doctorId) {
  const hash = crypto.createHash('sha256').update(`${featureKey}:${String(doctorId)}`).digest();
  return hash.readUInt32BE(0) % 100;
}

export function isDoctorInPercentage(featureKey, doctorId, percentage) {
  const pct = Number(percentage);
  if (!Number.isFinite(pct) || pct <= 0) return false;
  if (pct >= 100) return true;
  return doctorRolloutBucket(featureKey, doctorId) < pct;
}
