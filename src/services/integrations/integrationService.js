const crypto = require("crypto");

const Agent = require("../../models/agent");
const AgentWallet = require("../../models/agentWallet");
const UserApiKey = require("../../models/userApiKey");
const {
  buildApiKeyArtifacts,
  createApiKeySecret,
} = require("../settings/settingsService");

const DEFAULT_EMBED_CONFIG = {
  agentId: null,
  allowedOrigins: [],
  theme: "system",
  defaultTaskType: "execution",
  webhookUrl: null,
  publicClientKey: null,
};

const SNIPPET_TYPES = ["javascript", "react", "html", "curl"];

function getBaseUrl() {
  return (
    process.env.PUBLIC_API_BASE_URL ||
    process.env.API_BASE_URL ||
    "https://hederaagentitybackend.onrender.com"
  );
}

function createPublicClientKey() {
  return `agty_pub_${crypto.randomBytes(12).toString("hex")}`;
}

function normalizeEmbedConfig(config = {}) {
  return {
    ...DEFAULT_EMBED_CONFIG,
    ...(config || {}),
    allowedOrigins: Array.isArray(config.allowedOrigins)
      ? config.allowedOrigins
      : [],
  };
}

function buildIntegrationMetadata(userMetadata = {}, patch = {}) {
  const current = userMetadata.agentityIntegration || {};
  const currentEmbedConfig = normalizeEmbedConfig(current.embedConfig);
  const nextEmbedConfig = normalizeEmbedConfig({
    ...currentEmbedConfig,
    ...(patch.embedConfig || {}),
  });

  if (!nextEmbedConfig.publicClientKey) {
    nextEmbedConfig.publicClientKey = createPublicClientKey();
  }

  return {
    ...userMetadata,
    agentityIntegration: {
      ...current,
      ...patch,
      embedConfig: nextEmbedConfig,
    },
  };
}

async function getActiveApiKeyForUser(userId) {
  return UserApiKey.findOne({
    where: { user_id: userId, status: "active" },
    order: [["updated_at", "DESC"]],
  });
}

async function getLatestAgentForUser(userId) {
  return Agent.findOne({
    where: { creator_id: userId },
    order: [["updatedAt", "DESC"]],
  });
}

async function buildAgentStatus(agent) {
  if (!agent) return null;

  const wallet = await AgentWallet.findOne({
    where: { agent_id: agent.id, status: "linked" },
  });

  return {
    id: agent.id,
    name: agent.agent_name,
    status: agent.status,
    fingerprint: agent.fingerprint,
    publicKey: agent.public_key,
    hasWallet: Boolean(wallet),
    hederaAccountId: wallet?.hedera_account_id || null,
    hasKmsKey: Boolean(wallet?.kms_key_id),
  };
}

async function buildIntegrationOverview(user) {
  const [agentCount, verifiedAgentCount, activeApiKey, latestAgent] =
    await Promise.all([
      Agent.count({ where: { creator_id: user.id } }),
      Agent.count({ where: { creator_id: user.id, status: "verified" } }),
      getActiveApiKeyForUser(user.id),
      getLatestAgentForUser(user.id),
    ]);

  const embedConfig = normalizeEmbedConfig(
    user?.user_metadata?.agentityIntegration?.embedConfig,
  );
  const agent = await buildAgentStatus(latestAgent);

  return {
    baseUrl: getBaseUrl(),
    hasAgent: agentCount > 0,
    hasVerifiedAgent: verifiedAgentCount > 0,
    hasApiKey: Boolean(activeApiKey),
    agent,
    apiKey: activeApiKey
      ? {
          id: activeApiKey.id,
          preview: activeApiKey.key_preview,
          createdAt: activeApiKey.created_at || activeApiKey.createdAt,
          lastUsedAt: activeApiKey.last_used_at || activeApiKey.lastUsedAt,
        }
      : null,
    embedConfig,
    snippetTypes: SNIPPET_TYPES,
    nextSteps: [
      {
        id: "register-agent",
        label: "Register an agent",
        completed: agentCount > 0,
      },
      {
        id: "verify-agent",
        label: "Verify the agent",
        completed: verifiedAgentCount > 0,
      },
      {
        id: "generate-api-key",
        label: "Generate an API key",
        completed: Boolean(activeApiKey),
      },
      {
        id: "copy-snippet",
        label: "Copy an integration snippet",
        completed: Boolean(activeApiKey && agent),
      },
    ],
  };
}

async function createIntegrationApiKey(userId) {
  const secret = createApiKeySecret();
  const { keyHash, keyPrefix, keyPreview } = buildApiKeyArtifacts(secret);

  await UserApiKey.update(
    { status: "revoked", revoked_at: new Date() },
    { where: { user_id: userId, status: "active" } },
  );

  const record = await UserApiKey.create({
    user_id: userId,
    key_hash: keyHash,
    key_prefix: keyPrefix,
    key_preview: keyPreview,
    status: "active",
  });

  return {
    apiKey: secret,
    key: {
      id: record.id,
      preview: record.key_preview,
      createdAt: record.created_at || record.createdAt,
    },
  };
}

