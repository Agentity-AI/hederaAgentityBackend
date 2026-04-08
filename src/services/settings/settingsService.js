const crypto = require("crypto");
const UserApiKey = require("../../models/userApiKey");

const DEFAULT_SETTINGS = {
  profile: {
    username: "",
    company: "",
  },
  notifications: {
    emailAlerts: false,
    slackIntegration: false,
    webhookNotifications: false,
    criticalAlertsOnly: false,
    slackWebhookUrl: null,
    webhookUrl: null,
  },
  security: {
    twoFactorEnabled: false,
    automaticApiKeyRotation: false,
    auditLogging: true,
  },
};

function cloneDefaults() {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
}

function normalizeSettingsMetadata(userMetadata = {}) {
  const defaults = cloneDefaults();
  const raw = userMetadata.agentitySettings || {};

  return {
    profile: {
      username:
        raw?.profile?.username ||
        userMetadata.name ||
        userMetadata.full_name ||
        defaults.profile.username,
      company:
        raw?.profile?.company ||
        userMetadata.company ||
        defaults.profile.company,
    },
    notifications: {
      ...defaults.notifications,
      ...(raw.notifications || {}),
    },
    security: {
      ...defaults.security,
      ...(raw.security || {}),
    },
  };
}

function buildSettingsResponse(user, options = {}) {
  const metadata = normalizeSettingsMetadata(user?.user_metadata || {});

  return {
    profile: {
      username: metadata.profile.username,
      email: user?.email || null,
      company: metadata.profile.company,
    },
    notifications: metadata.notifications,
    security: {
      ...metadata.security,
      apiKeyPreview: options.apiKeyPreview || null,
      apiKeyLastRotatedAt: options.apiKeyLastRotatedAt || null,
      hasActiveApiKey: Boolean(options.apiKeyPreview),
    },
  };
}

async function getActiveApiKeyForUser(userId) {
  return UserApiKey.findOne({
    where: {
      user_id: userId,
      status: "active",
    },
    order: [["updated_at", "DESC"]],
  });
}

async function buildSettingsPayload(user) {
  const activeApiKey = await getActiveApiKeyForUser(user.id);

  return buildSettingsResponse(user, {
    apiKeyPreview: activeApiKey?.key_preview || null,
    apiKeyLastRotatedAt: activeApiKey?.updated_at || null,
  });
}

function mergeSettings(userMetadata = {}, patch = {}) {
  const current = normalizeSettingsMetadata(userMetadata);

  return {
    ...current,
    ...patch,
    profile: {
      ...current.profile,
      ...(patch.profile || {}),
    },
    notifications: {
      ...current.notifications,
      ...(patch.notifications || {}),
    },
    security: {
      ...current.security,
      ...(patch.security || {}),
    },
  };
}

function buildUpdatedMetadata(userMetadata = {}, patch = {}) {
  const mergedSettings = mergeSettings(userMetadata, patch);

  return {
    ...userMetadata,
    name: mergedSettings.profile.username,
    agentitySettings: mergedSettings,
  };
}

function createApiKeySecret() {
  const token = crypto.randomBytes(24).toString("hex");
  return `agty_live_${token}`;
}

function buildApiKeyArtifacts(secret) {
  const keyHash = crypto.createHash("sha256").update(secret).digest("hex");
  const keyPrefix = secret.slice(0, 12);
  const keyPreview = `${keyPrefix}...${secret.slice(-4)}`;

  return {
    keyHash,
    keyPrefix,
    keyPreview,
  };
}

module.exports = {
  buildApiKeyArtifacts,
  buildSettingsPayload,
  buildUpdatedMetadata,
  createApiKeySecret,
  normalizeSettingsMetadata,
};
