# MCPController

MCPController is a single-deploy doctor management application with a React frontend, Express API, OAuth 2.1 authorization server, and MCP server — all served from one origin (for example `https://mcpcontroller.vercel.app`).

ChatGPT connects through OAuth with PKCE. Users log in (or register), review a consent screen, grant doctor-management permissions, and ChatGPT receives access and refresh tokens for the `/mcp` endpoint. Every MCP tool enforces the scopes granted during consent.

## Architecture

```text
ChatGPT
  → OAuth discovery (/.well-known/*)
  → GET /oauth/authorize (backend bridge)
  → /login or /authorize (React)
  → POST /api/oauth/consent
  → Authorization code + PKCE
  → POST /oauth/token
  → Bearer access token (+ refresh token)
  → POST /mcp (MCP tools)
  → Permission check → MongoDB
```

### Components

| Layer | Responsibility |
| --- | --- |
| **Frontend (`client/`)** | Login, register, OAuth consent, dashboard, permission management |
| **API (`server/routes/`, `server/controllers/`)** | REST endpoints for auth, admin, doctors, connections |
| **OAuth (`server/services/oauth.service.js`)** | Authorization code + PKCE, DCR, token exchange, revocation |
| **MCP (`server/mcp/`)** | Streamable HTTP MCP server with doctor tools |
| **Models (`server/models/`)** | User, Doctor, OAuthClient, AccessToken, Connection, AuthorizationCode |
| **Vercel entry (`api/index.js`)** | Serverless Express handler for production |

## Authentication

Two separate credential systems:

1. **Website session** — HTTP-only JWT cookie (`mcpcontroller_session`) for the React UI.
2. **MCP access token** — Bearer token used by ChatGPT on `/mcp`.

### Accounts

- **Administrator** — credentials from `ADMIN_EMAIL` / `ADMIN_PASSWORD` in environment variables. Has all scopes and can manage other users’ permissions.
- **Normal users** — register through the website. Default allowed scope: `doctor:read`. An admin can grant additional scopes from the dashboard.

Registration is disabled for the reserved admin email address.

## OAuth flow

1. ChatGPT discovers metadata from `/.well-known/oauth-authorization-server` and `/.well-known/oauth-protected-resource`.
2. ChatGPT opens `GET /oauth/authorize` with PKCE S256 parameters.
3. If no session exists, the user is redirected to `/login?returnTo=/authorize?...`.
4. If a session exists, the user goes directly to `/authorize` (React consent page).
5. The user selects permissions and clicks **Allow & Connect**.
6. The backend creates a single-use authorization code bound to PKCE, client, redirect URI, and resource.
7. ChatGPT exchanges the code at `POST /oauth/token`.
8. ChatGPT uses the access token on `/mcp`. Refresh tokens keep the connection alive without re-authorizing every time.

Revoking a connection from the dashboard (or calling `POST /oauth/revoke`) immediately invalidates stored tokens.

## Permission system

| Scope | MCP tools |
| --- | --- |
| `doctor:read` | `list_doctors`, `get_doctor` |
| `doctor:create` | `add_doctor` |
| `doctor:update` | `update_doctor` |
| `doctor:delete` | `delete_doctor` |

Permissions are enforced in three places:

1. **User account** — `allowedScopes` on the User document (admin-managed for normal users).
2. **OAuth consent** — only scopes the user is allowed to grant can be selected.
3. **MCP tools** — every tool call checks the access token scopes again.

## Doctor model

| Field | Description |
| --- | --- |
| `name` | Required |
| `specialization` | Required |
| `email` | Optional contact email |
| `phone` | Optional phone number |
| `availability` | Optional appointment / availability notes |

## Environment variables

Create a `.env` file in the project root (see `.env.example`).

