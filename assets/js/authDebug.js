<!-- Floating Debug Button -->
<div id="debug-toggle-btn" style="
  position: fixed;
  bottom: 12px;
  right: 12px;
  width: 36px;
  height: 36px;
  background: rgba(0,255,255,0.15);
  backdrop-filter: blur(4px);
  border: 1px solid #0ff;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 1000000;
  color: #0ff;
  font-size: 18px;
  box-shadow: 0 0 10px rgba(0,255,255,0.4);
">
  🐞
</div>

<script>
  const panel = document.getElementById("auth-debug-overlay");
  const btn = document.getElementById("debug-toggle-btn");

  btn.addEventListener("click", () => {
    if (!panel) return;
    panel.style.display = panel.style.display === "none" ? "block" : "none";
  });
</script>
