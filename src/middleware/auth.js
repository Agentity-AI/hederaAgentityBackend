const { supabaseAdmin } = require("../config/supabase");

function getToken(req) {
  // 1) Authorization: Bearer <token>
  const h = req.headers.authorization || "";
  if (h.startsWith("Bearer ")) return h.slice(7).trim();

  // 2) httpOnly cookie fallback: agentity_jwt
  if (req.cookies?.agentity_jwt) return req.cookies.agentity_jwt;

  return null;
}

async function optionalAuth(req, res, next) {
  try {
    const token = getToken(req);
    if (!token) return next();

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (!error && data?.user) req.user = data.user;

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

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ message: "Invalid token" });
    }

    req.user = data.user;
    return next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
}

module.exports = { optionalAuth, requireAuth };