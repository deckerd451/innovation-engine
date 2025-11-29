// ====================================================================
// CharlestonHacks – Simple Tab Controller (2025 FINAL)
// Works with any .tab-button and .tab-content-pane group
// ====================================================================

export function initTabs() {
  const buttons = document.querySelectorAll(".tab-button");
  const panes = document.querySelectorAll(".tab-content-pane");

  if (!buttons.length || !panes.length) {
    console.warn("Tabs: No buttons or panes found.");
    return;
  }

  buttons.forEach(btn => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;

      // Deactivate all buttons
      buttons.forEach(b => b.classList.remove("active"));

      // Activate clicked button
      btn.classList.add("active");

      // Hide all panes
      panes.forEach(p => p.classList.remove("active-tab-pane"));

      // Show the selected pane
      const target = document.getElementById(tab);
      if (target) {
        target.classList.add("active-tab-pane");
      } else {
        console.warn("Tabs: No pane found for", tab);
      }
    });
  });

  console.log("✨ Tabs initialized");
}
