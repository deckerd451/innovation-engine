// ======================================================================
// CharlestonHacks Innovation Engine – SUPABASE CLIENT (FIXED 2025)
// Fully aligned with:
//   ✓ community table (user_id PK, unique email)
//   ✓ RLS: auth.uid() = user_id
//   ✓ Profile System FINAL
//   ✓ Storage: hacksbucket
//   ✓ FIXED: Never overwrites existing user data!
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
console.log("Supabase injected into window.");

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
// 3. ENSURE COMMUNITY USER EXISTS (NEVER OVERWRITE EXISTING DATA!)
// ======================================================================
export async function ensureCommunityUser() {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData?.session;

  if (!session?.user) {
    console.warn("⚠️ No logged-in user for community sync");
    return;
  }

  const user = session.user;

  // --- STEP 1: CHECK IF PROFILE ALREADY EXISTS ---
  const { data: existingProfile, error: fetchError } = await supabase
    .from("community")
    .select("id, email, user_id")
    .eq("user_id", user.id)
    .maybeSingle(); // Returns null if not found, no error

  if (fetchError) {
    console.error("❌ Error checking for existing profile:", fetchError);
    return;
  }

  // --- STEP 2: IF PROFILE EXISTS, DO NOTHING (PRESERVE USER DATA!) ---
  if (existingProfile) {
    console.log(
      `✅ Profile already exists for: ${existingProfile.email} (id: ${existingProfile.id}) - preserving user data`
    );
    return;
  }

  // --- STEP 3: ONLY INSERT IF NEW USER ---
  console.log(`🆕 Creating new profile for: ${user.email}`);
  
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

  const { data, error } = await supabase
    .from("community")
    .insert(payload)  // CHANGED: insert() instead of upsert()
    .select()
    .single();

  if (error) {
    console.error("❌ Failed to create community profile:", error);
    return;
  }

  console.log(
    `✅ New profile created for: ${data.email} → id: ${data.id}`
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
