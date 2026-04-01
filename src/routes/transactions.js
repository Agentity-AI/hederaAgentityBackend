const express = require("express");
const router = express.Router();

const { requireAuth } = require("../middleware/auth");
const {
  createPolicy,
  formatTransaction,
  getTransactionForUser,
  listPoliciesForUser,
  listTransactionsForUser,
} = require("../services/transactions/transactionService");

/**
 * @openapi
 * tags:
 *   - name: Transactions
 *     description: Unified transaction history and policy management
 */

router.get("/history", requireAuth, async (req, res, next) => {
  try {
    const items = await listTransactionsForUser(req.user.id);

    return res.json({
      total: items.length,
      items: items.map(formatTransaction),
    });
  } catch (error) {
    next(error);
  }
});

router.get("/policies", requireAuth, async (req, res, next) => {
  try {
    const items = await listPoliciesForUser(req.user.id);

    return res.json({
      total: items.length,
      items: items.map((policy) => ({
        id: policy.id,
        name: policy.name,
        description: policy.description,
        status: policy.status,
        rules: policy.rules,
        createdAt: policy.created_at,
        updatedAt: policy.updated_at,
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/policies", requireAuth, async (req, res, next) => {
  try {
    const { name, description, rules, status } = req.body || {};

    if (!name) {
      return res.status(400).json({ message: "name is required" });
    }

    const policy = await createPolicy({
      userId: req.user.id,
      name: String(name).trim(),
      description: description ? String(description).trim() : null,
      rules: rules && typeof rules === "object" ? rules : {},
      status:
        status && ["active", "disabled"].includes(String(status).trim().toLowerCase())
          ? String(status).trim().toLowerCase()
          : "active",
    });

    return res.status(201).json({
      id: policy.id,
      name: policy.name,
      description: policy.description,
      status: policy.status,
      rules: policy.rules,
      createdAt: policy.created_at,
      updatedAt: policy.updated_at,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const transaction = await getTransactionForUser(req.params.id, req.user.id);

    if (!transaction) {
      return res.status(404).json({ message: "Transaction not found" });
    }

    return res.json(formatTransaction(transaction));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
