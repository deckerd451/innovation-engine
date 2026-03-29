// ================================================================
// CharlestonHacks Innovation Engine — ORGANIZATION PROFILE
// File: /assets/js/organizations/organization-profile.js
// ================================================================
// Renders organization profile pages with member lists, opportunities,
// and interaction buttons
//
// Features:
// ✅ Display organization information and branding
// ✅ Show team members with roles
// ✅ List open opportunities
// ✅ Display sponsored themes
// ✅ Follow/unfollow functionality
// ✅ Member management UI for admins
//
// Requires:
//  - organization-manager.js
//  - opportunities.js (for opportunity display)
// ================================================================

/* global OrganizationManager, OpportunityManager */

import {
  getOrganization,
  getOrganizationMembers,
  updateOrganization,
  followOrganization,
  unfollowOrganization,
  isFollowing,
  canEditOrganization,
  getCurrentUserCommunityId,
} from "./organization-manager.js";

// ========================
// STATE
// ========================
let currentOrganization = null;
let currentMembers = [];
let isUserFollowing = false;
let userCanEdit = false;
// Resolved once during init; used by canEditOrganization() and the edit modal.
let _communityId = null;

// ========================
// INIT
// ========================
export async function initOrganizationProfile(organizationIdOrSlug) {
  try {
    // Resolve current user's community profile id from the manager module state.
    // No extra DB call — the manager already did this during initOrganizationManager().
    _communityId = getCurrentUserCommunityId();
    console.log("[org-profile] init — communityId:", _communityId, "| lookup:", organizationIdOrSlug);

    // Load organization + members in a single query (getOrganization now embeds members)
    currentOrganization = await getOrganization(organizationIdOrSlug);
    if (!currentOrganization) {
      showError("Organization not found");
      return;
    }

    // Use the embedded members from the org query (no second round-trip)
    currentMembers = (currentOrganization.organization_members || []).filter(
      (m) => m.status === "active"
    );

    // Determine edit permission synchronously from already-fetched member data
    userCanEdit = canEditOrganization(currentOrganization, _communityId);
    console.log("[org-profile] userCanEdit:", userCanEdit, "| members in payload:", currentOrganization.organization_members?.length ?? 0);

    // Check following status (still needs a DB call)
    isUserFollowing = await isFollowing(currentOrganization.id);

    renderOrganizationProfile();
    console.log("%c✓ Organization Profile loaded", "color: #0f0", { id: currentOrganization.id, userCanEdit });
  } catch (error) {
    console.error("[org-profile] initOrganizationProfile failed:", error);
    showError("Failed to load organization profile");
  }
}

// ========================
// RENDER FUNCTIONS
// ========================

function renderOrganizationProfile() {
  const container = document.getElementById("organization-profile-container");
  if (!container) {
    console.error("Organization profile container not found");
    return;
  }

  container.innerHTML = `
    ${renderHeader()}
    ${renderInfo()}
    ${renderTabs()}
    <div id="organization-content-area"></div>
  `;

  // Bind event listeners
  bindEventListeners();

  // Load default tab (about)
  showTab("about");
}

