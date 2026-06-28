import { createClient } from "@supabase/supabase-js";

// Server-side Supabase client using the service-role key. NEVER expose this key
// to the browser — it bypasses Row Level Security. Used only inside API routes.
export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);
