const express = require("express");
const { Op } = require("sequelize");

const router = express.Router();

const sequelize = require("../config/database");
const { supabaseAdmin } = require("../config/supabase");
const Agent = require("../models/agent");
const AgentBehaviorLog = require("../models/agentBehaviorLog");
const AgentHcsMessage = require("../models/agentHcsMessage");
const AgentHcsRegistry = require("../models/agentHcsRegistry");
const AgentMetadata = require("../models/agentMetadata");
const AgentReputation = require("../models/agentReputation");
const AgentWallet = require("../models/agentWallet");
const Alert = require("../models/alert");
const KmsAuditLog = require("../models/kmsAuditLog");
const PaymentRecord = require("../models/paymentRecord");
const SimulationRun = require("../models/simulationRun");
const SmartContractAudit = require("../models/smartContractAudit");
const TaskExecution = require("../models/taskExecution");
const TransactionPolicy = require("../models/transactionPolicy");
const TransactionRecord = require("../models/transactionRecord");
const UserAgentEvent = require("../models/userAgentEvent");
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
  const allowedFields = ["username"];
  const unexpectedFields = Object.keys(body).filter(
    (key) => !allowedFields.includes(key),
  );

  if (unexpectedFields.length > 0) {
    throw new ValidationError(
      `Only username can be updated in profile settings`,
    );
  }

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

async function deleteUserData(userId) {
  const transaction = await sequelize.transaction();

  try {
    const ownedAgents = await Agent.findAll({
      where: { creator_id: userId },
      attributes: ["id"],
      transaction,
    });
    const agentIds = ownedAgents.map((agent) => agent.id);

    await Promise.all([
      UserAgentEvent.destroy({ where: { user_id: userId }, transaction }),
      UserApiKey.destroy({ where: { user_id: userId }, transaction }),
      SmartContractAudit.destroy({ where: { user_id: userId }, transaction }),
      SimulationRun.destroy({ where: { user_id: userId }, transaction }),
      TaskExecution.destroy({
        where: { requester_user_id: userId },
        transaction,
      }),
      PaymentRecord.destroy({
        where: { from_user_id: userId },
        transaction,
      }),
      TransactionRecord.destroy({ where: { user_id: userId }, transaction }),
      TransactionPolicy.destroy({ where: { user_id: userId }, transaction }),
      Alert.destroy({ where: { user_id: userId }, transaction }),
      KmsAuditLog.destroy({ where: { user_id: userId }, transaction }),
    ]);

    if (agentIds.length > 0) {
      const whereAgents = {
        agent_id: {
          [Op.in]: agentIds,
        },
      };

      await Promise.all([
        AgentBehaviorLog.destroy({ where: whereAgents, transaction }),
        AgentHcsMessage.destroy({ where: whereAgents, transaction }),
        AgentHcsRegistry.destroy({ where: whereAgents, transaction }),
        AgentMetadata.destroy({ where: whereAgents, transaction }),
        AgentReputation.destroy({ where: whereAgents, transaction }),
        AgentWallet.destroy({ where: whereAgents, transaction }),
        Alert.destroy({ where: whereAgents, transaction }),
        SimulationRun.destroy({ where: whereAgents, transaction }),
        TaskExecution.destroy({ where: whereAgents, transaction }),
        PaymentRecord.destroy({
          where: {
            to_agent_id: {
              [Op.in]: agentIds,
            },
          },
          transaction,
        }),
        TransactionRecord.destroy({ where: whereAgents, transaction }),
      ]);

      await Agent.destroy({
        where: {
          id: {
            [Op.in]: agentIds,
          },
        },
        transaction,
      });
    }

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
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
 *       `email` remains read-only in this API contract.
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
 * /settings/account:
 *   delete:
 *     tags: [Settings]
 *     summary: Permanently delete the authenticated user's account
 *     description: |
 *       Danger-zone endpoint for permanent account deletion.
 *       This removes the authenticated user's local backend data and then deletes the Supabase auth user.
 *
 *       Frontend safety note:
 *       - require an explicit confirmation input before calling this route
 *       - send `confirmText: DELETE`
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [confirmText]
 *             properties:
 *               confirmText:
 *                 type: string
 *                 example: "DELETE"
 *     responses:
 *       200:
 *         description: Account deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Account deleted successfully"
 *       400:
 *         description: Missing or invalid confirmation text
 *       401:
 *         description: Unauthorized
 *       502:
 *         description: Local data was removed but upstream auth deletion failed
 */
router.delete("/account", requireAuth, async (req, res, next) => {
  try {
    const confirmText = requireString(req.body?.confirmText, "confirmText", {
      min: 6,
      max: 20,
    });

    if (confirmText !== "DELETE") {
      return res.status(400).json({
        message: "confirmText must be exactly DELETE",
      });
    }

    const currentUser = await loadCurrentUser(req.user.id);

    await logEvent(req, {
      action: "settings_account_delete_requested",
      payload: {
        email: currentUser.email,
      },
    });

    await deleteUserData(req.user.id);

    const { error } = await supabaseAdmin.auth.admin.deleteUser(req.user.id);

    if (error) {
      return res.status(502).json({
        message:
          "Account data was deleted locally, but auth deletion failed. Please contact support to complete account removal.",
      });
    }

    res.clearCookie("agentity_jwt", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      path: "/",
    });

    return res.json({
      success: true,
      message: "Account deleted successfully",
    });
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
