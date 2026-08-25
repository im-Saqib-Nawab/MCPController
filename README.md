# MCPController

A beginner-friendly **full-stack practice app** that shows how a remote **MCP server** is connected to **ChatGPT** using **OAuth 2.1**, user login, consent/permissions, and MongoDB-backed tools.

Frontend, backend, OAuth, and MCP all live in **one repository** and deploy as **one origin**.

---

# How to run MCPController

Do this in order: **run locally first**, confirm the two URLs, then **deploy to Vercel** with different env values.

## A. Run locally (first)

You need **Node.js 20+**, **npm**, and **MongoDB** running on your machine (or an Atlas URI).

### 1. Install

```bash
cd MCPController
npm install
```

### 2. Create `.env`

Copy the example file:

```bash
copy .env.example .env
```

(macOS/Linux: `cp .env.example .env`)

### 3. Set local URLs correctly

On your computer, Vite (the React UI) and Express (API + MCP) are **two different ports**. That is the only time `APP_URL` and `API_URL` should differ.

Put this in `.env`:

```env
NODE_ENV=development
PORT=3000

APP_URL=http://localhost:5173
API_URL=http://localhost:3000

MONGODB_URI=mongodb://127.0.0.1:27017/mcpcontroller

JWT_SECRET=replace-with-a-long-random-secret
SESSION_SECRET=replace-with-a-long-random-secret

MCP_SERVER_NAME=MCPController
MCP_SERVER_VERSION=1.0.0
```

| Variable | Local value | Why |
| --- | --- | --- |
| `APP_URL` | `http://localhost:5173` | The website you open in the browser (login, dashboard, OAuth consent). Vite serves it. |
| `API_URL` | `http://localhost:3000` | Express: REST API, `/oauth/token`, `/mcp`, `/.well-known`. MCP clients talk here. |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/mcpcontroller` | Local MongoDB database name `mcpcontroller`. |

Do **not** set both to `5173` or both to `3000` while using `npm run dev`. Consent and tokens will point at the wrong place.

What you open in the browser:

| What | Local URL |
| --- | --- |
| Home / login / dashboard | http://localhost:5173 |
| Login | http://localhost:5173/login |
| Dashboard | http://localhost:5173/dashboard |
| API health check | http://localhost:3000/api/health |
| MCP endpoint (Inspector / ChatGPT later) | http://localhost:3000/mcp |
| OAuth discovery | http://localhost:3000/.well-known/oauth-protected-resource |

### 4. Seed the demo user

```bash
npm run seed
```

Demo login (not stored in the React app):

- Email: `test@example.com`
- Password: `password123`

### 5. Start the app

```bash
npm run dev
```

That starts **both** processes:

1. Express on **3000** (`API_URL`)
2. Vite on **5173** (`APP_URL`) — it proxies `/api` to Express

Open **http://localhost:5173** → Log in → Dashboard.

To stop: `Ctrl+C` in the terminal.

Optional separate terminals:

```bash
npm run server
npm run client
```

---

## B. Deploy to Vercel (after local works)

On Vercel there is **one public HTTPS origin**. The React build and Express API are the same site. `APP_URL` and `API_URL` must be **identical**.

### 1. Put the project on GitHub

Create a GitHub repo and push this folder. Do **not** commit `.env` (it is gitignored). Secrets go only in the Vercel dashboard.

### 2. MongoDB Atlas (required on Vercel)

Local `127.0.0.1` MongoDB is not reachable from Vercel.

1. Create a free cluster at [MongoDB Atlas](https://www.mongodb.com/atlas).
2. Create a database user and password.
3. Network Access → allow `0.0.0.0/0` (or Vercel’s IPs) so the function can connect.
4. Copy the connection string, replace `<password>`, and add a database name, for example:

```text
mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/mcpcontroller?retryWrites=true&w=majority
```

Seed Atlas once from your laptop (put the Atlas URI in `.env`, run `npm run seed`, then switch `.env` back to local Mongo if you still develop locally), or register a new user on the live `/login` page.

### 3. Import the repo in Vercel

1. Open [vercel.com](https://vercel.com) → **Add New** → **Project** → import the GitHub repo.
2. Leave the root directory as the repo root (where `package.json` and `vercel.json` are).
3. Framework preset can stay Other — `vercel.json` already rewrites every path to `api/index.js` (the Express app).
4. **Do not deploy yet** until env vars are set.

### 4. Vercel environment variables

In the project: **Settings → Environment Variables**. Add these for **Production** (and Preview if you use preview URLs).

After the first deploy you will know the real host, e.g. `https://mcpcontroller-xxxx.vercel.app`. Use that host with **no trailing slash**.