| Variable | Example | Public? | Notes |
| --- | --- | --- | --- |
| `NODE_ENV` | `development` | No | `production` on Vercel |
| `PORT` | `3000` | No | Local Express port |
| `APP_URL` | `http://localhost:5173` | Yes | Frontend origin (Vite dev). On Vercel: `https://mcpcontroller.vercel.app` |
| `API_URL` | `http://localhost:3000` | Yes | API origin. On Vercel: same as `APP_URL` |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/mcpcontroller` | **Secret** | MongoDB connection string |
| `ADMIN_EMAIL` | `admin@example.com` | No | Admin login email |
| `ADMIN_PASSWORD` | `change-this-password` | **Secret** | Admin login password |
| `JWT_SECRET` | long random string | **Secret** | Session cookie signing |
| `JWT_EXPIRES_IN` | `7d` | No | Optional session lifetime |
| `AUTH_CODE_TTL_SECONDS` | `600` | No | Optional |
| `ACCESS_TOKEN_TTL_SECONDS` | `3600` | No | Optional |
| `REFRESH_TOKEN_TTL_SECONDS` | `2592000` | No | Optional (30 days) |
| `MCP_SERVER_NAME` | `MCPController` | Yes | MCP server metadata |
| `MCP_SERVER_VERSION` | `1.0.0` | Yes | MCP server metadata |

**Never expose** `MONGODB_URI`, `ADMIN_PASSWORD`, or `JWT_SECRET` to the browser.

## Local development

```bash
npm install
npm run seed    # creates admin, sample doctors, MCP Inspector client
npm run dev     # Express :3000 + Vite :5173
```

Vite proxies `/api`, `/oauth/token`, `/oauth/register`, `/mcp`, and `/.well-known` to Express.

## Testing

```bash
npm test
npm run build
```

## Vercel deployment

1. Push to GitHub and import the repo in Vercel (Framework: Other).
2. Set environment variables for Production (see table above). **`APP_URL` and `API_URL` must both be `https://mcpcontroller.vercel.app`** (or your custom domain).
3. Deploy. `vercel.json` rewrites API, OAuth, MCP, and discovery routes to the serverless function and serves the React SPA for other paths.
4. Seed MongoDB Atlas from your machine: `npm run seed` with `MONGODB_URI` pointing at Atlas.
5. Log in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

### Production URLs

- App: `https://mcpcontroller.vercel.app/`
- Health: `https://mcpcontroller.vercel.app/api/health`
- OAuth metadata: `https://mcpcontroller.vercel.app/.well-known/oauth-authorization-server`
- Protected resource: `https://mcpcontroller.vercel.app/.well-known/oauth-protected-resource`
- MCP: `https://mcpcontroller.vercel.app/mcp`

## Connecting ChatGPT

1. In ChatGPT, add an MCP server with URL: `https://mcpcontroller.vercel.app/mcp`
2. ChatGPT discovers OAuth metadata automatically.
3. Click **Connect** — you are redirected to log in (or reuse an existing session).
4. Review permissions on the consent page and click **Allow & Connect**.
5. ChatGPT receives tokens and can call doctor management tools within granted scopes.

To disconnect, open the dashboard and click **Revoke access** for the connection.

## Project structure

```text
MCPController/
├── api/index.js              # Vercel serverless entry
├── client/                   # React frontend (Vite)
├── server/
│   ├── app.js                # Express app
│   ├── config/               # env, database
│   ├── controllers/          # route handlers
│   ├── middleware/           # auth, errors, permissions
│   ├── models/               # Mongoose schemas
│   ├── routes/               # Express routers
│   ├── services/             # business logic
│   ├── mcp/                  # MCP server + tools
│   └── seed/                 # database seed script
├── tests/
├── vercel.json
└── package.json
```

## Security notes

- OAuth tokens are SHA-256 hashed before storage.
- PKCE S256 is required for authorization code flow.
- Redirect URIs are validated exactly against registered client metadata (including CIMD clients like ChatGPT).
- MCP resource indicator (`resource` parameter) must match `/mcp`.
- Revocation from the dashboard marks all matching access tokens as revoked immediately.
- Admin credentials live only in environment variables — not in the client bundle.
