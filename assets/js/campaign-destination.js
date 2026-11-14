// Only known app destinations; never navigate to a caller-provided URL.
(() => {
  const key = "ie-campaign-destination";
  const url = new URL(location.href),
    resource = url.searchParams.get("campaign_resource");
  try {
    if (["projects", "opportunities"].includes(resource)) {
      sessionStorage.setItem(key, resource);
      url.searchParams.delete("campaign_resource");
      history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
  } catch {
    /* Navigation still works without persistence. */
  }
  let completed = false,
    timer;
  function open() {
    if (
      completed ||
      !window.currentUserProfile?.id ||
      !window.AppNav?.go ||
      !window.CommandDashboard?.selectResourceTab
    )
      return;
    let target = resource;
    try {
      target = sessionStorage.getItem(key) || target;
    } catch {
      /* use current URL choice */
    }
    if (!["projects", "opportunities"].includes(target)) {
      completed = true;
      clearInterval(timer);
      return;
    }
    completed = true;
    try {
      sessionStorage.removeItem(key);
    } catch {
      /* no persistence */
    }
    window.AppNav.go("explore");
    window.CommandDashboard.selectResourceTab(target);
    clearInterval(timer);
  }
  window.addEventListener("profile-loaded", open);
  window.addEventListener("app-destination-changed", open);
  let attempts = 0;
  timer = setInterval(() => {
    open();
    if (++attempts >= 120) clearInterval(timer);
  }, 500);
  open();
})();