If you do not know the URL yet: deploy once with placeholder URLs, copy the real domain from the Vercel dashboard, update `APP_URL` and `API_URL`, then **Redeploy**.

| Name | Value on Vercel |
| --- | --- |
| `NODE_ENV` | `production` |
| `APP_URL` | `https://YOUR-PROJECT.vercel.app` |
| `API_URL` | `https://YOUR-PROJECT.vercel.app` **(same as APP_URL)** |
| `MONGODB_URI` | Atlas `mongodb+srv://...` string |
| `JWT_SECRET` | a long random string |
| `SESSION_SECRET` | another long random string |
| `MCP_SERVER_NAME` | `MCPController` |
| `MCP_SERVER_VERSION` | `1.0.0` |

Example (replace the host with yours):

```env
NODE_ENV=production
APP_URL=https://your-project.vercel.app
API_URL=https://your-project.vercel.app
MONGODB_URI=mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/mcpcontroller?retryWrites=true&w=majority
JWT_SECRET=generate-a-long-random-secret
SESSION_SECRET=generate-another-long-random-secret
MCP_SERVER_NAME=MCPController
MCP_SERVER_VERSION=1.0.0
```

If you add a custom domain later, change **both** `APP_URL` and `API_URL` to `https://your-domain.com` and redeploy.

### 5. Deploy and check

1. Click **Deploy**.
2. Open `https://YOUR-PROJECT.vercel.app` — you should see the home page.
3. Open `https://YOUR-PROJECT.vercel.app/api/health` — should return JSON `{ "ok": true, ... }`.
4. Log in (Atlas-seeded user or register).
5. MCP URL for ChatGPT / Inspector: `https://YOUR-PROJECT.vercel.app/mcp`

| What | Production URL |
| --- | --- |
| Website | `https://YOUR-PROJECT.vercel.app` |
| Login | `https://YOUR-PROJECT.vercel.app/login` |
| Dashboard | `https://YOUR-PROJECT.vercel.app/dashboard` |
| MCP | `https://YOUR-PROJECT.vercel.app/mcp` |
| OAuth metadata | `https://YOUR-PROJECT.vercel.app/.well-known/oauth-protected-resource` |

ChatGPT **cannot** use `localhost`. Use the Vercel HTTPS URL. Enable Developer mode, add an app, MCP server URL = `https://YOUR-PROJECT.vercel.app/mcp`, auth = OAuth.

If login or OAuth consent goes to the wrong host, `APP_URL` / `API_URL` are not both the live Vercel origin. Fix env and **Redeploy**.

---

## Local vs Vercel (one picture)

```text
LOCAL (npm run dev)
  APP_URL  = http://localhost:5173     ← open this in the browser
  API_URL  = http://localhost:3000     ← MCP + API + OAuth token
  MongoDB  = local 127.0.0.1 or Atlas

VERCEL (production)
  APP_URL  = https://your-project.vercel.app
  API_URL  = https://your-project.vercel.app    ← MUST match APP_URL
  MongoDB  = Atlas only
```

```text
                 ChatGPT
                    │
                    │ MCP / OAuth
                    ▼
          ┌─────────────────────┐
          │    MCPController    │
          │                     │
          │ React + Express     │
          │                     │
          │ Auth                │
          │ OAuth               │
          │ Permissions         │
          │ MCP Server          │
          └──────────┬──────────┘
                     │
                     ▼
                 MongoDB
```

---

## 1. What is MCPController?

MCPController is a small SaaS-style control plane for MCP tools:

- Users log in on a React website.
- An MCP client (ChatGPT, MCP Inspector, Cursor) requests access.
- The user sees a **consent screen**, picks **read / write / delete**, and clicks **Allow & Connect**.
- The client receives an **access token**.
- Tool calls hit `POST /mcp`. Express checks the token and the granted scopes, then the tool reads or writes **MongoDB**.

It is a **real working application**, not a UI mock.

---

## 2. Why this project exists

MCP documentation often splits “auth server”, “resource server”, and “demo UI”. This project puts them together so you can follow one request across the whole stack:

```text
ChatGPT → OAuth → Login → Consent → Token → MCP → Permission → Tool → MongoDB
```

