// ======================================================================
// CharlestonHacks – Supabase Client (Final Production Version)
// Includes:
//   ✔ Clean ESM browser import (GitHub Pages compatible)
//   ✔ Stable Auth session handling
//   ✔ Auto-backfill community.user_id for pre-auth profiles
//   ✔ Global exposure for debugging
// ======================================================================

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// ---------------------------------------------------------
// 1) Initialize Supabase client
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
// 2) AUTO-BACKFILL community.user_id for existing profiles
// ---------------------------------------------------------
export async function backfillCommunityUser() {
  try {
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData?.user) return;

    const user = authData.user;
    const email = user.email;
    const userId = user.id;

    if (!email) return;

    const { data: existing, error: queryErr } = await supabase
      .from("community")
      .select("id, email, user_id")
      .eq("email", email)
      .is("user_id", null)
      .maybeSingle();

    if (queryErr) {
      console.warn("[Backfill] Query error:", queryErr);
      return;
    }

    if (!existing) return;

    console.log("🔧 Backfill: Updating community row:", existing.id);

    const { error: updateErr } = await supabase
      .from("community")
      .update({ user_id: userId })
      .eq("id", existing.id);

    if (updateErr) {
      console.error("❌ Backfill update error:", updateErr);
      return;
    }

    console.log("✅ Backfill complete for:", email);

  } catch (err) {
    console.error("❌ Backfill fatal error:", err);
  }
}

// ---------------------------------------------------------
// 3) Get authenticated user
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
// 4) SESSION HANDLER – run backfill on login
// ---------------------------------------------------------
supabase.auth.onAuthStateChange(async (event, session) => {
  if (session?.user) {
    console.log("🔐 Auth:", event, session.user.email);
    await backfillCommunityUser();
  }
});

// ---------------------------------------------------------
// 5) Global debug helpers
// ---------------------------------------------------------
window.supabase = supabase;
window.backfillCommunityUser = backfillCommunityUser;
window.getCurrentUser = getCurrentUser;
export const supabaseClient = supabase; // Legacy alias for older imports
console.log("🔌 Supabase client initialized (FINAL BUILD)");
