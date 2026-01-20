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
  followOrganization,
  unfollowOrganization,
  isFollowing,
  canUserEdit,
} from "./organization-manager.js";

// ========================
// STATE
// ========================
let currentOrganization = null;
let currentMembers = [];
let isUserFollowing = false;
let userCanEdit = false;

// ========================
// INIT
// ========================
export async function initOrganizationProfile(organizationIdOrSlug) {
  try {
    // Load organization data
    currentOrganization = await getOrganization(organizationIdOrSlug);
    if (!currentOrganization) {
      showError("Organization not found");
      return;
    }

    // Load members
    currentMembers = await getOrganizationMembers(currentOrganization.id);

    // Check following status
    isUserFollowing = await isFollowing(currentOrganization.id);

    // Check edit permissions
    userCanEdit = await canUserEdit(currentOrganization.id);

    // Render profile
    renderOrganizationProfile();

    console.log("%c✓ Organization Profile loaded", "color: #0f0");
  } catch (error) {
    console.error("Error initializing organization profile:", error);
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
      ${opportunity.required_skills && opportunity.required_skills.length > 0 ? `
        <div class="opp-skills">
          ${opportunity.required_skills.slice(0, 5).map(skill => `<span class="skill-tag">${skill}</span>`).join('')}
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
  // Redirect to organization admin page
  window.location.href = `/organization-admin.html?id=${currentOrganization.id}`;
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
