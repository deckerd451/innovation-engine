// assets/js/btc.js
// - Small BTC header ticker (Coinbase spot price)
// - Matrix BTC modal (Matrix rain + CoinGecko stats + open/close + ESC/outside click)

const COINBASE_SPOT_URL = "https://api.coinbase.com/v2/prices/BTC-USD/spot";
const COINGECKO_SIMPLE_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true&include_last_updated_at=true";
const COINGECKO_DETAIL_URL =
  "https://api.coingecko.com/api/v3/coins/bitcoin?localization=false&tickers=false&community_data=false&developer_data=false";

// -----------------------------
// Small BTC ticker (header)
// -----------------------------
export function startBTCPriceTracker(elId, { intervalMs = 60_000 } = {}) {
  const el = document.getElementById(elId);
  if (!el) return () => {};

  let timer = null;

  async function fetchPrice() {
    try {
      const res = await fetch(COINBASE_SPOT_URL, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const price = Number(data?.data?.amount || 0);

      if (!Number.isFinite(price) || price <= 0) throw new Error("Bad data");

      el.textContent = `BTC $${price.toLocaleString()}`;
      el.classList.add("visible");
    } catch {
      el.textContent = "BTC price unavailable";
      el.classList.remove("visible");
    }
  }

  fetchPrice();
  timer = setInterval(fetchPrice, intervalMs);

  // return a cleanup function (handy if you ever SPA this page)
  return () => {
    if (timer) clearInterval(timer);
    timer = null;
  };
}

// -----------------------------
// Matrix BTC Modal
// -----------------------------
export function initMatrixBTCOverlay({
  overlayId = "matrix-btc-overlay",
  canvasId = "matrix-canvas",
  closeBtnId = "close-matrix-btc",
  dataContainerId = "btc-data-container",
  loadingId = "btc-loading",
  contentId = "btc-content",
  fields = {
    mainPrice: "btc-main-price",
    change24h: "btc-24h-change",
    high24h: "btc-24h-high",
    low24h: "btc-24h-low",
    marketCap: "btc-market-cap",
    volume: "btc-volume",
    lastUpdate: "btc-last-update",
  },
} = {}) {
  const overlay = document.getElementById(overlayId);
  const canvas = document.getElementById(canvasId);
  const closeBtn = document.getElementById(closeBtnId);
  const dataContainer = document.getElementById(dataContainerId);
  const loadingEl = document.getElementById(loadingId);
  const contentEl = document.getElementById(contentId);

  if (!overlay || !canvas || !closeBtn || !dataContainer || !loadingEl || !contentEl) {
    console.warn("⚠️ Matrix BTC overlay missing required DOM nodes. Skipping init.");
    return { open: () => {}, close: () => {}, destroy: () => {} };
  }

  const ctx = canvas.getContext("2d");
  let matrixTimer = null;
  let resizeHandler = null;

  function $(id) {
    return document.getElementById(id);
  }

  function resetUIForOpen() {
    dataContainer.classList.remove("visible");
    loadingEl.style.display = "block";
    loadingEl.textContent = "LOADING BTC DATA...";
    contentEl.style.display = "none";
  }

  function resetCanvas() {
    try {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    } catch {}
  }

  function setCanvasSize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function startMatrixRain() {
    setCanvasSize();

    const fontSize = 15;
    const columnWidth = 20;
    const columns = Math.floor(canvas.width / columnWidth);
    const drops = Array(columns).fill(1);

    const btcChars = "₿$0123456789BITCOIN.";

    function draw() {
      ctx.fillStyle = "rgba(0, 0, 0, 0.05)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = "#00ff00";
      ctx.font = `${fontSize}px Courier New`;

      for (let i = 0; i < drops.length; i++) {
        const text = btcChars[Math.floor(Math.random() * btcChars.length)];
        ctx.fillText(text, i * columnWidth, drops[i] * columnWidth);

        if (drops[i] * columnWidth > canvas.height && Math.random() > 0.975) {
          drops[i] = 0;
        }
        drops[i]++;
      }
    }

    stopMatrixRain();
    matrixTimer = setInterval(draw, 33);

    // show stats container after a beat
    setTimeout(() => {
      dataContainer.classList.add("visible");
    }, 1500);

    // keep rain sized correctly
    resizeHandler = () => setCanvasSize();
    window.addEventListener("resize", resizeHandler);
  }

  function stopMatrixRain() {
    if (matrixTimer) {
      clearInterval(matrixTimer);
      matrixTimer = null;
    }
    if (resizeHandler) {
      window.removeEventListener("resize", resizeHandler);
      resizeHandler = null;
    }
  }

  function formatUSD(n, { digits = 2 } = {}) {
    const val = Number(n || 0);
    return "$" + val.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }

  function formatBillions(n) {
    const val = Number(n || 0);
    return "$" + (val / 1e9).toFixed(2) + "B";
  }

  async function fetchBTCData() {
    try {
      const [simpleRes, detailRes] = await Promise.all([
        fetch(COINGECKO_SIMPLE_URL),
        fetch(COINGECKO_DETAIL_URL),
      ]);

      if (!simpleRes.ok) throw new Error(`CoinGecko simple HTTP ${simpleRes.status}`);
      if (!detailRes.ok) throw new Error(`CoinGecko detail HTTP ${detailRes.status}`);

      const simple = await simpleRes.json();
      const detail = await detailRes.json();

      const btc = simple?.bitcoin;
      const market = detail?.market_data;

      if (!btc || !market) throw new Error("CoinGecko returned incomplete data.");

      // main price
      $(fields.mainPrice).textContent = formatUSD(btc.usd, { digits: 2 });

      // 24h change
      const change = Number(btc.usd_24h_change || 0);
      const changeEl = $(fields.change24h);
      changeEl.textContent = `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`;
      changeEl.className = "btc-stat-value " + (change >= 0 ? "positive" : "negative");

      // high/low
      $(fields.high24h).textContent = formatUSD(market.high_24h?.usd, { digits: 2 });
      $(fields.low24h).textContent = formatUSD(market.low_24h?.usd, { digits: 2 });

      // market cap / volume
      $(fields.marketCap).textContent = formatBillions(btc.usd_market_cap);
      $(fields.volume).textContent = formatBillions(btc.usd_24h_vol);

      // last updated
      const updateTime = new Date((btc.last_updated_at || 0) * 1000);
      $(fields.lastUpdate).textContent = updateTime.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });

      setTimeout(() => {
        loadingEl.style.display = "none";
        contentEl.style.display = "block";
      }, 1200);
    } catch (err) {
      console.error("❌ Error fetching BTC data:", err);
      loadingEl.textContent = "ERROR LOADING DATA";

      setTimeout(() => {
        loadingEl.style.display = "none";
        contentEl.style.display = "block";
        $(fields.mainPrice).textContent = "DATA UNAVAILABLE";
      }, 1200);
    }
  }

  function open() {
    overlay.classList.add("active");
    resetUIForOpen();
    startMatrixRain();
    fetchBTCData();
  }

  function close() {
    overlay.classList.remove("active");
    stopMatrixRain();

    // reset for next open
    setTimeout(() => {
      dataContainer.classList.remove("visible");
      loadingEl.style.display = "block";
      contentEl.style.display = "none";
      resetCanvas();
    }, 350);
  }

  // Close button
  closeBtn.addEventListener("click", close);

  // ESC closes (but don’t hijack ESC if you have other modals open later)
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay.classList.contains("active")) close();
  });

  // Clicking outside closes
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  return {
    open,
    close,
    destroy() {
      stopMatrixRain();
      closeBtn.removeEventListener("click", close);
    },
  };
}
