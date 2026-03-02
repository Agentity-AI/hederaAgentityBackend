const { supabaseAdmin } = require("../config/supabase");

function bearer(req) {
  const h = req.headers.authorization || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

async function optionalAuth(req, res, next) {
  try {
    const token = bearer(req);
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
    const token = bearer(req);
    if (!token) return res.status(401).json({ message: "Missing Bearer token" });

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ message: "Invalid token" });

    req.user = data.user;
    return next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
}

module.exports = { optionalAuth, requireAuth };