const express = require("express");
const router = express.Router();

const { supabaseAdmin, supabaseAuth } = require("../config/supabase");
const { buildDashboard } = require("../services/dashboard/buildDashboard");

function badRequest(res, message) {
  return res.status(400).json({ message });
}

function setAuthCookie(res, jwt) {
  const isProd = process.env.NODE_ENV === "production";

  res.cookie("agentity_jwt", jwt, {
    httpOnly: true,
    secure: isProd, // Render is HTTPS => true in production
    sameSite: isProd ? "none" : "lax", // cross-site cookie for Render + separate frontend domain
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: "/",
  });
}

/**
 * @openapi
 * tags:
 *   - name: Auth
 *     description: Supabase Auth (sets httpOnly cookie agentity_jwt)
 */

/**
 * @openapi
 * /auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register user (sets cookie + returns dashboard DTO)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, name]
 *             properties:
 *               email: { type: string, example: "user@mail.com" }
 *               password: { type: string, example: "Password123!" }
 *               name: { type: string, example: "John Doe" }
 *     responses:
 *       201:
 *         description: Created
 *       400:
 *         description: Bad request
 *       401:
 *         description: Invalid credentials
 *
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login user (sets cookie + returns dashboard DTO)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, example: "user@mail.com" }
 *               password: { type: string, example: "Password123!" }
 *     responses:
 *       200:
 *         description: OK
 *       400:
 *         description: Bad request
 *       401:
 *         description: Invalid credentials
 */

router.post("/register", async (req, res, next) => {
  try {
    const { email, password, name } = req.body || {};
    if (!email || !password || !name) {
      return badRequest(res, "email, password, and name are required");
    }

    // Create user with confirmed email to allow immediate session issuance
    const { data: created, error: createErr } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name },
      });

    // If user exists, treat it as idempotent and attempt login
    if (createErr) {
      const msg = (createErr.message || "").toLowerCase();
      const already =
        msg.includes("already") ||
        msg.includes("registered") ||
        msg.includes("exists");

      if (!already) {
        return res.status(400).json({ message: createErr.message });
      }
    }

    const { data: signedIn, error: signInErr } =
      await supabaseAuth.auth.signInWithPassword({ email, password });

    if (signInErr) return res.status(401).json({ message: signInErr.message });

    const jwt = signedIn?.session?.access_token;
    const user = signedIn?.user;

    if (!jwt || !user) {
      return res
        .status(500)
        .json({ message: "Failed to create session token" });
    }

    setAuthCookie(res, jwt);

    const dashboard = await buildDashboard(user);

    return res.status(201).json({
      email: user.email,
      name: user?.user_metadata?.name || name,
      jwt, // keep in body for hackathon speed; frontend can ignore once cookie works
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
      return res
        .status(500)
        .json({ message: "Failed to create session token" });
    }

    setAuthCookie(res, jwt);

    const name =
      user?.user_metadata?.name || user?.user_metadata?.full_name || "";

    const dashboard = await buildDashboard(user);

    return res.json({
      email: user.email,
      name,
      jwt, // keep for now; cookie is primary
      dashboard,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/logout", async (req, res) => {
  res.clearCookie("agentity_jwt", { path: "/" });
  res.json({ ok: true });
});

module.exports = router;
