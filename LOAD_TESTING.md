# Load Testing Guide

MCPController includes a **Node.js load-testing harness** and an **Admin Testing Center** UI at `/admin/testing`.

**Full Testing Center documentation (concepts, flow, diagrams, every feature):** [TESTING_CENTER.md](./TESTING_CENTER.md)

## Testing Center (recommended)

1. Log in as **admin** and open **Testing Center** in the navbar (or `/admin/testing`).
2. Choose a scenario, configure virtual users / duration / role mix, and click **Start test**.
3. Monitor live RPS, latency, logs, traces, and feature-flag results in the dashboard.
4. Review the final **PASS / WARN / FAIL** summary when the run completes.

No extra environment variables are required — access is **admin-only**, and auth rate limits are relaxed automatically while a test is running.

For local development, run the server normally (`npm run server` or `npm run dev`). Optional: `LOG_LEVEL=info` for verbose server logs during tests.

See [TESTING_CENTER.md](./TESTING_CENTER.md) for the full guide.

## CLI harness

The CLI harness remains available for automation and CI:

## Why this approach (and not k6 / Grafana / Prometheus)

After inspecting the codebase, your observability layer is:

| Layer | Implementation |
| --- | --- |
| **Logs** | Pino structured logging → stdout (dev/Vercel) |
| **Persistence** | MongoDB `SystemLog` collection (30-day TTL) |
| **Metrics** | Aggregated on demand from `SystemLog` via `/api/admin/observability/metrics` |
| **Traces** | Request correlation via `x-request-id`, grouped by `requestId` in `/api/admin/observability/traces` |
| **UI** | Admin React page at `/observability` |

There is **no Prometheus, Grafana, or OpenTelemetry** in this project — and you do not need to add them. The load harness reports client-side latency percentiles, while your admin observability API and UI show server-side audit counts, error rates, and trace timelines from the same traffic.

The harness is **Node.js + native `fetch`** because:

- Your REST API uses **JWT cookie sessions** (`mcpcontroller_session`) — easy to simulate with a cookie-aware client
- You already use Node 20+ and ESM everywhere
- Post-run verification can call your **existing admin observability endpoints**
- Feature-flag correctness reuses your rollout logic (`server/lib/rollout.js`)
- No external binary install (unlike k6/Artillery CLI)

## Prerequisites

1. **MongoDB** running locally or via Atlas (`MONGODB_URI` in `.env`)
2. **Seed data** with demo users:

```bash
npm run seed
```

3. **Server running in load-test mode** (disables auth rate limiting):

```powershell
# PowerShell
$env:LOAD_TEST="true"
$env:LOG_LEVEL="info"
npm run server
```

```bash
# bash
LOAD_TEST=true LOG_LEVEL=info npm run server
```

Keep `NODE_ENV=development` (default). Do **not** use `NODE_ENV=test` — that silences MongoDB log persistence.

## Quick start

```bash
# Terminal 1: server (see above)
# Terminal 2:
npm run load:smoke      # 5 VUs, 30 seconds
npm run load:flags      # feature-flag correctness only
npm run load:all        # flags → load → observability verification
```

## Test plans

| npm script | Plan | Purpose |
| --- | --- | --- |
| `load:smoke` | Smoke | Fast sanity check after changes |
| `load` | Load | Normal traffic — 50 VUs for 2 minutes |
| `load:levels` | Load levels | Sequential runs at 10, 50, 100, 500 VUs |
| `load:stress` | Stress | Ramp 10→500 VUs until error/latency threshold |
| `load:spike` | Spike | 10 VU baseline → 200 VU spike → recovery |
| `load:soak` | Soak | 30 VUs for 30 minutes (configurable) |
| `load:flags` | Feature flags | Percentage, specific, role, consistency checks |
| `load:observability` | Observability | Verify logs/metrics/traces without generating load |
| `load:all` | Full suite | Flags + load (with failure scenarios) + observability |

### CLI options

```bash
node load-tests/run.js load --vu=100 --duration=90
node load-tests/run.js load --failures     # include 400/401/403/404/auth failure scenarios
node load-tests/run.js load --no-verify    # skip post-run observability checks
```

Reports are saved to `load-tests/reports/*.json`.

## What traffic is simulated

Virtual users rotate across roles (~10% admin, ~50% doctor, ~40% patient) using seeded credentials from `load-tests/config.js`.

Each VU runs realistic workflows:

| Role | Operations |
| --- | --- |
| **All** | Health check, `/api/auth/me`, list doctors, list appointments, medicines (respects feature flag), feature flag via `user.features` |
| **Patient** | Book appointment, cancel appointment |
| **Doctor / Admin** | List patients |
| **Admin** | Stats, feature-flag admin API, observability metrics/logs/traces |

With `--failures`:

| Scenario | Expected status |
| --- | --- |
| Invalid appointment body | 400 |
| Unauthenticated `/api/doctors` | 401 |
| Non-admin `/api/admin/stats` | 403 |
| Missing doctor ID | 404 |
| Bad login credentials | 401 |

## Feature-flag testing

`npm run load:flags` validates your `medicine_health_tips` flag:

| Mode | What's verified |
| --- | --- |
| **100% enabled** | All doctors + patients (when `patientsEnabled`) see `canView: true` |
| **Patient toggle** | `patientsEnabled: false` blocks patients |
| **Specific doctors** | Ahmed included, Ali excluded |
| **10 / 25 / 50%** | Bucket math matches `rollout.js`; same user gets consistent results across repeated `/api/auth/me` calls |
| **Disabled** | Everyone gets `canView: false` |

