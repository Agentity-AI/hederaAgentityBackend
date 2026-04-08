const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildApiKeyArtifacts,
  buildUpdatedMetadata,
  normalizeSettingsMetadata,
} = require("../src/services/settings/settingsService");
const {
  ValidationError,
  requireEmail,
  requireHederaAccountId,
  requirePassword,
  requireUuid,
} = require("../src/utils/validation");

test("normalizeSettingsMetadata hydrates defaults and preserves saved preferences", () => {
  const result = normalizeSettingsMetadata({
    name: "Jane Developer",
    agentitySettings: {
      notifications: {
        emailAlerts: true,
      },
      security: {
        auditLogging: false,
      },
    },
  });

  assert.equal(result.profile.username, "Jane Developer");
  assert.equal(result.notifications.emailAlerts, true);
  assert.equal(result.notifications.criticalAlertsOnly, false);
  assert.equal(result.security.auditLogging, false);
  assert.equal(result.security.twoFactorEnabled, false);
});

test("buildUpdatedMetadata merges profile and keeps existing settings", () => {
  const result = buildUpdatedMetadata(
    {
      name: "Old Name",
      agentitySettings: {
        profile: { username: "Old Name", company: "Agentity Labs" },
        notifications: { emailAlerts: true },
      },
    },
    {
      profile: { username: "New Name" },
      security: { auditLogging: false },
    },
  );

  assert.equal(result.name, "New Name");
  assert.equal(result.agentitySettings.profile.company, "Agentity Labs");
  assert.equal(result.agentitySettings.notifications.emailAlerts, true);
  assert.equal(result.agentitySettings.security.auditLogging, false);
});

test("buildApiKeyArtifacts produces a stable preview and hash", () => {
  const result = buildApiKeyArtifacts("agty_live_1234567890abcdef");

  assert.match(result.keyHash, /^[0-9a-f]{64}$/);
  assert.equal(result.keyPrefix, "agty_live_12");
  assert.equal(result.keyPreview, "agty_live_12...cdef");
});

test("validation helpers reject malformed auth and wallet input", () => {
  assert.throws(() => requireEmail("not-an-email"), ValidationError);
  assert.throws(() => requirePassword("short"), ValidationError);
  assert.throws(() => requireUuid("1234", "agentId"), ValidationError);
  assert.throws(
    () => requireHederaAccountId("hedera-testnet", "hederaAccountId"),
    ValidationError,
  );
});

test("validation helpers accept expected auth and wallet input", () => {
  assert.equal(requireEmail("USER@mail.com"), "user@mail.com");
  assert.equal(requirePassword("Password123"), "Password123");
  assert.equal(
    requireUuid("123e4567-e89b-42d3-a456-426614174000", "agentId"),
    "123e4567-e89b-42d3-a456-426614174000",
  );
  assert.equal(
    requireHederaAccountId("0.0.8479610", "hederaAccountId"),
    "0.0.8479610",
  );
});
