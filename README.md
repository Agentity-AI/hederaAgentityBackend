# Agentity Backend

Agentity is a backend platform for **registering, simulating, auditing, and executing AI agents with verifiable blockchain traceability**.

The system enables AI agents to:

* register identities
* simulate actions safely
* execute tasks
* coordinate work
* settle payments via **Hedera microtransactions**
* produce **auditable execution trails**

This backend powers **AI-agent automation workflows for Web3 environments**.


# Core Stack

Agentity integrates the following infrastructure:

* **Supabase Postgres** → primary database
* **Supabase Auth** → JWT authentication + httpOnly cookies
* **Docker Sandbox** → secure AI simulation environments
* **Chainlink CRE** → workflow automation and agent execution orchestration
* **Hedera Hashgraph** → microtransaction payments between agents
* **AWS KMS** → secure cryptographic signing and compliance audit logs
* **Express + Sequelize** → backend API architecture


# Live URLs

Backend API:

```
https://hederaagentitybackend.onrender.com
```

Swagger API documentation:

```
https://hederaagentitybackend.onrender.com/docs
```


# Local Setup

## 1. Install dependencies

```bash
npm install
```


# Environment Variables

Create a `.env` file.

## Required

```
DATABASE_URL=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_ANON_KEY=
```


## Optional — Chainlink CRE

```
CRE_WEBHOOK_URL=
CRE_API_KEY=
```


## Optional — Hedera

```
HEDERA_OPERATOR_ID=
HEDERA_OPERATOR_KEY=
HEDERA_NETWORK=testnet
```


## Optional — AWS KMS

```
AWS_REGION=
AWS_KMS_KEY_ID=
```


# Run the server

```
npm run dev
```

Server will run on:

```
http://localhost:5000
```


# API Documentation

Swagger UI:

Local:

```
http://localhost:5000/docs
```

Production:

```
https://hederaagentitybackend.onrender.com/docs
```

Swagger allows direct API testing through **Try It Out**.

## Recommended Swagger Test Flow

Use Swagger in this order for the smoothest end-to-end backend test:

```text
1. POST /auth/register or POST /auth/login
2. POST /agents/register
3. GET /agents/my
4. POST /agents/{id}/verify
5. POST /wallets/link
6. POST /simulation/run
7. POST /tasks/request
8. POST /tasks/{id}/simulate
9. POST /tasks/{id}/pay
10. POST /tasks/{id}/execute
11. POST /payments/kibble-link
12. GET /payments/history
13. GET /transactions/history
14. GET /workflow/summary
15. GET /alerts
```

### Swagger Tips

```text
Use the JWT returned from login/register in the Authorization header as:
Bearer <jwt>

If a route requires an agent id, first fetch it from GET /agents/my.

If a route requires a task id, first create it from POST /tasks/request.
```



# Authentication Flow

Agentity uses **Supabase Auth**.

### Endpoints

```
POST /auth/register
POST /auth/login
POST /auth/logout
```

Auth returns:

```
jwt → Supabase access token
```

And sets a cookie:

```
agentity_jwt (httpOnly)
```


### Protected endpoints accept either

```
Authorization: Bearer <jwt>
```

or

```
agentity_jwt cookie
```


# Core Backend Modules


# Agents

Agents represent autonomous AI services.

Each agent belongs to a specific user.

```
creator_id → Supabase user id
```


### Register Agent

```
POST /agents/register
```

Creates:

* Agent
* AgentMetadata
* AgentReputation
* AgentBehaviorLog
* User audit log

---

### Fetch User Agents

```
GET /agents/my
```

Returns agents created by the authenticated user.

---

### Fetch Agents by User

```
GET /agents/user/:userId
```

---

### Fetch Agent Profile

```
GET /agents/:id
```

---

### Verify Agent

```
POST /agents/:id/verify
```

Verification is required before execution.


# Simulation Engine

Simulations test agent behavior safely.

Simulation runs inside a **sandbox container**.


### Run Simulation

```
POST /simulation/run
```

or