After tests, the flag is restored to `enabled: true, doctorAccess: all, patientsEnabled: true`.

## Observability verification

After load tests (or via `load:observability`), the harness checks:

1. Admin metrics endpoint returns data (`audit.total`, `http.total`, `database.connected`)
2. Logs contain `requestId`, `operation`, and user/role context
3. Traces group by `requestId` with steps
4. Sample `x-request-id` values from load traffic can be followed via `/api/admin/observability/traces/:requestId`
5. Error logs are queryable with `status=error`

### Where to monitor results

#### 1. Load test terminal (client-side)

The harness prints:

- Requests per second
- Error rate
- avg / p50 / p95 / p99 latency
- Per-scenario breakdown
- Health evaluation against thresholds in `load-tests/config.js`

#### 2. Admin Observability UI

Open `http://localhost:5173/observability` (or your deployed URL) while logged in as admin.

| Tab | What to check during/after load |
| --- | --- |
| **Overview** | Audit totals increasing, error rate stable |
| **Metrics** | HTTP completed count, MCP tool calls, DB connected, avg response time |
| **Logs** | Filter by role (`doctor`, `patient`, `admin`), action, or search a `requestId` |
| **Traces** | End-to-end request timelines; failed traces highlighted |

Set the time window to **Last hour** during active tests.

#### 3. Server terminal (Pino logs)

With `LOG_LEVEL=info`, watch the server terminal for:

```
http.request.received → domain operations → http.request.completed
```

Filter by `requestId` to follow one request (see [OBSERVABILITY.md](./OBSERVABILITY.md)).

#### 4. JSON reports

`load-tests/reports/<plan>-<timestamp>.json` contains full summaries for comparison across runs.

## Healthy vs unhealthy results

### Healthy system indicators

| Metric | Healthy range (local dev) |
| --- | --- |
| Error rate | < 5% (excluding intentional `--failures` tests) |
| p95 latency | < 2000 ms |
| p99 latency | < 5000 ms |
| Observability | Metrics/logs/traces all returning data |
| Feature flags | Consistent `canView` per user across repeated calls |
| Database | `database.connected: true` in metrics |

### Problems to watch for

| Symptom | Likely cause |
| --- | --- |
| High 401 on `setup.login` | Seed not run, wrong credentials, or server not in `LOAD_TEST=true` mode |
| Rising p95 under load | MongoDB connection pool saturation, missing indexes, or local machine limits |
| Error rate spike at 500 VUs | Expected on a single local Node process — use `load:stress` to find your ceiling |
| Empty observability logs | Server running with `NODE_ENV=test`, or time window too narrow |
| Feature flag flips between requests | Bug in rollout logic (should be stable — file an issue if seen) |
| 429 on login | Forgot `LOAD_TEST=true` on the server |
| Traces missing steps | Request failed before audit log was written, or request predates the time window |

## Configuration

Edit `load-tests/config.js`:

```javascript
vuLevels: [10, 50, 100, 500],
thresholds: {
  errorRateMax: 5,      // percent
  p95LatencyMs: 2000,
  p99LatencyMs: 5000
}
```

Environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `LOAD_TEST_URL` | `API_URL` or `http://127.0.0.1:3000` | Target server |
| `LOAD_TEST=true` | — | Set on **server** to skip auth rate limit |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | from `.env` | Admin persona |

## Manual failure scenarios

Some scenarios are not automated (to avoid damaging production):

| Scenario | How to test manually |
| --- | --- |
| **500 errors** | Temporarily break a service function locally, run `load:smoke`, check `http.error` in logs |
| **DB timeout / failure** | Stop MongoDB mid-test; expect `db.connection.failed` and 500s |
| **Slow requests** | Watch p95/p99 in load report; compare with trace `durationMs` in observability UI |
| **Concurrent booking conflicts** | Run `load:levels` — patients booking same doctor/day should see 409 responses (counted as OK) |

## Files added

```text
load-tests/
├── config.js                 # URLs, personas, thresholds, plan defaults
├── run.js                    # CLI entry point
├── lib/
│   ├── http-client.js        # Cookie-aware fetch client
│   ├── metrics.js            # Latency percentiles, error rates
│   ├── personas.js           # Admin/doctor/patient VU assignment
│   ├── scenarios.js          # API workflows + failure scenarios
│   ├── runner.js             # VU engine (load/stress/spike/soak)
│   ├── feature-flag-verify.js
│   ├── observability-verify.js
│   └── report.js             # Console output + JSON reports
└── reports/                  # Generated JSON (gitignored)
```

Minimal app change: `server/routes/auth.routes.js` skips rate limiting when `LOAD_TEST=true`.

## Recommended test schedule

1. **After every significant change** — `npm run load:smoke`
2. **Before release** — `npm run load:all`
3. **Capacity planning** — `npm run load:levels` (find max VUs before p95 degrades)
4. **Regression on feature flags** — `npm run load:flags`
5. **Weekly soak** (optional) — `npm run load:soak` against staging

## Optional: k6 for higher scale

If you later need >500 VUs against a deployed environment, [k6](https://k6.io/) can complement this harness for raw HTTP throughput. You would still monitor results through this project's admin observability UI — no need for Prometheus/Grafana unless you outgrow MongoDB-based metrics aggregation.

The Node harness remains the source of truth for feature-flag and observability verification because it integrates directly with your APIs and rollout logic.
