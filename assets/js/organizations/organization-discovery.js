// ================================================================
// CharlestonHacks Innovation Engine — ORGANIZATION DISCOVERY
// File: /assets/js/organizations/organization-discovery.js
// ================================================================
// Browse, search, and discover organizations
//
// Features:
// ✅ Browse all active organizations
// ✅ Filter by industry, size, location
// ✅ Search by name and keywords
// ✅ Sort by followers, opportunities, name
// ✅ Grid and list views
// ✅ Follow organizations directly from discovery
//
// Requires:
//  - organization-manager.js
// ================================================================

/* global OrganizationManager */

import {
  getOrganizations,
  followOrganization,
  unfollowOrganization,
  isFollowing,
} from "./organization-manager.js";

// ========================
// STATE
// ========================
let currentFilters = {
  search: "",
  industry: null,
  size: null,
  location: "",
  verified: null,
  sortBy: "follower_count",
  sortOrder: "desc",
  limit: 20,
  offset: 0,
};

let organizations = [];
let totalOrganizations = 0;
let viewMode = "grid"; // 'grid' or 'list'

// ========================
// INIT
// ========================
export async function initOrganizationDiscovery() {
  try {
    // Load initial organizations
    await loadOrganizations();

    // Setup event listeners
    setupEventListeners();

    console.log("%c✓ Organization Discovery initialized", "color: #0f0");
  } catch (error) {
    console.error("Error initializing organization discovery:", error);
    showError("Failed to load organizations");
  }
}

// ========================
// LOAD ORGANIZATIONS
// ========================
async function loadOrganizations(append = false) {
  try {
    const container = document.getElementById("organizations-container");
    if (!container) return;

    // Show loading state
    if (!append) {
      container.innerHTML = '<div class="loading-spinner">Loading organizations...</div>';
    }

    // Fetch organizations
    const results = await getOrganizations(currentFilters);

    if (!append) {
      organizations = results;
    } else {
      organizations = [...organizations, ...results];
    }

    // Render organizations
    renderOrganizations();

    // Update pagination
    updatePaginationButtons(results.length);
  } catch (error) {
    console.error("Error loading organizations:", error);
    showError("Failed to load organizations");
  }
}

// ========================
// RENDER FUNCTIONS
// ========================