function renderHeader() {
  const org = currentOrganization;

  return `
    <div class="org-header" style="background-image: url('${org.banner_url || "/images/default-org-banner.jpg"}');">
      <div class="org-header-overlay">
        <div class="org-header-content">
          <img src="${org.logo_url || "https://via.placeholder.com/150"}"
               alt="${org.name} logo"
               class="org-logo-large">
          <div class="org-header-info">
            <h1 class="org-name">
              ${org.name}
              ${org.verified ? '<i class="fas fa-check-circle verified-badge" title="Verified Organization"></i>' : ''}
            </h1>
            <div class="org-tags">
              ${org.industry ? org.industry.map(ind => `<span class="industry-tag">${ind}</span>`).join('') : ''}
              ${org.size ? `<span class="size-tag">${formatSize(org.size)}</span>` : ''}
              ${org.location ? `<span class="location-tag"><i class="fas fa-map-marker-alt"></i> ${org.location}</span>` : ''}
            </div>
            <div class="org-stats">
              <span class="stat">
                <i class="fas fa-users"></i>
                <strong>${org.follower_count || 0}</strong> followers
              </span>
              <span class="stat">
                <i class="fas fa-briefcase"></i>
                <strong>${org.opportunity_count || 0}</strong> opportunities
              </span>
              <span class="stat">
                <i class="fas fa-user-tie"></i>
                <strong>${currentMembers.length}</strong> members
              </span>
            </div>
          </div>
          <div class="org-header-actions">
            ${renderActionButtons()}
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderActionButtons() {
  let buttons = '';

  // Follow/Unfollow button
  if (isUserFollowing) {
    buttons += `
      <button class="btn btn-secondary" id="unfollow-org-btn">
        <i class="fas fa-user-minus"></i> Unfollow
      </button>
    `;
  } else {
    buttons += `
      <button class="btn btn-primary" id="follow-org-btn">
        <i class="fas fa-user-plus"></i> Follow
      </button>
    `;
  }

  // Edit button (if user has permissions)
  if (userCanEdit) {
    buttons += `
      <button class="btn btn-accent" id="edit-org-btn">
        <i class="fas fa-edit"></i> Edit Profile
      </button>
    `;
  }

  return buttons;
}

function renderInfo() {
  const org = currentOrganization;

  return `
    <div class="org-info-section">
      <p class="org-description">${org.description || 'No description provided.'}</p>
      <div class="org-links">
        ${org.website ? `<a href="${org.website}" target="_blank" rel="noopener" class="org-link">
          <i class="fas fa-globe"></i> Website
        </a>` : ''}
        ${org.linkedin_url ? `<a href="${org.linkedin_url}" target="_blank" rel="noopener" class="org-link">
          <i class="fab fa-linkedin"></i> LinkedIn
        </a>` : ''}
        ${org.twitter_url ? `<a href="${org.twitter_url}" target="_blank" rel="noopener" class="org-link">
          <i class="fab fa-twitter"></i> Twitter
        </a>` : ''}
        ${org.github_url ? `<a href="${org.github_url}" target="_blank" rel="noopener" class="org-link">
          <i class="fab fa-github"></i> GitHub
        </a>` : ''}
      </div>
    </div>
  `;
}

function renderTabs() {
  return `
    <div class="org-tabs">
      <button class="org-tab active" data-tab="about">About</button>
      <button class="org-tab" data-tab="opportunities">Opportunities (${currentOrganization.opportunity_count || 0})</button>
      <button class="org-tab" data-tab="team">Team (${currentMembers.length})</button>
      <button class="org-tab" data-tab="themes">Sponsored Themes</button>
    </div>
  `;
}

function showTab(tabName) {
  // Update active tab
  document.querySelectorAll(".org-tab").forEach(tab => {
    tab.classList.toggle("active", tab.dataset.tab === tabName);
  });

  // Render tab content
  const contentArea = document.getElementById("organization-content-area");
  if (!contentArea) return;

  switch (tabName) {
    case "about":
      contentArea.innerHTML = renderAboutTab();
      break;
    case "opportunities":
      contentArea.innerHTML = '<div id="opportunities-list">Loading opportunities...</div>';
      loadOpportunities();
      break;
    case "team":
      contentArea.innerHTML = renderTeamTab();
      break;
    case "themes":
      contentArea.innerHTML = renderThemesTab();
      break;
  }
}

function renderAboutTab() {
  const org = currentOrganization;

  return `
    <div class="org-about-tab">
      <div class="about-section">
        <h3>About ${org.name}</h3>
        <p>${org.description || 'No description provided.'}</p>
        ${org.founded_year ? `<p><strong>Founded:</strong> ${org.founded_year}</p>` : ''}
        ${org.size ? `<p><strong>Company Size:</strong> ${formatSize(org.size)}</p>` : ''}
        ${org.location ? `<p><strong>Location:</strong> ${org.location}</p>` : ''}
      </div>

      ${org.industry && org.industry.length > 0 ? `
        <div class="about-section">
          <h3>Industries</h3>
          <div class="industry-tags">
            ${org.industry.map(ind => `<span class="industry-tag-large">${ind}</span>`).join('')}
          </div>
        </div>
      ` : ''}

      <div class="about-section">
        <h3>Connect</h3>
        <div class="org-links-large">
          ${org.website ? `
            <a href="${org.website}" target="_blank" rel="noopener" class="org-link-card">
              <i class="fas fa-globe"></i>
              <span>Visit Website</span>
            </a>
          ` : ''}
          ${org.linkedin_url ? `
            <a href="${org.linkedin_url}" target="_blank" rel="noopener" class="org-link-card">
              <i class="fab fa-linkedin"></i>
              <span>LinkedIn</span>
            </a>
          ` : ''}
          ${org.twitter_url ? `
            <a href="${org.twitter_url}" target="_blank" rel="noopener" class="org-link-card">
              <i class="fab fa-twitter"></i>
              <span>Twitter</span>
            </a>
          ` : ''}
          ${org.github_url ? `
            <a href="${org.github_url}" target="_blank" rel="noopener" class="org-link-card">
              <i class="fab fa-github"></i>
              <span>GitHub</span>
            </a>
          ` : ''}
        </div>
      </div>
    </div>
  `;
}

function renderTeamTab() {
  if (currentMembers.length === 0) {
    return '<p class="empty-state">No team members yet.</p>';
  }

  return `
    <div class="org-team-tab">
      <h3>Team Members</h3>
      <div class="team-members-grid">
        ${currentMembers.map(member => renderMemberCard(member)).join('')}
      </div>
    </div>
  `;
}

function renderMemberCard(member) {
  const community = member.community;

  return `
    <div class="member-card">
      <img src="${community.profile_pic || 'https://via.placeholder.com/80'}"
           alt="${community.name}"
           class="member-avatar">
      <div class="member-info">
        <h4 class="member-name">${community.name}</h4>
        <p class="member-role">${formatRole(member.role)}</p>
        ${member.title ? `<p class="member-title">${member.title}</p>` : ''}
        ${member.bio ? `<p class="member-bio">${member.bio}</p>` : ''}
        ${community.skills && community.skills.length > 0 ? `
          <div class="member-skills">
            ${community.skills.slice(0, 3).map(skill => `<span class="skill-tag">${skill}</span>`).join('')}
          </div>
        ` : ''}
      </div>
      <a href="/profile.html?id=${community.id}" class="btn btn-sm btn-secondary">View Profile</a>
    </div>
  `;
}

function renderThemesTab() {
  // This would load sponsored themes from the database
  return `
    <div class="org-themes-tab">
      <h3>Sponsored Themes</h3>
      <p class="empty-state">No sponsored themes yet.</p>
      ${userCanEdit ? `
        <button class="btn btn-primary" id="sponsor-theme-btn">
          <i class="fas fa-plus"></i> Sponsor a Theme
        </button>
      ` : ''}
    </div>
  `;
}

async function loadOpportunities() {
  try {
    // Import opportunities module dynamically
    const { getOpportunitiesByOrganization } = await import("./opportunities.js");

    const opportunities = await getOpportunitiesByOrganization(currentOrganization.id);

    const container = document.getElementById("opportunities-list");
    if (!container) return;

    if (opportunities.length === 0) {
      container.innerHTML = `
        <p class="empty-state">No open opportunities at this time.</p>
        ${userCanEdit ? `
          <button class="btn btn-primary" id="post-opportunity-btn">
            <i class="fas fa-plus"></i> Post an Opportunity
          </button>
        ` : ''}
      `;
      return;
    }

    container.innerHTML = `
      <div class="opportunities-grid">
        ${opportunities.map(opp => renderOpportunityCard(opp)).join('')}
      </div>
      ${userCanEdit ? `
        <button class="btn btn-primary" id="post-opportunity-btn">
          <i class="fas fa-plus"></i> Post an Opportunity
        </button>
      ` : ''}
    `;
  } catch (error) {
    console.error("Error loading opportunities:", error);
    document.getElementById("opportunities-list").innerHTML =
      '<p class="error-state">Failed to load opportunities.</p>';
  }
}

function renderOpportunityCard(opportunity) {
  return `
    <div class="opportunity-card" data-id="${opportunity.id}">
      <div class="opp-header">
        <h4>${opportunity.title}</h4>
        <span class="opp-type-badge">${formatOpportunityType(opportunity.type)}</span>
      </div>
      <p class="opp-description">${truncate(opportunity.description, 150)}</p>
      <div class="opp-details">
        ${opportunity.location ? `<span><i class="fas fa-map-marker-alt"></i> ${opportunity.location}</span>` : ''}
        ${opportunity.remote_ok ? `<span><i class="fas fa-home"></i> Remote OK</span>` : ''}
        ${opportunity.compensation_range ? `<span><i class="fas fa-dollar-sign"></i> ${opportunity.compensation_range}</span>` : ''}
      </div>
      ${opportunity.skills && opportunity.skills.length > 0 ? `
        <div class="opp-skills">
          ${opportunity.skills.slice(0, 5).map(skill => `<span class="skill-tag">${skill}</span>`).join('')}
        </div>
      ` : ''}
      <div class="opp-footer">
        <span class="opp-posted">${formatDate(opportunity.created_at)}</span>
        <a href="/opportunity.html?id=${opportunity.id}" class="btn btn-sm btn-primary">View Details</a>
      </div>
    </div>
  `;
}

// ========================
// EVENT HANDLERS
// ========================

function bindEventListeners() {
  // Follow button
  const followBtn = document.getElementById("follow-org-btn");
  if (followBtn) {
    followBtn.addEventListener("click", handleFollow);
  }

  // Unfollow button
  const unfollowBtn = document.getElementById("unfollow-org-btn");
  if (unfollowBtn) {
    unfollowBtn.addEventListener("click", handleUnfollow);
  }

  // Edit button
  const editBtn = document.getElementById("edit-org-btn");
  if (editBtn) {
    editBtn.addEventListener("click", handleEdit);
  }

  // Tab buttons
  document.querySelectorAll(".org-tab").forEach(tab => {
    tab.addEventListener("click", (e) => {
      showTab(e.target.dataset.tab);
    });
  });
}

async function handleFollow() {
  try {
    await followOrganization(currentOrganization.id);
    isUserFollowing = true;
    currentOrganization.follower_count++;
    renderOrganizationProfile();
  } catch (error) {
    console.error("Error following organization:", error);
  }
}

async function handleUnfollow() {
  try {
    await unfollowOrganization(currentOrganization.id);
    isUserFollowing = false;
    currentOrganization.follower_count--;
    renderOrganizationProfile();
  } catch (error) {
    console.error("Error unfollowing organization:", error);
  }
}

function handleEdit() {
  // Double-check permission against live member data before opening modal.
  // This catches the edge case where permission changed since the page loaded.
  const stillCanEdit = canEditOrganization(currentOrganization, _communityId);
  console.log("[org-profile] handleEdit — canEditOrganization:", stillCanEdit, { orgId: currentOrganization.id, _communityId });
  if (!stillCanEdit) {
    alert("You no longer have permission to edit this organization.");
    return;
  }
  openEditModal();
}

// ========================
// EDIT MODAL
// ========================

function openEditModal() {
  const existing = document.getElementById("org-edit-modal-overlay");
  if (existing) existing.remove();

  const org = currentOrganization;
  const overlay = document.createElement("div");
  overlay.id = "org-edit-modal-overlay";
  overlay.style.cssText = [
    "position:fixed", "inset:0", "background:rgba(0,0,0,0.75)",
    "z-index:10000", "display:flex", "align-items:center",
    "justify-content:center", "backdrop-filter:blur(4px)",
  ].join(";");

  overlay.innerHTML = `
    <div id="org-edit-modal" style="
      background:rgba(15,20,50,0.98);
      border:1px solid rgba(168,85,247,0.4);
      border-radius:16px;
      padding:2rem;
      width:min(560px,92vw);
      max-height:90vh;
      overflow-y:auto;
      position:relative;
    ">
      <button id="org-edit-close-btn" style="
        position:absolute;top:1rem;right:1rem;background:none;border:none;
        color:#aaa;font-size:1.2rem;cursor:pointer;
      "><i class="fas fa-times"></i></button>

      <h2 style="color:#a855f7;margin:0 0 1.5rem;">
        <i class="fas fa-edit"></i> Edit Organization
      </h2>

      <form id="org-edit-form" autocomplete="off">
        <div style="margin-bottom:1rem;">
          <label style="display:block;color:#aaa;margin-bottom:0.4rem;font-size:0.875rem;">Name *</label>
          <input type="text" id="edit-org-name" required
            value="${escapeAttr(org.name)}"
            style="${inputStyle()}">
        </div>

        <div style="margin-bottom:1rem;">
          <label style="display:block;color:#aaa;margin-bottom:0.4rem;font-size:0.875rem;">Description</label>
          <textarea id="edit-org-description" rows="4" style="${inputStyle()}">${escapeHtml(org.description || "")}</textarea>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1rem;">
          <div>
            <label style="display:block;color:#aaa;margin-bottom:0.4rem;font-size:0.875rem;">Location</label>
            <input type="text" id="edit-org-location"
              value="${escapeAttr(org.location || "")}"
              placeholder="e.g. Charleston, SC"
              style="${inputStyle()}">
          </div>
          <div>
            <label style="display:block;color:#aaa;margin-bottom:0.4rem;font-size:0.875rem;">Size</label>
            <select id="edit-org-size" style="${inputStyle()}">
              <option value="">— select —</option>
              ${["startup","small","medium","large","enterprise"].map(s =>
                `<option value="${s}" ${org.size === s ? "selected" : ""}>${formatSize(s)}</option>`
              ).join("")}
            </select>
          </div>
        </div>

        <div style="margin-bottom:1rem;">
          <label style="display:block;color:#aaa;margin-bottom:0.4rem;font-size:0.875rem;">Industry (comma-separated)</label>
          <input type="text" id="edit-org-industry"
            value="${escapeAttr((org.industry || []).join(", "))}"
            placeholder="e.g. Technology, Education"
            style="${inputStyle()}">
        </div>

        <div style="margin-bottom:1rem;">
          <label style="display:block;color:#aaa;margin-bottom:0.4rem;font-size:0.875rem;">Website</label>
          <input type="url" id="edit-org-website"
            value="${escapeAttr(org.website || "")}"
            placeholder="https://..."
            style="${inputStyle()}">
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1rem;margin-bottom:1.5rem;">
          <div>
            <label style="display:block;color:#aaa;margin-bottom:0.4rem;font-size:0.875rem;">LinkedIn URL</label>
            <input type="url" id="edit-org-linkedin"
              value="${escapeAttr(org.linkedin_url || "")}"
              style="${inputStyle()}">
          </div>
          <div>
            <label style="display:block;color:#aaa;margin-bottom:0.4rem;font-size:0.875rem;">Twitter URL</label>
            <input type="url" id="edit-org-twitter"
              value="${escapeAttr(org.twitter_url || "")}"
              style="${inputStyle()}">
          </div>
          <div>
            <label style="display:block;color:#aaa;margin-bottom:0.4rem;font-size:0.875rem;">GitHub URL</label>
            <input type="url" id="edit-org-github"
              value="${escapeAttr(org.github_url || "")}"
              style="${inputStyle()}">
          </div>
        </div>

        <div id="org-edit-error" style="display:none;color:#f44336;margin-bottom:1rem;font-size:0.875rem;padding:0.75rem;background:rgba(244,67,54,0.1);border-radius:6px;"></div>

        <div style="display:flex;gap:0.75rem;justify-content:flex-end;">
          <button type="button" id="org-edit-cancel-btn"
            style="padding:0.7rem 1.25rem;background:transparent;border:1px solid rgba(255,255,255,0.2);
                   border-radius:8px;color:#aaa;cursor:pointer;font-size:0.9rem;">
            Cancel
          </button>
          <button type="submit" id="org-edit-save-btn"
            style="padding:0.7rem 1.5rem;background:linear-gradient(135deg,#a855f7,#8b5cf6);
                   border:none;border-radius:8px;color:white;font-weight:600;cursor:pointer;font-size:0.9rem;">
            <i class="fas fa-save"></i> Save Changes
          </button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(overlay);

  // Close handlers
  document.getElementById("org-edit-close-btn").addEventListener("click", () => overlay.remove());
  document.getElementById("org-edit-cancel-btn").addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });

  // Submit handler
  document.getElementById("org-edit-form").addEventListener("submit", handleSaveEdit);
}

