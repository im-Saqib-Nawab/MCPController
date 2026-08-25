# MCPController

MCPController is a single-admin doctor-management MCP application. ChatGPT connects through OAuth 2.1 with PKCE, the Admin logs in, chooses which doctor permissions to grant, and the MCP server exposes doctor tools backed by MongoDB.

## Architecture

```text
ChatGPT
  ↓
OAuth
  ↓
Admin Login
  ↓
Admin Consent
  ↓
Granted Permissions
  ↓
MCP Access Token
  ↓
MCP /mcp
  ↓
Permission Check
  ↓
Doctor Tools
  ↓
MongoDB
```

## What This App Does

- One Admin owns the whole system.
- There is no public registration and no multi-user account switching.
- The Admin authenticates with credentials from environment variables.
- The consent screen lets the Admin approve `doctor:read`, `doctor:write`, and `doctor:delete`.
- The MCP server checks the approved scopes again on every tool call.
- Doctor data is stored in MongoDB through a simple Mongoose model.

## Authentication

The browser session is separate from the MCP bearer token.

- Browser session: HTTP-only cookie used for the Admin UI and consent screen.
- MCP access token: Bearer token used by ChatGPT against `/mcp`.
- OAuth uses authorization code flow with PKCE.
- Authorization codes are single-use and short-lived.
- Access tokens and refresh tokens are hashed before storage.

The Admin login uses `ADMIN_EMAIL` and `ADMIN_PASSWORD` from `.env`.

## Doctor Management

The domain model is intentionally small:

- `name` - required string
- `specialization` - required string
- `createdAt` / `updatedAt` - managed by Mongoose timestamps

Doctor CRUD is implemented in a service layer and reused by both the REST admin API and the MCP tool layer.

## OAuth Flow

1. ChatGPT opens the authorization endpoint.
2. If the Admin is not authenticated, the browser goes to `/login`.
3. The Admin logs in.
4. The consent page shows the requested doctor permissions.
5. The Admin approves a subset or denies the request.
6. The authorization code is exchanged for an access token.
7. ChatGPT uses that token on `/mcp`.

## Permission Flow

Requested scopes map to MCP tools like this:

- `doctor:read` → `list_doctors`, `get_doctor`
- `doctor:write` → `add_doctor`, `update_doctor`
- `doctor:delete` → `delete_doctor`

The backend enforces permissions twice:

- OAuth only writes approved scopes into the authorization code and token.
- Each MCP tool checks the token scopes before it touches MongoDB.

## MCP Tools

| Tool | Scope | Behavior |
| --- | --- | --- |
| `list_doctors` | `doctor:read` | Returns all doctors |
| `get_doctor` | `doctor:read` | Returns one doctor by `doctorId` |
| `add_doctor` | `doctor:write` | Creates a doctor with `name` and `specialization` |
| `update_doctor` | `doctor:write` | Updates a doctor by `doctorId` |
| `delete_doctor` | `doctor:delete` | Deletes a doctor by `doctorId` |

## Environment Variables

Use a root `.env` file. The application loads it from the project root.

Required values for local `npm run dev` (Vite on 5173, API on 3000):

```env
NODE_ENV=development
PORT=3000
APP_URL=http://localhost:5173
API_URL=http://localhost:3000
MONGODB_URI=mongodb://127.0.0.1:27017/mcpcontroller
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=change-this-password
JWT_SECRET=change-this-to-a-long-random-secret
MCP_SERVER_NAME=MCPController
MCP_SERVER_VERSION=1.0.0
```

The code also supports token/session lifetime variables with safe defaults:

- `JWT_EXPIRES_IN`
- `AUTH_CODE_TTL_SECONDS`
- `ACCESS_TOKEN_TTL_SECONDS`
- `REFRESH_TOKEN_TTL_SECONDS`

On Vercel, `APP_URL` and `API_URL` must both be the public HTTPS origin (see Deployment below).

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Start MongoDB locally.

3. Seed sample data:

```bash
npm run seed
```

4. Start the app:

```bash
npm run dev
```

In development, the React client runs through Vite and proxies API requests to the backend.

## Testing

Run the automated checks with:

```bash
npm test
```

Run the client build with:

```bash
npm run build
```

The current test suite covers:

- admin login
- registration disabled
- doctor model and CRUD service
- OAuth scope approval
- MCP tool permission enforcement
- token revocation

## Connecting ChatGPT

Use the authorization URL exposed by the server:

- `/.well-known/oauth-authorization-server`
- `/.well-known/oauth-protected-resource`
- `/oauth/token`
- `/mcp`

