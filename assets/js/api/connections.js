// /assets/js/api/connections.js
import { supabaseClient as supabase } from '../supabaseClient.js';

export async function fetchConnections() {
  const { data, error } = await supabase.from('connections').select('*');
  if (error) throw error;
  return data ?? [];
}
