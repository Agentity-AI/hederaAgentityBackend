const express = require("express");

const router = express.Router();

const { supabaseAdmin } = require("../config/supabase");
const { requireAuth } = require("../middleware/auth");
const { logEvent } = require("../services/audit/logEvent");
const {
  buildIntegrationMetadata,
  buildIntegrationOverview,
  buildIntegrationSnippet,
  createIntegrationApiKey,
  normalizeEmbedConfig,
} = require("../services/integrations/integrationService");
const {
  ValidationError,
  optionalEnum,
  optionalString,
  optionalUrl,
  requireUuid,
} = require("../utils/validation");

const THEMES = ["light", "dark", "system"];
const SNIPPET_TYPES = ["javascript", "react", "html", "curl"];

async function loadCurrentUser(userId) {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (error || !data?.user) {
    const err = new Error(error?.message || "Unable to load integration settings");
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
    const err = new Error(error?.message || "Unable to save integration settings");
    err.status = 500;
    throw err;
  }

  return data.user;
}

function optionalOriginList(value) {
  if (value == null) return null;

  if (!Array.isArray(value)) {
    throw new ValidationError("allowedOrigins must be an array of origins");
  }

  return value.map((item, index) => {
    const origin = optionalString(item, `allowedOrigins[${index}]`, {
      max: 255,
    });

    if (!origin) {
      throw new ValidationError(`allowedOrigins[${index}] is required`);
    }

    try {
      const url = new URL(origin);
      if (!["http:", "https:"].includes(url.protocol)) {
        throw new Error("Invalid protocol");
      }
      return url.origin;
    } catch {
      throw new ValidationError(
        `allowedOrigins[${index}] must be a valid http or https origin`,
      );
    }
  });
}

function buildEmbedPatch(body = {}, currentConfig = {}) {
  const patch = {};

  if (body.agentId !== undefined) {
    patch.agentId = body.agentId ? requireUuid(body.agentId, "agentId") : null;
  }

  if (body.allowedOrigins !== undefined) {
    patch.allowedOrigins = optionalOriginList(body.allowedOrigins) || [];
  }

  if (body.theme !== undefined) {
    patch.theme = optionalEnum(body.theme, "theme", THEMES) || "system";
  }

  if (body.defaultTaskType !== undefined) {
    patch.defaultTaskType =
      optionalString(body.defaultTaskType, "defaultTaskType", {
        max: 80,
      }) || "execution";
  }

  if (body.webhookUrl !== undefined) {
    patch.webhookUrl = optionalUrl(body.webhookUrl, "webhookUrl");
  }

  return normalizeEmbedConfig({
    ...currentConfig,
    ...patch,
  });
}

/**
 * @openapi
 * tags:
 *   - name: Integrations
 *     description: Backend-driven embed, SDK, and API-key onboarding flow for frontend integration screens
 */

/**
 * @openapi
 * /integrations/overview:
 *   get:
 *     tags: [Integrations]
 *     summary: Get the authenticated user's integration onboarding state
 *     description: |
 *       Returns the current state needed to render an embeddable integration setup screen.
 *       Use this endpoint to decide which checklist items are complete, which agent to show,
 *       whether an API key exists, and which snippet types the UI can offer.
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Integration overview
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 baseUrl:
 *                   type: string
 *                   example: "https://hederaagentitybackend.onrender.com"
 *                 hasAgent:
 *                   type: boolean
 *                 hasVerifiedAgent:
 *                   type: boolean
 *                 hasApiKey:
 *                   type: boolean
 *                 agent:
 *                   nullable: true
 *                   type: object
 *                   additionalProperties: true
 *                 apiKey:
 *                   nullable: true
 *                   type: object
 *                   properties:
 *                     preview:
 *                       type: string
 *                       example: "agty_live_12...abcd"
 *                 embedConfig:
 *                   type: object
 *                   additionalProperties: true
 *                 snippetTypes:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["javascript", "react", "html", "curl"]
 *                 nextSteps:
 *                   type: array
 *                   items:
 *                     type: object
 *       401:
 *         description: Unauthorized
 */
router.get("/overview", requireAuth, async (req, res, next) => {
  try {
    const currentUser = await loadCurrentUser(req.user.id);
    const currentConfig = normalizeEmbedConfig(
      currentUser.user_metadata?.agentityIntegration?.embedConfig,
    );
    const user = currentConfig.publicClientKey
      ? currentUser
      : await persistUserMetadata(
          req.user.id,
          buildIntegrationMetadata(currentUser.user_metadata || {}),
        );

    return res.json(await buildIntegrationOverview(user));
  } catch (error) {
    return next(error);
  }
});

/**
 * @openapi
 * /integrations/api-keys:
 *   post:
 *     tags: [Integrations]
 *     summary: Generate an integration API key
 *     description: |
 *       Revokes previous active API keys for the authenticated user, creates a new key,
 *       stores only a hash, and returns the plaintext key once. The frontend should show
 *       the key immediately and then rely on the preview from overview/settings later.
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       201:
 *         description: API key created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 apiKey:
 *                   type: string
 *                   example: "agty_live_..."
 *                 key:
 *                   type: object
 *                   additionalProperties: true
 *                 overview:
 *                   type: object
 *                   additionalProperties: true
 *       401:
 *         description: Unauthorized
 */
