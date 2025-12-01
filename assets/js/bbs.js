function waitForSupabaseReady() {
  return new Promise(resolve => {
    console.log("[BBS] Listening for Supabase auth events…");

    // Check immediately
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) {
        console.log("[BBS] Auth session ready:", data.session.user.email);
      } else {
        console.log("[BBS] No auth session — continuing anonymous");
      }
      resolve();  // <-- ALWAYS RESOLVE
    });

    // Also listen for changes
    supabase.auth.onAuthStateChange((event, session) => {
      console.log("[BBS] Auth event:", event, session);
      resolve(); // <-- ALWAYS RESOLVE
    });
  });
}
