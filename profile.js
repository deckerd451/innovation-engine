// ================================================================
// CharlestonHacks Innovation Engine — PROFILE / HEADER CONTROLLER (ROOT)
// File: /profile.js
// ================================================================
// Responsibilities:
// - Update header user display (name/initials/avatar)
// - Provide profile modal open/close
// - Provide profile editor (write to community table)
// - Bind UI buttons: header user menu + bottom bar "Edit Profile"
// - NEW: Profile photo upload (pick file -> resize/compress -> Supabase Storage -> community.image_url)
//
// Depends on:
// - window.supabase from /assets/js/supabaseClient.js
// - auth.js emitting events: app-ready, profile-loaded, profile-new, user-logged-out
// ================================================================

/* global window, document */

(() => {
  "use strict";

  // ================================================================
  // PRE-GUARD: Initialize CHProfile namespace (always runs, idempotent)
  // ================================================================
  window.CHProfile = window.CHProfile || {};
  if (!window.CHProfile.version) {
    window.CHProfile.version = "v3-uploader-20260220";
  }

  // Banner log: exactly once per page load
  if (!window.__CH_PROFILE_BANNER_LOGGED__) {
    window.__CH_PROFILE_BANNER_LOGGED__ = true;
    console.log("[PROFILE] loaded profile.js v3-uploader-20260220");
    console.log("[PROFILE] CHProfile.version=", window.CHProfile.version);
  }

  const GUARD = "__CH_IE_PROFILE_V3__";
  if (window[GUARD]) {
    // Guard fired: DOM setup already done. Re-assert canonical entrypoint.
    if (typeof window.CHProfile.openEditorV3 === "function") {
      window.openProfileEditor = function openProfileEditorProxy() {
        return window.CHProfile.openEditorV3();
      };
      console.log("[PROFILE CANON] guard-skip: re-asserted openProfileEditor -> CHProfile.openEditorV3");
    }
    return;
  }
  window[GUARD] = true;

  const STYLE_ID = "ch-profile-styles-v3";
  const $ = (id) => document.getElementById(id);

  // Header elements
  const elUserName = () => $("user-name-header");
  const elInitials = () => $("user-initials-header");
  const elAvatar = () => $("user-avatar-header"); // may be <img> or container
  const elUserMenu = () => $("user-menu");

  // Modals
  const profileModal = () => $("profile-modal");
  const profileModalContent = () => $("modal-profile-content");

  // Bottom bar buttons
  const btnEditProfile = () => $("btn-profile");

  // Storage settings
  const AVATAR_BUCKET = "hacksbucket";
  const AVATAR_MAX_DIM = 512;
  const AVATAR_MAX_BYTES = 450 * 1024; // 450KB target
  const AVATAR_JPEG_QUALITY_START = 0.82;
  const AVATAR_JPEG_QUALITY_MIN = 0.6;

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
         PROFILE MODAL (VIEW + EDIT) — V3 (adds uploader)
         ========================================================== */

      #profile-modal .modal-content {
        display: flex;
        flex-direction: column;
        max-height: 85vh;
        min-height: 0;
      }

      .ch-profile-layout {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 0;
      }

      .ch-profile-top {
        padding: 1rem;
        overflow-y: auto;
        max-height: clamp(240px, 35vh, 440px);
        scrollbar-gutter: stable;
      }

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
      .ch-textarea { resize: vertical; }

      .ch-profile-image-preview { margin-bottom: 0.75rem; }
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

      .ch-uploader-row {
        display: inline-flex;
        align-items: center;
        gap: 0.6rem;
        flex-wrap: wrap;
        justify-content: center;
        margin-bottom: 0.25rem;
      }

      .ch-uploader-btn {
        background: rgba(255,255,255,0.10);
        border: 1px solid rgba(255,255,255,0.22);
        color: #fff;
        padding: 0.65rem 0.85rem;
        border-radius: 10px;
        font-weight: 800;
        cursor: pointer;
      }
      .ch-uploader-btn:disabled {
        opacity: 0.55;
        cursor: not-allowed;
      }

      .ch-uploader-hint {
        color: #aaa;
        font-size: 0.85rem;
        line-height: 1.35;
        margin: 0.25rem 0 0.25rem 0;
      }

      .ch-uploader-status {
        color: #ddd;
        font-size: 0.9rem;
        min-height: 1.2em;
        margin-top: 0.25rem;
      }
      .ch-uploader-status .ok { color: #00ff88; font-weight: 800; }
      .ch-uploader-status .bad { color: #ff6b6b; font-weight: 800; }

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
      .ch-toast-error {
        background: linear-gradient(135deg, #ff4444, #cc2200);
      }

      /* ==========================================================
         PASSWORD CHANGE VIEW
         ========================================================== */
      .ch-pw-editor-title {
        color: #00e0ff;
        margin: 0 0 1rem 0;
        display: flex;
        align-items: center;
        gap: 0.6rem;
      }

      .ch-pw-hint {
        color: #aaa;
        font-size: 0.85rem;
        margin-bottom: 1.25rem;
        line-height: 1.5;
      }

      .ch-pw-strength {
        margin-top: 0.4rem;
        font-size: 0.82rem;
        min-height: 1.2em;
      }
      .ch-pw-strength.weak   { color: #ff6b6b; }
      .ch-pw-strength.fair   { color: #ffd166; }
      .ch-pw-strength.strong { color: #00ff88; }

      .ch-pw-mismatch {
        color: #ff6b6b;
        font-size: 0.82rem;
        margin-top: 0.4rem;
        min-height: 1.2em;
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

  function cacheBust(url) {
    if (!url) return url;
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}v=${Date.now()}`;
  }

  function setHeaderAvatar(url, nameForAlt) {
    const host = elAvatar();
    if (!host) return;

    const finalUrl = url ? cacheBust(url) : "";

    // If it's already an <img>, set src.
    if (host.tagName && host.tagName.toLowerCase() === "img") {
      if (finalUrl) {
        host.src = finalUrl;
        host.alt = nameForAlt || "Profile photo";
      } else {
        // If no avatar, clear src so CSS/placeholder can show (if any)
        host.removeAttribute("src");
        host.alt = nameForAlt || "Profile";
      }
      return;
    }

    // Otherwise treat as container: inject or update an <img>.
    let img = host.querySelector("img[data-ch-avatar='1']");
    if (!finalUrl) {
      if (img) img.remove();
      // Optionally: you could render initials here, but leaving container untouched is safest.
      return;
    }
    if (!img) {
      img = document.createElement("img");
      img.dataset.chAvatar = "1";
      img.style.width = "32px";
      img.style.height = "32px";
      img.style.borderRadius = "999px";
      img.style.objectFit = "cover";
      img.style.border = "2px solid rgba(0,224,255,0.7)";
      img.style.display = "block";
      host.appendChild(img);
    }
    img.src = finalUrl;
    img.alt = nameForAlt || "Profile photo";
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

    // Set avatar if available
    const imageUrl = profile?.image_url || "";
    setHeaderAvatar(imageUrl, name);

    if (elAvatar()) elAvatar().title = name;
  }

  // -----------------------------
  // Read-only profile view modal
  // -----------------------------
  function shouldCollapseHeader() {
    return window.innerHeight && window.innerHeight <= 680;
  }

  function isEmailPasswordUser(user) {
    if (!user) return false;
    if (Array.isArray(user.identities)) {
      return user.identities.some((id) => id.provider === "email");
    }
    return user.app_metadata?.provider === "email";
  }

  function renderProfileView(profile, user) {
    const name = profile?.name || user?.email || "Your Profile";
    const bio = profile?.bio || "";
    const skills = profile?.skills || "";
    const interestsArr = Array.isArray(profile?.interests) ? profile.interests : [];
    const interests = interestsArr.length ? interestsArr.join(", ") : "";
    const availability = profile?.availability || "";
    const imageUrl = profile?.image_url || "";
    const showChangePw = isEmailPasswordUser(user);

    const collapsedClass = shouldCollapseHeader() ? "is-collapsed" : "";

    return `
      <div class="ch-profile-layout ${collapsedClass}">
        <div class="ch-profile-top" role="region" aria-label="Profile details">
          <div class="ch-profile-header">
            ${
              imageUrl
                ? `<img src="${escapeHtml(cacheBust(imageUrl))}" alt="Profile photo" class="ch-profile-avatar">`
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

          ${showChangePw ? `<button id="btn-change-password" class="btn ch-btn-secondary">
            <i class="fas fa-key"></i> Change Password
          </button>` : ""}

          <button id="logout-btn" class="btn ch-btn-secondary">
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

    $("btn-open-profile-editor")?.addEventListener(
      "click",
      () => window.openProfileEditor?.(),
      { once: true }
    );

    $("btn-change-password")?.addEventListener(
      "click",
      () => window.openPasswordChangeView?.(),
      { once: true }
    );

    $("logout-btn")?.addEventListener(
      "click",
      () => window.handleLogout?.(),
      { once: true }
    );

    openModal(modal);
  };

  // -----------------------------
  // Avatar: resize/crop/compress + upload
  // -----------------------------
  async function createSquareAvatarJpeg(file) {
    // Decode image with orientation if possible
    let bitmap = null;
    try {
      // Some browsers support imageOrientation option
      bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // Fallback
      bitmap = await createImageBitmap(file);
    }

    const srcW = bitmap.width;
    const srcH = bitmap.height;

    // Crop to square (center crop)
    const side = Math.min(srcW, srcH);
    const sx = Math.floor((srcW - side) / 2);
    const sy = Math.floor((srcH - side) / 2);

    // Output size (do not upscale tiny images)
    const outSide = Math.min(AVATAR_MAX_DIM, side);

    const canvas = document.createElement("canvas");
    canvas.width = outSide;
    canvas.height = outSide;

    const ctx = canvas.getContext("2d", { alpha: false });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, outSide, outSide);

    // Iteratively compress
    let q = AVATAR_JPEG_QUALITY_START;

    async function toBlob(quality) {
      return new Promise((resolve) => {
        canvas.toBlob(
          (b) => resolve(b),
          "image/jpeg",
          quality
        );
      });
    }

    let blob = await toBlob(q);
    while (blob && blob.size > AVATAR_MAX_BYTES && q > AVATAR_JPEG_QUALITY_MIN) {
      q = Math.max(AVATAR_JPEG_QUALITY_MIN, q - 0.06);
      blob = await toBlob(q);
    }

    if (!blob) throw new Error("Failed to encode image.");

    return {
      blob,
      mime: "image/jpeg",
      width: outSide,
      height: outSide,
      size: blob.size,
    };
  }

  async function uploadAvatarToSupabase({ supabase, userId, blob, mime }) {
    const path = `${userId}/avatar.jpg`;

    const { error: upErr } = await supabase.storage
      .from(AVATAR_BUCKET)
      .upload(path, blob, {
        upsert: true,
        contentType: mime,
        cacheControl: "3600",
      });

    if (upErr) throw upErr;

    const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
    const publicUrl = data?.publicUrl;
    if (!publicUrl) throw new Error("Could not get public URL for uploaded avatar.");

    return publicUrl;
  }

  function setUploaderStatus(text, kind) {
    const el = $("avatar-upload-status");
    if (!el) return;
    if (!text) {
      el.textContent = "";
      return;
    }
    if (kind === "ok") {
      el.innerHTML = `<span class="ok">${escapeHtml(text)}</span>`;
    } else if (kind === "bad") {
      el.innerHTML = `<span class="bad">${escapeHtml(text)}</span>`;
    } else {
      el.textContent = text;
    }
  }

  // -----------------------------
  // Profile editor modal
  // -----------------------------
  function renderProfileEditor(profile, user) {
    const safeProfile = profile || {};
    const existingImageUrl = safeProfile.image_url || "";

    const interests =
      Array.isArray(safeProfile?.interests) ? safeProfile.interests.join(", ") : (safeProfile?.interests || "");

    // Note: capture attr helps on mobile, harmless elsewhere.
    const captureAttr = "capture=\"environment\"";

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
                  existingImageUrl
                    ? `<img id="avatar-preview-img" src="${escapeHtml(cacheBust(existingImageUrl))}" alt="Profile photo">`
                    : `<div class="ch-profile-image-placeholder" aria-hidden="true">
                        <i class="fas fa-user" style="font-size:2.5rem;color:rgba(0,224,255,0.3);"></i>
                      </div>`
                }
              </div>

              <div class="ch-uploader-row">
                <button type="button" id="btn-avatar-pick" class="ch-uploader-btn">
                  <i class="fas fa-camera"></i> Choose Photo
                </button>

                <input
                  type="file"
                  id="edit-avatar-file"
                  accept="image/*"
                  ${captureAttr}
                  style="display:none"
                />

                ${
                  existingImageUrl
                    ? `<button type="button" id="btn-avatar-remove" class="ch-uploader-btn" style="border-color: rgba(255,255,255,0.18);">
                        <i class="fas fa-trash"></i> Remove
                      </button>`
                    : ""
                }
              </div>

              <div class="ch-uploader-hint">
                We’ll automatically resize and optimize your photo (best results: clear face, square-ish).<br>
                Target: ${AVATAR_MAX_DIM}×${AVATAR_MAX_DIM}, ≤ ${Math.round(AVATAR_MAX_BYTES / 1024)}KB.
              </div>

              <div id="avatar-upload-status" class="ch-uploader-status" aria-live="polite"></div>
            </div>

            <div class="ch-form-group">
              <label class="ch-form-label" for="edit-name">Name *</label>
              <input
                type="text"
                id="edit-name"
                class="ch-input"
                value="${escapeHtml(safeProfile.name || "")}"
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
              >${escapeHtml(safeProfile.bio || "")}</textarea>
            </div>

            <div class="ch-form-group">
              <label class="ch-form-label" for="edit-skills">Skills (comma-separated)</label>
              <input
                type="text"
                id="edit-skills"
                class="ch-input"
                value="${escapeHtml(safeProfile.skills || "")}"
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
                  .map((v) => `<option value="${v}" ${safeProfile.availability === v ? "selected" : ""}>${v}</option>`)
                  .join("")}
              </select>
            </div>

            <div style="height: 16px;"></div>
          </form>
        </div>

        <div class="ch-profile-editor-actions">
          <button type="submit" form="edit-profile-form" id="btn-save-profile" class="btn ch-btn-save">
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
    let selectedFile = null;
    let pendingRemoveAvatar = false;

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

      const preview = $("edit-profile-image-preview");
      const pickBtn = $("btn-avatar-pick");
      const fileInput = $("edit-avatar-file");
      const removeBtn = $("btn-avatar-remove");
      const saveBtn = $("btn-save-profile");

      function setPreviewToUrl(url) {
        if (!preview) return;
        if (url) {
          preview.innerHTML = `<img id="avatar-preview-img" src="${escapeHtml(cacheBust(url))}" alt="Profile photo">`;
        } else {
          preview.innerHTML = `<div class="ch-profile-image-placeholder" aria-hidden="true">
            <i class="fas fa-user" style="font-size:2.5rem;color:rgba(0,224,255,0.3);"></i>
          </div>`;
        }
      }

      function setPreviewToObjectUrl(objUrl) {
        if (!preview) return;
        preview.innerHTML = `<img id="avatar-preview-img" src="${escapeHtml(objUrl)}" alt="Profile photo preview">`;
      }

      function setBusy(isBusy) {
        if (pickBtn) pickBtn.disabled = !!isBusy;
        if (removeBtn) removeBtn.disabled = !!isBusy;
        if (saveBtn) {
          saveBtn.disabled = !!isBusy;
          saveBtn.innerHTML = isBusy
            ? '<i class="fas fa-spinner fa-spin"></i> Saving…'
            : '<i class="fas fa-save"></i> Save Changes';
        }
      }

      // Choose photo
      pickBtn?.addEventListener("click", () => fileInput?.click());

      fileInput?.addEventListener("change", () => {
        const f = fileInput.files && fileInput.files[0];
        if (!f) return;

        if (!/^image\//i.test(f.type)) {
          setUploaderStatus("Please choose an image file.", "bad");
          fileInput.value = "";
          return;
        }

        // Soft guardrail: huge originals are OK (we compress), but warn.
        if (f.size > 10 * 1024 * 1024) {
          setUploaderStatus("Large image selected — it may take a moment to optimize.", "");
        } else {
          setUploaderStatus("Photo selected. It will be optimized on save.", "ok");
        }

        selectedFile = f;
        pendingRemoveAvatar = false;

        const objUrl = URL.createObjectURL(f);
        setPreviewToObjectUrl(objUrl);

        // Clean up later (avoid keeping blobs around)
        setTimeout(() => {
          try { URL.revokeObjectURL(objUrl); } catch {}
        }, 15_000);
      });
    

      // Remove photo (optional nice-to-have)
      removeBtn?.addEventListener("click", () => {
        selectedFile = null;
        pendingRemoveAvatar = true;
        if (fileInput) fileInput.value = "";
        setPreviewToUrl("");
        setUploaderStatus("Photo will be removed on save.", "");
      });

      $("edit-cancel")?.addEventListener(
        "click",
        () => window.closeProfileModal(),
        { once: true }
      );

      $("edit-profile-form")?.addEventListener("submit", async (e) => {
        e.preventDefault();

        setBusy(true);
        setUploaderStatus("", "");

        try {
          // Build updated payload
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
          };

          if (!updated.name) {
            setUploaderStatus("Name is required.", "bad");
            $("edit-name")?.focus();
            setBusy(false);
            return;
          }

          // Avatar handling:
          // - If user selected a new file => optimize + upload => set updated.image_url
          // - Else if they clicked remove => set updated.image_url = null AND delete object (best-effort)
          // - Else => do not modify image_url (keep existing)
          if (selectedFile) {
            setUploaderStatus("Optimizing photo…", "");
            const { blob, mime, size, width, height } = await createSquareAvatarJpeg(selectedFile);

            setUploaderStatus(`Uploading optimized ${width}×${height} (${Math.round(size / 1024)}KB)…`, "");

            const publicUrl = await uploadAvatarToSupabase({
              supabase: window.supabase,
              userId: user.id,
              blob,
              mime,
            });

            // Store cache-busted URL in DB so all clients see refresh; safe if you prefer storing raw URL:
            // If you want raw URL, store `publicUrl` and only bust on display.
            updated.image_url = publicUrl;

            setUploaderStatus("Photo uploaded.", "ok");
          } else if (pendingRemoveAvatar) {
            updated.image_url = null;

            // best-effort delete from storage (ignore errors)
            try {
              const path = `${user.id}/avatar.jpg`;
              await window.supabase.storage.from(AVATAR_BUCKET).remove([path]);
            } catch (err) {
              console.warn("Avatar remove (storage) failed (ignored):", err);
            }

            setUploaderStatus("Photo removed.", "ok");
          }

          const isExisting = !!profile?.id;
          const q = window.supabase.from("community");

          const { error: saveError } = isExisting
            ? await q.update(updated).eq("id", profile.id)
            : await q.insert(updated);

          if (saveError) {
            console.error("Error updating profile:", saveError);
            setUploaderStatus("Error saving profile: " + saveError.message, "bad");
            setBusy(false);
            return;
          }

          // Refresh local state + header
          state.user = user;

          // Merge carefully: if updated.image_url is undefined (no change), keep old
          const merged = { ...(profile || {}), ...updated };
          if (typeof updated.image_url === "undefined") {
            merged.image_url = profile?.image_url || null;
          }

          state.profile = merged;

          setHeaderUser(user, state.profile);

          toast("Profile updated successfully!");
          window.closeProfileModal();

          window.dispatchEvent(
            new CustomEvent("profile-loaded", {
              detail: { user, profile: state.profile },
            })
          );
        } catch (err) {
          console.error("Profile save error:", err);
          setUploaderStatus("Unexpected error. Please try again.", "bad");
          toastError("Unexpected error while saving.");
          setBusy(false);
        }
      });

      openModal(modal);
    } catch (e) {
      console.error("Error in openProfileEditor:", e);
      alert("Error opening profile editor.");
    }
  };
  // ================================================================
  // Export to canonical CHProfile namespace
  // ================================================================
  window.CHProfile.openEditorV3 = window.openProfileEditor;
  window.CHProfile.openModal = function openProfileModalProxy() {
    return window.openProfileModal?.();
  };

  // Replace bare assignment with a proxy wrapper (canonicalizer re-asserts this)
  window.openProfileEditor = function openProfileEditorProxy() {
    return window.CHProfile.openEditorV3();
  };
  // Backward-compat alias
  window.openProfileEditorV3 = window.CHProfile.openEditorV3;

  console.log("[PROFILE] openProfileEditor points to: openProfileEditorProxy -> CHProfile.openEditorV3");

  // -----------------------------
  // Password change view
  // -----------------------------
  function renderPasswordChangeView() {
    return `
      <div class="ch-profile-layout">
        <div class="ch-profile-editor" role="region" aria-label="Change password">
          <h2 class="ch-pw-editor-title">
            <i class="fas fa-key"></i> Change Password
          </h2>

          <p class="ch-pw-hint">
            Enter and confirm your new password below. It must be at least 8 characters.
          </p>

          <form id="change-password-form" class="ch-profile-editor-form">
            <div class="ch-form-group">
              <label class="ch-form-label" for="pw-new">New Password</label>
              <input
                type="password"
                id="pw-new"
                class="ch-input"
                autocomplete="new-password"
                placeholder="Enter new password"
                required
                minlength="8"
              />
              <div id="pw-strength" class="ch-pw-strength" aria-live="polite"></div>
            </div>

            <div class="ch-form-group">
              <label class="ch-form-label" for="pw-confirm">Confirm New Password</label>
              <input
                type="password"
                id="pw-confirm"
                class="ch-input"
                autocomplete="new-password"
                placeholder="Confirm new password"
                required
                minlength="8"
              />
              <div id="pw-mismatch" class="ch-pw-mismatch" aria-live="polite"></div>
            </div>

            <div style="height: 16px;"></div>
          </form>
        </div>

        <div class="ch-profile-editor-actions">
          <button type="submit" form="change-password-form" id="pw-save-btn" class="btn ch-btn-save">
            <i class="fas fa-lock"></i> Update Password
          </button>
          <button type="button" id="pw-cancel" class="btn ch-btn-secondary">
            Cancel
          </button>
        </div>
      </div>
    `;
  }

  window.openPasswordChangeView = function openPasswordChangeView() {
    const modal = profileModal();
    const content = profileModalContent();
    if (!modal || !content) return;

    ensureStyles();
    content.innerHTML = renderPasswordChangeView();

    const pwNew = $("pw-new");
    const pwConfirm = $("pw-confirm");
    const strengthEl = $("pw-strength");
    const mismatchEl = $("pw-mismatch");

    function getStrength(pw) {
      if (!pw) return { label: "", cls: "" };
      if (pw.length < 8) return { label: "Too short", cls: "weak" };
      let score = 0;
      if (/[A-Z]/.test(pw)) score++;
      if (/[0-9]/.test(pw)) score++;
      if (/[^A-Za-z0-9]/.test(pw)) score++;
      if (pw.length >= 12) score++;
      if (score <= 1) return { label: "Weak", cls: "weak" };
      if (score === 2) return { label: "Fair", cls: "fair" };
      return { label: "Strong", cls: "strong" };
    }

    pwNew?.addEventListener("input", () => {
      const { label, cls } = getStrength(pwNew.value);
      if (strengthEl) {
        strengthEl.textContent = label;
        strengthEl.className = "ch-pw-strength " + cls;
      }
    });

    pwConfirm?.addEventListener("input", () => {
      if (mismatchEl) {
        mismatchEl.textContent =
          pwConfirm.value && pwNew.value !== pwConfirm.value
            ? "Passwords do not match"
            : "";
      }
    });

    $("pw-cancel")?.addEventListener(
      "click",
      () => window.openProfileModal?.(),
      { once: true }
    );

    $("change-password-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();

      const newPw = pwNew?.value || "";
      const confirmPw = pwConfirm?.value || "";

      if (newPw.length < 8) {
        toastError("Password must be at least 8 characters.");
        return;
      }

      if (newPw !== confirmPw) {
        if (mismatchEl) mismatchEl.textContent = "Passwords do not match";
        pwConfirm?.focus();
        return;
      }

      const saveBtn = $("pw-save-btn");
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating…';
      }

      try {
        const { error } = await window.supabase.auth.updateUser({ password: newPw });

        if (error) {
          toastError("Error updating password: " + error.message);
          if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<i class="fas fa-lock"></i> Update Password';
          }
          return;
        }

        toast("Password updated successfully!");
        window.openProfileModal?.();
      } catch (err) {
        console.error("Password change error:", err);
        toastError("Unexpected error. Please try again.");
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.innerHTML = '<i class="fas fa-lock"></i> Update Password';
        }
      }
    });

    openModal(modal);
  };

  function toastError(message) {
    const t = document.createElement("div");
    t.className = "ch-toast ch-toast-error";
    t.innerHTML = `<i class="fas fa-exclamation-circle"></i> <span>${escapeHtml(message)}</span>`;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3200);
  }

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
    elUserMenu()?.addEventListener("click", () => window.openProfileModal?.());
    btnEditProfile()?.addEventListener("click", () => window.openProfileEditor?.());

    window.addEventListener("resize", () => {
      const modal = profileModal();
      if (!modal?.classList.contains("active")) return;
      const content = profileModalContent();
      if (!content) return;

      // ... your existing resize re-render logic here ...
      // IMPORTANT: make sure this resize handler fully closes:
    });
  }

  // ================================================================
  // CANONICALIZER — re-asserts openProfileEditor -> CHProfile.openEditorV3
  // ================================================================
  function canonicalizeProfileEditor() {
    if (typeof window.CHProfile?.openEditorV3 !== "function") return;
    window.openProfileEditor = function openProfileEditorProxy() {
      return window.CHProfile.openEditorV3();
    };
    console.log("[PROFILE CANON] set openProfileEditor -> CHProfile.openEditorV3");
  }

  // ================================================================
  // DEBUG WATCHERS — installed when localStorage.DEBUG_PROFILE_CANON = "1"
  // ================================================================
  function installDebugWatchers() {
    if (localStorage.getItem("DEBUG_PROFILE_CANON") !== "1") return;
    let _openPE = window.openProfileEditor;
    try {
      Object.defineProperty(window, "openProfileEditor", {
        get() { return _openPE; },
        set(v) {
          // Silent for our own canonical re-assertions
          if (typeof v === "function" && v.name === "openProfileEditorProxy") {
            _openPE = v;
            return;
          }
          const stack = new Error().stack;
          console.warn(
            `PROFILE WATCH: openProfileEditor overwritten by ${v?.name || "(anonymous)"} at\n${stack}`
          );
          _openPE = v;
        },
        configurable: true,
        enumerable: true
      });

      let _CHProfile = window.CHProfile;
      Object.defineProperty(window, "CHProfile", {
        get() { return _CHProfile; },
        set(v) {
          const stack = new Error().stack;
          console.warn(`PROFILE WATCH: window.CHProfile overwritten at\n${stack}`);
          _CHProfile = v;
        },
        configurable: true,
        enumerable: true
      });

      console.log("[PROFILE DEBUG] Overwrite watchers installed on openProfileEditor + CHProfile");
    } catch (e) {
      console.warn("[PROFILE DEBUG] Could not install watchers:", e);
    }
  }

  // Listen for auth events — update state + re-canonicalize
  window.addEventListener("app-ready", (e) => {
    const detail = e?.detail || {};
    if (detail.user) state.user = detail.user;
    if (detail.profile) { state.profile = detail.profile; setHeaderUser(state.user, state.profile); }
  });
  window.addEventListener("profile-loaded", (e) => {
    const detail = e?.detail || {};
    if (detail.user) state.user = detail.user;
    if (detail.profile) { state.profile = detail.profile; setHeaderUser(state.user, state.profile); }
    // CRITICAL: profile-loaded fires after login (after node-panel.js may have loaded + overwritten)
    canonicalizeProfileEditor();
  });
  window.addEventListener("profile-new", (e) => {
    const detail = e?.detail || {};
    if (detail.user) state.user = detail.user;
    if (detail.profile) { state.profile = detail.profile; setHeaderUser(state.user, state.profile); }
  });
  window.addEventListener("user-logged-out", () => {
    state.user = null;
    state.profile = null;
  });

  // ✅ This MUST be outside bindUI()
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => { canonicalizeProfileEditor(); bindUI(); }, { once: true });
  } else {
    canonicalizeProfileEditor();
    bindUI();
  }

  // ✅ This MUST be outside bindUI()
  window.addEventListener("load", () => {
    canonicalizeProfileEditor();
    console.log("[PROFILE] window.load: canonicalization done. openProfileEditor.name=",
      window.openProfileEditor?.name || typeof window.openProfileEditor);
    installDebugWatchers();
  }, { once: true });

  console.log("✅ profile.js loaded (v3 — uploader added)");
})();
