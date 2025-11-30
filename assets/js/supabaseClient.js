// ======================================================================
// CharlestonHacks Innovation Engine – SUPABASE CLIENT (FINAL 2025)
// Fully aligned with:
//   ✔ community table (user_id PK, unique email)
//   ✔ RLS: auth.uid() = user_id
//   ✔ Profile System FINAL
//   ✔ Storage: hacksbucket
// ======================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ======================================================================
// 1. CREATE SUPABASE CLIENT
// ======================================================================
export const supabase = createClient(
  "https://hvmotpzhliufzomewzfl.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2bW90cHpobGl1ZnpvbWV3emZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDI1NzY2NDUsImV4cCI6MjA1ODE1MjY0NX0.foHTGZVtRjFvxzDfMf1dpp0Zw4XFfD-FPZK-zRnjc6s",
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  }
);

// Debug access
window.supabase = supabase;

// ======================================================================
// 2. OAUTH PROVIDERS
// ======================================================================
export async function signInWithGitHub() {
  return await supabase.auth.signInWithOAuth({
    provider: "github",
    options: {
      redirectTo: "https://www.charlestonhacks.com/2card.html",
    },
  });
}

export async function signInWithGoogle() {
  return await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: "https://www.charlestonhacks.com/2card.html",
    },
  });
}

// ======================================================================
// 3. ENSURE COMMUNITY USER EXISTS (NO DUPLICATE EMAIL ERRORS)
// ======================================================================
export async function ensureCommunityUser() {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData?.session;

  if (!session?.user) {
    console.warn("⚠️ No logged-in user for community sync");
    return;
  }

  const user = session.user;

  // --- Perfectly matched payload for your schema ---
  const payload = {
    user_id: user.id,
    email: user.email,
    name: user.email?.split("@")[0] || "New User",
    skills: "",
    interests: [],
    availability: "Available",
    bio: "",
    image_url: null,
    profile_completed: false,
  };

  // --- UPSERT FIX: ONLY CONFLICT ON user_id ---
  const { data, error } = await supabase
    .from("community")
    .upsert(payload, { onConflict: "user_id" })
    .select()
    .single(); // expected exactly one row

  if (error) {
    console.error("❌ Failed to upsert community profile:", error);
    return;
  }

  console.log(
    `✅ Community profile ensured for: ${data.email} → id: ${data.id}`
  );
}

// ======================================================================
// 4. AUTH STATE LISTENER → ALWAYS ENSURE PROFILE EXISTS
// ======================================================================
supabase.auth.onAuthStateChange(async (event, session) => {
  console.log("⚡ Auth State Change:", event);

  if (event === "SIGNED_IN" && session?.user) {
    console.log("🟢 User logged in:", session.user.email);
    await ensureCommunityUser();
  }

  if (event === "TOKEN_REFRESHED" && session?.user) {
    console.log("🔄 Session refreshed");
  }

  if (event === "SIGNED_OUT") {
    console.log("🟡 User signed out.");
  }
});

