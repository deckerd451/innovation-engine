// ================================================================
// CharlestonHacks Innovation Engine — PROFILE / HEADER CONTROLLER (ROOT)
// File: /profile.js
// Version: v4-avatar-avatars-folder-20260220
// ================================================================
// Responsibilities:
// - Header user display (name/initials/avatar)
// - Profile modal view + editor
// - Save profile to community table
// - Avatar upload: pick -> resize/crop -> compress -> Supabase Storage -> community.image_url
//
// Depends on:
// - window.supabase from /assets/js/supabaseClient.js
// - auth.js emitting: app-ready, profile-loaded, profile-new, user-logged-out
// ================================================================

/* global window, document */

(() => {
  "use strict";

  // ================================================================
  // Namespace + guard
  // ================================================================
  window.CHProfile = window.CHProfile || {};
  const VERSION = "v4-avatar-avatars-folder-20260220";
  window.CHProfile.version = VERSION;

  const GUARD = "__CH_IE_PROFILE_V4__";
  if (window[GUARD]) return;
  window[GUARD] = true;

  console.log(`[PROFILE] loaded profile.js ${VERSION}`);

  // ================================================================
  // Config
  // ================================================================
  const STYLE_ID = "ch-profile-styles-v4";
  const AVATAR_BUCKET = "hacksbucket";

  // We STANDARDIZE to: avatars/<uid>/avatar.jpg
  function avatarObjectPath(userId) {
    return `avatars/${userId}/avatar.jpg`;
  }

  const AVATAR_MAX_DIM = 512;
  const AVATAR_MAX_BYTES = 450 * 1024; // 450KB target
  const AVATAR_JPEG_QUALITY_START = 0.82;
  const AVATAR_JPEG_QUALITY_MIN = 0.6;

  const $ = (id) => document.getElementById(id);

  // Header elements
  const elUserName = () => $("user-name-header");
  const elInitials = () => $("user-initials-header");
  const elAvatar = () => $("user-avatar-header");
  const elUserMenu = () => $("user-menu");
  const btnEditProfile = () => $("btn-profile");

  // Modals
  const profileModal = () => $("profile-modal");
  const profileModalContent = () => $("modal-profile-content");

  // State
  const state = {
    user: null,
    profile: null,
  };

  // ================================================================
  // Utilities
  // ================================================================
  function ensureSupabase() {
    if (!window.supabase) throw new Error("Supabase not ready (window.supabase missing).");
    return window.supabase;
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function initialsFromName(nameOrEmail) {
    const s = (nameOrEmail || "").trim();
    if (!s) return "?";
    const parts = s.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function cacheBust(url) {
    if (!url) return url;
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}v=${Date.now()}`;
  }

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

  function setHeaderAvatar(url, nameForAlt) {
    const host = elAvatar();
    if (!host) return;

    const finalUrl = url ? cacheBust(url) : "";

    if (host.tagName && host.tagName.toLowerCase() === "img") {
      if (finalUrl) {
        host.src = finalUrl;
        host.alt = nameForAlt || "Profile photo";
      } else {
        host.removeAttribute("src");
        host.alt = nameForAlt || "Profile";
      }
      return;
    }

    let img = host.querySelector("img[data-ch-avatar='1']");
    if (!finalUrl) {
      if (img) img.remove();
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

    if (elUserName()) elUserName().textContent = name;
    if (elInitials()) elInitials().textContent = initialsFromName(name);

    setHeaderAvatar(profile?.image_url || "", name);

    if (elAvatar()) elAvatar().title = name;
  }

  function toast(message) {
    const t = document.createElement("div");
    t.className = "ch-toast";
    t.innerHTML = `<i class="fas fa-check-circle"></i> <span>${escapeHtml(message)}</span>`;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2600);
  }

  function toastError(message) {
    const t = document.createElement("div");
    t.className = "ch-toast ch-toast-error";
    t.innerHTML = `<i class="fas fa-exclamation-circle"></i> <span>${escapeHtml(message)}</span>`;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3200);
  }

  function setUploaderStatus(text, kind) {
    const el = $("avatar-upload-status");
    if (!el) return;
    if (!text) {
      el.textContent = "";
      return;
    }
    if (kind === "ok") el.innerHTML = `<span class="ok">${escapeHtml(text)}</span>`;
    else if (kind === "bad") el.innerHTML = `<span class="bad">${escapeHtml(text)}</span>`;
    else el.textContent = text;
  }

  function isEmailPasswordUser(user) {
    if (!user) return false;
    if (Array.isArray(user.identities)) {
      return user.identities.some((id) => id.provider === "email");
    }
    return user.app_metadata?.provider === "email";
  }

  function shouldCollapseHeader() {
    return window.innerHeight && window.innerHeight <= 680;
  }

  // ================================================================
  // Styles
  // ================================================================
  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #profile-modal .modal-content { display:flex; flex-direction:column; max-height:85vh; min-height:0; }
      .ch-profile-layout { display:flex; flex-direction:column; height:100%; min-height:0; }
      .ch-profile-top { padding:1rem; overflow-y:auto; max-height:clamp(240px,35vh,440px); scrollbar-gutter:stable; }
      .ch-profile-layout.is-collapsed .ch-profile-bio, .ch-profile-layout.is-collapsed .ch-profile-cards { display:none!important; }
      @media (max-height:680px){ .ch-profile-top{max-height:28vh;padding:.85rem;} .ch-profile-bio,.ch-profile-cards{display:none;} }
      @media (max-height:560px){ .ch-profile-top{max-height:24vh;padding:.75rem;} }

      .ch-profile-header{display:flex;align-items:center;gap:1rem;margin-bottom:1.1rem;}
      .ch-profile-avatar{width:72px;height:72px;border-radius:999px;object-fit:cover;border:3px solid #00e0ff;flex:0 0 auto;}
      .ch-profile-avatar-placeholder{width:72px;height:72px;border-radius:999px;background:rgba(0,224,255,.1);border:3px dashed rgba(0,224,255,.3);display:flex;align-items:center;justify-content:center;flex:0 0 auto;}
      .ch-profile-avatar-initials{font-size:1.25rem;color:#00e0ff;font-weight:800;letter-spacing:.02em;}
      .ch-profile-header-text{flex:1;min-width:0;}
      .ch-profile-name{margin:0;color:#00e0ff;font-size:1.35rem;line-height:1.15;word-break:break-word;}
      .ch-profile-email{margin-top:.25rem;color:#aaa;font-size:.9rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
      .ch-profile-availability{margin-top:.35rem;color:#fff;font-size:.9rem;opacity:.88;display:inline-flex;align-items:center;gap:.45rem;flex-wrap:wrap;}
      .ch-profile-availability-dot{width:9px;height:9px;border-radius:999px;background:#00ff88;display:inline-block;box-shadow:0 0 0 3px rgba(0,255,136,.12);}
      .ch-profile-bio{margin-bottom:1rem;color:#ddd;line-height:1.55;white-space:pre-wrap;}
      .ch-profile-cards{display:grid;gap:.75rem;margin-bottom:.5rem;}
      .ch-profile-card{background:rgba(0,224,255,.05);border:1px solid rgba(0,224,255,.2);border-radius:12px;padding:.9rem;}
      .ch-profile-card-label{color:#00e0ff;font-weight:800;font-size:.85rem;text-transform:uppercase;margin-bottom:.35rem;letter-spacing:.08em;}
      .ch-profile-card-value{color:#ddd;word-break:break-word;}

      .ch-profile-actions, .ch-profile-editor-actions{
        position:sticky;bottom:0;padding:1rem;display:flex;gap:.75rem;flex-wrap:wrap;
        background:rgba(0,0,0,.85);backdrop-filter:blur(10px);border-top:1px solid rgba(255,255,255,.12);
      }
      .ch-profile-actions .btn{min-width:160px;}
      .btn.ch-btn-secondary{background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);}

      .ch-profile-editor{padding:1rem;overflow-y:auto;min-height:0;}
      .ch-profile-editor-title{color:#00e0ff;margin:0 0 1rem 0;display:flex;align-items:center;gap:.6rem;}
      .ch-profile-editor-form{max-width:640px;}
      .ch-form-group{margin-bottom:1rem;}
      .ch-form-group.center{text-align:center;margin-bottom:1.25rem;}
      .ch-form-label{display:block;color:#aaa;margin-bottom:.5rem;font-weight:700;}
      .ch-input,.ch-textarea,.ch-select{
        width:100%;padding:.75rem;background:rgba(0,224,255,.05);border:1px solid rgba(0,224,255,.2);
        border-radius:8px;color:white;font-family:inherit;outline:none;
      }
      .ch-textarea{resize:vertical;}
      .ch-profile-image-preview{margin-bottom:.75rem;}
      .ch-profile-image-preview img{width:100px;height:100px;border-radius:999px;object-fit:cover;border:3px solid #00e0ff;}
      .ch-profile-image-placeholder{width:100px;height:100px;border-radius:999px;background:rgba(0,224,255,.1);border:3px dashed rgba(0,224,255,.3);display:inline-flex;align-items:center;justify-content:center;}

      .ch-uploader-row{display:inline-flex;align-items:center;gap:.6rem;flex-wrap:wrap;justify-content:center;margin-bottom:.25rem;}
      .ch-uploader-btn{
        background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.22);color:#fff;
        padding:.65rem .85rem;border-radius:10px;font-weight:800;cursor:pointer;
      }
      .ch-uploader-btn:disabled{opacity:.55;cursor:not-allowed;}
      .ch-uploader-hint{color:#aaa;font-size:.85rem;line-height:1.35;margin:.25rem 0;}
      .ch-uploader-status{color:#ddd;font-size:.9rem;min-height:1.2em;margin-top:.25rem;}
      .ch-uploader-status .ok{color:#00ff88;font-weight:800;}
      .ch-uploader-status .bad{color:#ff6b6b;font-weight:800;}

      .btn.ch-btn-save{
        background:linear-gradient(135deg,#00e0ff,#0080ff);border:none;padding:.9rem 1rem;border-radius:8px;
        color:white;font-weight:800;cursor:pointer;font-size:1rem;
      }
      .ch-profile-editor-actions .btn{flex:1;min-width:200px;}

      .ch-toast{
        position:fixed;top:100px;right:20px;background:linear-gradient(135deg,#00ff88,#00cc70);color:white;
        padding:1rem 1.5rem;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,.3);
        z-index:10000;font-weight:800;display:flex;gap:.6rem;align-items:center;
      }
      .ch-toast-error{background:linear-gradient(135deg,#ff4444,#cc2200);}
    `;
    document.head.appendChild(style);
  }

  // ================================================================
  // Avatar: resize/crop/compress
  // ================================================================
  async function createSquareAvatarJpeg(file) {
    let bitmap = null;
    try {
      bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      bitmap = await createImageBitmap(file);
    }

    const srcW = bitmap.width;
    const srcH = bitmap.height;

    const side = Math.min(srcW, srcH);
    const sx = Math.floor((srcW - side) / 2);
    const sy = Math.floor((srcH - side) / 2);

    const outSide = Math.min(AVATAR_MAX_DIM, side);

    const canvas = document.createElement("canvas");
    canvas.width = outSide;
    canvas.height = outSide;

    const ctx = canvas.getContext("2d", { alpha: false });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, outSide, outSide);

    const toBlob = (quality) =>
      new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", quality));

    let q = AVATAR_JPEG_QUALITY_START;
    let blob = await toBlob(q);

    while (blob && blob.size > AVATAR_MAX_BYTES && q > AVATAR_JPEG_QUALITY_MIN) {
      q = Math.max(AVATAR_JPEG_QUALITY_MIN, q - 0.06);
      blob = await toBlob(q);
    }

    if (!blob) throw new Error("Failed to encode avatar image.");
    return { blob, mime: "image/jpeg", width: outSide, height: outSide, size: blob.size };
  }

  // ================================================================
  // Avatar: upload + public URL
  // ================================================================
  async function uploadAvatarToSupabase({ supabase, userId, blob, mime }) {
    const path = avatarObjectPath(userId);

    const { error } = await supabase.storage
      .from(AVATAR_BUCKET)
      .upload(path, blob, {
        upsert: true,
        contentType: mime,
        cacheControl: "3600",
      });

    if (error) throw error;

    const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
    const publicUrl = data?.publicUrl;
    if (!publicUrl) throw new Error("Could not get public URL for uploaded avatar.");
    return publicUrl;
  }

  async function removeAvatarFromSupabase({ supabase, userId }) {
    const path = avatarObjectPath(userId);
    // best-effort
    const { error } = await supabase.storage.from(AVATAR_BUCKET).remove([path]);
    if (error) throw error;
  }

  // ================================================================
  // Profile view
  // ================================================================
  function renderProfileView(profile, user) {
    const name = profile?.name || user?.email || "Your Profile";
    const bio = profile?.bio || "";
    const skills = profile?.skills || "";
    const interestsArr = Array.isArray(profile?.interests) ? profile.interests : [];
    const interests = interestsArr.length ? interestsArr.join(", ") : "";
    const availability = profile?.availability || "";
    const imageUrl = profile?.image_url || "";
    const collapsedClass = shouldCollapseHeader() ? "is-collapsed" : "";
    const showChangePw = isEmailPasswordUser(user);

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

    $("btn-open-profile-editor")?.addEventListener("click", () => window.openProfileEditor?.(), { once: true });
    $("btn-change-password")?.addEventListener("click", () => window.openPasswordChangeView?.(), { once: true });
    $("logout-btn")?.addEventListener("click", () => window.handleLogout?.(), { once: true });

    openModal(modal);
  };

  // ================================================================
  // Profile editor
  // ================================================================
  function renderProfileEditor(profile, user) {
    const safeProfile = profile || {};
    const existingImageUrl = safeProfile.image_url || "";
    const interests =
      Array.isArray(safeProfile?.interests)
        ? safeProfile.interests.join(", ")
        : (safeProfile?.interests || "");

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

                <input type="file" id="edit-avatar-file" accept="image/*" style="display:none" />

                ${
                  existingImageUrl
                    ? `<button type="button" id="btn-avatar-remove" class="ch-uploader-btn" style="border-color: rgba(255,255,255,0.18);">
                        <i class="fas fa-trash"></i> Remove
                      </button>`
                    : ""
                }
              </div>

              <div class="ch-uploader-hint">
                We’ll resize & optimize automatically.<br>
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
              <textarea id="edit-bio" class="ch-textarea" rows="3"
                placeholder="Tell us about yourself...">${escapeHtml(safeProfile.bio || "")}</textarea>
            </div>

            <div class="ch-form-group">
              <label class="ch-form-label" for="edit-skills">Skills (comma-separated)</label>
              <input id="edit-skills" class="ch-input" value="${escapeHtml(safeProfile.skills || "")}"
                placeholder="e.g., JavaScript, React, Python, Design" />
            </div>

            <div class="ch-form-group">
              <label class="ch-form-label" for="edit-interests">Interests (comma-separated)</label>
              <input id="edit-interests" class="ch-input" value="${escapeHtml(interests)}"
                placeholder="e.g., AI, Web3, Sustainability" />
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

    const modal = profileModal();
    const content = profileModalContent();
    if (!modal || !content) return;

    try {
      const supabase = ensureSupabase();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toastError("Please log in first.");
        return;
      }

      const { data: row, error } = await supabase
        .from("community")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        console.error("[PROFILE] load error:", error);
        toastError("Error loading profile: " + error.message);
        return;
      }

      const profile = row || { user_id: user.id };

      ensureStyles();
      content.innerHTML = renderProfileEditor(profile, user);

      const preview = $("edit-profile-image-preview");
      const pickBtn = $("btn-avatar-pick");
      const fileInput = $("edit-avatar-file");
      const removeBtn = $("btn-avatar-remove");
      const saveBtn = $("btn-save-profile");

      const setPreviewToUrl = (url) => {
        if (!preview) return;
        if (url) preview.innerHTML = `<img id="avatar-preview-img" src="${escapeHtml(cacheBust(url))}" alt="Profile photo">`;
        else preview.innerHTML = `<div class="ch-profile-image-placeholder" aria-hidden="true">
          <i class="fas fa-user" style="font-size:2.5rem;color:rgba(0,224,255,0.3);"></i>
        </div>`;
      };

      const setPreviewToObjectUrl = (objUrl) => {
        if (!preview) return;
        preview.innerHTML = `<img id="avatar-preview-img" src="${escapeHtml(objUrl)}" alt="Profile photo preview">`;
      };

      const setBusy = (busy) => {
        if (pickBtn) pickBtn.disabled = !!busy;
        if (removeBtn) removeBtn.disabled = !!busy;
        if (saveBtn) {
          saveBtn.disabled = !!busy;
          saveBtn.innerHTML = busy
            ? '<i class="fas fa-spinner fa-spin"></i> Saving…'
            : '<i class="fas fa-save"></i> Save Changes';
        }
      };

      pickBtn?.addEventListener("click", () => fileInput?.click());

      fileInput?.addEventListener("change", () => {
        const f = fileInput.files && fileInput.files[0];
        if (!f) return;

        if (!/^image\//i.test(f.type)) {
          setUploaderStatus("Please choose an image file.", "bad");
          fileInput.value = "";
          return;
        }

        selectedFile = f;
        pendingRemoveAvatar = false;

        if (f.size > 10 * 1024 * 1024) setUploaderStatus("Large image selected — optimizing may take a moment.", "");
        else setUploaderStatus("Photo selected. It will be optimized on save.", "ok");

        const objUrl = URL.createObjectURL(f);
        setPreviewToObjectUrl(objUrl);

        setTimeout(() => {
          try { URL.revokeObjectURL(objUrl); } catch {}
        }, 15_000);
      });

      removeBtn?.addEventListener("click", () => {
        selectedFile = null;
        pendingRemoveAvatar = true;
        if (fileInput) fileInput.value = "";
        setPreviewToUrl("");
        setUploaderStatus("Photo will be removed on save.", "");
      });

      $("edit-cancel")?.addEventListener("click", () => window.closeProfileModal?.(), { once: true });

      $("edit-profile-form")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        setBusy(true);
        setUploaderStatus("", "");

        try {
          const updated = {
            user_id: user.id,
            name: ($("edit-name")?.value || "").trim(),
            bio: ($("edit-bio")?.value || "").trim(),
            skills: ($("edit-skills")?.value || "").trim(),
            interests: ($("edit-interests")?.value || "")
              .split(",").map((i) => i.trim()).filter(Boolean),
            availability: $("edit-availability")?.value || null,
          };

          if (!updated.name) {
            setUploaderStatus("Name is required.", "bad");
            $("edit-name")?.focus();
            setBusy(false);
            return;
          }

          // Avatar logic
          if (selectedFile) {
            setUploaderStatus("Optimizing photo…", "");
            const { blob, mime, size, width, height } = await createSquareAvatarJpeg(selectedFile);
            setUploaderStatus(`Uploading ${width}×${height} (${Math.round(size / 1024)}KB)…`, "");

            const publicUrl = await uploadAvatarToSupabase({
              supabase,
              userId: user.id,
              blob,
              mime,
            });

            updated.image_url = publicUrl;
            setUploaderStatus("Photo uploaded.", "ok");
          } else if (pendingRemoveAvatar) {
            updated.image_url = null;

            try {
              await removeAvatarFromSupabase({ supabase, userId: user.id });
            } catch (err) {
              console.warn("[PROFILE] avatar delete failed (ignored):", err);
            }

            setUploaderStatus("Photo removed.", "ok");
          }

          const isExisting = !!profile?.id;
          const q = supabase.from("community");

          const { error: saveError } = isExisting
            ? await q.update(updated).eq("id", profile.id)
            : await q.insert(updated);

          if (saveError) {
            console.error("[PROFILE] save error:", saveError);
            setUploaderStatus("Error saving profile: " + saveError.message, "bad");
            setBusy(false);
            return;
          }

          // Update in-memory state + header
          state.user = user;

          const merged = { ...(profile || {}), ...updated };
          if (typeof updated.image_url === "undefined") merged.image_url = profile?.image_url || null;

          state.profile = merged;
          setHeaderUser(user, state.profile);

          toast("Profile updated successfully!");
          window.closeProfileModal();

          window.dispatchEvent(new CustomEvent("profile-loaded", { detail: { user, profile: state.profile } }));
        } catch (err) {
          console.error("[PROFILE] submit error:", err);
          setUploaderStatus(err?.message || "Unexpected error. Please try again.", "bad");
          toastError("Unexpected error while saving.");
          setBusy(false);
        }
      });

      openModal(modal);
    } catch (err) {
      console.error("[PROFILE] open editor error:", err);
      toastError(err?.message || "Error opening profile editor.");
    }
  };

  // ================================================================
  // Password change view (kept as-is, minimal)
  // ================================================================
  function renderPasswordChangeView() {
    return `
      <div class="ch-profile-layout">
        <div class="ch-profile-editor" role="region" aria-label="Change password">
          <h2 class="ch-profile-editor-title">
            <i class="fas fa-key"></i> Change Password
          </h2>

          <p class="ch-uploader-hint">
            Enter and confirm your new password below. It must be at least 8 characters.
          </p>

          <form id="change-password-form" class="ch-profile-editor-form">
            <div class="ch-form-group">
              <label class="ch-form-label" for="pw-new">New Password</label>
              <input type="password" id="pw-new" class="ch-input" autocomplete="new-password"
                placeholder="Enter new password" required minlength="8" />
              <div id="pw-strength" class="ch-uploader-status" aria-live="polite"></div>
            </div>

            <div class="ch-form-group">
              <label class="ch-form-label" for="pw-confirm">Confirm New Password</label>
              <input type="password" id="pw-confirm" class="ch-input" autocomplete="new-password"
                placeholder="Confirm new password" required minlength="8" />
              <div id="pw-mismatch" class="ch-uploader-status" aria-live="polite"></div>
            </div>
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

    function strengthLabel(pw) {
      if (!pw) return "";
      if (pw.length < 8) return "Too short";
      let score = 0;
      if (/[A-Z]/.test(pw)) score++;
      if (/[0-9]/.test(pw)) score++;
      if (/[^A-Za-z0-9]/.test(pw)) score++;
      if (pw.length >= 12) score++;
      return score <= 1 ? "Weak" : (score === 2 ? "Fair" : "Strong");
    }

    pwNew?.addEventListener("input", () => {
      if (strengthEl) strengthEl.textContent = strengthLabel(pwNew.value);
    });

    pwConfirm?.addEventListener("input", () => {
      if (mismatchEl) mismatchEl.textContent =
        pwConfirm.value && pwNew.value !== pwConfirm.value ? "Passwords do not match" : "";
    });

    $("pw-cancel")?.addEventListener("click", () => window.openProfileModal?.(), { once: true });

    $("change-password-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();

      const newPw = pwNew?.value || "";
      const confirmPw = pwConfirm?.value || "";

      if (newPw.length < 8) return toastError("Password must be at least 8 characters.");
      if (newPw !== confirmPw) return toastError("Passwords do not match.");

      const saveBtn = $("pw-save-btn");
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating…';
      }

      try {
        const supabase = ensureSupabase();
        const { error } = await supabase.auth.updateUser({ password: newPw });
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
        console.error("[PROFILE] password error:", err);
        toastError("Unexpected error. Please try again.");
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.innerHTML = '<i class="fas fa-lock"></i> Update Password';
        }
      }
    });

    openModal(modal);
  };

  // ================================================================
  // Wiring
  // ================================================================
  function bindUI() {
    elUserMenu()?.addEventListener("click", () => window.openProfileModal?.());
    btnEditProfile()?.addEventListener("click", () => window.openProfileEditor?.());
  }

  // Keep CHProfile exports
  window.CHProfile.openModal = () => window.openProfileModal?.();
  window.CHProfile.openEditor = () => window.openProfileEditor?.();

  // Listen for auth events
  window.addEventListener("app-ready", (e) => {
    const d = e?.detail || {};
    if (d.user) state.user = d.user;
    if (d.profile) {
      state.profile = d.profile;
      setHeaderUser(state.user, state.profile);
    }
  });

  window.addEventListener("profile-loaded", (e) => {
    const d = e?.detail || {};
    if (d.user) state.user = d.user;
    if (d.profile) {
      state.profile = d.profile;
      setHeaderUser(state.user, state.profile);
    }
  });

  window.addEventListener("profile-new", (e) => {
    const d = e?.detail || {};
    if (d.user) state.user = d.user;
    if (d.profile) {
      state.profile = d.profile;
      setHeaderUser(state.user, state.profile);
    }
  });

  window.addEventListener("user-logged-out", () => {
    state.user = null;
    state.profile = null;
    setHeaderAvatar("", "Profile");
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindUI, { once: true });
  } else {
    bindUI();
  }
})();
