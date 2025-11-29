// ======================================================================
// CharlestonHacks Innovation Engine – SUPABASE CLIENT (FINAL 2025)
// Fully aligned with existing community schema
// Handles:
//   ✔ Global supabase client
//   ✔ OAuth login (GitHub, Google)
//   ✔ ensureCommunityUser() — correct upsert into community table
// ======================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ======================================================================
// 1. SUPABASE CLIENT
// ======================================================================
export const supabase = createClient(
  "https://hvmotpzhliufzomewzfl.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2bW90cHpobGl1ZnpvbWV3emZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDI1NzY2NDUsImV4cCI6MjA1ODE1MjY0NX0.foHTGZVtRjFvxzDfMf1dpp0Zw4XFfD-FPZK-zRnjc6s",
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true
    }
  }
);

// Make globally visible for debugging
window.supabase = supabase;

// ======================================================================
// 2. OAuth Providers
// ======================================================================
export async function signInWithGitHub() {
  return await supabase.auth.signInWithOAuth({
    provider: "github",
    options: {
      redirectTo: "https://www.charlestonhacks.com/2card.html"
    }
  });
}

export async function signInWithGoogle() {
  return await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: "https://www.charlestonhacks.com/2card.html"
    }
  });
}

// ======================================================================
// 3. Ensure User Exists in community Table
// ======================================================================
// Called after login to make sure community row exists
// ONLY inserts fields that ACTUALLY exist in your Supabase schema
// ======================================================================

export async function ensureCommunityUser() {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData?.session;

  if (!session?.user) {
    console.warn("⚠️ No logged-in user for community sync");
    return;
  }

  const user = session.user;

  // Query community table to see if user already exists
  const { data: existing, error: selectErr } = await supabase
    .from("community")
    .select("id, user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (selectErr) {
    console.error("❌ Error checking community table:", selectErr);
    return;
  }

  if (existing) {
    console.log("ℹ️ Community profile already exists:", existing.id);
    return;
  }

  // Insert minimal required row
  const payload = {
    user_id: user.id,
    email: user.email,
    name: user.email ? user.email.split("@")[0] : "New User",
    skills: "",
    interests: [],
    availability: "Available",
    bio: "",
    profile_completed: false
  };

  const { error: insertErr } = await supabase
    .from("community")
    .insert(payload);

  if (insertErr) {
    console.error("❌ Failed to create community profile:", insertErr);
    return;
  }

  console.log("✅ New community profile created for:", user.email);
}

// ======================================================================
// 4. AUTO ENSURE COMMUNITY USER AFTER LOGIN
// ======================================================================
supabase.auth.onAuthStateChange(async (event, session) => {
  console.log("⚡ Auth State Change:", event);

  if (event === "SIGNED_IN" && session?.user) {
    console.log("🟢 User logged in:", session.user.email);
    await ensureCommunityUser();
  }

  if (event === "SIGNED_OUT") {
    console.log("🟡 User signed out.");
  }
});
