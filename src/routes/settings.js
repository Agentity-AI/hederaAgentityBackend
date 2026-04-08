const express = require("express");

const router = express.Router();

const { supabaseAdmin } = require("../config/supabase");
const UserApiKey = require("../models/userApiKey");
const { requireAuth } = require("../middleware/auth");
const { logEvent } = require("../services/audit/logEvent");
const {
  buildApiKeyArtifacts,
  buildSettingsPayload,
  buildUpdatedMetadata,
  createApiKeySecret,
} = require("../services/settings/settingsService");
const {
  ValidationError,
  optionalBoolean,
  optionalUrl,
  requireString,
} = require("../utils/validation");

async function loadCurrentUser(userId) {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (error || !data?.user) {
    const err = new Error(error?.message || "Unable to load user settings");
    err.status = 500;
    throw err;
  }

  return data.user;
}

async function persistUserMetadata(userId, userMetadata) {
  const { data, error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    user_metadata: userMetadata,
  });

  if (error || !data?.user) {
    const err = new Error(error?.message || "Unable to save user settings");
    err.status = 500;
    throw err;
  }

  return data.user;
}

function buildProfilePatch(body = {}) {
  const username = requireString(body.username, "username", {
    min: 2,
    max: 80,
  });

  return {
    profile: {
      username,
    },
  };
}

function buildNotificationPatch(body = {}) {
  return {
    notifications: {
      emailAlerts: optionalBoolean(body.emailAlerts, "emailAlerts"),
      slackIntegration: optionalBoolean(body.slackIntegration, "slackIntegration"),
      webhookNotifications: optionalBoolean(
        body.webhookNotifications,
        "webhookNotifications",
      ),
      criticalAlertsOnly: optionalBoolean(
        body.criticalAlertsOnly,
        "criticalAlertsOnly",
      ),
      slackWebhookUrl: optionalUrl(body.slackWebhookUrl, "slackWebhookUrl"),
      webhookUrl: optionalUrl(body.webhookUrl, "webhookUrl"),
    },
  };
}

function buildSecurityPatch(body = {}) {
  return {
    security: {
      twoFactorEnabled: optionalBoolean(
        body.twoFactorEnabled,
        "twoFactorEnabled",
      ),
      automaticApiKeyRotation: optionalBoolean(
        body.automaticApiKeyRotation,
        "automaticApiKeyRotation",
      ),
      auditLogging: optionalBoolean(body.auditLogging, "auditLogging"),
    },
  };
}

function stripNullishValues(object) {
  return Object.fromEntries(
    Object.entries(object).filter(([, value]) => value !== null),
  );
}

async function updateSettingsSection(req, res, patchBuilder, action, payloadLabel) {
  const currentUser = await loadCurrentUser(req.user.id);
  const patch = patchBuilder(req.body || {});
  const normalizedPatch = Object.fromEntries(
    Object.entries(patch).map(([key, value]) => [key, stripNullishValues(value)]),
  );
  const nextMetadata = buildUpdatedMetadata(
    currentUser.user_metadata || {},
    normalizedPatch,
  );
  const updatedUser = await persistUserMetadata(req.user.id, nextMetadata);

  await logEvent(req, {
    action,
    payload: {
      [payloadLabel]: normalizedPatch,
    },
  });

  return res.json(await buildSettingsPayload(updatedUser));
}

/**
 * @openapi
 * tags:
 *   - name: Settings
 *     description: Account profile, notification, and security preferences for the authenticated user
 */

/**
 * @openapi
 * /settings:
 *   get:
 *     tags: [Settings]
 *     summary: Get settings for the authenticated user
 *     description: Returns all data needed to render the Settings screen, including profile, notification preferences, and security toggles.
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Settings payload
 *       401:
 *         description: Unauthorized
 */
router.get("/", requireAuth, async (req, res, next) => {
  try {
    const currentUser = await loadCurrentUser(req.user.id);
    return res.json(await buildSettingsPayload(currentUser));
  } catch (error) {
    return next(error);
  }
});