You should be able to reopen the repo later and still see:

- what the frontend does
- what Express does
- how login cookies differ from MCP bearer tokens
- how OAuth codes and tokens are stored
- how ChatGPT discovers this server
- how a missing `delete` scope blocks `delete_data`

---

## 3. Technology stack

**Frontend:** React, Vite, React Router, Tailwind CSS, Axios

**Backend:** Node.js, Express, MongoDB, Mongoose, JWT, bcrypt, Zod, Helmet, CORS, express-rate-limit

**MCP:** Official TypeScript SDK v2

- `@modelcontextprotocol/server` — `McpServer`, `createMcpHandler`
- `@modelcontextprotocol/node` — `toNodeHandler` for Express

**Not used (on purpose):** Redis, Kafka, Docker, Kubernetes, GraphQL, Prisma, PostgreSQL, microservices.

---

## 4. Project architecture

This is **one application**, not two deployments.

```text
Browser
   ↓
Express
   ├── React production build (same origin)
   ├── REST API (/api/auth, /api/connections)
   ├── OAuth (/oauth/authorize UI, /oauth/token, /oauth/register)
   └── MCP (/mcp) + discovery (/.well-known/...)
         ↓
      MongoDB
```

Internal layering:

```text
Frontend
   ↓
Express routes / controllers
   ↓
Services (auth, oauth, token, permission)
   ↓
Mongoose models
   ↓
MongoDB
```

The MCP SDK is the **resource server** half (verify bearer token, run tools). MCPController is also the **authorization server** (login, consent, codes, tokens). The MCP specification allows hosting both together; that is the learning goal.

---

## 5. Folder structure

```text
MCPController/
├── client/                 React (Vite) UI
├── server/                 Express + OAuth + MCP
│   ├── config/
│   ├── models/
│   ├── routes/
│   ├── controllers/
│   ├── services/
│   ├── middleware/
│   ├── mcp/
│   ├── seed/
│   ├── app.js
│   └── index.js
├── api/index.js            Vercel serverless entry (same Express app)
├── tests/
├── .env.example
├── vercel.json
├── package.json
└── README.md
```

---

## 6. Frontend explanation

The UI is a small developer console:

| Route | Page | Role |
| --- | --- | --- |
| `/` | Home | Product explanation and “Connect MCP” |
| `/login` | Login | Email/password → `POST /api/auth/login` |
| `/dashboard` | Dashboard | Current user + connected OAuth apps |
| `/oauth/authorize` | Consent | Client name and scopes from the OAuth request |
| `/oauth/success` | Success | Local redirect target for practice clients |

The consent page **never hardcodes “ChatGPT”**. It displays `clientName` from MongoDB (`OAuthClient`).

Secrets (`JWT_SECRET`, `MONGODB_URI`, token hashes) stay on the server. Axios only calls `/api` with cookies.

---

## 7. Backend explanation

`server/app.js` mounts everything:

- `/api/auth` — register, login, logout, me
- `/api/connections` — dashboard list / revoke
- `/api/oauth/request` and `/api/oauth/consent` — logged-in consent API
- `/oauth/token` and `/oauth/register` — OAuth 2.1 token + Dynamic Client Registration
- `/mcp` — Streamable HTTP MCP endpoint
- `/.well-known/oauth-authorization-server` — RFC 8414
- `/.well-known/oauth-protected-resource` — RFC 9728

`npm start` (production) also serves `client/dist` so the public URL is a single site.

---

## 8. MongoDB explanation

| Model | Purpose |
| --- | --- |
| `User` | Account. Password is bcrypt-hashed in a `pre('save')` hook. |
| `OAuthClient` | Registered apps (DCR, CIMD, or seed). Holds **allowed redirect URIs**. |
| `AuthorizationCode` | Short-lived, single-use code + PKCE challenge. |
| `AccessToken` | **SHA-256 hashes** of access and refresh tokens, plus scopes and resource. |
| `Connection` | Dashboard view of who connected which client. |
| `DataItem` | Sample documents for `get_data` / `create_data` / `update_data` / `delete_data`. |

---

## 9. Authentication explanation

There are **two different credentials**:

1. **Website session** — after login, Express sets an **HTTP-only** JWT cookie. Used by `/dashboard` and the consent page. ChatGPT never sees this cookie.
2. **MCP access token** — after OAuth, ChatGPT sends `Authorization: Bearer …` to `/mcp`.

