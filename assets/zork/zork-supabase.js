// ======================================================
//   Supabase Save / Restore Handler for Zork
// ======================================================

// Import the Supabase client.  In the original version this pointed at
// `../js/supabaseClient.js`, but our project structure does not include a
// `js` folder.  We assume a `supabaseClient.js` module lives alongside
// the BBS modules (e.g. in the project root), mirroring how `bbs.js`
// imports its client.  Adjust the path here to match that location.
import { supabase } from "./supabaseClient.js";

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
