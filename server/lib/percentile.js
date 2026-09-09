/**
 * Compute percentile from an array of numbers.
 * @param {number[]} values
 * @param {number} p - 0-100
 */
export function percentile(values, p) {
  if (!values?.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

export function computeLatencyStats(durations) {
  const values = (durations || []).filter((v) => Number.isFinite(v));
  if (!values.length) {
    return {
      count: 0,
      avgMs: 0,
      p50Ms: 0,
      p95Ms: 0,
      p99Ms: 0,
      maxMs: 0
    };
  }

  const sum = values.reduce((acc, v) => acc + v, 0);
  return {
    count: values.length,
    avgMs: Math.round(sum / values.length),
    p50Ms: Math.round(percentile(values, 50)),
    p95Ms: Math.round(percentile(values, 95)),
    p99Ms: Math.round(percentile(values, 99)),
    maxMs: Math.round(Math.max(...values))
  };
}
