import { createClient } from "@supabase/supabase-js";

// Credentials come from Vite env vars; the literals are dev fallbacks so the
// app keeps working locally without a .env. The anon/publishable key is safe
// to ship to the browser. Set VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in prod.
const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || "https://dbmkdrytjeppcbhuzkxh.supabase.co";
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_fUmhHIYTbiIraSM7FA63iQ_yjMh4vNG";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
