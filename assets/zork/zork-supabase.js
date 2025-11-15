// ======================================================
//   Supabase Save / Restore Handler for Zork
// ======================================================

import { supabase } from "../js/supabaseClient.js"; // adjust path if needed

export async function saveZorkState(username, saveData) {
  await supabase
    .from("zork_saves")
    .upsert({
      username,
      save_data: btoa(String.fromCharCode(...saveData)),
      updated_at: new Date().toISOString()
    });
}

export async function loadZorkState(username) {
  const { data } = await supabase
    .from("zork_saves")
    .select("save_data")
    .eq("username", username)
    .maybeSingle();

  if (!data) return null;

  const raw = atob(data.save_data);
  return new Uint8Array([...raw].map(c => c.charCodeAt(0)));
}