Typical flow:

1. ChatGPT discovers the OAuth metadata.
2. ChatGPT requests authorization for the MCP resource.
3. The browser redirects to the Admin login screen.
4. The Admin reviews permissions and clicks `Allow & Connect`.
5. ChatGPT exchanges the code for tokens.
6. ChatGPT calls the MCP tools using the bearer token.

## Deployment

The app is a single origin: Express serves `/api`, `/oauth`, `/mcp`, OAuth discovery, and the React build.

### Vercel

This repo already includes `vercel.json` and `api/index.js`. Vercel runs the Express app as one serverless function and rewrites every path to it.

**1. MongoDB Atlas**

1. Create a cluster (free M0 is enough).
2. Create a database user.
3. Network Access: allow `0.0.0.0/0` so Vercel can connect (or add Vercel IPs if you prefer).
4. Copy the connection string, for example:

```text
mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/mcpcontroller?retryWrites=true&w=majority
```

**2. Deploy the project**

- Push this repo to GitHub.
- In [Vercel](https://vercel.com), Import the repository.
- Framework Preset: Other (leave it). `vercel.json` sets install and build.
- Root Directory: leave as the repo root (do not set it to `client` or `server`).
- Node.js version: 20.x or newer.

**3. Environment variables in Vercel**

Project → Settings → Environment Variables. Set them for Production (and Preview if you use preview URLs).

| Name | Example | Notes |
| --- | --- | --- |
| `NODE_ENV` | `production` | Vercel usually sets this automatically. |
| `APP_URL` | `https://your-app.vercel.app` | No trailing slash. Must match the live origin. |
| `API_URL` | `https://your-app.vercel.app` | Same value as `APP_URL` on Vercel. |
| `MONGODB_URI` | `mongodb+srv://…/mcpcontroller` | Atlas URI. |
| `ADMIN_EMAIL` | your admin email | Used to log in to the consent UI. |
| `ADMIN_PASSWORD` | a strong password | Compared on login; never sent to the browser. |
| `JWT_SECRET` | long random string | Session cookie signing. Do not use the example values. |
| `JWT_EXPIRES_IN` | `7d` | Optional. |
| `AUTH_CODE_TTL_SECONDS` | `120` | Optional. |
| `ACCESS_TOKEN_TTL_SECONDS` | `3600` | Optional. |
| `REFRESH_TOKEN_TTL_SECONDS` | `2592000` | Optional. |
| `MCP_SERVER_NAME` | `MCPController` | Optional. |
| `MCP_SERVER_VERSION` | `1.0.0` | Optional. |

Do **not** put `ADMIN_PASSWORD` or `JWT_SECRET` in the React app. The client only talks to `/api`.

If you add a custom domain later, change `APP_URL` and `API_URL` to `https://your-domain.com` and redeploy.

Generate `JWT_SECRET` with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

**4. First deploy and seed**

1. Deploy.
2. Open `https://your-app.vercel.app/api/health` — you should see `{ "ok": true, ... }`.
3. Seed MongoDB **from your machine**, pointed at Atlas (not Vercel’s serverless function):

```bash
# In the project root, temporarily set MONGODB_URI to the Atlas URI in .env
npm run seed
```

Seed creates the Admin user row, sample doctors, and a local MCP Inspector client. After that, log in on the live site with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

**5. Connect ChatGPT**

Use the deployed origin:

- `https://your-app.vercel.app/.well-known/oauth-authorization-server`
- `https://your-app.vercel.app/.well-known/oauth-protected-resource`
- `https://your-app.vercel.app/mcp`

In ChatGPT (or MCP Inspector), add that MCP URL. ChatGPT will open the login + consent screens on the same domain, then call `/mcp` with a Bearer token.

**CLI deploy (optional)**

```bash
npm i -g vercel
vercel login
vercel env pull   # optional: sync env locally
vercel --prod
```

After the first production deploy, copy the URL into `APP_URL` and `API_URL` if you used a placeholder, then redeploy so OAuth metadata points at the real origin.

## Security Notes

- Do not expose `ADMIN_PASSWORD` or `JWT_SECRET` to the browser.
- Keep OAuth tokens hashed in the database.
- Only approve the scopes the Admin actually wants ChatGPT to use.
- Revoke access when the connection should no longer be trusted.
- The admin login exists only to authorize ChatGPT and manage doctor data; there is no public signup flow.

## Seed Data

The seed script creates:

- sample doctors
- a sample OAuth client for local inspector use

It does not create demo users or hardcode Admin credentials.
