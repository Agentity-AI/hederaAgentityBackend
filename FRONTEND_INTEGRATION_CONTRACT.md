# Frontend Integration Contract

This document is the practical frontend-facing contract for the current Agentity backend.

Use this together with Swagger:

```text
Local: http://localhost:5000/docs
Live: https://hederaagentitybackend.onrender.com/docs
```

The goal here is simple:

* show the payload each screen should send
* separate required fields from optional fields
* call out fields that are accepted by the backend but not needed by the current UI


# Auth

## Register

Endpoint:

```text
POST /auth/register
```

Required payload:

```json
{
  "email": "user@mail.com",
  "password": "Password123",
  "name": "John Developer"
}
```

Notes:

* `password` must be at least 8 characters and include at least one letter and one number
* response includes `jwt`
* backend also sets `agentity_jwt` cookie


## Login

Endpoint:

```text
POST /auth/login
```

Required payload:

```json
{
  "email": "user@mail.com",
  "password": "Password123"
}
```


# Dashboard

## Overview

Endpoint:

```text
GET /dashboard/overview
```

Frontend-useful response fields:

* `email`
* `name`
* `Totalagent`
* `TotalvarifiedAgent`
* `activeSimulation`
* `VulnerabilitiesDetected`
* `TransactionsExecuted`
* `chart`
* `activeAgent`
* `recentAlerts`
* `recentActivity`

Notes:

* `recentActivity` is the preferred camelCase field for the frontend
* `RecentActivity` is still present for backward compatibility


# Agents

## Agent Type Dropdown

Endpoint:

```text
GET /agents/types
```

Use this for the registration modal dropdown.


## List User Agents

Endpoint:

```text
GET /agents/my
```

Frontend-useful response fields per item:

* `id`
* `agentName`
* `agentType`
* `reputation.score`
* `status`
* `lastActivityAt`
* `lastActivityType`


## Register Agent

Endpoint:

```text
POST /agents/register
```

Recommended frontend payload:

```json
{
  "agentName": "Alpha Trading Bot",
  "agentType": "Trading Bot",
  "publicKey": "0x42Ec816b0923eEF0c76589627107AdaBb749AB75",
  "description": "Executes monitored trading strategies across supported protocols.",
  "apiEndpoint": "https://agent.example.com/api/trading-bot",
  "metadata": {
    "strategy": "swing",
    "network": "avalanche"
  }
}
```

Required:

* `agentName`
* `publicKey`

Recommended for current UI:

* `agentType`
* `description`
* `apiEndpoint`
* `metadata`

Advanced optional backend fields:

* `modelName`
* `version`
* `executionEnvironment`

Backward-compatible aliases still accepted:

* `agent_name`
* `public_key`
* `agent_type`
* `api_endpoint`
* `model_name`
* `execution_environment`

Important:

* although the modal visually makes wallet/public key look optional, the backend still requires `publicKey`
* this is used for uniqueness and fingerprinting


## Verify Agent

Endpoint:

```text
POST /agents/{id}/verify
```

Optional payload:

```json
{
  "hederaAccountId": "0.0.8479610",
  "hederaPublicKey": "302a300506032b6570032100examplepublickey",
  "kmsKeyId": "demo-kms-key"
}
```

Notes:

* the frontend can verify without sending a body
* wallet info can be linked here or through `POST /wallets/link`


# Wallets

## Link Wallet

Endpoint:

```text
POST /wallets/link
```

Required payload:

```json
{
  "agentId": "ac0d21d5-bb02-4d52-8004-4725488cf007",
  "hederaAccountId": "0.0.8479610",
  "hederaPublicKey": "302a300506032b6570032100examplepublickey"
}
```

Optional:

* `kmsKeyId`


# Simulation

## Scenario Dropdown

Endpoint:

```text
GET /simulation/scenarios
```

Current supported frontend labels:

* `Token Swap`
* `Liquidity Pool`
* `NFT Mint`
* `Contract Deployment`
* `Multi-Sig Transaction`
* `Cross-Chain Bridge`


## Run Simulation

Endpoint:

```text
POST /simulation/run
```

Recommended payload:

```json
{
  "agentId": "ac0d21d5-bb02-4d52-8004-4725488cf007",
  "scenarioType": "Token Swap",
  "parameters": {
    "amount": 10,
    "tokenIn": "USDC",
    "tokenOut": "HBAR"
  }
}
```

Required:

