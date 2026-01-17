// ======================================================================
// CharlestonHacks Innovation Engine — SUPABASE CLIENT (CYNQ Enhanced)
// Fully aligned with:
//   ✓ community table (user_id PK, unique email)
//   ✓ cynq_cards table for Human-Centered Design workflows
//   ✓ RLS: auth.uid() = user_id
//   ✓ Profile System FINAL
//   ✓ Storage: hacksbucket
//   ✓ FIXED: Never overwrites existing user data!
// ======================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ======================================================================
// 1. CREATE SUPABASE CLIENT (Singleton pattern to prevent multiple instances)
// ======================================================================
// Check if client already exists on window to prevent multiple GoTrueClient instances
let supabaseInstance;

if (window.supabase) {
  // Reuse existing client if module is imported multiple times
  supabaseInstance = window.supabase;
  console.log("♻️ Reusing existing Supabase client");
} else {
  // Create new client only if one doesn't exist
  supabaseInstance = createClient(
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
  window.supabase = supabaseInstance;
  console.log("✅ Supabase client initialized");
}

export const supabase = supabaseInstance;
export const supabaseClient = supabaseInstance;
// ======================================================================
// 2. OAUTH PROVIDERS
// ======================================================================
export async function signInWithGitHub() {
  return await supabase.auth.signInWithOAuth({
    provider: "github",
    options: {
      redirectTo: window.location.origin + "/dashboard.html",
    },
  });
}

export async function signInWithGoogle() {
  return await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: window.location.origin + "/dashboard.html",
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

  // --- STEP 1: CHECK IF PROFILE ALREADY EXISTS (by user_id) ---
  const { data: existingProfile, error: fetchError } = await supabase
    .from("community")
    .select("id, email, user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (fetchError) {
    console.error("❌ Error checking for existing profile:", fetchError);
    return;
  }

  // --- STEP 2: IF PROFILE EXISTS, DO NOTHING (PRESERVE USER DATA!) ---
  if (existingProfile) {
    console.log(
      `✅ Profile already exists for: ${existingProfile.email} (id: ${existingProfile.id})`
    );
    return;
  }

  // --- STEP 2.5: CHECK FOR MIGRATED PROFILE (by email) ---
  // This handles users from the old app who are logging in for the first time
  const { data: migratedProfile, error: migratedError } = await supabase
    .from("community")
    .select("id, email, user_id, name")
    .eq("email", user.email)
    .is("user_id", null) // Only match profiles without user_id (migrated users)
    .maybeSingle();

  if (!migratedError && migratedProfile) {
    // Found a migrated profile! Link it to this auth user
    console.log(
      `🔗 Found migrated profile for ${user.email}! Linking to auth user...`
    );
    
    const { error: updateError } = await supabase
      .from("community")
      .update({ user_id: user.id })
      .eq("id", migratedProfile.id);

    if (updateError) {
      console.error("❌ Failed to link migrated profile:", updateError);
      return;
    }

    console.log(
      `✅ Successfully reclaimed profile: ${migratedProfile.name} (${migratedProfile.email})`
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
    .insert(payload)
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
// 4. CYNQ WORKFLOW HELPER FUNCTIONS
// ======================================================================

/**
 * Fetch all CYNQ cards for the current user
 */
export async function getCYNQCards() {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData?.session?.user;
  
  if (!user) {
    throw new Error("User not authenticated");
  }

  const { data, error } = await supabase
    .from("cynq_cards")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * Create a new CYNQ card
 */
export async function createCYNQCard(cardData) {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData?.session?.user;
  
  if (!user) {
    throw new Error("User not authenticated");
  }

  const { data, error } = await supabase
    .from("cynq_cards")
    .insert({
      ...cardData,
      user_id: user.id,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Update an existing CYNQ card
 */
export async function updateCYNQCard(cardId, updates) {
  const { data, error } = await supabase
    .from("cynq_cards")
    .update(updates)
    .eq("id", cardId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Delete a CYNQ card
 */
export async function deleteCYNQCard(cardId) {
  const { error } = await supabase
    .from("cynq_cards")
    .delete()
    .eq("id", cardId);

  if (error) throw error;
  return true;
}

/**
 * Get CYNQ cards by stage
 */
export async function getCYNQCardsByStage(stage) {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData?.session?.user;
  
  if (!user) {
    throw new Error("User not authenticated");
  }

  const { data, error } = await supabase
    .from("cynq_cards")
    .select("*")
    .eq("user_id", user.id)
    .eq("stage", stage)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * Get card count by stage for current user
 */
export async function getCYNQCardCounts() {
  const cards = await getCYNQCards();
  
  const counts = {
    empathize: 0,
    define: 0,
    ideate: 0,
    prototype: 0,
    test: 0,
  };

  cards.forEach(card => {
    if (counts.hasOwnProperty(card.stage)) {
      counts[card.stage]++;
    }
  });

  return counts;
}

/**
 * Move card to different stage
 */
export async function moveCYNQCard(cardId, newStage) {
  return await updateCYNQCard(cardId, { stage: newStage });
}

// ======================================================================
// 5. AUTH STATE LISTENER → ALWAYS ENSURE PROFILE EXISTS
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
    console.log("🟡 User signed out");
  }
});

// ======================================================================
// 6. UTILITY FUNCTIONS
// ======================================================================

/**
 * Check if user is authenticated
 */
export async function isAuthenticated() {
  const { data: { session } } = await supabase.auth.getSession();
  return !!session?.user;
}

/**
 * Get current user
 */
export async function getCurrentUser() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user || null;
}

/**
 * Get user profile from community table
 */
export async function getUserProfile() {
  const user = await getCurrentUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("community")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (error) {
    console.error("Error fetching user profile:", error);
    return null;
  }

  return data;
}

// ======================================================================
// 7. EXPORT ALL FUNCTIONS
// ======================================================================
export default {
  supabase,
  signInWithGitHub,
  signInWithGoogle,
  ensureCommunityUser,
  getCYNQCards,
  createCYNQCard,
  updateCYNQCard,
  deleteCYNQCard,
  getCYNQCardsByStage,
  getCYNQCardCounts,
  moveCYNQCard,
  isAuthenticated,
  getCurrentUser,
  getUserProfile,
};