function renderOrganizations() {
  const container = document.getElementById("organizations-container");
  if (!container) return;

  if (organizations.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-building"></i>
        <h3>No organizations found</h3>
        <p>Try adjusting your filters or search terms.</p>
        <button class="btn btn-primary" id="clear-filters-btn">Clear Filters</button>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="organizations-${viewMode}">
      ${organizations.map(org => renderOrganizationCard(org)).join("")}
    </div>
  `;

  // Bind follow buttons
  bindFollowButtons();
}

function renderOrganizationCard(org) {
  if (viewMode === "grid") {
    return `
      <div class="organization-card" data-id="${org.id}">
        <div class="org-card-header">
          <img src="${org.logo_url || "https://via.placeholder.com/100"}"
               alt="${org.name}"
               class="org-card-logo">
          ${org.verified ? '<span class="verified-badge-small" title="Verified"><i class="fas fa-check-circle"></i></span>' : ''}
        </div>
        <div class="org-card-body">
          <h3 class="org-card-name">${org.name}</h3>
          <p class="org-card-description">${truncate(org.description || "", 100)}</p>
          <div class="org-card-tags">
            ${org.industry ? org.industry.slice(0, 2).map(ind => `<span class="industry-tag-sm">${ind}</span>`).join('') : ''}
          </div>
          <div class="org-card-stats">
            <span><i class="fas fa-users"></i> ${org.follower_count || 0}</span>
            <span><i class="fas fa-briefcase"></i> ${org.opportunity_count || 0}</span>
            ${org.location ? `<span><i class="fas fa-map-marker-alt"></i> ${truncate(org.location, 20)}</span>` : ''}
          </div>
        </div>
        <div class="org-card-footer">
          <a href="/organization-profile.html?slug=${org.slug}" class="btn btn-sm btn-secondary">View Profile</a>
          <button class="btn btn-sm btn-primary follow-btn" data-org-id="${org.id}">
            <i class="fas fa-user-plus"></i> Follow
          </button>
        </div>
      </div>
    `;
  } else {
    // List view
    return `
      <div class="organization-list-item" data-id="${org.id}">
        <img src="${org.logo_url || "https://via.placeholder.com/60"}"
             alt="${org.name}"
             class="org-list-logo">
        <div class="org-list-info">
          <h3 class="org-list-name">
            ${org.name}
            ${org.verified ? '<i class="fas fa-check-circle verified-badge-inline"></i>' : ''}
          </h3>
          <p class="org-list-description">${truncate(org.description || "", 150)}</p>
          <div class="org-list-meta">
            ${org.industry ? org.industry.slice(0, 3).map(ind => `<span class="industry-tag-sm">${ind}</span>`).join('') : ''}
            ${org.size ? `<span class="size-badge">${formatSize(org.size)}</span>` : ''}
            ${org.location ? `<span class="location-text"><i class="fas fa-map-marker-alt"></i> ${org.location}</span>` : ''}
          </div>
        </div>
        <div class="org-list-stats">
          <div class="stat-item">
            <strong>${org.follower_count || 0}</strong>
            <span>Followers</span>
          </div>
          <div class="stat-item">
            <strong>${org.opportunity_count || 0}</strong>
            <span>Opportunities</span>
          </div>
          <div class="stat-item">
            <strong>${org.member_count || 0}</strong>
            <span>Members</span>
          </div>
        </div>
        <div class="org-list-actions">
          <a href="/organization-profile.html?slug=${org.slug}" class="btn btn-secondary">View Profile</a>
          <button class="btn btn-primary follow-btn" data-org-id="${org.id}">
            <i class="fas fa-user-plus"></i> Follow
          </button>
        </div>
      </div>
    `;
  }
}

// ========================
// EVENT HANDLERS
// ========================

function setupEventListeners() {
  // Search input
  const searchInput = document.getElementById("org-search-input");
  if (searchInput) {
    searchInput.addEventListener("input", debounce(handleSearch, 500));
  }

  // Filter selects
  const industryFilter = document.getElementById("org-industry-filter");
  if (industryFilter) {
    industryFilter.addEventListener("change", handleFilterChange);
  }

  const sizeFilter = document.getElementById("org-size-filter");
  if (sizeFilter) {
    sizeFilter.addEventListener("change", handleFilterChange);
  }

  const locationFilter = document.getElementById("org-location-filter");
  if (locationFilter) {
    locationFilter.addEventListener("input", debounce(handleFilterChange, 500));
  }

  const verifiedFilter = document.getElementById("org-verified-filter");
  if (verifiedFilter) {
    verifiedFilter.addEventListener("change", handleFilterChange);
  }

  // Sort select
  const sortSelect = document.getElementById("org-sort-select");
  if (sortSelect) {
    sortSelect.addEventListener("change", handleSortChange);
  }

  // View mode toggle
  const gridViewBtn = document.getElementById("grid-view-btn");
  if (gridViewBtn) {
    gridViewBtn.addEventListener("click", () => setViewMode("grid"));
  }

  const listViewBtn = document.getElementById("list-view-btn");
  if (listViewBtn) {
    listViewBtn.addEventListener("click", () => setViewMode("list"));
  }

  // Load more button
  const loadMoreBtn = document.getElementById("load-more-btn");
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener("click", handleLoadMore);
  }

  // Clear filters button
  document.addEventListener("click", (e) => {
    if (e.target.id === "clear-filters-btn" || e.target.closest("#clear-filters-btn")) {
      handleClearFilters();
    }
  });
}

function handleSearch(e) {
  currentFilters.search = e.target.value;
  currentFilters.offset = 0;
  loadOrganizations();
}

function handleFilterChange() {
  const industryFilter = document.getElementById("org-industry-filter");
  const sizeFilter = document.getElementById("org-size-filter");
  const locationFilter = document.getElementById("org-location-filter");
  const verifiedFilter = document.getElementById("org-verified-filter");

  currentFilters.industry = industryFilter?.value || null;
  currentFilters.size = sizeFilter?.value || null;
  currentFilters.location = locationFilter?.value || "";
  currentFilters.verified = verifiedFilter?.value === "true" ? true : verifiedFilter?.value === "false" ? false : null;
  currentFilters.offset = 0;

  loadOrganizations();
}

function handleSortChange(e) {
  const value = e.target.value;
  const [sortBy, sortOrder] = value.split("-");

  currentFilters.sortBy = sortBy;
  currentFilters.sortOrder = sortOrder;
  currentFilters.offset = 0;

  loadOrganizations();
}

function handleLoadMore() {
  currentFilters.offset += currentFilters.limit;
  loadOrganizations(true);
}

function handleClearFilters() {
  // Reset filters
  currentFilters = {
    search: "",
    industry: null,
    size: null,
    location: "",
    verified: null,
    sortBy: "follower_count",
    sortOrder: "desc",
    limit: 20,
    offset: 0,
  };

  // Reset form inputs
  const searchInput = document.getElementById("org-search-input");
  if (searchInput) searchInput.value = "";

  const industryFilter = document.getElementById("org-industry-filter");
  if (industryFilter) industryFilter.value = "";

  const sizeFilter = document.getElementById("org-size-filter");
  if (sizeFilter) sizeFilter.value = "";

  const locationFilter = document.getElementById("org-location-filter");
  if (locationFilter) locationFilter.value = "";

  const verifiedFilter = document.getElementById("org-verified-filter");
  if (verifiedFilter) verifiedFilter.value = "";

  const sortSelect = document.getElementById("org-sort-select");
  if (sortSelect) sortSelect.value = "follower_count-desc";

  // Reload organizations
  loadOrganizations();
}

function setViewMode(mode) {
  viewMode = mode;

  // Update active button
  const gridBtn = document.getElementById("grid-view-btn");
  const listBtn = document.getElementById("list-view-btn");

  if (gridBtn) gridBtn.classList.toggle("active", mode === "grid");
  if (listBtn) listBtn.classList.toggle("active", mode === "list");

  // Re-render
  renderOrganizations();
}

function bindFollowButtons() {
  document.querySelectorAll(".follow-btn").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      const orgId = e.currentTarget.dataset.orgId;
      await handleFollow(orgId, e.currentTarget);
    });
  });
}

async function handleFollow(orgId, button) {
  try {
    const isCurrentlyFollowing = button.querySelector("i").classList.contains("fa-user-minus");

    if (isCurrentlyFollowing) {
      await unfollowOrganization(orgId);
      button.innerHTML = '<i class="fas fa-user-plus"></i> Follow';

      // Update follower count
      const org = organizations.find(o => o.id === orgId);
      if (org) org.follower_count--;
    } else {
      await followOrganization(orgId);
      button.innerHTML = '<i class="fas fa-user-minus"></i> Unfollow';

      // Update follower count
      const org = organizations.find(o => o.id === orgId);
      if (org) org.follower_count++;
    }

    // Re-render to update counts
    renderOrganizations();
  } catch (error) {
    console.error("Error toggling follow:", error);
  }
}

function updatePaginationButtons(resultsCount) {
  const loadMoreBtn = document.getElementById("load-more-btn");
  if (!loadMoreBtn) return;

  // Hide load more button if we got fewer results than the limit
  if (resultsCount < currentFilters.limit) {
    loadMoreBtn.style.display = "none";
  } else {
    loadMoreBtn.style.display = "block";
  }
}

// ========================
// UTILITY FUNCTIONS
// ========================

function formatSize(size) {
  const sizeMap = {
    startup: "Startup",
    small: "Small",
    medium: "Medium",
    large: "Large",
    enterprise: "Enterprise",
  };
  return sizeMap[size] || size;
}

function truncate(text, maxLength) {
  if (!text || text.length <= maxLength) return text || "";
  return text.substring(0, maxLength) + "...";
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

function showError(message) {
  const container = document.getElementById("organizations-container");
  if (container) {
    container.innerHTML = `
      <div class="error-container">
        <i class="fas fa-exclamation-triangle"></i>
        <h2>${message}</h2>
        <button class="btn btn-primary" onclick="location.reload()">Reload Page</button>
      </div>
    `;
  }
}

// ========================
// EXPORTS
// ========================

if (typeof window !== "undefined") {
  window.OrganizationDiscovery = {
    init: initOrganizationDiscovery,
    loadOrganizations,
    setViewMode,
  };
}
