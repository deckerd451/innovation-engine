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
// This fixes all pre-auth profiles created before Supabase Auth was enabled.
// When a user logs in, find their old profile (matched by email)
// and attach their user_id. Prevents duplicates, fixes RLS, fixes Synapse.
export async function backfillCommunityUser() {
  try {
    // 1. Get logged-in user
    const { data, error: authErr } = await supabase.auth.getUser();
    if (authErr || !data?.user) return;

    const user = data.user;
    const userId = user.id;
    const email = user.email;

    if (!email) return;

    // 2. Find existing community row for this email that has user_id = null
    const { data: oldRow, error: queryErr } = await supabase
      .from("community")
      .select("id, email, user_id")
      .eq("email", email)
      .is("user_id", null)
      .maybeSingle();

    if (queryErr) {
      console.warn("[Backfill] Query error:", queryErr);
      return;
    }

    if (!oldRow) {
      // No orphan row = nothing to fix.
      return;
    }

    console.log("🔧 Backfill: Linking community row → user_id:", oldRow.id);

    // 3. Patch user_id onto the old row
    const { error: updateErr } = await supabase
      .from("community")
      .update({ user_id: userId })
      .eq("id", oldRow.id);

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
// 3) Optional: Get the current authenticated user
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
// 4) SESSION HANDLER: auto-run backfill on login
// ---------------------------------------------------------
supabase.auth.onAuthStateChange(async (event, session) => {
  if (session?.user) {
    console.log("🔐 Auth state change:", event, "→ user logged in");
    await backfillCommunityUser();
  }
});

// ---------------------------------------------------------
// 5) Expose Supabase globally for debugging
// ---------------------------------------------------------
window.supabase = supabase;
window.getCurrentUser = getCurrentUser;
window.backfillCommunityUser = backfillCommunityUser;

console.log("🔌 Supabase client initialized (CharlestonHacks Final Build)");
