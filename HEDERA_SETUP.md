# Hedera HCS Integration — Setup Guide

This implementation adds **Hedera Consensus Service (HCS)** registration and
**automatic scheduled reverification** to your Agentity platform.

---

## What Was Added

| File | Type | Purpose |
|---|---|---|
| `src/config/hederaClient.js` | NEW | Hedera SDK client singleton + Mirror Node URL |
| `src/models/agentHcsRegistry.js` | NEW | HCS topic ID, schedule state, trust score per agent |
| `src/models/agentHcsMessage.js` | NEW | Local mirror of HCS messages |
| `src/models/index.js` | MODIFIED | Adds HCS model associations |
| `src/services/hedera/hcsRegistryService.js` | NEW | Core: register + verify + score calc |
| `src/services/hedera/hcsSchedulerService.js` | NEW | Creates/cancels Hedera scheduled transactions |
| `src/services/hedera/hcsWatcherService.js` | NEW | Polls Mirror Node, chains next schedule |
| `src/routes/agents.js` | MODIFIED | `POST /:id/verify` now triggers full HCS flow |
| `src/server.js` | MODIFIED | Starts HCS watcher on boot |
| `schema_hedera_additions.sql` | NEW | Two new DB tables |

---

## Step 1 — Get Hedera Testnet Credentials

1. Go to **https://portal.hedera.com**
2. Sign up (free) → select **Testnet**
3. Copy your **Account ID** (e.g. `0.0.4821700`) and **Private Key**
4. You get **10,000 free testnet HBAR** — more than enough

---

## Step 2 — Install the Hedera SDK

```bash
cd your-backend
npm install @hashgraph/sdk
```

SDK docs: https://docs.hedera.com/hedera/sdks-and-apis/sdks

---

## Step 3 — Create the Global Registry Topic (once)

This is the platform-wide index of all registered agents.

```bash
# Install Hedera CLI
npm install -g @hashgraph/hedera-cli

# Create global registry topic
hedera topic create \
  --memo "Agentity Global Registry" \
  --network testnet
```

Copy the returned topic ID (e.g. `0.0.4821733`) to your `.env`.

Alternatively, create it via the SDK:
```js
const { TopicCreateTransaction } = require("@hashgraph/sdk");
const { getHederaClient } = require("./src/config/hederaClient");

const client  = getHederaClient();
const tx      = await new TopicCreateTransaction().setTopicMemo("Agentity Global Registry").execute(client);
const receipt = await tx.getReceipt(client);
console.log("Global topic:", receipt.topicId.toString());
```

---

## Step 4 — Add Environment Variables

Copy the contents of `.env.hedera.example` to your `.env`:

```
HEDERA_OPERATOR_ID=0.0.XXXXXXX
HEDERA_OPERATOR_KEY=302e020100...
HEDERA_NETWORK=testnet
HEDERA_GLOBAL_REGISTRY_TOPIC_ID=0.0.YYYYYYY
HEDERA_REVERIFY_INTERVAL_SECONDS=3600
HEDERA_WATCHER_POLL_MS=60000
HEDERA_HEALTHY_THRESHOLD=60
```

---

## Step 5 — Run the SQL Migration

Run `schema_hedera_additions.sql` against your Supabase database:

1. Go to **Supabase Dashboard → SQL Editor**
2. Paste the contents of `schema_hedera_additions.sql`
3. Click **Run**

Or via psql:
```bash
psql $DATABASE_URL < schema_hedera_additions.sql
```

---

## Step 6 — Copy Files Into Your Project

Copy each file to its corresponding path in your backend:

```
hedera-impl/
├── src/config/hederaClient.js        → src/config/hederaClient.js
├── src/models/agentHcsRegistry.js    → src/models/agentHcsRegistry.js
├── src/models/agentHcsMessage.js     → src/models/agentHcsMessage.js
├── src/models/index.js               → src/models/index.js          (replaces)
├── src/services/hedera/
│   ├── hcsRegistryService.js         → src/services/hedera/hcsRegistryService.js
│   ├── hcsSchedulerService.js        → src/services/hedera/hcsSchedulerService.js
│   └── hcsWatcherService.js          → src/services/hedera/hcsWatcherService.js
├── src/routes/agents.js              → src/routes/agents.js          (replaces)
└── src/server.js                     → src/server.js                 (replaces)
```

---

## Step 7 — Start Your Server

```bash
npm run dev
# or
node src/server.js
```

You should see in logs:
```
[hedera] Client initialized — network: testnet, operator: 0.0.XXXXXXX
[watcher] Starting — poll interval: 60000ms, reverify interval: 3600s
Server running on port 5000
```

---

## Testing the Full Flow

### 1. Register an agent
```bash
curl -X POST http://localhost:5000/agents/register \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"agentName": "TestAgent", "walletAddress": "0xabc123"}'
```

### 2. Verify the agent (triggers immediate HCS verification)
```bash
curl -X POST http://localhost:5000/agents/AGENT_ID/verify \
  -H "Authorization: Bearer YOUR_JWT"
```

**Expected response:**
```json
{
  "message": "Agent verified",
  "agent": { "id": "...", "status": "verified" },
  "hedera": {
    "topicId": "0.0.4821733",
    "trustScore": 78,
    "isHealthy": true,
    "riskLevel": "low",
    "scheduleId": "0.0.5555",
    "nextCheckAt": "2026-03-13T15:00:00.000Z",
    "hashscanUrl": "https://hashscan.io/testnet/topic/0.0.4821733"
  }
}
```

### 3. View HCS history
```bash
curl http://localhost:5000/agents/AGENT_ID/hcs-history
```

### 4. View on HashScan (publicly verifiable, no login)
```
https://hashscan.io/testnet/topic/0.0.4821733
```

---

## How the Reverification Chain Works

```
T+0s    User clicks Verify
          → HCS topic created
          → AGENT_REGISTERED submitted to HCS (seq 1)
          → Trust score calculated
          → VERIFIED submitted to HCS (seq 2)
          → Hedera ScheduleTx_1 created (fires at T+1hr)

T+1hr   ScheduleTx_1 fires on Hedera network
          → REVERIFICATION_TRIGGERED appears on HCS topic (seq 3)
          → Watcher detects this message (within 60s poll)
          → runScheduledReverification() fires
          → REVERIFIED submitted to HCS (seq 4)
          → ScheduleTx_2 created (fires at T+2hr)

T+2hr   ScheduleTx_2 fires → REVERIFIED (seq 5) → ScheduleTx_3 created
         ... continues forever

If server goes down:
          → On restart, recoverMissedSchedules() detects overdue agents
          → Creates new schedule firing in 2 minutes
          → Chain resumes
```

---

## Key Hedera Docs

| Topic | URL |
|---|---|
| HCS Overview | https://docs.hedera.com/hedera/sdks-and-apis/sdks/consensus-service |
| Create Topic | https://docs.hedera.com/hedera/sdks-and-apis/sdks/consensus-service/create-a-topic |
| Submit Message | https://docs.hedera.com/hedera/sdks-and-apis/sdks/consensus-service/submit-a-message |
| Scheduled Transactions | https://docs.hedera.com/hedera/sdks-and-apis/sdks/schedule-transaction |
| Mirror Node REST API | https://docs.hedera.com/hedera/sdks-and-apis/rest-api#topics |
| HashScan Explorer | https://hashscan.io/testnet |
| Hedera Portal (get keys) | https://portal.hedera.com |
| SDK npm package | https://www.npmjs.com/package/@hashgraph/sdk |