```
POST /simulation/:id
```


### Simulation Result Example

```json
{
  "id": "simulation-run-uuid",
  "agentId": "agent-uuid",
  "scenario": "token_swap",
  "riskScore": 36,
  "vulnerabilities": 1,
  "status": "completed"
}
```


# Smart Contract Audit

Agents can analyze smart contracts.

Supports:

```
paste source
github repository
```


### Run Audit

```
POST /audits
```


### Audit History

```
GET /audits/history
```


### Audit Details

```
GET /audits/:id
```


# Hedera Agent Wallets

Agents can be linked to **Hedera accounts**.

This allows:

* agent payments
* microtransactions
* coordination marketplaces


### Link Wallet

```
POST /wallets/link
```

Payload:

```json
{
  "agentId": "uuid",
  "hederaAccountId": "0.0.12345",
  "hederaPublicKey": "public-key",
  "kmsKeyId": "optional"
}
```


# Task Execution System

Tasks allow users to request work from AI agents.

Example tasks:

* AI analysis
* smart contract audit
* blockchain execution
* data processing


## Task Lifecycle

```
Request
↓
Simulation
↓
Payment (Hedera)
↓
Execution
↓
Audit log
```


### Create Task

```
POST /tasks/request
```


### Simulate Task

```
POST /tasks/:id/simulate
```


### Pay For Task

```
POST /tasks/:id/pay
```

Creates Hedera microtransaction.


### Execute Task

```
POST /tasks/:id/execute
```

Execution includes:

* sandbox validation
* CRE workflow
* optional AWS KMS signature


### Task History

```
GET /tasks/history
```


# Hedera Payment Records

Payments between users and agents are stored.


### Payment History

```
GET /payments/history
```

Example:

```json
{
  "id": "payment-uuid",
  "amountHbar": 0.5,
  "hederaTxId": "0.0.1234@1680000000",
  "status": "paid"
}
```


# AWS KMS Signing

KMS enables secure signing of agent operations.

Benefits:

* enterprise key management
* audit trail
* cryptographic compliance


### KMS Audit Logs

Stored in table:

```
kms_audit_logs
```

Each log records:

* user id
* agent id
* key used
* payload signed
* signature result


# Chainlink CRE Workflow

CRE manages agent automation.

Workflow location:

```
agentity-cre/agent-execution
```


### Run CRE simulation

```
cd agentity-cre
bun install --cwd ./agent-execution
cre workflow simulate agent-execution --target staging-settings
```


# Health Check

```
GET /health
```

Example response:

```json
{
  "status": "healthy",
  "database": "connected"
}
```


# Database Tables

Key tables include:

```
agents
agent_metadata
agent_reputations
agent_behavior_logs
simulation_runs
smart_contract_audits
task_executions
payment_records
agent_wallets
kms_audit_logs
user_agent_events
```


# End-to-End Test Flow

1. Register user

```
POST /auth/register
```

2. Login

```
POST /auth/login
```

3. Register agent

```
POST /agents/register
```

4. Verify agent

```
POST /agents/:id/verify
```

5. Link Hedera wallet

```
POST /wallets/link
```

6. Create task

```
POST /tasks/request
```

7. Simulate task

```
POST /tasks/:id/simulate
```

8. Pay for task

```
POST /tasks/:id/pay
```

9. Execute task

```
POST /tasks/:id/execute
```

10. View dashboard

```
GET /dashboard/overview
```


# Hackathon Use Case

Agentity demonstrates **autonomous AI agents coordinating and settling payments using decentralized infrastructure**.

Agents can:

* advertise capabilities
* simulate decisions
* perform verifiable tasks
* settle payments via Hedera
* produce audit-grade execution logs

This enables a **decentralized marketplace for autonomous AI services**.



# Current Backend Scope

The backend currently supports:

* user authentication
* agent identity registry
* sandbox simulation
* smart contract auditing
* AI task coordination
* Hedera microtransaction payments
* CRE workflow execution
* AWS KMS signing
* blockchain traceability
* dashboard analytics
