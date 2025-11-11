// /assets/js/supabaseClient.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// Supabase credentials
export const SUPABASE_URL = 'https://hvmotpzhliufzomewzfl.supabase.co';
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2bW90cHpobGl1ZnpvbWV3emZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDI1NzY2NDUsImV4cCI6MjA1ODE1MjY0NX0.foHTGZVtRjFvxzDfMf1dpp0Zw4XFfD-FPZK-zRnjc6s';

// ✅ Create Supabase client
export const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

console.log('✅ Supabase Client initialized successfully');

// ✅ Add ensureCommunityUser helper
export async function ensureCommunityUser() {
  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return null;

    // Check if this user already exists in the community table
    const { data: existing, error: fetchError } = await supabaseClient
      .from('community')
      .select('id')
      .eq('email', user.email)
      .maybeSingle();

    if (fetchError) throw fetchError;

    // If not found, insert a new record
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
      console.log('🧠 New community user added:', user.email);
    }

    return user;
  } catch (err) {
    console.error('⚠️ ensureCommunityUser error:', err.message);
    return null;
  }
}
