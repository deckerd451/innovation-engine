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

  const GUARD = "__CH_IE_PROFILE_V1__";
  if (window[GUARD]) {
    console.log("⚠️ profile.js already initialized — skipping duplicate init.");
    return;
  }
  window[GUARD] = true;

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
  // UI helpers
  // -----------------------------
  function openModal(modalEl) {
    if (!modalEl) return;
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

  function setHeaderUser(user, profile) {
    const name = profile?.name || user?.user_metadata?.full_name || user?.email || "User";
    const initials = initialsFromName(name);

    if (elUserName()) elUserName().textContent = name;
    if (elInitials()) elInitials().textContent = initials;

    // Optional: if you later add an <img> inside avatar, you can set it here.
    if (elAvatar()) {
      elAvatar().title = name;
    }
  }

  // -----------------------------
  // Read-only profile view modal
  // -----------------------------
  function renderProfileView(profile, user) {
    const name = profile?.name || user?.email || "Your Profile";
    const bio = profile?.bio || "";
    const skills = profile?.skills || "";
    const interestsArr = Array.isArray(profile?.interests) ? profile.interests : [];
    const interests = interestsArr.length ? interestsArr.join(", ") : "";
    const availability = profile?.availability || "";
    const imageUrl = profile?.image_url || "";

    const html = `
      <div style="display:flex; align-items:center; gap:1rem; margin-bottom:1.25rem;">
        ${
          imageUrl
            ? `<img src="${imageUrl}" alt="Profile" style="width:72px;height:72px;border-radius:50%;object-fit:cover;border:3px solid #00e0ff;">`
            : `<div style="width:72px;height:72px;border-radius:50%;background:rgba(0,224,255,0.1);border:3px dashed rgba(0,224,255,0.3);display:flex;align-items:center;justify-content:center;">
                 <span style="font-size:1.25rem;color:#00e0ff;font-weight:800;">${initialsFromName(name)}</span>
               </div>`
        }
        <div style="flex:1;">
          <h2 style="margin:0;color:#00e0ff;">${escapeHtml(name)}</h2>
          <div style="margin-top:0.25rem;color:#aaa;font-size:0.9rem;">${escapeHtml(user?.email || "")}</div>
          ${availability ? `<div style="margin-top:0.35rem;color:#fff;font-size:0.9rem;opacity:0.85;"><i class="fas fa-circle" style="color:#00ff88;"></i> ${escapeHtml(availability)}</div>` : ""}
        </div>
      </div>

      ${bio ? `<div style="margin-bottom:1rem;color:#ddd;line-height:1.55;">${escapeHtml(bio)}</div>` : ""}

      <div style="display:grid; gap:0.75rem; margin-bottom:1.25rem;">
        <div style="background:rgba(0,224,255,0.05);border:1px solid rgba(0,224,255,0.2);border-radius:12px;padding:0.9rem;">
          <div style="color:#00e0ff;font-weight:800;font-size:0.85rem;text-transform:uppercase;margin-bottom:0.35rem;">
            Skills
          </div>
          <div style="color:#ddd;">${escapeHtml(skills || "—")}</div>
        </div>

        <div style="background:rgba(0,224,255,0.05);border:1px solid rgba(0,224,255,0.2);border-radius:12px;padding:0.9rem;">
          <div style="color:#00e0ff;font-weight:800;font-size:0.85rem;text-transform:uppercase;margin-bottom:0.35rem;">
            Interests
          </div>
          <div style="color:#ddd;">${escapeHtml(interests || "—")}</div>
        </div>
      </div>

      <div style="display:flex; gap:0.75rem; flex-wrap:wrap;">
        <button id="btn-open-profile-editor" class="btn btn-primary" style="min-width:160px;">
          <i class="fas fa-user-edit"></i> Edit Profile
        </button>

        <button id="btn-logout" class="btn" style="background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.2);">
          <i class="fas fa-sign-out-alt"></i> Log out
        </button>
      </div>
    `;

    return html;
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  window.openProfileModal = function openProfileModal() {
    const modal = profileModal();
    const content = profileModalContent();
    if (!modal || !content) return;

    content.innerHTML = renderProfileView(state.profile, state.user);

    // Bind buttons
    const btnEdit = $("btn-open-profile-editor");
    btnEdit?.addEventListener("click", () => window.openProfileEditor?.(), { once: true });

    const btnLogout = $("btn-logout");
    btnLogout?.addEventListener("click", () => window.handleLogout?.(), { once: true });

    openModal(modal);
  };

  // -----------------------------
  // Profile editor modal
  // -----------------------------
  window.openProfileEditor = async function openProfileEditor() {
    try {
      if (!window.supabase) {
        alert("Supabase not ready. Refresh and try again.");
        return;
      }

      const { data: { user } } = await window.supabase.auth.getUser();
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

      const interests = Array.isArray(profile.interests) ? profile.interests.join(", ") : (profile.interests || "");

      content.innerHTML = `
        <h2 style="color: #00e0ff; margin-bottom: 1.25rem;">
          <i class="fas fa-user-edit"></i> Edit Your Profile
        </h2>

        <form id="edit-profile-form" style="max-width: 640px;">
          <div style="margin-bottom: 1.25rem; text-align: center;">
            <div id="edit-profile-image-preview" style="margin-bottom: 1rem;">
              ${
                profile.image_url
                  ? `<img src="${profile.image_url}" alt="Profile" style="width: 100px; height: 100px; border-radius: 50%; object-fit: cover; border: 3px solid #00e0ff;">`
                  : `<div style="width: 100px; height: 100px; border-radius: 50%; background: rgba(0,224,255,0.1); border: 3px dashed rgba(0,224,255,0.3); display: inline-flex; align-items: center; justify-content: center;">
                       <i class="fas fa-user" style="font-size: 2.5rem; color: rgba(0,224,255,0.3);"></i>
                     </div>`
              }
            </div>
            <div style="margin-bottom: 1rem;">
              <input type="url" id="edit-image-url" value="${escapeHtml(profile.image_url || "")}" placeholder="Profile image URL"
                style="width: 100%; padding: 0.75rem; background: rgba(0,224,255,0.05); border: 1px solid rgba(0,224,255,0.2); border-radius: 8px; color: white; font-family: inherit;">
            </div>
          </div>

          <div style="margin-bottom: 1rem;">
            <label style="display: block; color: #aaa; margin-bottom: 0.5rem; font-weight: bold;">Name *</label>
            <input type="text" id="edit-name" value="${escapeHtml(profile.name || "")}" required placeholder="Your full name"
              style="width: 100%; padding: 0.75rem; background: rgba(0,224,255,0.05); border: 1px solid rgba(0,224,255,0.2); border-radius: 8px; color: white; font-family: inherit;">
          </div>

          <div style="margin-bottom: 1rem;">
            <label style="display: block; color: #aaa; margin-bottom: 0.5rem; font-weight: bold;">Bio</label>
            <textarea id="edit-bio" rows="3" placeholder="Tell us about yourself..."
              style="width: 100%; padding: 0.75rem; background: rgba(0,224,255,0.05); border: 1px solid rgba(0,224,255,0.2); border-radius: 8px; color: white; font-family: inherit; resize: vertical;"
            >${escapeHtml(profile.bio || "")}</textarea>
          </div>

          <div style="margin-bottom: 1rem;">
            <label style="display: block; color: #aaa; margin-bottom: 0.5rem; font-weight: bold;">Skills (comma-separated)</label>
            <input type="text" id="edit-skills" value="${escapeHtml(profile.skills || "")}" placeholder="e.g., JavaScript, React, Python, Design"
              style="width: 100%; padding: 0.75rem; background: rgba(0,224,255,0.05); border: 1px solid rgba(0,224,255,0.2); border-radius: 8px; color: white; font-family: inherit;">
          </div>

          <div style="margin-bottom: 1rem;">
            <label style="display: block; color: #aaa; margin-bottom: 0.5rem; font-weight: bold;">Interests (comma-separated)</label>
            <input type="text" id="edit-interests" value="${escapeHtml(interests)}" placeholder="e.g., AI, Web3, Sustainability"
              style="width: 100%; padding: 0.75rem; background: rgba(0,224,255,0.05); border: 1px solid rgba(0,224,255,0.2); border-radius: 8px; color: white; font-family: inherit;">
          </div>

          <div style="margin-bottom: 1.25rem;">
            <label style="display: block; color: #aaa; margin-bottom: 0.5rem; font-weight: bold;">Availability</label>
            <select id="edit-availability" style="width: 100%; padding: 0.75rem; background: rgba(0,224,255,0.05); border: 1px solid rgba(0,224,255,0.2); border-radius: 8px; color: white; font-family: inherit;">
              ${["Available now","Available for mentoring","Looking for opportunities","Busy","Not available"].map(v => `
                <option value="${v}" ${profile.availability === v ? "selected" : ""}>${v}</option>
              `).join("")}
            </select>
          </div>

          <div style="display: flex; gap: 0.75rem; flex-wrap:wrap;">
            <button type="submit" class="btn btn-primary" style="flex: 1; min-width:200px; background: linear-gradient(135deg, #00e0ff, #0080ff); border: none; padding: 0.9rem 1rem; border-radius: 8px; color: white; font-weight: bold; cursor: pointer; font-size: 1rem;">
              <i class="fas fa-save"></i> Save Changes
            </button>
            <button type="button" id="edit-cancel" class="btn" style="background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); padding: 0.9rem 1.25rem; border-radius: 8px; color: white; cursor: pointer; font-size: 1rem;">
              Cancel
            </button>
          </div>
        </form>
      `;

      $("edit-cancel")?.addEventListener("click", () => window.closeProfileModal(), { once: true });

      $("edit-profile-form")?.addEventListener("submit", async (e) => {
        e.preventDefault();

        const updated = {
          user_id: user.id,
          name: $("edit-name").value.trim(),
          bio: $("edit-bio").value.trim(),
          skills: $("edit-skills").value.trim(),
          interests: $("edit-interests").value
            .split(",")
            .map((i) => i.trim())
            .filter(Boolean),
          availability: $("edit-availability").value,
          image_url: $("edit-image-url").value.trim() || null,
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

        // Also broadcast so other modules can refresh.
        window.dispatchEvent(new CustomEvent("profile-loaded", { detail: { user, profile: state.profile } }));
      });

      openModal(modal);
    } catch (e) {
      console.error("Error in openProfileEditor:", e);
      alert("Error opening profile editor.");
    }
  };

  function toast(message) {
    const t = document.createElement("div");
    t.style.cssText = `
      position: fixed; top: 100px; right: 20px;
      background: linear-gradient(135deg, #00ff88, #00cc70);
      color: white; padding: 1rem 1.5rem; border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3); z-index: 10000; font-weight: 800;
    `;
    t.innerHTML = `<i class="fas fa-check-circle"></i> ${escapeHtml(message)}`;
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

  console.log("✅ profile.js loaded (v1)");
})();
