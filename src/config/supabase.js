const { createClient } = require("@supabase/supabase-js");

const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
for (const k of required) {
  if (!process.env[k]) throw new Error(`${k} is required`);
}

// Recommended for login/signup flows
// If not present, we fallback to service role
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const supabaseAuth = createClient(
  process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

module.exports = { supabaseAdmin, supabaseAuth };