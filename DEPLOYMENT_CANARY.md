# Canary Deployment Guide

This document describes the production-grade canary routing system for MCPController on Vercel.

## Architecture

```
Client (browser / ChatGPT)
        │
        ▼
https://mcpcontroller.vercel.app   ← stable public URL (production router)
        │
        ▼
   Canary Router (production deployment only)
        ├── Production target (local handlers on router)
        └── Canary target (internal Vercel Preview URL)
```

### Roles

| Deployment | Vercel environment | Role | Public URL in env |
|------------|-------------------|------|-------------------|
| `main` production | `production` | Router + control plane | `https://mcpcontroller.vercel.app` |
| `canary/*` preview | `preview` | Internal canary target | **Same** stable public URL |

The preview deployment never exposes its preview hostname to users or ChatGPT. The production deployment proxies eligible requests to the preview origin internally.

## Version model

Rollout state is stored in MongoDB (`DeploymentRollout` singleton):

- `productionVersion` — label for the live production deployment
- `canaryVersion` — label for the preview/canary deployment
- `canaryDeploymentUrl` — trusted internal preview origin (HTTPS, allowlisted)
- `canaryPercentage` — 0–100
- `rolloutEnabled` — whether traffic splitting is active
- `rolloutStatus` — `idle`, `rolling`, `paused`, `promoted`
- `assignmentEpoch` — incremented on rollback/promotion to invalidate sticky cookies safely

Promotion moves `canaryVersion → productionVersion` and clears the canary target.

## Sticky assignment

Users are not randomly reassigned on every request.

1. Subject key priority:
   - authenticated session user ID
   - OAuth bearer token hash (ChatGPT / MCP clients)
   - anonymous ID cookie
2. Stable bucket: `sha256(epoch:subject) % 100`
3. Signed cookie `mcpcontroller_rollout` stores `{ assignment, epoch, subject }`
4. Rollback increments `assignmentEpoch` and sets percentage to `0%`, forcing production

## Routes handled by the router

Always served locally on production (never proxied):

- `/.well-known/*` — OAuth/MCP discovery with stable URLs
- `/api/admin/*` — all admin APIs including deployment control
- `/api/auth/login`, `/api/auth/register` — authentication bootstrap (must work even if canary is down)
- `/health*`, `/metrics`, `/api/health*`, `/api/metrics` — monitoring endpoints

Proxied to canary when sticky assignment selects canary:

- `/mcp`
- `/oauth/*`
- `/api/*` (except deployment control)
- SPA / frontend routes (via `vercel.json` rewrite to `/api`)

## MCP & OAuth compatibility

- MCP transport: **Streamable HTTP** with `responseMode: 'json'` (proxy-safe on Vercel)
- Discovery metadata always references `${API_URL}` on the stable origin
- Preview/canary deployments must set:
  - `APP_URL=https://mcpcontroller.vercel.app`
  - `API_URL=https://mcpcontroller.vercel.app`
- ChatGPT keeps using `https://mcpcontroller.vercel.app/mcp`
- OAuth tokens remain valid because issuer/resource URLs stay on the stable origin and MongoDB is shared

## Admin control

UI: `/admin/deployment`

Authorization:

- Any `admin` can view status
- Only the **primary administrator** (`ADMIN_EMAIL`) can modify rollout settings

All changes are written to `DeploymentRolloutAudit` and the existing audit log pipeline.

## Environment variables

### Production router (`main`)

```env
APP_URL=https://mcpcontroller.vercel.app
API_URL=https://mcpcontroller.vercel.app
IS_DEPLOYMENT_ROUTER=true
DEPLOYMENT_ROLE=router
CANARY_URL_ALLOWLIST=*.vercel.app
```

### Preview / canary target (`canary/*` branch)

See [`.env.preview.example`](.env.preview.example).

```env
APP_URL=https://mcpcontroller.vercel.app
API_URL=https://mcpcontroller.vercel.app
DEPLOYMENT_ROLE=canary
IS_DEPLOYMENT_ROUTER=false
```

Preview deployments automatically disable routing when `VERCEL_ENV=preview`.

### Shared (both)

```env
MONGODB_URI=...   # same Atlas cluster
JWT_SECRET=...    # same secret (session + rollout cookies)
ADMIN_EMAIL=...
ADMIN_PASSWORD=...
```

## Git / Vercel workflow

### 1. Create V2 on a canary branch

```bash
git checkout main
git pull
git checkout -b canary/my-feature
# make changes
git push -u origin canary/my-feature
```

Vercel creates a Preview deployment. Copy its HTTPS URL from the Vercel dashboard or:

```bash
npx vercel ls
```

Example preview URL:

`https://mcpcontroller-git-canary-my-feature-yourteam.vercel.app`

### 2. Configure the canary target (production admin UI)

1. Log in as the primary admin (`ADMIN_EMAIL`)
2. Open **Deployment** → `/admin/deployment`
3. Paste the preview URL and set version label (for example `v2`)
4. Save canary target

### 3. Start a 10% rollout

Click **10%** or PATCH:

```bash
curl -X PATCH https://mcpcontroller.vercel.app/api/admin/deployment/percentage \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: ..." \
  --cookie "..." \
  -d '{"percentage":10}'
```

### 4. Increase traffic

Use preset buttons: `25%`, `50%`, `75%`, `100%`.

### 5. Rollback

Click **Rollback** — immediately sets canary to `0%` and bumps assignment epoch.

### 6. Promote canary to production

After V2 is verified:

1. Merge `canary/*` into `main` (updates production code)
2. Click **Promote Canary** to record version metadata and clear preview target
3. Optionally deploy `main` and sync production version label

## Observability

Responses include:

- `x-deployment-version`
- `x-served-by` (`production`, `canary`, or `router`)
- `x-rollout-assignment`

Request logs and the Observability UI inherit these fields through the existing logging middleware.

## Testing

```bash
npm test
npm run build
```

Dedicated tests live in `tests/deployment.test.js`.

## Limitations

1. **Shared MongoDB** — preview and production use the same database by design so OAuth/MCP sessions stay compatible. Do not point experimental migrations at production data without safeguards.
2. **Static assets** — Vite-hashed assets that exist only in the canary build are proxied through the router when missing from the production filesystem.
3. **Preview cold starts** — first proxied requests may be slower while the preview function wakes up.
4. **No edge-only control plane** — rollout config is read from MongoDB inside the production serverless function (short TTL cache).

## Manual checklist

- [ ] Production env: `APP_URL` and `API_URL` set to stable domain
- [ ] Preview env: same `APP_URL` / `API_URL`, `DEPLOYMENT_ROLE=canary`
- [ ] Shared `MONGODB_URI` and `JWT_SECRET`
- [ ] Canary preview URL saved in Deployment Control UI
- [ ] ChatGPT MCP URL unchanged: `https://mcpcontroller.vercel.app/mcp`
- [ ] Rollback tested at least once before full promotion
