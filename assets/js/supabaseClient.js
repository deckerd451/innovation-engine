// =====================================================
// CharlestonHacks Supabase Client — v3.1 Stable Build
// =====================================================
// Features:
// ✅ Smart ensureCommunityUser() (checks by id + email)
// ✅ Handles Supabase auth events automatically
// ✅ Eliminates duplicate key + FK errors
// ✅ Works with GitHub Pages (CORS safe)
// ✅ Adds global showNotification()
// =====================================================

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// -----------------------------------------------------
// SUPABASE CONFIGURATION
// -----------------------------------------------------
export const SUPABASE_URL = "https://hvmotpzhliufzomewzfl.supabase.co";
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2bW90cHpobGl1ZnpvbWV3emZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDI1NzY2NDUsImV4cCI6MjA1ODE1MjY0NX0.foHTGZVtRjFvxzDfMf1dpp0Zw4XFfD-FPZK-zRnjc6s";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  global: {
    fetch: (...args) => fetch(...args, { mode: "cors", credentials: "omit" }),
  },
});

// -----------------------------------------------------
// 🧩 ensureCommunityUser() — verifies user record exists
// -----------------------------------------------------
export async function ensureCommunityUser() {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    // Check both id and email to prevent duplicates
    const { data: existing, error: fetchError } = await supabase
      .from("community")
      .select("id, email")
      .or(`id.eq.${user.id},email.eq.${user.email}`)
      .maybeSingle();

    if (fetchError && fetchError.code !== "PGRST116") {
      console.warn("[ensureCommunityUser] Fetch error:", fetchError.message);
      return null;
    }

    // If no record found → create one
    if (!existing) {
      const newProfile = {
        id: user.id,
        email: user.email,
        name:
          user.user_metadata?.full_name ||
          user.user_metadata?.name ||
          user.email.split("@")[0],
        image_url: user.user_metadata?.avatar_url || null,
        user_role: "member",
        profile_completed: false,
      };

      const { error: insertError } = await supabase
        .from("community")
        .insert(newProfile)
        .select();

      if (insertError) {
        // Skip if it's a duplicate email
        if (insertError.code === "23505") {
          console.log("🟡 Duplicate email detected — skipping insert.");
          return existing;
        }
        console.error("[ensureCommunityUser] Insert error:", insertError.message);
        return null;
      }

      console.log("✅ Created new community user:", newProfile.email);
      return newProfile;
    }

    console.log("🧠 Community user verified:", existing.email);
    return existing;
  } catch (err) {
    console.error("[ensureCommunityUser] Unexpected error:", err);
    return null;
  }
}

// -----------------------------------------------------
// 🔁 AUTH STATE HANDLER — runs ensureCommunityUser()
// -----------------------------------------------------
supabase.auth.onAuthStateChange(async (event, session) => {
  if (session?.user) {
    console.log(`🔐 Auth event: ${event} → ensuring community user…`);
    await ensureCommunityUser();
  } else if (event === "SIGNED_OUT") {
    console.log("👋 User signed out");
  }
});

// -----------------------------------------------------
// 💬 showNotification(msg, type)
// -----------------------------------------------------
export function showNotification(message, type = "info") {
  const colors = {
    info: "#00c6ff",
    success: "#00ff88",
    error: "#ff3b30",
  };

  const toast = document.createElement("div");
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    padding: 12px 18px;
    border-radius: 8px;
    background: ${colors[type] || "#00c6ff"};
    color: #fff;
    font-family: system-ui, sans-serif;
    font-size: 14px;
    z-index: 9999;
    opacity: 0;
    transform: translateY(10px);
    transition: opacity 0.3s ease, transform 0.3s ease;
    box-shadow: 0 0 10px rgba(0,0,0,0.3);
  `;
  document.body.appendChild(toast);

  // Fade in
  requestAnimationFrame(() => {
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";
  });

  // Fade out
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(10px)";
    setTimeout(() => toast.remove(), 400);
  }, 3000);
}

// -----------------------------------------------------
// 🧭 Debug helper for console
// -----------------------------------------------------
window.supabase = supabase;
console.log("✅ Supabase client initialized successfully");
