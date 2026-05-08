# Backend Testing Guide

## Quick checks

Run these first:

```bash
npm run db:check
npm test
```

These confirm:

```text
database connectivity
core unit tests
basic backend code health
```

## Full smoke test

Start the backend in one terminal:

```bash
npm run dev
```

Run the live smoke test in another terminal:

```bash
npm run smoke
```

The smoke script tests:

```text
GET /health
GET /system/status
POST /auth/register
GET /dashboard/overview
POST /agents/register
POST /wallets/link when wallet env is available
POST /agents/:id/verify
GET /agents/my
GET /workflow/summary
POST /audits
GET /audits/history
GET /audits/:id
GET /alerts
GET /alerts/summary
POST /tasks/request
POST /tasks/:id/simulate
GET /tasks/history
GET /payments/history
POST /tasks/:id/pay when wallet env is available
POST /tasks/:id/execute when wallet env is available
POST /transactions/policies
GET /transactions/policies
GET /transactions/history
GET /transactions/:id when a transaction exists
```

## Smoke script environment

Optional variables:

```text
SMOKE_BASE_URL=http://localhost:5000
SMOKE_HEDERA_ACCOUNT_ID=
SMOKE_HEDERA_PUBLIC_KEY=
SMOKE_KMS_KEY_ID=
```

Notes:

```text
If Hedera is enabled and smoke wallet vars are missing, the script skips live payment and execution checks.
If CRE is not configured, execution falls back to the local fallback response.
If KMS is not configured, signing is simulated.
```

## Recommended manual verification after smoke test

Open Swagger:

```text
http://localhost:5000/docs
```

Then confirm:

```text
the created user can authenticate
the created agent appears in /agents/my
the audit appears in /audits/history
alerts reflect risky audit or simulation conditions
workflow summary counters increase correctly
task history and payment history reflect the new task
transaction history shows payment and execution records when those steps ran
```
