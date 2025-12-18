// ======================================================================
// CharlestonHacks Innovation Engine – SUPABASE CLIENT (CORRECTED)
// FIXED: Using correct Supabase project URL
// ======================================================================

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// ======================================================================
// 1. CREATE SUPABASE CLIENT - CORRECT URL
// ======================================================================
export const supabase = createClient(
  "https://lrsqxxnkzrfxthdqctgx.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxyc3F4eG5renJmeHRoZHFjdGd4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzE3Nzc2MDEsImV4cCI6MjA0NzM1MzYwMX0.lPJXMHqJ59YD0gQaUPbhAX62IEY_PY16PljHiSrVFqQ",
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  }
);

// Debug access - only set once to avoid "already declared" errors
if (!window.supabase) {
  window.supabase = supabase;
  console.log("✅ Supabase client initialized (CORRECT URL)");
}

// ======================================================================
// 2. OAUTH PROVIDERS
// ======================================================================
export async function signInWithGitHub() {
  return await supabase.auth.signInWithOAuth({
    provider: "github",
    options: {
      redirectTo: window.location.origin + "/2card.html",
    },
  });
}

export async function signInWithGoogle() {
  return await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: window.location.origin + "/2card.html",
    },
  });
}

// ======================================================================
// 3. ENSURE COMMUNITY USER EXISTS
// ======================================================================
export async function ensureCommunityUser() {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData?.session;

  if (!session?.user) {
    console.warn("⚠️ No logged-in user for community sync");
    return;
  }

  const user = session.user;

  // Check if profile exists
  const { data: existingProfile, error: fetchError } = await supabase
    .from("community")
    .select("id, email, user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (fetchError) {
    console.error("❌ Error checking for existing profile:", fetchError);
    return;
  }

  if (existingProfile) {
    console.log(
      `✅ Profile already exists for: ${existingProfile.email} (id: ${existingProfile.id})`
    );
    return;
  }

  // Create new profile
  console.log(`🆕 Creating new profile for: ${user.email}`);
  
  const payload = {
    user_id: user.id,
    email: user.email,
    name: user.email?.split("@")[0] || "New User",
    skills: [],
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

export async function deleteCYNQCard(cardId) {
  const { error } = await supabase
    .from("cynq_cards")
    .delete()
    .eq("id", cardId);

  if (error) throw error;
  return true;
}

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

export async function moveCYNQCard(cardId, newStage) {
  return await updateCYNQCard(cardId, { stage: newStage });
}

// ======================================================================
// 5. AUTH STATE LISTENER
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

export async function isAuthenticated() {
  const { data: { session } } = await supabase.auth.getSession();
  return !!session?.user;
}

export async function getCurrentUser() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user || null;
}

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
// 7. EXPORT ALL
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
