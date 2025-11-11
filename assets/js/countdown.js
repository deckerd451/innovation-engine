export function startCountdown(elementId, eventDateStr) {
  const countdownEl = document.getElementById(elementId);
  if (!countdownEl) return;

  let timer; // ✅ Declare timer before it's used

  function updateCountdown() {
    const eventDate = new Date(eventDateStr);
    const now = new Date();
    const diff = eventDate - now;

    // 🟢 When countdown is over:
    if (diff <= 0) {
      countdownEl.innerHTML = `<span class="coming-soon">Next Event Coming Soon!</span>`;
      clearInterval(timer); // ✅ Now timer is in scope and initialized
      return;
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((diff / (1000 * 60)) % 60);
    const seconds = Math.floor((diff / 1000) % 60);
    const pad = n => n.toString().padStart(2, '0');

    countdownEl.innerHTML = `
      <span><b>HH2025:</b></span>
      <span>${days}<small>d</small></span>
      <span>${pad(hours)}<small>h</small></span>
      <span>${pad(minutes)}<small>m</small></span>
      <span>${pad(seconds)}<small>s</small></span>
    `;
  }

  updateCountdown(); // Run immediately
  timer = setInterval(updateCountdown, 1000); // ✅ Assign after declaration
}
