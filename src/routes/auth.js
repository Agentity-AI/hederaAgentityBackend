const express = require("express");
const router = express.Router();

const { supabaseAdmin, supabaseAuth } = require("../config/supabase");
const { buildDashboard } = require("../services/dashboard/buildDashboard");
const {
  ValidationError,
  requireEmail,
  requirePassword,
  requireString,
} = require("../utils/validation");

const AUTH_COOKIE_MAX_AGE_DAYS = Number(process.env.AUTH_COOKIE_MAX_AGE_DAYS || 7);

function badRequest(res, message) {
  return res.status(400).json({ success: false, message });
}

function setAuthCookie(res, jwt) {
  const isProd = process.env.NODE_ENV === "production";

  res.cookie("agentity_jwt", jwt, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    maxAge: AUTH_COOKIE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

/**
 * @openapi
 * tags:
 *   - name: Auth
 *     description: Supabase Auth (sets and clears httpOnly cookie agentity_jwt)
 */

/**
 * @openapi
 * /auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register user
 *     description: Creates a user, signs them in, sets the agentity_jwt cookie, and returns the dashboard payload.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, name]
 *             properties:
 *               email:
 *                 type: string
 *                 example: "user@mail.com"
 *               password:
 *                 type: string
 *                 example: "Password123!"
 *               name:
 *                 type: string
 *                 example: "John Doe"
 *     responses:
 *       201:
 *         description: User registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 email:
 *                   type: string
 *                   example: "user@mail.com"
 *                 name:
 *                   type: string
 *                   example: "John Doe"
 *                 jwt:
 *                   type: string
 *                   example: "eyJhbGciOi..."
 *                 dashboard:
 *                   type: object
 *                   additionalProperties: true
 *       400:
 *         description: Bad request
 *       401:
 *         description: Invalid credentials
 */

/**
 * @openapi
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login user
 *     description: Signs in the user, sets the agentity_jwt cookie, and returns the dashboard payload.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 example: "user@mail.com"
 *               password:
 *                 type: string
 *                 example: "Password123!"
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 email:
 *                   type: string
 *                   example: "user@mail.com"
 *                 name:
 *                   type: string
 *                   example: "John Doe"
 *                 jwt:
 *                   type: string
 *                   example: "eyJhbGciOi..."
 *                 dashboard:
 *                   type: object
 *                   additionalProperties: true
 *       400:
 *         description: Bad request
 *       401:
 *         description: Invalid credentials
 */

/**
 * @openapi
 * /auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Logout user
 *     description: Clears the agentity_jwt httpOnly cookie. Frontend should also remove any locally stored JWT after this call.
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Logout successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 ok:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Signed out successfully"
 *       401:
 *         description: Included for frontend consistency, though logout can safely be called without an active session
 */

router.post("/register", async (req, res, next) => {
  try {
    const email = requireEmail(req.body?.email);
    const password = requirePassword(req.body?.password);
    const name = requireString(req.body?.name, "name", { min: 2, max: 80 });

    const { error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
    });

    if (createErr) {
      const msg = (createErr.message || "").toLowerCase();
      const already =
        msg.includes("already") ||
        msg.includes("registered") ||
        msg.includes("exists");

      if (!already) {
        return res.status(400).json({ success: false, message: createErr.message });
      }
    }

    const { data: signedIn, error: signInErr } =
      await supabaseAuth.auth.signInWithPassword({ email, password });

    if (signInErr) {
      return res.status(401).json({ success: false, message: signInErr.message });
    }

    const jwt = signedIn?.session?.access_token;
    const user = signedIn?.user;

    if (!jwt || !user) {
      return res.status(500).json({
        success: false,
        message: "Failed to create session token",
      });
    }

    setAuthCookie(res, jwt);

    const dashboard = await buildDashboard(user);

    return res.status(201).json({
      success: true,
      email: user.email,
      name: user?.user_metadata?.name || name,
      jwt,
      dashboard,
    });
  } catch (err) {
    return next(err);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const email = requireEmail(req.body?.email);
    const password = requirePassword(req.body?.password);

    const { data, error } = await supabaseAuth.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return res.status(401).json({ success: false, message: error.message });
    }

    const jwt = data.session?.access_token;
    const user = data.user;

    if (!jwt || !user) {
      return res.status(500).json({
        success: false,
        message: "Failed to create session token",
      });
    }

    setAuthCookie(res, jwt);

    const name =
      user?.user_metadata?.name || user?.user_metadata?.full_name || "";

    const dashboard = await buildDashboard(user);

    return res.json({
      success: true,
      email: user.email,
      name,
      jwt,
      dashboard,
    });
  } catch (err) {
    return next(err);
  }
});

router.post("/logout", async (req, res) => {
  const isProd = process.env.NODE_ENV === "production";

  res.clearCookie("agentity_jwt", {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    path: "/",
  });

  return res.json({
    success: true,
    ok: true,
    message: "Signed out successfully",
  });
});

router.use((error, req, res, next) => {
  if (error instanceof ValidationError) {
    return badRequest(res, error.message);
  }

  return next(error);
});

module.exports = router;
