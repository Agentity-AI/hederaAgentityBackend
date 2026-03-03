// src/routes/auth.js
const express = require("express");
const router = express.Router();

const { supabaseAuth } = require("../config/supabase");
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

    const { data, error } = await supabaseAuth.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });

    if (error) return res.status(400).json({ message: error.message });

    // Note: if email confirmations are enabled in Supabase,
    // session may be null until user confirms.
    const jwt = data.session?.access_token;
    const user = data.user;

    if (!user) return res.status(500).json({ message: "User creation failed" });

    // If your Supabase project requires email confirmation, don't hard-fail here.
    // Return a helpful response instead.
    if (!jwt) {
      return res.status(201).json({
        email: user.email,
        name,
        jwt: null,
        dashboard: null,
        message: "Account created. Please confirm your email to receive a session token.",
      });
    }

    const dashboard = await buildDashboard(user);

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
    if (!email || !password) {
      return badRequest(res, "email and password are required");
    }

    const { data, error } = await supabaseAuth.auth.signInWithPassword({
      email,
      password,
    });

    if (error) return res.status(401).json({ message: error.message });

    const jwt = data.session?.access_token;
    const user = data.user;

    if (!jwt || !user) {
      return res.status(500).json({ message: "Failed to create session token" });
    }

    const name =
      user?.user_metadata?.name || user?.user_metadata?.full_name || "";

    const dashboard = await buildDashboard(user);

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