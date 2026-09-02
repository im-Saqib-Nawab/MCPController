#!/usr/bin/env node
import { config } from './config.js';
import { runLoadPlan, runSoakPlan, runSpikePlan, runStressPlan } from './lib/runner.js';
import { verifyFeatureFlags } from './lib/feature-flag-verify.js';
import { extractSampleRequestIds, verifyObservability } from './lib/observability-verify.js';
import { printLoadSummary, printVerificationResult, writeReport } from './lib/report.js';

const PLAN_HELP = `
MCPController load testing

Usage:
  node load-tests/run.js <plan> [options]

Plans:
  smoke          Quick sanity check (5 VUs, 30s)
  load           Normal load test (${config.plans.load.vu} VUs, ${config.plans.load.durationSec}s)
  levels         Run load at ${config.vuLevels.join(', ')} VUs sequentially
  stress         Ramp VUs until failure threshold
  spike          Baseline → spike → recovery
  soak           Sustained load (${config.plans.soak.durationSec}s)
  feature-flags  Verify feature-flag correctness (no load)
  observability  Verify logs/metrics/traces after traffic
  all            feature-flags → load → observability

Environment:
  LOAD_TEST=true on the server disables auth rate limiting during tests.
  LOAD_TEST_URL=http://127.0.0.1:3000  Target API base URL
  ADMIN_EMAIL / ADMIN_PASSWORD          Admin credentials
  LOG_LEVEL=info                        Recommended on server during tests

Examples:
  # Terminal 1 — start server with load-test mode
  $env:LOAD_TEST="true"; $env:LOG_LEVEL="info"; npm run server

  # Terminal 2 — seed data once, then run tests
  npm run seed
  npm run load:smoke
  npm run load:all
`;

function parseArgs(argv) {
  const args = { plan: argv[2] || 'help', vu: null, durationSec: null, includeFailures: false, verify: true };
  for (let i = 3; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--failures') args.includeFailures = true;
    if (arg === '--no-verify') args.verify = false;
    if (arg.startsWith('--vu=')) args.vu = Number(arg.split('=')[1]);
    if (arg.startsWith('--duration=')) args.durationSec = Number(arg.split('=')[1]);
  }
  return args;
}

async function runPlan(name, options = {}) {
  const startedAt = new Date().toISOString();
  let summary;

  switch (name) {
    case 'smoke':
      summary = await runLoadPlan({
        vu: 5,
        durationSec: 30,
        rampUpSec: 5,
        includeFailures: options.includeFailures
      });
      break;
    case 'load':
      summary = await runLoadPlan({
        vu: options.vu || config.plans.load.vu,
        durationSec: options.durationSec || config.plans.load.durationSec,
        rampUpSec: config.plans.load.rampUpSec,
        includeFailures: options.includeFailures
      });
      break;
    case 'levels': {
      const levelSummaries = [];
      for (const vu of config.vuLevels) {
        console.log(`\n[levels] starting vu=${vu}`);
        const levelSummary = await runLoadPlan({
          vu,
          durationSec: options.durationSec || 60,
          rampUpSec: Math.min(30, vu),
          includeFailures: options.includeFailures,
          thinkTimeMs: 200
        });
        printLoadSummary(`load vu=${vu}`, levelSummary);
        levelSummaries.push({ vu, summary: levelSummary });
      }
      writeReport('levels', { startedAt, levelSummaries });
      return levelSummaries;
    }
    case 'stress':
      summary = await runStressPlan({
        ...config.plans.stress,
        includeFailures: options.includeFailures
      });
      break;
    case 'spike':
      summary = await runSpikePlan({
        ...config.plans.spike,
        includeFailures: options.includeFailures
      });
      break;
    case 'soak':
      summary = await runSoakPlan({
        ...config.plans.soak,
        includeFailures: options.includeFailures
      });
      break;
    default:
      throw new Error(`Unknown load plan: ${name}`);
  }

  const health = printLoadSummary(name, summary);
  const payload = { startedAt, plan: name, summary, health };

  if (options.verify) {
    const obs = await verifyObservability({
      sinceMinutes: 120,
      sampleRequestIds: extractSampleRequestIds(summary)
    });
    printVerificationResult('Observability verification', obs);
    payload.observability = obs;
  }

  writeReport(name, payload);
  return summary;
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.plan === 'help' || args.plan === '--help' || args.plan === '-h') {
    console.log(PLAN_HELP);
    return;
  }

  console.log(`Target: ${config.baseUrl}`);

  if (args.plan === 'feature-flags') {
    const result = await verifyFeatureFlags();
    printVerificationResult('Feature flag verification', result);
    writeReport('feature-flags', { result });
    process.exitCode = result.failed > 0 ? 1 : 0;
    return;
  }

  if (args.plan === 'observability') {
    const result = await verifyObservability({ sinceMinutes: 120 });
    printVerificationResult('Observability verification', result);
    writeReport('observability', { result });
    process.exitCode = result.failed > 0 ? 1 : 0;
    return;
  }

  if (args.plan === 'all') {
    const flags = await verifyFeatureFlags();
    printVerificationResult('Feature flag verification', flags);
    const summary = await runPlan('load', { ...args, verify: false });
    const obs = await verifyObservability({
      sinceMinutes: 120,
      sampleRequestIds: extractSampleRequestIds(summary)
    });
    printVerificationResult('Observability verification', obs);
    writeReport('all', { flags, summary, observability: obs });
    process.exitCode = flags.failed > 0 || obs.failed > 0 ? 1 : 0;
    return;
  }

  await runPlan(args.plan, args);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
