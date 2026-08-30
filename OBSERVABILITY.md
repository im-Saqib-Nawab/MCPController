# Observability Guide

MCPController uses a centralized **Pino** logging layer with request correlation IDs. Logs are structured JSON in production and colorized pretty output in local development.

## What was added

| File | Purpose |
| --- | --- |
| `server/lib/logger.js` | Pino logger, redaction rules, error serialization |
| `server/lib/request-context.js` | Correlation ID storage (`AsyncLocalStorage`), `logOperation()`, `logError()` |
| `server/middleware/request-log.middleware.js` | Assigns `x-request-id`, logs every HTTP request start/finish |
| `server/middleware/error.middleware.js` | Central error logging with stack traces + safe client responses |
| Instrumentation in OAuth, MCP, auth, permissions, DB, and token services | Domain-specific operation logs |

## Environment variables

| Variable | Default | Description |
| --- | --- | --- |
| `LOG_LEVEL` | `debug` (dev), `info` (production) | Minimum log level: `debug`, `info`, `warn`, `error` |
| `NODE_ENV` | `development` | `test` silences logs during automated tests |

## Database log storage

Important logs are also persisted in MongoDB (`SystemLog` collection) for later review:

- Retention: **30 days** (TTL index)
- Written automatically from `logOperation()` and `logError()`
- Sensitive fields are never stored (tokens, passwords, etc.)

### Query logs from ChatGPT

Grant the **`logs:read`** scope during OAuth (included automatically for admins when all permissions are approved).

| MCP tool | Purpose |
| --- | --- |
| `search_logs` | Filter by `requestId`, `operation`, `level`, `tool`, `sinceMinutes`, `limit` |
| `get_request_logs` | Return the full trace for one `requestId` |

Example ChatGPT prompts:

- "Search system logs for `mcp.tool.failed` in the last 60 minutes"
- "Get all logs for requestId `abc-123-def`"

Admins can search all logs. Other users only see logs tied to their own `userId`.

## Log structure

Every log line includes:

- `time` — ISO timestamp
- `level` — `debug`, `info`, `warn`, `error`
- `requestId` — correlation ID (when inside an HTTP request)
- `operation` — semantic event name (e.g. `oauth.token.exchange.completed`)
- Context fields — `method`, `route`, `statusCode`, `durationMs`, `userId`, `clientId`, `tool`, etc.
- `err` — `{ name, message, code, status, stack }` on errors

### Operation names by flow

| Step | Operation |
| --- | --- |
| HTTP request received | `http.request.received` |
| HTTP request finished | `http.request.completed` |
| Discovery metadata | `oauth.discovery.authorization_server`, `oauth.discovery.protected_resource` |
| OAuth authorize redirect | `oauth.authorize.redirect_login`, `oauth.authorize.redirect_consent` |
| User login/register | `auth.login.completed`, `auth.register.completed` |
| Consent granted/denied | `oauth.consent.allowed`, `oauth.consent.denied` |
| Authorization code created | `oauth.authorization_code.created` |
| Token exchange | `oauth.token.exchange.completed`, `oauth.token.authorization_code.exchanged` |
| Token refresh | `oauth.token.refresh.completed` |
| Token stored | `oauth.token.stored` |
| Token revoked | `oauth.token.revoked`, `oauth.connection.revoked` |
| MCP bearer validated | `mcp.auth.validated` |
| MCP auth rejected | `mcp.auth.rejected` |
| MCP HTTP request | `mcp.request.received` |
| MCP tool call | `mcp.tool.started`, `mcp.tool.completed`, `mcp.tool.failed` |
| Permission denied | `permission.denied` |
| Unhandled HTTP error | `http.error` |
| OAuth error response | `oauth.error` |
| MongoDB connected | `db.connected` |
| MongoDB connection failed | `db.connection.failed` |

## Security: what is never logged

The logger redacts these fields automatically:

- Passwords, client secrets
- Access tokens, refresh tokens, authorization codes
- PKCE verifiers, raw `Authorization` headers, cookies

Safe identifiers used instead: `userId`, `clientId`, `role`, `scopeCount`, `tool`, `requestId`.

## Where logs appear

### Local development

```bash
npm run dev
```

Logs print to the **terminal running Express** (port 3000). Development uses `pino-pretty` for readable, colorized output.

### Production (Vercel)

Logs go to **Vercel → Project → Logs** (Runtime Logs for the `api` serverless function). Format is JSON — one object per line.

### Tests

When `NODE_ENV=test`, logging is silenced so test output stays clean.

## Searching and filtering logs

### Local (PowerShell)

Pipe server output and filter by operation or request ID:

```powershell
npm run server 2>&1 | Select-String "oauth.token"
npm run server 2>&1 | Select-String "a1b2c3d4-e5f6"
```

### Vercel dashboard

1. Open your project → **Logs**
2. Filter by text: `operation:"mcp.tool.failed"`, `requestId:"..."`, `route:"/mcp"`
3. Filter by level: errors only during incidents

### Recommended filters

| Goal | Filter |
| --- | --- |
| All MCP tool failures | `mcp.tool.failed` or `mcp.tool.error` |
| OAuth token issues | `oauth.token` or `oauth.error` |
| Permission problems | `permission.denied` |
| 5xx errors | `"level":50` (Pino error level) or `http.error` |
| One user's actions | `userId:"..."` |

## Following one request (correlation ID)

1. Every HTTP response includes header: **`x-request-id`**
2. Error JSON bodies include **`requestId`** (REST) or **`request_id`** (OAuth errors)
3. All log lines for that request share the same `requestId`

**Example workflow:**

