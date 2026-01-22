// ================================================================
// CharlestonHacks Innovation Engine — PROFILE / HEADER CONTROLLER (ROOT)
// File: /profile.js
// ================================================================
// Responsibilities:
// - Update header user display (name/initials/avatar)
// - Provide profile modal open/close
// - Provide profile editor (write to community table)
// - Bind UI buttons: header user menu + bottom bar "Edit Profile"
//
// Depends on:
// - window.supabase from /assets/js/supabaseClient.js
// - auth.js emitting events: app-ready, profile-loaded, profile-new, user-logged-out
// ================================================================

/* global window, document */

(() => {
  "use strict";

  const GUARD = "__CH_IE_PROFILE_V2__";
  if (window[GUARD]) {
    return;
  }
  window[GUARD] = true;

  const STYLE_ID = "ch-profile-styles-v2";
  const $ = (id) => document.getElementById(id);

  // Header elements
  const elUserName = () => $("user-name-header");
  const elInitials = () => $("user-initials-header");
  const elAvatar = () => $("user-avatar-header");
  const elUserMenu = () => $("user-menu");

  // Modals
  const profileModal = () => $("profile-modal");
  const profileModalContent = () => $("modal-profile-content");

  // Bottom bar buttons
  const btnEditProfile = () => $("btn-profile");

  // State
  const state = {
    user: null,
    profile: null,
  };

  // -----------------------------
  // Styles (class-based, injected once)
  // -----------------------------
  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      /* ==========================================================
         PROFILE MODAL (VIEW + EDIT) — V2
         ========================================================== */

      /* Ensure modal content can host nested scroll areas */
      #profile-modal .modal-content {
        display: flex;
        flex-direction: column;
        max-height: 85vh;
        min-height: 0; /* critical for nested scrolling */
      }

      .ch-profile-layout {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 0;
      }

      /* Top area: scrollable */
      .ch-profile-top {
        padding: 1rem;
        overflow-y: auto;
        max-height: clamp(240px, 35vh, 440px);
        scrollbar-gutter: stable;
      }

      /* Collapsed header mode on short screens */
      .ch-profile-layout.is-collapsed .ch-profile-bio,
      .ch-profile-layout.is-collapsed .ch-profile-cards {
        display: none !important;
      }
      @media (max-height: 680px) {
        .ch-profile-top {
          max-height: 28vh;
          padding: 0.85rem;
        }
        .ch-profile-bio,
        .ch-profile-cards {
          display: none;
        }
      }
      @media (max-height: 560px) {
        .ch-profile-top {
          max-height: 24vh;
          padding: 0.75rem;
        }
      }

      .ch-profile-header {
        display: flex;
        align-items: center;
        gap: 1rem;
        margin-bottom: 1.1rem;
      }

      .ch-profile-avatar {
        width: 72px;
        height: 72px;
        border-radius: 999px;
        object-fit: cover;
        border: 3px solid #00e0ff;
        flex: 0 0 auto;
      }

      .ch-profile-avatar-placeholder {
        width: 72px;
        height: 72px;
        border-radius: 999px;
        background: rgba(0,224,255,0.1);
        border: 3px dashed rgba(0,224,255,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 auto;
      }
      .ch-profile-avatar-initials {
        font-size: 1.25rem;
        color: #00e0ff;
        font-weight: 800;
        letter-spacing: 0.02em;
      }

      .ch-profile-header-text {
        flex: 1;
        min-width: 0;
      }

      .ch-profile-name {
        margin: 0;
        color: #00e0ff;
        font-size: 1.35rem;
        line-height: 1.15;
        word-break: break-word;
      }

      .ch-profile-email {
        margin-top: 0.25rem;
        color: #aaa;
        font-size: 0.9rem;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .ch-profile-availability {
        margin-top: 0.35rem;
        color: #fff;
        font-size: 0.9rem;
        opacity: 0.88;
        display: inline-flex;
        align-items: center;
        gap: 0.45rem;
        flex-wrap: wrap;
      }
      .ch-profile-availability-dot {
        width: 9px;
        height: 9px;
        border-radius: 999px;
        background: #00ff88;
        display: inline-block;
        box-shadow: 0 0 0 3px rgba(0,255,136,0.12);
      }

      .ch-profile-bio {
        margin-bottom: 1rem;
        color: #ddd;
        line-height: 1.55;
        white-space: pre-wrap;
      }

      .ch-profile-cards {
        display: grid;
        gap: 0.75rem;
        margin-bottom: 0.5rem;
      }

      .ch-profile-card {
        background: rgba(0,224,255,0.05);
        border: 1px solid rgba(0,224,255,0.2);
        border-radius: 12px;
        padding: 0.9rem;
      }

      .ch-profile-card-label {
        color: #00e0ff;
        font-weight: 800;
        font-size: 0.85rem;
        text-transform: uppercase;
        margin-bottom: 0.35rem;
        letter-spacing: 0.08em;
      }

      .ch-profile-card-value {
        color: #ddd;
        word-break: break-word;
      }

      /* Sticky actions at bottom */
      .ch-profile-actions {
        position: sticky;
        bottom: 0;
        padding: 1rem;
        display: flex;
        gap: 0.75rem;
        flex-wrap: wrap;
        background: rgba(0,0,0,0.85);
        backdrop-filter: blur(10px);
        border-top: 1px solid rgba(255,255,255,0.12);
      }

      .ch-profile-actions .btn {
        min-width: 160px;
      }

      .btn.ch-btn-secondary {
        background: rgba(255,255,255,0.1);
        border: 1px solid rgba(255,255,255,0.2);
      }

      /* ==========================================================
         EDITOR STYLES
         ========================================================== */

      .ch-profile-editor-title {
        color: #00e0ff;
        margin: 0 0 1rem 0;
        display: flex;
        align-items: center;
        gap: 0.6rem;
      }

      .ch-profile-editor {
        padding: 1rem;
        overflow-y: auto;
        min-height: 0;
      }

      .ch-profile-editor-form {
        max-width: 640px;
      }

      .ch-form-group {
        margin-bottom: 1rem;
      }

      .ch-form-group.center {
        text-align: center;
        margin-bottom: 1.25rem;
      }

      .ch-form-label {
        display: block;
        color: #aaa;
        margin-bottom: 0.5rem;
        font-weight: 700;
      }

      .ch-input,
      .ch-textarea,
      .ch-select {
        width: 100%;
        padding: 0.75rem;
        background: rgba(0,224,255,0.05);
        border: 1px solid rgba(0,224,255,0.2);
        border-radius: 8px;
        color: white;
        font-family: inherit;
        outline: none;
      }
      .ch-textarea {
        resize: vertical;
      }

      .ch-profile-image-preview {
        margin-bottom: 1rem;
      }

      .ch-profile-image-preview img {
        width: 100px;
        height: 100px;
        border-radius: 999px;
        object-fit: cover;
        border: 3px solid #00e0ff;
      }

      .ch-profile-image-placeholder {
        width: 100px;
        height: 100px;
        border-radius: 999px;
        background: rgba(0,224,255,0.1);
        border: 3px dashed rgba(0,224,255,0.3);
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }

      .ch-profile-editor-actions {
        position: sticky;
        bottom: 0;
        padding: 1rem;
        display: flex;
        gap: 0.75rem;
        flex-wrap: wrap;
        background: rgba(0,0,0,0.85);
        backdrop-filter: blur(10px);
        border-top: 1px solid rgba(255,255,255,0.12);
      }

      .ch-profile-editor-actions .btn {
        flex: 1;
        min-width: 200px;
      }

      .btn.ch-btn-save {
        background: linear-gradient(135deg, #00e0ff, #0080ff);
        border: none;
        padding: 0.9rem 1rem;
        border-radius: 8px;
        color: white;
        font-weight: 800;
        cursor: pointer;
        font-size: 1rem;
      }

      /* Toast */
      .ch-toast {
        position: fixed;
        top: 100px;
        right: 20px;
        background: linear-gradient(135deg, #00ff88, #00cc70);
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 10000;
        font-weight: 800;
        display: flex;
        gap: 0.6rem;
        align-items: center;
      }
    `;
    document.head.appendChild(style);
  }

  // -----------------------------
  // UI helpers
  // -----------------------------
  function openModal(modalEl) {
    if (!modalEl) return;
    ensureStyles();
    modalEl.classList.add("active");
  }

  function closeModal(modalEl) {
    if (!modalEl) return;
    modalEl.classList.remove("active");
  }

  window.closeProfileModal = function closeProfileModal() {
    closeModal(profileModal());
  };

  function initialsFromName(nameOrEmail) {
    const s = (nameOrEmail || "").trim();
    if (!s) return "?";
    const parts = s.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function setHeaderUser(user, profile) {
    const name =
      profile?.name ||
      user?.user_metadata?.full_name ||
      user?.email ||
      "User";
    const initials = initialsFromName(name);

    if (elUserName()) elUserName().textContent = name;
    if (elInitials()) elInitials().textContent = initials;

    // Optional: if you later add an <img> inside avatar, you can set it here.
    if (elAvatar()) elAvatar().title = name;
  }

  // -----------------------------
  // Read-only profile view modal
  // -----------------------------
  function shouldCollapseHeader() {
    // Height-based collapse; also helps inside small laptop windows / mobile landscape.
    return window.innerHeight && window.innerHeight <= 680;
  }

  function renderProfileView(profile, user) {
    const name = profile?.name || user?.email || "Your Profile";
    const bio = profile?.bio || "";
    const skills = profile?.skills || "";
    const interestsArr = Array.isArray(profile?.interests) ? profile.interests : [];
    const interests = interestsArr.length ? interestsArr.join(", ") : "";
    const availability = profile?.availability || "";
    const imageUrl = profile?.image_url || "";

    const collapsedClass = shouldCollapseHeader() ? "is-collapsed" : "";

    return `
      <div class="ch-profile-layout ${collapsedClass}">
        <div class="ch-profile-top" role="region" aria-label="Profile details">
          <div class="ch-profile-header">
            ${
              imageUrl
                ? `<img src="${escapeHtml(imageUrl)}" alt="Profile photo" class="ch-profile-avatar">`
                : `<div class="ch-profile-avatar-placeholder" aria-hidden="true">
                    <span class="ch-profile-avatar-initials">${escapeHtml(initialsFromName(name))}</span>
                  </div>`
            }

            <div class="ch-profile-header-text">
              <h2 class="ch-profile-name">${escapeHtml(name)}</h2>
              <div class="ch-profile-email">${escapeHtml(user?.email || "")}</div>
              ${
                availability
                  ? `<div class="ch-profile-availability">
                      <span class="ch-profile-availability-dot" aria-hidden="true"></span>
                      <span>${escapeHtml(availability)}</span>
                    </div>`
                  : ""
              }
            </div>
          </div>

          ${bio ? `<div class="ch-profile-bio">${escapeHtml(bio)}</div>` : ""}

          <div class="ch-profile-cards">
            <div class="ch-profile-card">
              <div class="ch-profile-card-label">Skills</div>
              <div class="ch-profile-card-value">${escapeHtml(skills || "—")}</div>
            </div>

            <div class="ch-profile-card">
              <div class="ch-profile-card-label">Interests</div>
              <div class="ch-profile-card-value">${escapeHtml(interests || "—")}</div>
            </div>
          </div>
        </div>

        <div class="ch-profile-actions">
          <button id="btn-open-profile-editor" class="btn btn-primary">
            <i class="fas fa-user-edit"></i> Edit Profile
          </button>

          <button id="btn-logout" class="btn ch-btn-secondary">
            <i class="fas fa-sign-out-alt"></i> Log out
          </button>
        </div>
      </div>
    `;
  }

  window.openProfileModal = function openProfileModal() {
    const modal = profileModal();
    const content = profileModalContent();
    if (!modal || !content) return;

    ensureStyles();
    content.innerHTML = renderProfileView(state.profile, state.user);

    // Bind buttons
    $("btn-open-profile-editor")?.addEventListener(
      "click",
      () => window.openProfileEditor?.(),
      { once: true }
    );

    $("btn-logout")?.addEventListener(
      "click",
      () => window.handleLogout?.(),
      { once: true }
    );

    openModal(modal);
  };

  // -----------------------------
  // Profile editor modal
  // -----------------------------
  function renderProfileEditor(profile, user) {
    const interests =
      Array.isArray(profile?.interests) ? profile.interests.join(", ") : (profile?.interests || "");

    return `
      <div class="ch-profile-layout">
        <div class="ch-profile-editor" role="region" aria-label="Edit profile">
          <h2 class="ch-profile-editor-title">
            <i class="fas fa-user-edit"></i> Edit Your Profile
          </h2>

          <form id="edit-profile-form" class="ch-profile-editor-form">
            <div class="ch-form-group center">
              <div id="edit-profile-image-preview" class="ch-profile-image-preview">
                ${
                  profile.image_url
                    ? `<img src="${escapeHtml(profile.image_url)}" alt="Profile photo">`
                    : `<div class="ch-profile-image-placeholder" aria-hidden="true">
                        <i class="fas fa-user" style="font-size:2.5rem;color:rgba(0,224,255,0.3);"></i>
                      </div>`
                }
              </div>

              <div class="ch-form-group">
                <input
                  type="url"
                  id="edit-image-url"
                  class="ch-input"
                  value="${escapeHtml(profile.image_url || "")}"
                  placeholder="Profile image URL"
                />
              </div>
            </div>

            <div class="ch-form-group">
              <label class="ch-form-label" for="edit-name">Name *</label>
              <input
                type="text"
                id="edit-name"
                class="ch-input"
                value="${escapeHtml(profile.name || "")}"
                required
                placeholder="Your full name"
              />
            </div>

            <div class="ch-form-group">
              <label class="ch-form-label" for="edit-bio">Bio</label>
              <textarea
                id="edit-bio"
                class="ch-textarea"
                rows="3"
                placeholder="Tell us about yourself..."
              >${escapeHtml(profile.bio || "")}</textarea>
            </div>

            <div class="ch-form-group">
              <label class="ch-form-label" for="edit-skills">Skills (comma-separated)</label>
              <input
                type="text"
                id="edit-skills"
                class="ch-input"
                value="${escapeHtml(profile.skills || "")}"
                placeholder="e.g., JavaScript, React, Python, Design"
              />
            </div>

            <div class="ch-form-group">
              <label class="ch-form-label" for="edit-interests">Interests (comma-separated)</label>
              <input
                type="text"
                id="edit-interests"
                class="ch-input"
                value="${escapeHtml(interests)}"
                placeholder="e.g., AI, Web3, Sustainability"
              />
            </div>

            <div class="ch-form-group">
              <label class="ch-form-label" for="edit-availability">Availability</label>
              <select id="edit-availability" class="ch-select">
                ${["Available now","Available for mentoring","Looking for opportunities","Busy","Not available"]
                  .map((v) => `<option value="${v}" ${profile.availability === v ? "selected" : ""}>${v}</option>`)
                  .join("")}
              </select>
            </div>

            <!-- Spacer so the sticky action bar doesn't cover the last field -->
            <div style="height: 16px;"></div>
          </form>
        </div>

        <div class="ch-profile-editor-actions">
          <button type="submit" form="edit-profile-form" class="btn ch-btn-save">
            <i class="fas fa-save"></i> Save Changes
          </button>
          <button type="button" id="edit-cancel" class="btn ch-btn-secondary">
            Cancel
          </button>
        </div>
      </div>
    `;
  }

  window.openProfileEditor = async function openProfileEditor() {
    try {
      if (!window.supabase) {
        alert("Supabase not ready. Refresh and try again.");
        return;
      }

      const {
        data: { user },
      } = await window.supabase.auth.getUser();

      if (!user) {
        alert("Please log in first.");
        return;
      }

      // Load profile
      const { data: row, error } = await window.supabase
        .from("community")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        console.error("Error loading profile:", error);
        alert("Error loading profile: " + error.message);
        return;
      }

      const profile = row || { user_id: user.id };

      const modal = profileModal();
      const content = profileModalContent();
      if (!modal || !content) return;

      ensureStyles();
      content.innerHTML = renderProfileEditor(profile, user);

      // Live preview for image URL (nice UX, still minimal)
      const imgUrl = $("edit-image-url");
      const preview = $("edit-profile-image-preview");
      imgUrl?.addEventListener("input", () => {
        const url = (imgUrl.value || "").trim();
        if (!preview) return;

        if (url) {
          preview.innerHTML = `<img src="${escapeHtml(url)}" alt="Profile photo">`;
        } else {
          preview.innerHTML = `<div class="ch-profile-image-placeholder" aria-hidden="true">
            <i class="fas fa-user" style="font-size:2.5rem;color:rgba(0,224,255,0.3);"></i>
          </div>`;
        }
      });

      $("edit-cancel")?.addEventListener(
        "click",
        () => window.closeProfileModal(),
        { once: true }
      );

      $("edit-profile-form")?.addEventListener("submit", async (e) => {
        e.preventDefault();

        const updated = {
          user_id: user.id,
          name: ($("edit-name")?.value || "").trim(),
          bio: ($("edit-bio")?.value || "").trim(),
          skills: ($("edit-skills")?.value || "").trim(),
          interests: ($("edit-interests")?.value || "")
            .split(",")
            .map((i) => i.trim())
            .filter(Boolean),
          availability: $("edit-availability")?.value || null,
          image_url: (imgUrl?.value || "").trim() || null,
        };

        const isExisting = !!profile?.id;
        const q = window.supabase.from("community");

        const { error: saveError } = isExisting
          ? await q.update(updated).eq("id", profile.id)
          : await q.insert(updated);

        if (saveError) {
          console.error("Error updating profile:", saveError);
          alert("Error updating profile: " + saveError.message);
          return;
        }

        // Refresh local state + header, but avoid full reload.
        state.user = user;
        state.profile = { ...(profile || {}), ...updated };

        setHeaderUser(user, state.profile);

        toast("Profile updated successfully!");
        window.closeProfileModal();

        // Broadcast so other modules can refresh.
        window.dispatchEvent(
          new CustomEvent("profile-loaded", {
            detail: { user, profile: state.profile },
          })
        );
      });

      openModal(modal);
    } catch (e) {
      console.error("Error in openProfileEditor:", e);
      alert("Error opening profile editor.");
    }
  };

  function toast(message) {
    const t = document.createElement("div");
    t.className = "ch-toast";
    t.innerHTML = `<i class="fas fa-check-circle"></i> <span>${escapeHtml(message)}</span>`;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2600);
  }

  // -----------------------------
  // Wiring
  // -----------------------------
  function bindUI() {
    // Header click -> open modal
    elUserMenu()?.addEventListener("click", () => window.openProfileModal?.());

    // Bottom bar Edit Profile
    btnEditProfile()?.addEventListener("click", () => window.openProfileEditor?.());

    // Re-render on resize (so collapse mode updates if screen height changes)
    window.addEventListener("resize", () => {
      const modal = profileModal();
      if (!modal?.classList.contains("active")) return;
      const content = profileModalContent();
      if (!content) return;

      // If currently showing view (not editor), it contains btn-open-profile-editor.
      // Re-render view to apply collapse state cleanly.
      if ($("btn-open-profile-editor")) {
        content.innerHTML = renderProfileView(state.profile, state.user);

        $("btn-open-profile-editor")?.addEventListener(
          "click",
          () => window.openProfileEditor?.(),
          { once: true }
        );
        $("btn-logout")?.addEventListener(
          "click",
          () => window.handleLogout?.(),
          { once: true }
        );
      }
    });
  }

  // Listen for auth events
  window.addEventListener("app-ready", (e) => {
    state.user = e.detail?.user || null;
    setHeaderUser(state.user, state.profile);
  });

  window.addEventListener("profile-loaded", (e) => {
    state.user = e.detail?.user || state.user;
    state.profile = e.detail?.profile || state.profile;
    setHeaderUser(state.user, state.profile);
  });

  window.addEventListener("profile-new", (e) => {
    state.user = e.detail?.user || state.user;
    state.profile = null;
    setHeaderUser(state.user, state.profile);
  });

  window.addEventListener("user-logged-out", () => {
    state.user = null;
    state.profile = null;
    if (elUserName()) elUserName().textContent = "Logged out";
    if (elInitials()) elInitials().textContent = "?";
    window.closeProfileModal?.();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindUI, { once: true });
  } else {
    bindUI();
  }
})();
