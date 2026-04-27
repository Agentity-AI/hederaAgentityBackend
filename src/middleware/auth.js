const crypto = require("crypto");

const { supabaseAdmin } = require("../config/supabase");
const UserApiKey = require("../models/userApiKey");

function getToken(req) {
  // 1) Authorization: Bearer <token>
  const h = req.headers.authorization || "";
  if (h.startsWith("Bearer ")) return h.slice(7).trim();

  // 2) httpOnly cookie fallback: agentity_jwt
  if (req.cookies?.agentity_jwt) return req.cookies.agentity_jwt;

  return null;
}

async function getApiKeyUser(token) {
  if (!token?.startsWith("agty_live_")) return null;

  const keyHash = crypto.createHash("sha256").update(token).digest("hex");
  const record = await UserApiKey.findOne({
    where: {
      key_hash: keyHash,
      status: "active",
    },
  });

  if (!record) return null;

  await record.update({ last_used_at: new Date() });

  return {
    id: record.user_id,
    authType: "api_key",
    apiKeyId: record.id,
  };
}

function canUseApiKey(req) {
  return req.originalUrl?.startsWith("/tasks");
}

async function getAuthenticatedUser(token, req) {
  const apiKeyUser = await getApiKeyUser(token);
  if (apiKeyUser && canUseApiKey(req)) return apiKeyUser;
  if (apiKeyUser) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (!error && data?.user) {
    return {
      ...data.user,
      authType: "supabase",
    };
  }

  return null;
}

async function optionalAuth(req, res, next) {
  try {
    const token = getToken(req);
    if (!token) return next();

    const user = await getAuthenticatedUser(token, req);
    if (user) req.user = user;

    return next();
  } catch {
    return next();
  }
}

async function requireAuth(req, res, next) {
  try {
    const token = getToken(req);
    if (!token) {
      return res.status(401).json({ message: "Missing auth token (Bearer or cookie)" });
    }

    const user = await getAuthenticatedUser(token, req);
    if (!user) {
      return res.status(401).json({ message: "Invalid token" });
    }

    req.user = user;
    return next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
}

module.exports = { optionalAuth, requireAuth };
