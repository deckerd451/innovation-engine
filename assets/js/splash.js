// ===============================================
// CharlestonHacks Splash Screen Logic
// ===============================================
// ✅ Handles splash visibility + fade animation
// ✅ Respects "Don’t show again" checkbox
// ✅ Auto-dismiss after delay
// ✅ Works seamlessly with index.html
// ===============================================

(function () {
  const splashOverlay = document.getElementById('splash-overlay');
  const splashDesc    = document.getElementById('splash-desc');
  const dontShowBox   = document.getElementById('dont-show-again');
  const communityBtn  = document.getElementById('community-site-btn');
  const publicBtn     = document.getElementById('public-site-btn');
  const skipBtn       = document.getElementById('skip-splash-btn');
  const splashKey     = 'chs_splash_seen_v2';

  if (!splashOverlay) return; // safety check

  function hideSplash(immediate = false) {
    splashOverlay.classList.add('fade-out');
    document.body.classList.remove('splash-active');
    setTimeout(() => {
      splashOverlay.style.display = 'none';
      splashOverlay.style.pointerEvents = 'none';
    }, immediate ? 0 : 700);
  }

  function dismissSplash() {
    localStorage.setItem(splashKey, dontShowBox.checked ? 'never' : 'yes');
    hideSplash();
  }

  function maybeShowSplash() {
    const pref = localStorage.getItem(splashKey);

    // User never wants to see splash again
    if (pref === 'never') {
      hideSplash(true);
      return;
    }

    // Show returning vs first-time message
    const returning = pref === 'yes';
    splashDesc.textContent = returning
      ? "Welcome back. We'll jump into the experience shortly."
      : "You'll soon be presented with an interactive card that will take you to different parts of our lore.";

    document.getElementById('dont-show-label').style.display = returning
      ? 'none'
      : 'flex';

    document.body.classList.add('splash-active');
    splashOverlay.style.display = 'flex';

    // Hook up button actions
    communityBtn?.addEventListener('click', dismissSplash);
    communityBtn?.addEventListener('keyup', (e) => {
      if (e.key === 'Enter' || e.key === ' ') dismissSplash();
    });

    publicBtn?.addEventListener('click', () => {
      dismissSplash();
      window.location.href = 'https://charlestonhacks.mailchimpsites.com/';
    });
    publicBtn?.addEventListener('keyup', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        dismissSplash();
        window.location.href = 'https://charlestonhacks.mailchimpsites.com/';
      }
    });

    skipBtn?.addEventListener('click', dismissSplash);
    skipBtn?.addEventListener('keyup', (e) => {
      if (e.key === 'Enter' || e.key === ' ') dismissSplash();
    });

    // Auto-dismiss after short delay
    setTimeout(dismissSplash, returning ? 3000 : 5000);
  }

  window.addEventListener('DOMContentLoaded', maybeShowSplash);
})();