router.post("/api-keys", requireAuth, async (req, res, next) => {
  try {
    const currentUser = await loadCurrentUser(req.user.id);
    const metadata = buildIntegrationMetadata(currentUser.user_metadata || {});
    const user = await persistUserMetadata(req.user.id, metadata);
    const result = await createIntegrationApiKey(req.user.id);

    await logEvent(req, {
      action: "integration_api_key_create",
      payload: {
        keyPreview: result.key.preview,
      },
    });

    return res.status(201).json({
      message: "API key created successfully. Store it now because it is only returned once.",
      ...result,
      overview: await buildIntegrationOverview(user),
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * @openapi
 * /integrations/snippets:
 *   get:
 *     tags: [Integrations]
 *     summary: Get a ready-to-copy integration snippet
 *     description: |
 *       Generates a code snippet using the authenticated user's current agent,
 *       API key preview, base URL, and embed configuration.
 *
 *       Important:
 *       - server-side snippets include the API key preview only, not the full secret
 *       - the full API key is only returned once by `POST /integrations/api-keys`
 *       - if no agent or API key exists yet, the response includes warnings and placeholders
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         required: false
 *         schema:
 *           type: string
 *           enum: [javascript, react, html, curl]
 *           default: javascript
 *       - in: query
 *         name: agentId
 *         required: false
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Generated snippet
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 type:
 *                   type: string
 *                   example: "react"
 *                 language:
 *                   type: string
 *                   example: "react"
 *                 code:
 *                   type: string
 *                 variables:
 *                   type: object
 *                   additionalProperties: true
 *                 warnings:
 *                   type: array
 *                   items:
 *                     type: string
 *       400:
 *         description: Invalid snippet type or agent id
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Agent not found for authenticated user
 */
router.get("/snippets", requireAuth, async (req, res, next) => {
  try {
    const currentUser = await loadCurrentUser(req.user.id);
    const type =
      optionalEnum(req.query?.type || "javascript", "type", SNIPPET_TYPES) ||
      "javascript";
    const agentId = req.query?.agentId
      ? requireUuid(req.query.agentId, "agentId")
      : null;

    return res.json(
      await buildIntegrationSnippet({
        user: currentUser,
        type,
        agentId,
      }),
    );
  } catch (error) {
    return next(error);
  }
});

/**
 * @openapi
 * /integrations/embed-config:
 *   patch:
 *     tags: [Integrations]
 *     summary: Save embed/widget configuration
 *     description: |
 *       Saves frontend widget configuration in the authenticated user's metadata.
 *       This lets the frontend render a backend-driven embed flow while keeping the
 *       widget's public configuration separate from private API keys.
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
 *               agentId:
 *                 nullable: true
 *                 type: string
 *                 format: uuid
 *               allowedOrigins:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["https://example.com", "http://localhost:3000"]
 *               theme:
 *                 type: string
 *                 enum: [light, dark, system]
 *               defaultTaskType:
 *                 type: string
 *                 example: "execution"
 *               webhookUrl:
 *                 nullable: true
 *                 type: string
 *                 example: "https://example.com/api/agentity-webhook"
 *           examples:
 *             saveEmbedConfig:
 *               summary: Save widget configuration
 *               value:
 *                 agentId: "ac0d21d5-bb02-4d52-8004-4725488cf007"
 *                 allowedOrigins:
 *                   - "https://example.com"
 *                 theme: "system"
 *                 defaultTaskType: "execution"
 *                 webhookUrl: "https://example.com/api/agentity-webhook"
 *     responses:
 *       200:
 *         description: Updated integration overview
 *       400:
 *         description: Invalid embed configuration
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Agent not found for authenticated user
 */
router.patch("/embed-config", requireAuth, async (req, res, next) => {
  try {
    const currentUser = await loadCurrentUser(req.user.id);
    const currentConfig = normalizeEmbedConfig(
      currentUser.user_metadata?.agentityIntegration?.embedConfig,
    );
    const embedConfig = buildEmbedPatch(req.body || {}, currentConfig);

    if (embedConfig.agentId) {
      await buildIntegrationSnippet({
        user: currentUser,
        type: "javascript",
        agentId: embedConfig.agentId,
      });
    }

    const nextMetadata = buildIntegrationMetadata(currentUser.user_metadata || {}, {
      embedConfig,
    });
    const updatedUser = await persistUserMetadata(req.user.id, nextMetadata);

    await logEvent(req, {
      action: "integration_embed_config_update",
      payload: {
        embedConfig: {
          ...embedConfig,
          publicClientKey: embedConfig.publicClientKey ? "present" : null,
        },
      },
    });

    return res.json(await buildIntegrationOverview(updatedUser));
  } catch (error) {
    return next(error);
  }
});

router.use((error, req, res, next) => {
  if (error instanceof ValidationError) {
    return res.status(400).json({ message: error.message });
  }

  if (error.status) {
    return res.status(error.status).json({ message: error.message });
  }

  return next(error);
});

module.exports = router;
