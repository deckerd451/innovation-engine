// assets/js/docsModal.js
export function initDocsModal() {
  const modal = document.getElementById("docsModal") || document.getElementById("docs-modal");
  const openBtn = document.getElementById("openDocsBtn");
  const closeBtn = modal ? modal.querySelector(".close-button") : null;

  // If there is no modal in this page, just skip quietly
  if (!modal) {
    console.log("[DocsModal] No modal found in DOM — skipping init.");
    return;
  }

  if (openBtn) {
    openBtn.addEventListener("click", () => {
      modal.style.display = "block";
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      modal.style.display = "none";
    });
  }

  // Close when clicking outside the modal content
  window.addEventListener("click", (event) => {
    if (event.target === modal) {
      modal.style.display = "none";
    }
  });
}