If you mix them up, MCP calls will 401 even while you are logged into the dashboard. That is expected.

```text
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
```

---

## 10. OAuth explanation

This project implements **OAuth 2.1 authorization code + PKCE** (S256), which the current MCP authorization spec requires for HTTP transports.

### Discovery (what ChatGPT does first)

1. Client calls `/mcp` without a token.
2. Server returns **401** with  
   `WWW-Authenticate: Bearer resource_metadata="https://…/.well-known/oauth-protected-resource"`
3. Client fetches **Protected Resource Metadata** (RFC 9728) and learns the authorization server issuer.
4. Client fetches **Authorization Server Metadata** (RFC 8414).
5. Client obtains a `client_id` via:
   - **Dynamic Client Registration** `POST /oauth/register`, or
   - **Client ID Metadata Documents** (HTTPS `client_id` URL), or
   - a pre-seeded client such as `mcp-inspector`

### Authorization

```text
ChatGPT
  → GET {APP_URL}/oauth/authorize?response_type=code&client_id=…&redirect_uri=…&scope=…&state=…&code_challenge=…&code_challenge_method=S256&resource={API_URL}/mcp
  → If no login cookie: /login?next=/oauth/authorize?…
  → Consent UI (client name from OAuthClient)
  → User selects scopes → Allow & Connect
  → POST /api/oauth/consent
  → MongoDB stores a hashed authorization code (2 minutes, one use)
  → Redirect to the **registered** redirect_uri with ?code=&state=
  → POST /oauth/token (code + code_verifier + redirect_uri)
  → Access token + refresh token
```

`state` is returned unchanged so the client can stop CSRF on the redirect.

`redirect_uri` is compared **exactly** to the URIs stored on the client. An attacker cannot send the code to their own website.

`resource` (RFC 8707) must be this server’s MCP URL. The access token is stored with that audience and rejected if it does not match.

---

## 11. MCP explanation

Transport: **Streamable HTTP** on `/mcp` (POST for JSON-RPC). SSE-only `/sse` is not used; that pattern is legacy.

SDK wiring:

- `createMcpHandler` builds a **new** `McpServer` per request (stateless).
- `responseMode: 'json'` returns a JSON body instead of a long-lived SSE stream.
- That combination is what makes **one codebase** work both as `node server/index.js` and on **Vercel**.

Tools:

| Tool | Scope | Behavior |
| --- | --- | --- |
| `get_profile` | `read` | Authenticated user profile |
| `get_data` | `read` | List `DataItem` rows |
| `create_data` | `write` | Insert a row |
| `update_data` | `write` | Update a row owned by the user |
| `delete_data` | `delete` | Delete a row owned by the user |

Inputs use Zod schemas inside `registerTool`.

---

## 12. Permission / scope system

Consent checkboxes only decide what is **written on the token**. Enforcement is always on the server:

```text
Is there a valid bearer token?
        ↓
Which user and client is it?
        ↓
Which scopes were granted?
        ↓
Does this tool require one of those scopes?
        ↓
YES → Mongoose query
NO  → tool error "Permission denied"
```

Example: token has `read write` only → `delete_data` is denied even if ChatGPT asks for it.

---

## 13. Complete request flow

```text
                     CHATGPT
                        │
                 MCP / OAuth Request
                        ▼
              ┌────────────────────┐
              │   MCPController    │
              │      React         │
              │        ↓           │
              │     Express        │
              │        ↓           │
              │ Authentication     │
              │        ↓           │
              │ OAuth Authorization│
              │        ↓           │
              │   Permissions      │
              │        ↓           │
              │    MCP Server      │
              │        ↓           │
              │    MCP Tools       │
              └─────────┬──────────┘
                        ▼
                    MongoDB
```

---

## 14. Local setup

Requirements: **Node.js 20+**, **npm**, **MongoDB** (local or Atlas).

```bash
git clone <your-repo>
cd MCPController
npm install
copy .env.example .env
```

On macOS/Linux use `cp .env.example .env`.

---

## 15. Environment variables