1. User reports a failed MCP call
2. Check browser/network tab or ChatGPT error for `requestId` (if exposed) — or find the approximate time in Vercel logs
3. Search logs: `requestId:"abc-123-def"`
4. Read the sequence from `http.request.received` → domain operations → `http.request.completed` or `http.error`

## Debugging guides

### OAuth connection problems

Search logs in this order for one `requestId`:

1. `oauth.discovery.*` — client fetched metadata?
2. `oauth.authorize.redirect_login` or `redirect_consent` — did authorize start?
3. `auth.login.completed` — did user authenticate?
4. `oauth.consent.allowed` — were scopes approved?
5. `oauth.authorization_code.created` — was code issued?
6. `oauth.token.authorization_code.exchanged` or `oauth.error` — did token exchange succeed?
7. Common failures:
   - `oauth.pkce.verification_failed` — PKCE mismatch
   - `oauth.authorization_code.expired` / `reused` / `invalid`
   - `oauth.token.refresh.invalid` — stale refresh token

### MCP connection / tool problems

1. `mcp.auth.rejected` — missing/invalid bearer token (`invalid_token`, `mcp_authentication_required`)
2. `mcp.auth.validated` — token OK; note `userId`, `clientId`, `scopeCount`
3. `mcp.request.received` — MCP HTTP handler reached
4. `mcp.tool.started` → `mcp.tool.completed` or `mcp.tool.failed`
5. `permission.denied` — token valid but scope missing for that tool

### Database / API errors

1. `db.connection.failed` — MongoDB unreachable (Atlas URI, network, IP allowlist)
2. `http.error` with `statusCode: 500` — unhandled exception; read `err.stack` in logs (not in client response in production)
3. `http.request.completed` with `statusCode: 4xx` — expected client errors (validation, auth)

## Example log output

### Successful MCP tool call (development pretty format)

```text
[2026-08-30 12:00:01] INFO: http.request.received
    requestId: "f47ac10b-58cc-4372-a567-0e02b2c3d479"
    operation: "http.request.received"
    method: "POST"
    route: "/mcp"
    routeKind: "mcp"

[2026-08-30 12:00:01] INFO: mcp.auth.validated
    requestId: "f47ac10b-58cc-4372-a567-0e02b2c3d479"
    operation: "mcp.auth.validated"
    userId: "674a1b2c3d4e5f6789012345"
    clientId: "https://chatgpt.com"
    role: "patient"
    scopeCount: 6

[2026-08-30 12:00:01] INFO: mcp.tool.started
    requestId: "f47ac10b-58cc-4372-a567-0e02b2c3d479"
    operation: "mcp.tool.started"
    tool: "list_doctors"

[2026-08-30 12:00:01] INFO: mcp.tool.completed
    requestId: "f47ac10b-58cc-4372-a567-0e02b2c3d479"
    operation: "mcp.tool.completed"
    tool: "list_doctors"
    durationMs: 42
    success: true

[2026-08-30 12:00:01] INFO: POST /mcp 200
    requestId: "f47ac10b-58cc-4372-a567-0e02b2c3d479"
    operation: "http.request.completed"
    method: "POST"
    route: "/mcp"
    statusCode: 200
    durationMs: 87
```

### Failed OAuth token exchange (production JSON)

```json
{"level":40,"time":"2026-08-30T07:00:02.123Z","requestId":"b2c3d4e5-f6a7-8901-bcde-f23456789012","operation":"oauth.pkce.verification_failed","clientId":"https://chatgpt.com","userId":"674a1b2c3d4e5f6789012345","msg":"oauth.pkce.verification_failed"}
{"level":50,"time":"2026-08-30T07:00:02.124Z","requestId":"b2c3d4e5-f6a7-8901-bcde-f23456789012","operation":"oauth.error","statusCode":400,"errorCode":"invalid_grant","err":{"name":"AppError","message":"PKCE verification failed.","code":"invalid_grant","status":400,"stack":"AppError: PKCE verification failed.\n    at exchangeToken (...)"},"msg":"PKCE verification failed."}
{"level":40,"time":"2026-08-30T07:00:02.125Z","requestId":"b2c3d4e5-f6a7-8901-bcde-f23456789012","operation":"http.request.completed","method":"POST","route":"/oauth/token","routeKind":"oauth","statusCode":400,"durationMs":55,"msg":"POST /oauth/token 400"}
```

## Request flow through logs

```text
Client request
  └─ requestLogMiddleware
       ├─ assigns requestId → x-request-id header
       ├─ logs http.request.received
       └─ AsyncLocalStorage context for downstream code
            ├─ Route handler (OAuth / API / MCP)
            │    └─ logOperation(...) at key steps
            ├─ Services (oauth, token, permission, db)
            │    └─ logOperation(...) / logError(...)
            └─ on response finish → http.request.completed
  └─ errorMiddleware (if error thrown)
       ├─ logError with full stack
       └─ JSON response with requestId (safe message in production)
```

## Commands

```bash
# Install dependencies
npm install

# Run locally and watch logs in the server terminal
npm run dev

# Run server only
npm run server

# Run tests (logs silenced)
npm test

# Increase verbosity locally
LOG_LEVEL=debug npm run server
```

On Windows PowerShell:

```powershell
$env:LOG_LEVEL="debug"; npm run server
```

## Practical tracing checklist

When something breaks:

1. **Find the time** of the failure (user report, Vercel dashboard, or browser network tab)
2. **Get `requestId`** from the error response body or `x-request-id` response header
3. **Filter logs** by that `requestId`
4. **Walk the operation sequence** top to bottom — the first `warn`/`error` operation is usually the root cause
5. **Check the step after** — e.g. if auth succeeded but tool failed, focus on `mcp.tool.*` and `permission.denied`
6. **Read `err.stack`** in server logs for 500s (never sent to clients in production)