async function assertOwnedAgent(agentId, userId) {
  if (!agentId) return null;

  const agent = await Agent.findOne({
    where: { id: agentId, creator_id: userId },
  });

  if (!agent) {
    const error = new Error("Agent not found for this user");
    error.status = 404;
    throw error;
  }

  return agent;
}

async function findSnippetAgent({ userId, requestedAgentId, configuredAgentId }) {
  if (requestedAgentId) {
    return assertOwnedAgent(requestedAgentId, userId);
  }

  if (configuredAgentId) {
    const configured = await Agent.findOne({
      where: { id: configuredAgentId, creator_id: userId },
    });
    if (configured) return configured;
  }

  return getLatestAgentForUser(userId);
}

function buildJavascriptSnippet({ baseUrl, agentId }) {
  return `const response = await fetch("${baseUrl}/tasks/request", {
  method: "POST",
  headers: {
    "Authorization": "Bearer YOUR_AGENTITY_API_KEY",
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    agentId: "${agentId || "YOUR_AGENT_ID"}",
    taskType: "execution",
    inputPayload: {
      target: "swap",
      network: "hedera-testnet"
    }
  })
});

const task = await response.json();
console.log(task);`;
}

function buildReactSnippet({ agentId, publicClientKey }) {
  return `import { useState } from "react";

export function AgentityActionButton() {
  const [loading, setLoading] = useState(false);

  async function requestAgentTask() {
    setLoading(true);
    try {
      await window.Agentity?.requestTask({
        agentId: "${agentId || "YOUR_AGENT_ID"}",
        publicClientKey: "${publicClientKey || "YOUR_PUBLIC_CLIENT_KEY"}",
        taskType: "execution",
        inputPayload: { target: "swap" }
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <button onClick={requestAgentTask} disabled={loading}>
      {loading ? "Working..." : "Run with Agentity"}
    </button>
  );
}`;
}

function buildHtmlSnippet({ agentId, publicClientKey }) {
  return `<script
  src="https://cdn.agentity.ai/widget.js"
  data-agent-id="${agentId || "YOUR_AGENT_ID"}"
  data-public-client-key="${publicClientKey || "YOUR_PUBLIC_CLIENT_KEY"}"
  data-task-type="execution">
</script>`;
}

function buildCurlSnippet({ baseUrl, agentId }) {
  return `curl -X POST "${baseUrl}/tasks/request" \\
  -H "Authorization: Bearer YOUR_AGENTITY_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "agentId": "${agentId || "YOUR_AGENT_ID"}",
    "taskType": "execution",
    "inputPayload": {
      "target": "swap",
      "network": "hedera-testnet"
    }
  }'`;
}

function buildSnippet({ type, agent, activeApiKey, embedConfig }) {
  const baseUrl = getBaseUrl();
  const agentId = agent?.id || embedConfig.agentId || null;
  const publicClientKey = embedConfig.publicClientKey || null;
  const apiKeyPreview = activeApiKey?.key_preview || null;
  const builders = {
    javascript: buildJavascriptSnippet,
    react: buildReactSnippet,
    html: buildHtmlSnippet,
    curl: buildCurlSnippet,
  };

  return {
    type,
    language: type === "curl" ? "bash" : type,
    code: builders[type]({
      baseUrl,
      agentId,
      publicClientKey,
    }),
    variables: {
      baseUrl,
      agentId,
      apiKeyPreview,
      publicClientKey,
    },
    warnings: [
      !activeApiKey
        ? "Generate an API key before using server-side snippets."
        : null,
      !agent ? "Register an agent before using this snippet." : null,
    ].filter(Boolean),
  };
}

async function buildIntegrationSnippet({ user, type, agentId }) {
  if (!SNIPPET_TYPES.includes(type)) {
    const error = new Error(`type must be one of: ${SNIPPET_TYPES.join(", ")}`);
    error.status = 400;
    throw error;
  }

  const embedConfig = normalizeEmbedConfig(
    user?.user_metadata?.agentityIntegration?.embedConfig,
  );

  const [agent, activeApiKey] = await Promise.all([
    findSnippetAgent({
      userId: user.id,
      requestedAgentId: agentId,
      configuredAgentId: embedConfig.agentId,
    }),
    getActiveApiKeyForUser(user.id),
  ]);

  return buildSnippet({ type, agent, activeApiKey, embedConfig });
}

module.exports = {
  buildIntegrationMetadata,
  buildIntegrationOverview,
  buildIntegrationSnippet,
  createIntegrationApiKey,
  normalizeEmbedConfig,
};
