// ======================================================================
// CharlestonHacks – Supabase Client (Final Clean Version)
// Compatible with GitHub Pages, ESM, and new user_id-based profile logic
// ======================================================================

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// ---------------------------------------------------------
// 1) Initialize Supabase client (public anon key only)
// ---------------------------------------------------------
export const supabase = createClient(
  "https://hvmotpzhliufzomewzfl.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2bW90cHpobGl1ZnpvbWV3emZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDI1NzY2NDUsImV4cCI6MjA1ODE1MjY0NX0.foHTGZVtRjFvxzDfMf1dpp0Zw4XFfD-FPZK-zRnjc6s",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }
);

// ---------------------------------------------------------
// 2) Optional helper: Check current auth user (debug only)
// ---------------------------------------------------------
export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error("[Supabase] getSession() error:", error);
    return null;
  }
  return data?.session?.user ?? null;
}

// ---------------------------------------------------------
// 3) Expose Supabase globally for developer debugging
// ---------------------------------------------------------
window.supabase = supabase;
window.getCurrentUser = getCurrentUser;

console.log("🔌 Supabase client initialized (clean final version)");