| Variable | Meaning |
| --- | --- |
| `NODE_ENV` | `development` or `production` |
| `PORT` | Express port (default `3000`) |
| `APP_URL` | Public URL of the **React UI** (login + consent). Dev: `http://localhost:5173`. Prod: your site origin. |
| `API_URL` | Public URL of **Express** (tokens, MCP, metadata). Dev: `http://localhost:3000`. Prod: **same as `APP_URL`**. |
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | Signs the login cookie. Long random string. |
| `SESSION_SECRET` | Extra secret for future cookie signing. Keep it set. |
| `JWT_EXPIRES_IN` | Login cookie lifetime |
| `AUTH_CODE_TTL_SECONDS` | Authorization code TTL (default 120) |
| `ACCESS_TOKEN_TTL_SECONDS` | Access token TTL |
| `REFRESH_TOKEN_TTL_SECONDS` | Refresh token TTL (`offline_access` / refresh grant) |
| `MCP_SERVER_NAME` / `MCP_SERVER_VERSION` | Advertised MCP server identity |

Never put these values in React source. Never commit `.env`.

---

## 16. MongoDB setup

### Local MongoDB

Install MongoDB Community, start the service, use:

```text
MONGODB_URI=mongodb://127.0.0.1:27017/mcpcontroller
```

### MongoDB Atlas

1. Create a free cluster.
2. Create a database user.
3. Network access: allow your IP (local) or `0.0.0.0/0` (Vercel, with care).
4. Connection string:

```text
MONGODB_URI=mongodb+srv://USER:PASSWORD@cluster.mongodb.net/mcpcontroller?retryWrites=true&w=majority
```

---

## 17. Seed database

```bash
npm run seed
```

Creates:

- Demo user `test@example.com` / `password123` (password is hashed; it is **not** in the React code)
- OAuth client `mcp-inspector` with local Inspector redirect URIs
- Sample `DataItem` rows for `get_data`

---

## 18. Run frontend / backend

```bash
npm run dev
```

This starts **both**:

- Express on `http://localhost:3000` (API, OAuth token, MCP, metadata)
- Vite on `http://localhost:5173` (UI). Vite **proxies** `/api`, `/mcp`, and `/.well-known` to port 3000.

Open `http://localhost:5173`, log in with the seeded user, and open the dashboard.

You can also run them separately:

```bash
npm run server
npm run client
```

---

## 19. Production build

```bash
npm run build
npm start
```

`build` compiles React into `client/dist`. `start` runs Express, which serves that folder **and** the API/MCP routes. Set:

```text
NODE_ENV=production
APP_URL=https://your-domain
API_URL=https://your-domain
```

so metadata and cookies all point at the same origin.

---

## 20. Test MCP locally

### Automated tests

Start local MongoDB, then:

```bash
npm test
```

Tests use a separate database `mcpcontroller_test` so they do not wipe your seeded `mcpcontroller` data.

### MCP Inspector

1. `npm run dev` and `npm run seed`
2. Run Inspector (`npx @modelcontextprotocol/inspector`)
3. Transport: Streamable HTTP
4. URL: `http://localhost:3000/mcp`
5. Complete OAuth in the browser (login + consent)
6. Call `get_profile` / `get_data`

The seeded client id `mcp-inspector` is optional; Inspector can also use **Dynamic Client Registration**.

### curl (after you have a token)

```bash
curl -s http://localhost:3000/.well-known/oauth-protected-resource
curl -s -D - -o NUL http://localhost:3000/mcp
```

The second command should be **401** with `WWW-Authenticate` containing `resource_metadata`.

---

## 21. Connect to ChatGPT

ChatGPT talks to **public HTTPS** MCP servers. Localhost alone is not enough unless you use a tunnel (ngrok, Cloudflare Tunnel) or a deployed URL.

Current ChatGPT path (Developer Mode / plugins — UI labels move; follow in-product copy if it differs):

