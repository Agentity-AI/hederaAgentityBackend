# Agentity Backend

Agentity is a backend service for registering, verifying, simulating, and executing AI agents.

It integrates:
- **Supabase Postgres** (database)
- **Supabase Auth** (JWT + `httpOnly` cookie)
- **Docker** sandbox simulations
- **Chainlink CRE** workflow (local simulation; webhook execution when deployed)

## Live URLs
- Backend (Render): https://agentity-backend.onrender.com
- Swagger Docs: https://agentity-backend.onrender.com/docs

## Local Setup

### 1) Install
```bash
npm install
````

### 2) Environment Variables (`.env`)

Required:

* `DATABASE_URL`
* `SUPABASE_URL`
* `SUPABASE_SERVICE_ROLE_KEY`
* `SUPABASE_ANON_KEY`

Optional (CRE live execution):

* `CRE_WEBHOOK_URL`
* `CRE_API_KEY`

Example:

```env
DATABASE_URL=postgresql://...
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
SUPABASE_ANON_KEY=eyJ...

CRE_WEBHOOK_URL=
CRE_API_KEY=
```

### 3) Run

```bash
npm run dev
```

Server runs on:

* [http://localhost:5000](http://localhost:5000)

## API Documentation (Swagger)

Swagger UI:

* Local: [http://localhost:5000/docs](http://localhost:5000/docs)
* Render: [https://agentity-backend.onrender.com/docs](https://agentity-backend.onrender.com/docs)

Swagger supports **Try it out** to execute requests directly.

## Auth Flow (Supabase)

Endpoints:

* `POST /auth/register`
* `POST /auth/login`
* `POST /auth/logout`

Auth behavior:

* Returns `jwt` (Supabase `access_token`)
* Sets `agentity_jwt` **httpOnly** cookie (preferred)

Frontend must send cookies:

* `fetch`: `credentials: "include"`
* `axios`: `withCredentials: true`

## Core Backend Routes

### Agents

* `POST /agents/register`
* `GET /agents/:id`
* `POST /agents/:id/verify`

### Simulation

* `POST /simulation/:id`

### Execution

* `POST /execute/:id`

Execution flow:

* Runs sandbox simulation first
* Then runs CRE execution (or **fallback** if CRE webhook is not configured)

### Dashboard

* `GET /dashboard/overview` (requires auth)

### Health

* `GET /health`

## Chainlink CRE (Local Simulation)

CRE workflow folder:

* `agentity-cre/agent-execution`

Run:

```bash
cd agentity-cre
bun install --cwd ./agent-execution
cre workflow simulate agent-execution
```

Deployment notes:

* CRE workflow deployment is currently **early access**
* When enabled, set `CRE_WEBHOOK_URL` + `CRE_API_KEY` in Render for live execution

## Suggested Test Flow (End-to-End)

1. Open Swagger: `/docs`
2. Register/Login user: `/auth/register` or `/auth/login`
3. Register agent: `/agents/register`
4. Verify agent: `/agents/:id/verify`
5. Simulate agent: `/simulation/:id`
6. Execute agent: `/execute/:id`
7. View dashboard: `/dashboard/overview`

