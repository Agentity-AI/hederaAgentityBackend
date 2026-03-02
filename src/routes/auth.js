const express = require("express");
const router = express.Router();

const { supabaseAdmin, supabaseAuth } = require("../config/supabase");
const { buildDashboard } = require("../services/dashboard/buildDashboard");

function badRequest(res, message) {
  return res.status(400).json({ message });
}

router.post("/register", async (req, res, next) => {
  try {
    const { email, password, name } = req.body || {};

    if (!email || !password || !name) {
      return badRequest(res, "email, password, and name are required");
    }

    // Create user (admin) so we can avoid email confirmation blocking session issuance
    const { data: created, error: createErr } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name },
      });

    if (createErr) return res.status(400).json({ message: createErr.message });

    // Sign in to get JWT (Supabase access_token)
    const { data: signedIn, error: signInErr } =
      await supabaseAuth.auth.signInWithPassword({
        email,
        password,
      });

    if (signInErr) return res.status(400).json({ message: signInErr.message });

    const jwt = signedIn.session?.access_token;
    const user = signedIn.user;

    if (!jwt || !user)
      return res
        .status(500)
        .json({ message: "Failed to create session token" });

    const dashboard = await buildDashboard(user.id, user.email, name);

    // Dashboard DTO
    return res.status(201).json({
      email: user.email,
      name,
      jwt,
      dashboard,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password)
      return badRequest(res, "email and password are required");

    const { data, error } = await supabaseAuth.auth.signInWithPassword({
      email,
      password,
    });
    if (error) return res.status(401).json({ message: error.message });

    const jwt = data.session?.access_token;
    const user = data.user;

    const name =
      user?.user_metadata?.name || user?.user_metadata?.full_name || "";

    if (!jwt || !user)
      return res
        .status(500)
        .json({ message: "Failed to create session token" });

    const dashboard = await buildDashboard(user.id, user.email, name);

    return res.json({
      email: user.email,
      name,
      jwt,
      dashboard,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
