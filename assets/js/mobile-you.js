// The Home screen on phones and tablets (named "You" before the shared
// navigation; the You destination is the profile, profile.js). Home's
// sections are home-view.js, the same at every width; this file shows and
// hides the screen they are drawn in.
(function () {
  'use strict';
  if (window.MobileYou) return;

  const host = () => document.getElementById('mobile-you-content');
  const screen = () => document.getElementById('mobile-you-screen');

  function hide() {
    const el = screen();
    if (el) el.hidden = true;
    document.body.classList.remove('mobile-you-visible');
  }

  function signedOut() {
    const el = host();
    if (el) el.innerHTML = '<section class="mobile-you-state"><h1 id="mobile-you-title">Home</h1><p>Sign in to see people, possibilities and your work.</p></section>';
  }

  function render() {
    const el = screen();
    if (!el) return;
    el.hidden = false;
    document.body.classList.add('mobile-you-visible');
    const profile = window.currentUserProfile || window.CHProfile?.state?.profile;
    if (!profile?.id || !window.HomeView) { signedOut(); return; }
    window.HomeView.show();
  }

  window.MobileYou = { show: render, hide, refresh: render };
  window.addEventListener('profile-loaded', () => {
    if (document.body.classList.contains('mobile-surface-you')) render();
  });
  window.addEventListener('user-logged-out', () => { hide(); signedOut(); });
  if (document.body.classList.contains('mobile-surface-you')) render();
})();
