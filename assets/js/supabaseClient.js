// ===============================
// CharlestonHacks Supabase Client
// ===============================

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// === CONFIG ===
export const SUPABASE_URL = "https://hvmotpzhliufzomewzfl.supabase.co";
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2bW90cHpobGl1ZnpvbWV3emZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDI1NzY2NDUsImV4cCI6MjA1ODE1MjY0NX0.foHTGZVtRjFvxzDfMf1dpp0Zw4XFfD-FPZK-zRnjc6s";

export const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  global: {
    fetch: (...args) => fetch(...args, { mode: "cors", credentials: "omit" }),
  },
});

export const supabase = supabaseClient;

// =========================================================
// 🧩 AUTO-CREATE USER RECORD IN COMMUNITY TABLE
// =========================================================
export async function ensureCommunityUser() {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    // Check if record already exists in `community`
    const { data: existing, error: fetchError } = await supabase
      .from("community")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    if (fetchError && fetchError.code !== "PGRST116") {
      console.warn("[ensureCommunityUser] Fetch error:", fetchError.message);
      return null;
    }

    // If not found, create a minimal record
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
        console.error("[ensureCommunityUser] Insert error:", insertError.message);
        return null;
      }

      console.log("✅ Created new community user:", newProfile.email);
      return newProfile;
    }

    console.log("🧠 Community user verified:", user.email);
    return existing;
  } catch (err) {
    console.error("[ensureCommunityUser] Unexpected error:", err);
    return null;
  }
}

// =========================================================
// 🔁 HOOK INTO LOGIN EVENTS (OPTIONAL AUTO-RUN)
// =========================================================
supabase.auth.onAuthStateChange(async (event, session) => {
  if (session?.user) {
    console.log("🔐 Auth event:", event, "→ ensuring community user...");
    await ensureCommunityUser();
  }
});

// =========================================================
// 🔧 UTILITY: SHOW NOTIFICATION
// =========================================================
export function showNotification(msg, type = "info") {
  const toast = document.createElement("div");
  toast.textContent = msg;
  toast.className = `toast ${type}`;
  Object.assign(toast.style, {
    position: "fixed",
    bottom: "20px",
    right: "20px",
    padding: "10px 14px",
    background: type === "error" ? "#ff3b30" : "#00c6ff",
    color: "#fff",
    borderRadius: "6px",
    fontFamily: "system-ui, sans-serif",
    fontSize: "14px",
    zIndex: 99999,
    opacity: 0,
    transition: "opacity 0.3s",
  });
  document.body.appendChild(toast);
  requestAnimationFrame(() => (toast.style.opacity = "1"));
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 400);
  }, 2600);
}

window.supabase = supabase; // for debugging in console
