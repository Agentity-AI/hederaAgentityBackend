const express = require("express");
const router = express.Router();

const { requireAuth } = require("../middleware/auth");
const { buildDashboard } = require("../services/dashboard/buildDashboard");

router.get("/overview", requireAuth, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const email = req.user.email;
    const name = req.user?.user_metadata?.name || req.user?.user_metadata?.full_name || "";

    const dashboard = await buildDashboard(userId, email, name);
    res.json(dashboard);
  } catch (err) {
    next(err);
  }
});

module.exports = router;