/**
 * @openapi
 * /settings/profile:
 *   patch:
 *     tags: [Settings]
 *     summary: Update profile settings
 *     description: |
 *       Updates the editable profile data for the authenticated user.
 *       At the moment, the frontend should only allow changing `username`.
 *       `email` and `company` remain read-only in this API contract.
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username]
 *             properties:
 *               username:
 *                 type: string
 *                 example: "John Developer"
 *     responses:
 *       200:
 *         description: Updated settings payload
 *       400:
 *         description: Invalid username
 *       401:
 *         description: Unauthorized
 */
router.patch("/profile", requireAuth, async (req, res, next) => {
  try {
    return await updateSettingsSection(
      req,
      res,
      buildProfilePatch,
      "settings_profile_update",
      "profile",
    );
  } catch (error) {
    return next(error);
  }
});

/**
 * @openapi
 * /settings/notifications:
 *   patch:
 *     tags: [Settings]
 *     summary: Update notification preferences
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               emailAlerts:
 *                 type: boolean
 *               slackIntegration:
 *                 type: boolean
 *               webhookNotifications:
 *                 type: boolean
 *               criticalAlertsOnly:
 *                 type: boolean
 *               slackWebhookUrl:
 *                 type: string
 *                 example: "https://hooks.slack.com/services/..."
 *               webhookUrl:
 *                 type: string
 *                 example: "https://example.com/webhooks/agentity"
 *     responses:
 *       200:
 *         description: Updated settings payload
 *       400:
 *         description: Invalid notification settings payload
 *       401:
 *         description: Unauthorized
 */
router.patch("/notifications", requireAuth, async (req, res, next) => {
  try {
    return await updateSettingsSection(
      req,
      res,
      buildNotificationPatch,
      "settings_notifications_update",
      "notifications",
    );
  } catch (error) {
    return next(error);
  }
});

/**
 * @openapi
 * /settings/security:
 *   patch:
 *     tags: [Settings]
 *     summary: Update security settings
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               twoFactorEnabled:
 *                 type: boolean
 *               automaticApiKeyRotation:
 *                 type: boolean
 *               auditLogging:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Updated settings payload
 *       400:
 *         description: Invalid security settings payload
 *       401:
 *         description: Unauthorized
 */
router.patch("/security", requireAuth, async (req, res, next) => {
  try {
    return await updateSettingsSection(
      req,
      res,
      buildSecurityPatch,
      "settings_security_update",
      "security",
    );
  } catch (error) {
    return next(error);
  }
});

/**
 * @openapi
 * /settings/security/api-key/regenerate:
 *   post:
 *     tags: [Settings]
 *     summary: Regenerate the user's API key
 *     description: |
 *       Revokes any previous active key for the authenticated user, generates a new key,
 *       stores only its hash in the database, and returns the plaintext once.
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: API key regenerated
 *       401:
 *         description: Unauthorized
 */
router.post("/security/api-key/regenerate", requireAuth, async (req, res, next) => {
  try {
    const currentUser = await loadCurrentUser(req.user.id);
    const secret = createApiKeySecret();
    const { keyHash, keyPrefix, keyPreview } = buildApiKeyArtifacts(secret);

    await UserApiKey.update(
      {
        status: "revoked",
        revoked_at: new Date(),
      },
      {
        where: {
          user_id: req.user.id,
          status: "active",
        },
      },
    );

    await UserApiKey.create({
      user_id: req.user.id,
      key_hash: keyHash,
      key_prefix: keyPrefix,
      key_preview: keyPreview,
      status: "active",
    });

    await logEvent(req, {
      action: "settings_api_key_regenerate",
      payload: {
        keyPreview,
      },
    });

    return res.json({
      message: "API key regenerated successfully. Store it now because it is only returned once.",
      apiKey: secret,
      settings: await buildSettingsPayload(currentUser),
    });
  } catch (error) {
    return next(error);
  }
});

router.use((error, req, res, next) => {
  if (error instanceof ValidationError) {
    return res.status(400).json({ message: error.message });
  }

  return next(error);
});

module.exports = router;
