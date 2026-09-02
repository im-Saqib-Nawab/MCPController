import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

function statusIcon(ok) {
  return ok ? 'PASS' : 'FAIL';
}

export function printVerificationResult(title, result) {
  console.log(`\n=== ${title} ===`);
  console.log(`Passed ${result.passed}/${result.total}`);
  for (const check of result.checks) {
    console.log(`  [${statusIcon(check.ok)}] ${check.name}${check.details ? ` — ${check.details}` : ''}`);
  }
  if (result.failures?.length) {
    console.log('\nFailures:');
    for (const failure of result.failures) {
      console.log(`  - ${failure.name}: ${failure.details}`);
    }
  }
}

export function evaluateHealth(summary, thresholds = config.thresholds) {
  const issues = [];

  if (summary.totals.errorRate > thresholds.errorRateMax) {
    issues.push(`Error rate ${summary.totals.errorRate}% exceeds max ${thresholds.errorRateMax}%`);
  }
  if (summary.latency.p95Ms > thresholds.p95LatencyMs) {
    issues.push(`p95 latency ${summary.latency.p95Ms}ms exceeds max ${thresholds.p95LatencyMs}ms`);
  }
  if (summary.latency.p99Ms > thresholds.p99LatencyMs) {
    issues.push(`p99 latency ${summary.latency.p99Ms}ms exceeds max ${thresholds.p99LatencyMs}ms`);
  }

  return {
    healthy: issues.length === 0,
    issues
  };
}

export function printLoadSummary(planName, summary) {
  console.log(`\n=== ${planName} results ===`);
  console.log(`Duration: ${summary.window.durationSec}s`);
  console.log(`Requests: ${summary.totals.requests} (${summary.totals.requestsPerSecond} req/s)`);
  console.log(`Successful: ${summary.totals.successful} | Failed: ${summary.totals.failed} | Error rate: ${summary.totals.errorRate}%`);
  console.log(
    `Latency ms — avg: ${summary.latency.avgMs}, p50: ${summary.latency.p50Ms}, p95: ${summary.latency.p95Ms}, p99: ${summary.latency.p99Ms}, max: ${summary.latency.maxMs}`
  );

  console.log('\nBy scenario:');
  for (const [name, stats] of Object.entries(summary.byScenario).sort((a, b) => b[1].count - a[1].count)) {
    console.log(
      `  ${name}: count=${stats.count} err=${stats.errorRate}% p95=${stats.p95LatencyMs}ms`
    );
  }

  if (summary.recentErrors.length) {
    console.log('\nRecent errors:');
    for (const err of summary.recentErrors.slice(0, 5)) {
      console.log(`  ${err.method} ${err.path} -> ${err.status} (${err.requestId || 'no requestId'})`);
    }
  }

  const health = evaluateHealth(summary);
  console.log(`\nHealth: ${health.healthy ? 'HEALTHY' : 'UNHEALTHY'}`);
  for (const issue of health.issues) {
    console.log(`  - ${issue}`);
  }

  return health;
}

export function writeReport(planName, payload) {
  const dir = path.join(config.rootDir || process.cwd(), 'load-tests', 'reports');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(dir, `${planName}-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify(payload, null, 2));
  console.log(`\nReport saved: ${file}`);
  return file;
}