* `agentId`
* `scenarioType`

Optional:

* `parameters`

Use for screen:

* dropdown agent list from `GET /agents/my`
* scenario list from `GET /simulation/scenarios`
* history table from `GET /simulation/history`


# Smart Contract Audits

## Audit History

Endpoint:

```text
GET /audits/history
```

Use for:

* contract name
* risk level
* consensus score
* status
* date


## Create Audit

Endpoint:

```text
POST /audits
```

Paste-code payload:

```json
{
  "contractName": "MyContract",
  "sourceType": "paste",
  "sourceCode": "pragma solidity ^0.8.0; contract MyContract { }"
}
```

GitHub payload:

```json
{
  "contractName": "MyContract",
  "sourceType": "github",
  "githubUrl": "https://github.com/example/protocol/blob/main/contracts/MyContract.sol"
}
```

Required:

* `contractName`
* `sourceType`

Conditional:

* `sourceCode` required when `sourceType = paste`
* `githubUrl` required when `sourceType = github`


# Tasks

Tasks drive the execution flow:

```text
request -> simulate -> pay -> execute
```


## Create Task

Endpoint:

```text
POST /tasks/request
```

Recommended payload:

```json
{
  "agentId": "ac0d21d5-bb02-4d52-8004-4725488cf007",
  "taskType": "execution",
  "inputPayload": {
    "target": "swap",
    "network": "hedera-testnet",
    "maxSlippageBps": 100
  }
}
```

Required:

* `agentId`
* `taskType`

Optional:

* `inputPayload`


## Simulate Task

Endpoint:

```text
POST /tasks/{id}/simulate
```

No request body needed.


## Pay Task

Endpoint:

```text
POST /tasks/{id}/pay
```

No request body needed.

Important:

* task must already be simulated


## Execute Task

Endpoint:

```text
POST /tasks/{id}/execute
```

No request body needed.

Important:

* task must already be paid


# Payments & Transactions

## Summary Cards

Endpoint:

```text
GET /transactions/summary
```

Response fields:

* `totalTransactions`
* `totalVolume`
* `highRisk`
* `activePolicies`


## Payment History

Endpoint:

```text
GET /payments/history
```

Use for:

* Hedera payment records


## Transaction Table

Endpoint:

```text
GET /transactions/history
```

Top-level summary fields now included:

* `total`
* `totalVolume`
* `highRisk`

Frontend-useful fields:

* `id`
* `agentName`
* `displayType`
* `amount`
* `amountUnit`
* `riskRating`
* `status`
* `createdAt`


## Policies List

Endpoint:

```text
GET /transactions/policies
```

Frontend-useful fields:

* `id`
* `name`
* `agentId`
* `maxTransactionAmount`
* `dailyLimit`
* `requireManualApproval`
* `autoRejectHighRisk`
* `policyEnabled`


## Create Policy

Endpoint:

```text
POST /transactions/policies
```

Recommended modal payload:

```json
{
  "name": "Standard Trading Policy",
  "agentId": "ac0d21d5-bb02-4d52-8004-4725488cf007",
  "maxTransactionAmount": 1000,
  "dailyLimit": 10000,
  "requireManualApproval": true,
  "autoRejectHighRisk": true,
  "policyEnabled": true
}
```

Required:

* `name`

Optional:

* `agentId`
* `maxTransactionAmount`
* `dailyLimit`
* `requireManualApproval`
* `autoRejectHighRisk`
* `policyEnabled`

Advanced optional:

* `rules`


# Alerts & Monitoring

## Alert Summary Cards

Endpoint:

```text
GET /alerts/summary
```

Response fields:

* `total`
* `active`
* `critical`
* `resolved`
* `bySeverity`


## Alert Feed

Endpoint:

```text
GET /alerts
```

Optional query filters:

* `status`
* `severity`
* `type`

Frontend-useful response fields:

* `title`
* `message`
* `severity`
* `status`
* `type`
* `createdAt`
* `actionLinks.resolve`
* `actionLinks.dismiss`


## Resolve or Dismiss Alert

Endpoint:

```text
PATCH /alerts/{id}/status
```

Payload:

```json
{
  "status": "resolved"
}
```

Allowed status values:

* `active`
* `resolved`
* `dismissed`


# Settings

## Get Settings

Endpoint:

```text
GET /settings
```


## Update Profile

Endpoint:

```text
PATCH /settings/profile
```

