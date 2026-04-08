const express = require("express");
const router = express.Router();

const { requireAuth } = require("../middleware/auth");
const SmartContractAudit = require("../models/smartContractAudit");
const { analyzeSourceCode } = require("../services/audit/contractAuditService");
const { logEvent } = require("../services/audit/logEvent");
const { createAlert } = require("../services/alerts/alertService");
const {
  ValidationError,
  optionalUrl,
  requireString,
} = require("../utils/validation");

/**
 * @openapi
 * tags:
 *   - name: Audits
 *     description: Smart contract audit submission, history, and result inspection
 */

/**
 * @openapi
 * /audits:
 *   post:
 *     tags: [Audits]
 *     summary: Create and run a smart contract audit
 *     description: |
 *       Submits a smart contract for analysis using either pasted source code or a GitHub URL.
 *       The audit result is stored and can later be retrieved from `/audits/history` or `/audits/{id}`.
 *
 *       Frontend testing note:
 *       - use `sourceType: paste` with `sourceCode` for direct text audits
 *       - use `sourceType: github` with `githubUrl` for repository-based audits
 *       - high-risk and critical results may trigger alert creation
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [contractName, sourceType]
 *             properties:
 *               contractName:
 *                 type: string
 *                 example: "MyContract"
 *               sourceType:
 *                 type: string
 *                 enum: [paste, github]
 *               sourceCode:
 *                 type: string
 *                 example: "contract Vault { function withdraw() external {} }"
 *               githubUrl:
 *                 type: string
 *                 example: "https://github.com/example/protocol/blob/main/contracts/Vault.sol"
 *     responses:
 *       201:
 *         description: Audit completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 contractName:
 *                   type: string
 *                 riskLevel:
 *                   type: string
 *                   example: "medium"
 *                 consensusScore:
 *                   type: number
 *                   example: 82
 *                 status:
 *                   type: string
 *                   example: "completed"
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *                 findings:
 *                   type: array
 *                   items:
 *                     type: object
 *                     additionalProperties: true
 *                 summary:
 *                   type: string
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Audit execution failed
 */
router.post("/", requireAuth, async (req, res, next) => {
  try {
    const trimmedContractName = requireString(req.body?.contractName, "contractName", {
      min: 2,
      max: 120,
    });
    const trimmedSourceCode = req.body?.sourceCode
      ? requireString(req.body.sourceCode, "sourceCode", {
          min: 10,
          max: 50000,
        })
      : null;
    const trimmedGithubUrl = req.body?.githubUrl
      ? optionalUrl(req.body.githubUrl, "githubUrl")
      : null;
    const normalizedSourceType =
      typeof req.body?.sourceType === "string"
        ? req.body.sourceType.toLowerCase().trim()
        : "";

    if (!normalizedSourceType) {
      return res.status(400).json({ message: "sourceType is required" });
    }

    if (!["paste", "github"].includes(normalizedSourceType)) {
      return res
        .status(400)
        .json({ message: "sourceType must be 'paste' or 'github'" });
    }

    if (normalizedSourceType === "paste" && !trimmedSourceCode) {
      return res
        .status(400)
        .json({ message: "sourceCode is required for paste audits" });
    }

    if (normalizedSourceType === "github" && !trimmedGithubUrl) {
      return res
        .status(400)
        .json({ message: "githubUrl is required for github audits" });
    }

    const analysis = analyzeSourceCode(trimmedSourceCode || "", trimmedContractName);

    const audit = await SmartContractAudit.create({
      user_id: req.user.id,
      contract_name: trimmedContractName,
      source_type: normalizedSourceType,
      source_code: trimmedSourceCode || null,
      github_url: trimmedGithubUrl || null,
      risk_level: analysis.riskLevel,
      consensus_score: analysis.consensusScore,
      status: "completed",
      findings: analysis.findings,
      summary: analysis.summary,
      result_payload: analysis.resultPayload,
    });

    if (["high", "critical"].includes(String(audit.risk_level).toLowerCase())) {
      await createAlert({
        userId: req.user.id,
        title: "High-risk contract audit result",
        severity: audit.risk_level === "critical" ? "critical" : "high",
        type: "contract_audit",
        sourceId: audit.id,
        sourceType: "smart_contract_audit",
        message: `Audit for ${trimmedContractName} returned ${audit.risk_level} risk.`,
        metadata: {
          contractName: trimmedContractName,
          findings: audit.findings,
          consensusScore: audit.consensus_score,
        },
      });
    }

    await logEvent(req, {
      action: "contract_audit_create",
      payload: {
        auditId: audit.id,
        contractName: trimmedContractName,
        sourceType: normalizedSourceType,
        riskLevel: audit.risk_level,
      },
    });

    return res.status(201).json({
      id: audit.id,
      contractName: audit.contract_name,
      riskLevel: audit.risk_level,
      consensusScore: audit.consensus_score,
      status: audit.status,
      createdAt: audit.created_at,
      findings: audit.findings,
      summary: audit.summary,
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ message: error.message });
    }

    next(error);
  }
});

/**
 * @openapi
 * /audits/history:
 *   get:
 *     tags: [Audits]
 *     summary: Get audit history for authenticated user
 *     description: Returns recent audit jobs for the current user ordered from newest to oldest.
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Audit history
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       contractName:
 *                         type: string
 *                       riskLevel:
 *                         type: string
 *                       consensusScore:
 *                         type: number
 *                       status:
 *                         type: string
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Failed to load audit history
 */
router.get("/history", requireAuth, async (req, res, next) => {
  try {
    const audits = await SmartContractAudit.findAll({
      where: { user_id: req.user.id },
      order: [["created_at", "DESC"]],
      limit: 50,
    });

    return res.json({
      items: audits.map((audit) => ({
        id: audit.id,
        contractName: audit.contract_name,
        riskLevel: audit.risk_level,
        consensusScore: audit.consensus_score,
        status: audit.status,
        createdAt: audit.created_at,
      })),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /audits/{id}:
 *   get:
 *     tags: [Audits]
 *     summary: Get full audit result by id
 *     description: |
 *       Returns the full persisted audit payload for one audit owned by the authenticated user.
 *       This is the endpoint the frontend should use for audit detail pages and downloadable reports.
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Full audit result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 contractName:
 *                   type: string
 *                 sourceType:
 *                   type: string
 *                 sourceCode:
 *                   nullable: true
 *                   type: string
 *                 githubUrl:
 *                   nullable: true
 *                   type: string
 *                 riskLevel:
 *                   type: string
 *                 consensusScore:
 *                   type: number
 *                 status:
 *                   type: string
 *                 findings:
 *                   type: array
 *                   items:
 *                     type: object
 *                     additionalProperties: true
 *                 summary:
 *                   type: string
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *                 result:
 *                   type: object
 *                   additionalProperties: true
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Not found
 *       500:
 *         description: Failed to load audit details
 */
router.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const audit = await SmartContractAudit.findOne({
      where: {
        id: req.params.id,
        user_id: req.user.id,
      },
    });

    if (!audit) {
      return res.status(404).json({ message: "Audit not found" });
    }

    return res.json({
      id: audit.id,
      contractName: audit.contract_name,
      sourceType: audit.source_type,
      sourceCode: audit.source_code,
      githubUrl: audit.github_url,
      riskLevel: audit.risk_level,
      consensusScore: audit.consensus_score,
      status: audit.status,
      findings: audit.findings,
      summary: audit.summary,
      createdAt: audit.created_at,
      result: audit.result_payload,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
