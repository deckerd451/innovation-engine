// /assets/js/supabaseClient.js

// ✅ GitHub Pages compatible ESM import
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// ✅ Initialize Supabase client
export const supabase = createClient(
  "https://hvmotpzhliufzomewzfl.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2bW90cHpobGl1ZnpvbWV3emZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDI1NzY2NDUsImV4cCI6MjA1ODE1MjY0NX0.foHTGZVtRjFvxzDfMf1dpp0Zw4XFfD-FPZK-zRnjc6s"
);

// ======================================================
// OPTIONAL — keep only if the rest of your site uses it
// ======================================================
export async function ensureCommunityUser() {
  try {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError) throw authError;

    const user = authData?.user;
    if (!user) throw new Error("No authenticated user found.");

    // Check existing profile
    const { data: existing, error: fetchError } = await supabase
      .from("community")
      .select("id, name, email")
      .eq("email", user.email)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (existing) return existing;

    // Create new profile
    const { data: newProfile, error: insertError } = await supabase
      .from("community")
      .insert([
        {
          name: user.user_metadata?.full_name || user.email.split("@")[0],
          email: user.email,
          user_id: user.id,
          created_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (insertError) throw insertError;

    console.log("🆕 Created community profile:", newProfile);
    return newProfile;
  } catch (err) {
    console.error("❌ ensureCommunityUser failed:", err);
    throw err;
  }
}

// 👇 Expose globally for console debugging (safe)
window.supabase = supabase;