async function handleSaveEdit(e) {
  e.preventDefault();

  const errEl = document.getElementById("org-edit-error");
  const saveBtn = document.getElementById("org-edit-save-btn");
  errEl.style.display = "none";

  const industryRaw = document.getElementById("edit-org-industry").value.trim();
  const updates = {
    name:         document.getElementById("edit-org-name").value.trim(),
    description:  document.getElementById("edit-org-description").value.trim() || null,
    location:     document.getElementById("edit-org-location").value.trim() || null,
    size:         document.getElementById("edit-org-size").value || null,
    industry:     industryRaw ? industryRaw.split(",").map(s => s.trim()).filter(Boolean) : null,
    website:      document.getElementById("edit-org-website").value.trim() || null,
    linkedin_url: document.getElementById("edit-org-linkedin").value.trim() || null,
    twitter_url:  document.getElementById("edit-org-twitter").value.trim() || null,
    github_url:   document.getElementById("edit-org-github").value.trim() || null,
  };

  if (!updates.name || updates.name.length < 2) {
    errEl.textContent = "Organization name must be at least 2 characters.";
    errEl.style.display = "block";
    return;
  }

  console.log("[org-profile] handleSaveEdit — payload:", updates, "| orgId:", currentOrganization.id);
  saveBtn.disabled = true;
  saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…';

  try {
    const updated = await updateOrganization(currentOrganization.id, updates);
    console.log("[org-profile] handleSaveEdit — update result:", updated);

    // Merge the saved fields back into local state so the re-render is instant
    currentOrganization = { ...currentOrganization, ...updated };

    // Close modal and re-render the profile in place
    const overlay = document.getElementById("org-edit-modal-overlay");
    if (overlay) overlay.remove();
    renderOrganizationProfile();

    // Also refresh the discovery list if it's on the same page
    if (typeof window.OrganizationDiscovery?.loadOrganizations === "function") {
      window.OrganizationDiscovery.loadOrganizations();
    }
  } catch (error) {
    console.error("[org-profile] handleSaveEdit — updateOrganization threw:", error);
    errEl.textContent = error.message || "Failed to save changes. Check console for details.";
    errEl.style.display = "block";
    saveBtn.disabled = false;
    saveBtn.innerHTML = '<i class="fas fa-save"></i> Save Changes';
  }
}

