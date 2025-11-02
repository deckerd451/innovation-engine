// assets/js/btc.js
export function startBTCPriceTracker(elId) {
  const el = document.getElementById(elId);
  if (!el) return;

  async function fetchPrice() {
    try {
      const res = await fetch('https://api.coinbase.com/v2/prices/BTC-USD/spot', {
        headers: { 'Accept': 'application/json' }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const price = Number(data?.data?.amount || 0);
      if (Number.isFinite(price)) {
        el.textContent = `BTC $${price.toLocaleString()}`;
        el.classList.add('visible');   // your CSS shows it nicely
      } else {
        throw new Error('Bad data');
      }
    } catch {
      el.textContent = 'BTC price unavailable';
      el.classList.remove('visible');  // hide the glow if you want
    }
  }

  fetchPrice();
  setInterval(fetchPrice, 60_000); // update every minute
}
