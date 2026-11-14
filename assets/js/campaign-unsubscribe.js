// Remove the bearer preference token before importing anything or making requests.
const token = location.hash.slice(1);
history.replaceState(null, "", location.pathname + location.search);
const button = document.querySelector("#unsubscribe-confirm"),
  status = document.querySelector("#unsubscribe-status");
if (!/^[0-9a-f]{64}$/.test(token)) {
  button.disabled = true;
  status.textContent =
    "This preference link is missing or invalid. Use the unsubscribe link from your email.";
}
button.onclick = async () => {
  button.disabled = true;
  status.textContent = "Updating your preference…";
  try {
    const { supabase } = await import(
      "./supabaseClient.js?v=fc09b39b-1770146154f916933b2da"
    );
    const { error } = await supabase.rpc("unsubscribe_campaign_email", {
      p_token: token,
    });
    if (error) throw error;
    status.textContent =
      "Your unsubscribe request is complete. You will not receive further community campaigns for this email address.";
  } catch {
    status.textContent = "Your preference could not be updated. Try again.";
    button.disabled = false;
  }
};