// Shared input style string so the modal form is consistent
function inputStyle() {
  return [
    "width:100%",
    "padding:0.65rem 0.75rem",
    "background:rgba(168,85,247,0.06)",
    "border:1px solid rgba(168,85,247,0.25)",
    "border-radius:8px",
    "color:white",
    "font-family:inherit",
    "font-size:0.9rem",
    "box-sizing:border-box",
  ].join(";");
}

// Escape a string for use in an HTML attribute value
function escapeAttr(str) {
  return String(str).replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;");
}

// Escape a string for use as HTML text content
function escapeHtml(str) {
  return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

// ========================
// UTILITY FUNCTIONS
// ========================

function formatSize(size) {
  const sizeMap = {
    startup: "Startup (1-10)",
    small: "Small (11-50)",
    medium: "Medium (51-200)",
    large: "Large (201-1000)",
    enterprise: "Enterprise (1000+)",
  };
  return sizeMap[size] || size;
}

function formatRole(role) {
  const roleMap = {
    owner: "Owner",
    admin: "Administrator",
    member: "Member",
    representative: "Representative",
  };
  return roleMap[role] || role;
}

function formatOpportunityType(type) {
  const typeMap = {
    job: "Job",
    internship: "Internship",
    volunteer: "Volunteer",
    contract: "Contract",
    mentorship: "Mentorship",
  };
  return typeMap[type] || type;
}

function formatDate(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffTime = Math.abs(now - date);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return date.toLocaleDateString();
}

function truncate(text, maxLength) {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "...";
}

function showError(message) {
  const container = document.getElementById("organization-profile-container");
  if (container) {
    container.innerHTML = `
      <div class="error-container">
        <i class="fas fa-exclamation-triangle"></i>
        <h2>${message}</h2>
        <a href="/organizations.html" class="btn btn-primary">Browse Organizations</a>
      </div>
    `;
  }
}

// ========================
// EXPORTS
// ========================

if (typeof window !== "undefined") {
  window.OrganizationProfile = {
    init: initOrganizationProfile,
  };
}