1. Deploy MCPController (or tunnel `API_URL` + `APP_URL` so they match the public origin).
2. In ChatGPT: **Settings → Security and login → Developer mode**.
3. Open **Plugins / Apps** (or [chatgpt.com/plugins](https://chatgpt.com/plugins)) and create a **developer-mode app**.
4. Set **MCP server URL** to `https://your-domain/mcp` (Streamable HTTP).
5. Choose **OAuth** (do not paste a static API key unless you added that yourself — this project uses OAuth).
6. ChatGPT will hit `/mcp`, receive 401, read `/.well-known/oauth-protected-resource`, then RFC 8414 metadata.
7. It will register or present a client (DCR or Client ID Metadata Documents).
8. Browser opens `{APP_URL}/oauth/authorize`.
9. Log in, pick permissions, **Allow & Connect**.
10. ChatGPT stores the tokens and can call tools. Write tools usually require confirmation in the chat.

If ChatGPT drops the connection after an hour, confirm metadata includes `refresh_token` / `offline_access` (this server advertises both). Recreate the ChatGPT app after metadata changes so it refetches discovery.

---

## 22. Deployment

Preferred for a **long-lived Node process**: any host that runs `npm run build && npm start` (Railway, Render, a VPS, Fly.io). That is the simplest mental model: one Express process, one URL.

Vercel is documented next because the spec asked for it. It works **only** because this MCP handler is **stateless JSON** — not because classic stateful Streamable HTTP sessions fit serverless.

---

## 23. Deploying MCPController to Vercel

Vercel Functions do not keep in-memory MCP sessions between invocations. This project therefore uses `createMcpHandler` + `responseMode: 'json'`. Tool calls are request/response. Do **not** expect SSE notifications or sticky `Mcp-Session-Id` maps on Vercel.

### Steps

1. Push the repo to GitHub.
2. Import the repository in Vercel.
3. **Build command:** `npm run build`  
   **Output:** not used as a static-only site — `vercel.json` rewrites **all** routes to `api/index.js` (Express).
4. Add environment variables (below).
5. Create MongoDB Atlas and paste `MONGODB_URI`.
6. Deploy.
7. Open `https://your-project.vercel.app`, log in, confirm `/api/health`.
8. MCP URL: `https://your-project.vercel.app/mcp`
9. After you know ChatGPT’s redirect URI from DCR, you usually do not need to pre-register it. If you use a static client, add that redirect URI to `OAuthClient.redirectUris`.
10. Connect ChatGPT as in section 21.

If OAuth consent redirects to the wrong host, `APP_URL` and `API_URL` are not both set to the Vercel origin.

### Simpler alternative if Vercel fights you

Run `npm start` on **Railway / Render / a VM**. Same repo, same env vars, fewer serverless constraints. Still one URL.

---

## 24. Vercel environment variables

Set in the Vercel project (Production):

```text
NODE_ENV=production
MONGODB_URI=mongodb+srv://…
APP_URL=https://your-project.vercel.app
API_URL=https://your-project.vercel.app
JWT_SECRET=<long random>
SESSION_SECRET=<long random>
MCP_SERVER_NAME=MCPController
MCP_SERVER_VERSION=1.0.0
```

Do not expose these in the client bundle. Rotate secrets if they leak.

---

## 25. MongoDB Atlas setup

```text
Create MongoDB Atlas cluster
        ↓
Create database user
        ↓
Allow appropriate network access
        ↓
Copy connection string
        ↓
Add MONGODB_URI to Vercel (or your host)
        ↓
Deploy
        ↓
npm run seed  (against Atlas, from your laptop, using the same MONGODB_URI)
```

Atlas is the production database. The serverless function does not ship a local MongoDB.

---

## 26. Production security

- HTTPS only; `secure` cookies when `NODE_ENV=production`
- bcrypt passwords, hashed OAuth tokens
- PKCE S256, exact redirect URI match, single-use codes
- Helmet, CORS split (open for MCP discovery, credentialed for `/api`)
- Rate limits on login and token endpoints
- Zod on login/register and tool inputs
- Generic 500 messages in production (no stack traces)

This is a **practice** project. For a real product, add audit logs, stricter redirect URI patterns, bot protection, and a dedicated identity provider if you outgrow the built-in authorization server.

---

## 27. Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Consent shows the wrong app name | Client not in `OAuthClient`; DCR/CIMD failed |
| `Invalid redirect URI` | URI must match **exactly** (scheme, host, port, path) |
| Dashboard logged in, `/mcp` 401 | MCP needs a **Bearer token**, not the login cookie |
| ChatGPT never opens login | `APP_URL` / `API_URL` not public HTTPS; metadata wrong |
| `Permission denied` on delete | User did not grant `delete` |
| Vercel MCP timeouts | Keep tools fast; Atlas network access; `maxDuration` in `vercel.json` |
| Vite UI cannot call API | Express not running on 3000; proxy only works in `npm run dev` |
| Seed user cannot log in | Run `npm run seed` against the same `MONGODB_URI` the server uses |

---

## Scripts

```bash
npm run dev      # API + Vite together
npm run build    # React production build
npm start        # Express serves API + built UI
npm run seed     # Demo user and inspector client
npm test         # Backend tests (in-memory MongoDB)
```

---

## License

Use this repository as a personal learning project.
