// /assets/js/supabaseClient.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// 🔹 Your Supabase credentials
export const SUPABASE_URL = 'https://hvmotpzhliufzomewzfl.supabase.co';
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2bW90cHpobGl1ZnpvbWV3emZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDI1NzY2NDUsImV4cCI6MjA1ODE1MjY0NX0.foHTGZVtRjFvxzDfMf1dpp0Zw4XFfD-FPZK-zRnjc6s';

// 🔹 Create the Supabase client
export const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

console.log('✅ Supabase Client initialized successfully');

// 🔹 Ensure community user exists or is created
export async function ensureCommunityUser() {
  try {
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError) throw userError;
    if (!user) return null;

    // Check if user already exists in community
    const { data: existing, error: selectError } = await supabaseClient
      .from('community')
      .select('id')
      .eq('email', user.email)
      .maybeSingle();

    if (selectError) throw selectError;

    // If not found, insert it
    if (!existing) {
      const { error: insertError } = await supabaseClient.from('community').insert([
        {
          id: user.id,
          email: user.email,
          name: user.user_metadata?.full_name || user.email,
          user_role: 'member',
          created_at: new Date().toISOString(),
        },
      ]);
      if (insertError) throw insertError;
      console.log('🧠 Added new community user:', user.email);
    } else {
      console.log('👤 Community user already exists:', user.email);
    }

    return user;
  } catch (err) {
    console.error('⚠️ ensureCommunityUser error:', err.message);
    return null;
  }
}