Only supported payload:

```json
{
  "username": "John Developer"
}
```

Important:

* only `username` is accepted
* sending `email`, `company`, or any other profile field will be rejected


## Update Notifications

Endpoint:

```text
PATCH /settings/notifications
```

Purpose:

* save notification preferences from the Settings screen
* persist Slack/webhook target URLs for later use
* this does not currently send email, Slack, or webhook notifications by itself
* real outbound delivery workers can be added later without changing the frontend contract

Allowed fields:

* `emailAlerts`
* `slackIntegration`
* `webhookNotifications`
* `criticalAlertsOnly`
* `slackWebhookUrl`
* `webhookUrl`

Example payload:

```json
{
  "emailAlerts": true,
  "slackIntegration": false,
  "webhookNotifications": true,
  "criticalAlertsOnly": true,
  "webhookUrl": "https://example.com/webhooks/agentity"
}
```

Validation notes:

* boolean fields must be real booleans
* `slackWebhookUrl` and `webhookUrl` must be valid `http` or `https` URLs when provided
* partial updates are allowed; the frontend can send only the fields that changed
* saved values are returned by `GET /settings`

Frontend implementation notes:

* load the current toggle state from `GET /settings`
* save Settings-screen changes with `PATCH /settings/notifications`
* use the Alerts APIs for the actual in-app notification feed:
  * `GET /alerts/summary` for cards and counters
  * `GET /alerts` for the alert list
  * `PATCH /alerts/{id}/status` for resolve and dismiss actions
* do not assume the backend is already sending external email, Slack, or webhook deliveries just because the toggles are enabled


## Update Security

Endpoint:

```text
PATCH /settings/security
```

Allowed fields:

* `twoFactorEnabled`
* `automaticApiKeyRotation`
* `auditLogging`


## Regenerate API Key

Endpoint:

```text
POST /settings/security/api-key/regenerate
```

No request body needed.


# Integration / Embed Setup

This flow should be backend-driven. The frontend owns the screen layout, tabs, checklist UI, and copy buttons. The backend returns the real user-specific values: agent state, API key preview, public client key, embed config, and generated code snippets.


## Integration Overview

Endpoint:

```text
GET /integrations/overview
```

Use this as the first request when opening the integration setup screen.

Frontend-useful response fields:

* `baseUrl`
* `hasAgent`
* `hasVerifiedAgent`
* `hasApiKey`
* `agent`
* `apiKey.preview`
* `embedConfig`
* `snippetTypes`
* `nextSteps`


## Generate Integration API Key

Endpoint:

```text
POST /integrations/api-keys
```

No request body needed.

Important:

* this revokes the previous active key
* the full plaintext key is returned once
* later screens should show only `apiKey.preview` from `GET /integrations/overview`
* copied server-side snippets can use this key as `Authorization: Bearer <agty_live_api_key>` for task endpoints


## Save Embed Config

Endpoint:

```text
PATCH /integrations/embed-config
```

Recommended payload:

```json
{
  "agentId": "ac0d21d5-bb02-4d52-8004-4725488cf007",
  "allowedOrigins": ["https://example.com", "http://localhost:3000"],
  "theme": "system",
  "defaultTaskType": "execution",
  "webhookUrl": "https://example.com/api/agentity-webhook"
}
```

Allowed fields:

* `agentId`
* `allowedOrigins`
* `theme` - `light`, `dark`, or `system`
* `defaultTaskType`
* `webhookUrl`


## Get Generated Snippet

Endpoint:

```text
GET /integrations/snippets?type=react
```

Supported snippet types:

* `javascript`
* `react`
* `html`
* `curl`

Optional query:

```text
agentId=<agent uuid>
```

Response fields:

* `type`
* `language`
* `code`
* `variables`
* `warnings`

Important:

* snippets are generated from backend state
* snippets may include placeholders if the user has no agent or no API key
* snippets only include the API key preview, not the full secret


## Delete Account

Endpoint:

```text
DELETE /settings/account
```

Required payload:

```json
{
  "confirmText": "DELETE"
}
```

Important:

* this is permanent
* frontend should require a hard confirmation step before calling this route


# Notes For Frontend Team

* Prefer camelCase payloads and response fields whenever available.
* Use Swagger examples as the route-level source of truth.
* Use this document as the screen-level source of truth.
* If a form only needs a simple payload, do not implement advanced optional backend fields unless the product specifically asks for them.
