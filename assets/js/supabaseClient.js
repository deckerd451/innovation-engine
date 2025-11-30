// ======================================================================
// CharlestonHacks Innovation Engine – SUPABASE CLIENT (FINAL 2025)
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

// Debug access
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
// 3. Ensure User Exists (Upsert Fix)
// ======================================================================
export async function ensureCommunityUser() {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData?.session;

  if (!session?.user) {
    console.warn("⚠️ No logged-in user for community sync");
    return;
  }

  const user = session.user;

  // Payload exactly matching your schema
  const payload = {
    user_id: user.id,
    email: user.email,
    name: user.email?.split("@")[0] || "New User",
    skills: "",
    interests: [],
    availability: "Available",
    bio: "",
    profile_completed: false
  };

  // 🚀 UPSERT — prevents ALL duplicate key errors
  const { data, error } = await supabase
    .from("community")
    .upsert(payload, { onConflict: "user_id" })


    .select()
    .single();

  if (error) {
    console.error("❌ Failed to upsert community profile:", error);
    return;
  }

  console.log("✅ Community profile ensured for:", data.email, "→ id:", data.id);
}

// ======================================================================
// 4. AUTO CALL COMMUNITY ENSURE AFTER LOGIN
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
