// /assets/js/api/profiles.js
import { supabaseClient as supabase } from '../supabaseClient.js';

export async function upsertProfile(profile) {
  const { data, error } = await supabase
    .from('community')
    .upsert(profile, { onConflict: 'id' })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getMyProfile(userId) {
  const { data, error } = await supabase
    .from('community')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}
