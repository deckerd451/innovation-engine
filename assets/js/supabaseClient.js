// /assets/js/supabaseClient.js
import { createClient } from "@supabase/supabase-js";

// 🧠 Initialize Supabase
export const supabase = createClient(
  "https://hvmotpzhliufzomewzfl.supabase.co", // ✅ your Supabase URL
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2bW90cHpobGl1ZnpvbWV3emZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDI1NzY2NDUsImV4cCI6MjA1ODE1MjY0NX0.foHTGZVtRjFvxzDfMf1dpp0Zw4XFfD-FPZK-zRnjc6s"
);

// 🧩 Ensures that the current authenticated user has a matching row
// in the "community" table (required for connections, endorsements, etc.)
export async function ensureCommunityUser() {
  try {
    // 🔐 Get current user
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError) throw authError;
    const user = authData?.user;
    if (!user) throw new Error("No authenticated user found.");

    // 🧠 Check if a community profile already exists
    const { data: existing, error: fetchError } = await supabase
      .from("community")
      .select("id, name, email")
      .eq("email", user.email)
      .maybeSingle();

    if (fetchError) throw fetchError;

    // ✅ Already exists → return it
    if (existing) return existing;

    // 🧱 Otherwise create a new record
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

    console.log("🆕 Created new community profile:", newProfile);
    return newProfile;
  } catch (err) {
    console.error("❌ ensureCommunityUser failed:", err);
    throw err;
  }
}
