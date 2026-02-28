// ================================================================
// ADMIN PEOPLE MANAGEMENT PANEL
// ================================================================
// Modern UI for managing community members in the admin panel
// Replaces legacy "Add Person" and "Search/Remove" sections

import {
  listPeople,
  getPerson,
  updatePerson,
  setRole,
  setHidden,
  setDisabled,
  bulkUpdate,
  deletePerson,
  createPerson
} from './adminPeopleService.js';

// Escape user-supplied content before injecting into innerHTML
function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Panel state
let state = {
  search: '',
  filters: {
    role: null,
    hidden: null,
    disabled: null,
    claimed: null
  },
  page: 0,
  pageSize: 50,
  sortKey: 'created_at',
  sortDir: 'desc',
  selectedIds: new Set(),
  drawerPersonId: null,
  totalCount: 0
};

let searchDebounceTimer = null;

/**
 * Render the People Management panel
 * @param {HTMLElement} container - Container element
 */
export function renderPeoplePanel(container) {
  if (!container) return;

  container.innerHTML = `
    <div id="people-panel" style="max-height: 70vh; overflow: hidden; display: flex; flex-direction: column;">
      <!-- Toolbar -->
      <div id="people-toolbar" style="padding: 1rem; background: rgba(0,224,255,0.05); border: 2px solid rgba(0,224,255,0.3); border-radius: 12px; margin-bottom: 1rem;">
        <!-- Search and Filters Row -->
        <div style="display: flex; gap: 1rem; margin-bottom: 1rem; flex-wrap: wrap; align-items: center;">
          <!-- Search -->
          <input 
            type="text" 
            id="people-search-input" 
            placeholder="Search by name or email..." 
            style="flex: 1; min-width: 250px; padding: 0.75rem; background: rgba(0,0,0,0.3); border: 1px solid rgba(0,224,255,0.3); border-radius: 8px; color: white; font-size: 0.95rem;"
          />
          
          <!-- Primary CTA -->
          <button id="people-invite-btn" style="padding: 0.75rem 1.5rem; background: linear-gradient(135deg, #00ff88, #00e0ff); border: none; border-radius: 8px; color: #000; font-weight: 700; cursor: pointer; white-space: nowrap;">
            <i class="fas fa-user-plus"></i> Invite / Add Person
          </button>
        </div>
        
        <!-- Filters Row -->
        <div style="display: flex; gap: 0.75rem; flex-wrap: wrap; align-items: center;">
          <label style="color: rgba(255,255,255,0.7); font-size: 0.9rem; font-weight: 600;">Filters:</label>
          
          <select id="filter-role" style="padding: 0.5rem 0.75rem; background: rgba(0,0,0,0.3); border: 1px solid rgba(0,224,255,0.3); border-radius: 6px; color: white; font-size: 0.9rem; cursor: pointer;">
            <option value="">All Roles</option>
            <option value="Member">Member</option>
            <option value="Admin">Admin</option>
          </select>
          
          <select id="filter-hidden" style="padding: 0.5rem 0.75rem; background: rgba(0,0,0,0.3); border: 1px solid rgba(0,224,255,0.3); border-radius: 6px; color: white; font-size: 0.9rem; cursor: pointer;">
            <option value="">All Visibility</option>
            <option value="false">Visible</option>
            <option value="true">Hidden</option>
          </select>
          
          <select id="filter-disabled" style="padding: 0.5rem 0.75rem; background: rgba(0,0,0,0.3); border: 1px solid rgba(0,224,255,0.3); border-radius: 6px; color: white; font-size: 0.9rem; cursor: pointer;">
            <option value="">All Status</option>
            <option value="false">Active</option>
            <option value="true">Disabled</option>
          </select>
          
          <select id="filter-claimed" style="padding: 0.5rem 0.75rem; background: rgba(0,0,0,0.3); border: 1px solid rgba(0,224,255,0.3); border-radius: 6px; color: white; font-size: 0.9rem; cursor: pointer;">
            <option value="">All Accounts</option>
            <option value="true">Claimed</option>
            <option value="false">Unclaimed</option>
          </select>
          
          <button id="filter-clear-btn" style="padding: 0.5rem 1rem; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.3); border-radius: 6px; color: rgba(255,255,255,0.7); font-size: 0.9rem; cursor: pointer;">
            <i class="fas fa-times"></i> Clear
          </button>
        </div>
      </div>
      
      <!-- Results Count -->
      <div id="people-count" style="padding: 0.5rem 0; color: rgba(255,255,255,0.7); font-size: 0.9rem;">
        Loading...
      </div>
      
      <!-- Table Container (Desktop) -->
      <div id="people-table-container" style="flex: 1; overflow-y: auto; background: rgba(0,0,0,0.2); border: 1px solid rgba(0,224,255,0.2); border-radius: 8px; display: none;">
        <table id="people-table" style="width: 100%; border-collapse: collapse;">
          <thead style="position: sticky; top: 0; background: rgba(10,14,39,0.95); z-index: 1;">
            <tr style="border-bottom: 2px solid rgba(0,224,255,0.3);">
              <th style="padding: 0.75rem; text-align: left; color: #00e0ff; font-weight: 600; font-size: 0.85rem;">
                <input type="checkbox" id="select-all-checkbox" style="cursor: pointer; width: 16px; height: 16px;">
              </th>
              <th style="padding: 0.75rem; text-align: left; color: #00e0ff; font-weight: 600; font-size: 0.85rem; cursor: pointer;" data-sort="name">
                Name <i class="fas fa-sort"></i>
              </th>
              <th style="padding: 0.75rem; text-align: left; color: #00e0ff; font-weight: 600; font-size: 0.85rem; cursor: pointer;" data-sort="email">
                Email <i class="fas fa-sort"></i>
              </th>
              <th style="padding: 0.75rem; text-align: left; color: #00e0ff; font-weight: 600; font-size: 0.85rem; cursor: pointer;" data-sort="user_role">
                Role <i class="fas fa-sort"></i>
              </th>
              <th style="padding: 0.75rem; text-align: left; color: #00e0ff; font-weight: 600; font-size: 0.85rem;">
                Status
              </th>
              <th style="padding: 0.75rem; text-align: left; color: #00e0ff; font-weight: 600; font-size: 0.85rem; cursor: pointer;" data-sort="created_at">
                Created <i class="fas fa-sort"></i>
              </th>
              <th style="padding: 0.75rem; text-align: center; color: #00e0ff; font-weight: 600; font-size: 0.85rem;">
                Actions
              </th>
            </tr>
          </thead>
          <tbody id="people-table-body">
            <!-- Rows will be inserted here -->
          </tbody>
        </table>
      </div>
      
      <!-- Mobile Cards Container -->
      <div id="people-cards-container" style="flex: 1; overflow-y: auto; display: none;">
        <!-- Cards will be inserted here -->
      </div>
      
      <!-- Pagination -->
      <div id="people-pagination" style="padding: 1rem; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid rgba(0,224,255,0.2);">
        <button id="prev-page-btn" style="padding: 0.5rem 1rem; background: rgba(0,224,255,0.1); border: 1px solid rgba(0,224,255,0.3); border-radius: 6px; color: #00e0ff; cursor: pointer;" disabled>
          <i class="fas fa-chevron-left"></i> Previous
        </button>
        <span id="page-info" style="color: rgba(255,255,255,0.7); font-size: 0.9rem;">Page 1</span>
        <button id="next-page-btn" style="padding: 0.5rem 1rem; background: rgba(0,224,255,0.1); border: 1px solid rgba(0,224,255,0.3); border-radius: 6px; color: #00e0ff; cursor: pointer;">
          Next <i class="fas fa-chevron-right"></i>
        </button>
      </div>
    </div>
    
    <!-- Bulk Action Bar (hidden by default) -->
    <div id="bulk-action-bar" style="display: none; position: fixed; bottom: 2rem; left: 50%; transform: translateX(-50%); background: linear-gradient(135deg, rgba(0,224,255,0.95), rgba(0,128,255,0.95)); padding: 1rem 2rem; border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.5); z-index: 10004; backdrop-filter: blur(10px);">
      <div style="display: flex; gap: 1rem; align-items: center;">
        <span id="bulk-count" style="color: white; font-weight: 600; font-size: 1rem;">0 selected</span>
        <button id="bulk-set-role-btn" style="padding: 0.5rem 1rem; background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.4); border-radius: 6px; color: white; font-weight: 600; cursor: pointer;">
          <i class="fas fa-user-tag"></i> Set Role
        </button>
        <button id="bulk-hide-btn" style="padding: 0.5rem 1rem; background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.4); border-radius: 6px; color: white; font-weight: 600; cursor: pointer;">
          <i class="fas fa-eye-slash"></i> Hide
        </button>
        <button id="bulk-unhide-btn" style="padding: 0.5rem 1rem; background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.4); border-radius: 6px; color: white; font-weight: 600; cursor: pointer;">
          <i class="fas fa-eye"></i> Unhide
        </button>
        <button id="bulk-disable-btn" style="padding: 0.5rem 1rem; background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.4); border-radius: 6px; color: white; font-weight: 600; cursor: pointer;">
          <i class="fas fa-ban"></i> Disable
        </button>
        <button id="bulk-enable-btn" style="padding: 0.5rem 1rem; background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.4); border-radius: 6px; color: white; font-weight: 600; cursor: pointer;">
          <i class="fas fa-check-circle"></i> Enable
        </button>
        <button id="bulk-cancel-btn" style="padding: 0.5rem 1rem; background: rgba(255,107,107,0.3); border: 1px solid rgba(255,107,107,0.5); border-radius: 6px; color: white; font-weight: 600; cursor: pointer;">
          <i class="fas fa-times"></i> Cancel
        </button>
      </div>
    </div>
    
    <!-- Person Drawer (hidden by default) -->
    <div id="person-drawer" style="display: none; position: fixed; right: 0; top: 0; bottom: 0; width: 500px; max-width: 90vw; background: linear-gradient(135deg, rgba(10,14,39,0.98), rgba(26,26,46,0.98)); border-left: 2px solid rgba(0,224,255,0.5); box-shadow: -10px 0 50px rgba(0,0,0,0.7); z-index: 10005; overflow-y: auto; backdrop-filter: blur(20px);">
      <!-- Drawer content will be inserted here -->
    </div>
  `;

  // Setup responsive layout
  setupResponsiveLayout();
  
  // Wire up event listeners
  wireUpEventListeners();
  
  // Load initial data
  loadPeopleData();
}

/**
 * Setup responsive layout (desktop table vs mobile cards)
 */
function setupResponsiveLayout() {
  const tableContainer = document.getElementById('people-table-container');
  const cardsContainer = document.getElementById('people-cards-container');
  
  function updateLayout() {
    const isMobile = window.innerWidth < 768;
    if (tableContainer && cardsContainer) {
      tableContainer.style.display = isMobile ? 'none' : 'block';
      cardsContainer.style.display = isMobile ? 'block' : 'none';
    }
  }
  
  updateLayout();
  window.addEventListener('resize', updateLayout);
}

/**
 * Wire up all event listeners
 */
function wireUpEventListeners() {
  // Search input (debounced)
  const searchInput = document.getElementById('people-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        state.search = e.target.value.trim();
        state.page = 0;
        loadPeopleData();
      }, 300);
    });
  }
  
  // Filter dropdowns
  ['role', 'hidden', 'disabled', 'claimed'].forEach(filterKey => {
    const select = document.getElementById(`filter-${filterKey}`);
    if (select) {
      select.addEventListener('change', (e) => {
        const value = e.target.value;
        if (filterKey === 'hidden' || filterKey === 'disabled') {
          state.filters[filterKey] = value === '' ? null : value === 'true';
        } else if (filterKey === 'claimed') {
          state.filters[filterKey] = value === '' ? null : value === 'true';
        } else {
          state.filters[filterKey] = value || null;
        }
        state.page = 0;
        loadPeopleData();
      });
    }
  });
  
  // Clear filters button
  const clearBtn = document.getElementById('filter-clear-btn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      state.filters = { role: null, hidden: null, disabled: null, claimed: null };
      document.getElementById('filter-role').value = '';
      document.getElementById('filter-hidden').value = '';
      document.getElementById('filter-disabled').value = '';
      document.getElementById('filter-claimed').value = '';
      state.page = 0;
      loadPeopleData();
    });
  }
  
  // Invite button
  const inviteBtn = document.getElementById('people-invite-btn');
  if (inviteBtn) {
    inviteBtn.addEventListener('click', showInviteModal);
  }
  
  // Pagination
  const prevBtn = document.getElementById('prev-page-btn');
  const nextBtn = document.getElementById('next-page-btn');
  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (state.page > 0) {
        state.page--;
        loadPeopleData();
      }
    });
  }
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      const maxPage = Math.ceil(state.totalCount / state.pageSize) - 1;
      if (state.page < maxPage) {
        state.page++;
        loadPeopleData();
      }
    });
  }
  
  // Select all checkbox
  const selectAllCheckbox = document.getElementById('select-all-checkbox');
  if (selectAllCheckbox) {
    selectAllCheckbox.addEventListener('change', (e) => {
      const checkboxes = document.querySelectorAll('.person-checkbox');
      checkboxes.forEach(cb => {
        cb.checked = e.target.checked;
        if (e.target.checked) {
          state.selectedIds.add(cb.dataset.personId);
        } else {
          state.selectedIds.delete(cb.dataset.personId);
        }
      });
      updateBulkActionBar();
    });
  }
  
  // Bulk action buttons
  const bulkCancelBtn = document.getElementById('bulk-cancel-btn');
  if (bulkCancelBtn) {
    bulkCancelBtn.addEventListener('click', () => {
      state.selectedIds.clear();
      document.querySelectorAll('.person-checkbox').forEach(cb => cb.checked = false);
      if (selectAllCheckbox) selectAllCheckbox.checked = false;
      updateBulkActionBar();
    });
  }
  
  const bulkSetRoleBtn = document.getElementById('bulk-set-role-btn');
  if (bulkSetRoleBtn) {
    bulkSetRoleBtn.addEventListener('click', handleBulkSetRole);
  }
  
  const bulkHideBtn = document.getElementById('bulk-hide-btn');
  if (bulkHideBtn) {
    bulkHideBtn.addEventListener('click', () => handleBulkUpdate({ is_hidden: true }));
  }
  
  const bulkUnhideBtn = document.getElementById('bulk-unhide-btn');
  if (bulkUnhideBtn) {
    bulkUnhideBtn.addEventListener('click', () => handleBulkUpdate({ is_hidden: false }));
  }
  
  const bulkDisableBtn = document.getElementById('bulk-disable-btn');
  if (bulkDisableBtn) {
    bulkDisableBtn.addEventListener('click', () => handleBulkDisable());
  }
  
  const bulkEnableBtn = document.getElementById('bulk-enable-btn');
  if (bulkEnableBtn) {
    bulkEnableBtn.addEventListener('click', () => handleBulkUpdate({ is_disabled: false }));
  }
  
  // Table header sorting
  document.querySelectorAll('[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const sortKey = th.dataset.sort;
      if (state.sortKey === sortKey) {
        state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        state.sortKey = sortKey;
        state.sortDir = 'asc';
      }
      loadPeopleData();
    });
  });
}

/**
 * Load people data from service
 */
async function loadPeopleData() {
  const countEl = document.getElementById('people-count');
  const tableBody = document.getElementById('people-table-body');
  const cardsContainer = document.getElementById('people-cards-container');
  
  if (countEl) countEl.textContent = 'Loading...';
  if (tableBody) tableBody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 2rem; color: rgba(255,255,255,0.5);"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>';
  if (cardsContainer) cardsContainer.innerHTML = '<div style="text-align: center; padding: 2rem; color: rgba(255,255,255,0.5);"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';
  
  const { data, count, error } = await listPeople({
    search: state.search,
    role: state.filters.role,
    hidden: state.filters.hidden,
    disabled: state.filters.disabled,
    claimed: state.filters.claimed,
    page: state.page,
    pageSize: state.pageSize,
    sortKey: state.sortKey,
    sortDir: state.sortDir
  });
  
  if (error) {
    if (countEl) countEl.textContent = 'Error loading people';
    if (tableBody) tableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 2rem; color: #ff6b6b;"><i class="fas fa-exclamation-circle"></i> ${esc(error.message)}</td></tr>`;
    if (cardsContainer) cardsContainer.innerHTML = `<div style="text-align: center; padding: 2rem; color: #ff6b6b;"><i class="fas fa-exclamation-circle"></i> ${esc(error.message)}</div>`;
    return;
  }
  
  state.totalCount = count;
  
  // Update count
  if (countEl) {
    const start = state.page * state.pageSize + 1;
    const end = Math.min((state.page + 1) * state.pageSize, count);
    countEl.textContent = `Showing ${start}-${end} of ${count} people`;
  }
  
  // Update pagination
  updatePagination();
  
  // Render table rows (desktop)
  if (tableBody) {
    if (data.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 2rem; color: rgba(255,255,255,0.5);"><i class="fas fa-users-slash"></i> No people found</td></tr>';
    } else {
      tableBody.innerHTML = data.map(person => renderTableRow(person)).join('');
      
      // Wire up row checkboxes
      tableBody.querySelectorAll('.person-checkbox').forEach(cb => {
        cb.addEventListener('change', (e) => {
          if (e.target.checked) {
            state.selectedIds.add(e.target.dataset.personId);
          } else {
            state.selectedIds.delete(e.target.dataset.personId);
          }
          updateBulkActionBar();
        });
      });
      
      // Wire up row clicks
      tableBody.querySelectorAll('.person-row').forEach(row => {
        row.addEventListener('click', (e) => {
          if (!e.target.closest('input') && !e.target.closest('button')) {
            openPersonDrawer(row.dataset.personId);
          }
        });
      });
    }
  }
  
  // Render cards (mobile)
  if (cardsContainer) {
    if (data.length === 0) {
      cardsContainer.innerHTML = '<div style="text-align: center; padding: 2rem; color: rgba(255,255,255,0.5);"><i class="fas fa-users-slash"></i> No people found</div>';
    } else {
      cardsContainer.innerHTML = data.map(person => renderPersonCard(person)).join('');
      
      // Wire up card checkboxes
      cardsContainer.querySelectorAll('.person-checkbox').forEach(cb => {
        cb.addEventListener('change', (e) => {
          if (e.target.checked) {
            state.selectedIds.add(e.target.dataset.personId);
          } else {
            state.selectedIds.delete(e.target.dataset.personId);
          }
          updateBulkActionBar();
        });
      });
      
      // Wire up card clicks
      cardsContainer.querySelectorAll('.person-card').forEach(card => {
        card.addEventListener('click', (e) => {
          if (!e.target.closest('input') && !e.target.closest('button')) {
            openPersonDrawer(card.dataset.personId);
          }
        });
      });
    }
  }
}

/**
 * Render a table row for a person
 */
function renderTableRow(person) {
  const initials = getInitials(person.name);
  const avatar = getAvatarHTML(person, initials, 40);
  const rolePill = getRolePill(person.user_role);
  const statusPills = getStatusPills(person);
  const createdDate = new Date(person.created_at).toLocaleDateString();
  
  return `
    <tr class="person-row" data-person-id="${person.id}" style="border-bottom: 1px solid rgba(0,224,255,0.1); cursor: pointer; transition: background 0.2s;" onmouseover="this.style.background='rgba(0,224,255,0.05)'" onmouseout="this.style.background='transparent'">
      <td style="padding: 0.75rem;" onclick="event.stopPropagation()">
        <input type="checkbox" class="person-checkbox" data-person-id="${person.id}" ${state.selectedIds.has(person.id) ? 'checked' : ''} style="cursor: pointer; width: 16px; height: 16px;">
      </td>
      <td style="padding: 0.75rem;">
        <div style="display: flex; align-items: center; gap: 0.75rem;">
          ${avatar}
          <span style="color: white; font-weight: 500;">${esc(person.name) || 'Unnamed'}</span>
        </div>
      </td>
      <td style="padding: 0.75rem; color: rgba(255,255,255,0.7); font-size: 0.9rem;">${esc(person.email) || 'No email'}</td>
      <td style="padding: 0.75rem;">${rolePill}</td>
      <td style="padding: 0.75rem;">${statusPills}</td>
      <td style="padding: 0.75rem; color: rgba(255,255,255,0.6); font-size: 0.85rem;">${createdDate}</td>
      <td style="padding: 0.75rem; text-align: center;" onclick="event.stopPropagation()">
        <button onclick="openPersonDrawer('${person.id}')" style="padding: 0.4rem 0.8rem; background: rgba(0,224,255,0.1); border: 1px solid rgba(0,224,255,0.3); border-radius: 6px; color: #00e0ff; cursor: pointer; font-size: 0.85rem;">
          <i class="fas fa-ellipsis-h"></i>
        </button>
      </td>
    </tr>
  `;
}

/**
 * Render a mobile card for a person
 */
function renderPersonCard(person) {
  const initials = getInitials(person.name);
  const avatar = getAvatarHTML(person, initials, 48);
  const rolePill = getRolePill(person.user_role);
  const statusPills = getStatusPills(person);
  const createdDate = new Date(person.created_at).toLocaleDateString();
  
  return `
    <div class="person-card" data-person-id="${person.id}" style="padding: 1rem; margin-bottom: 0.75rem; background: rgba(0,224,255,0.05); border: 1px solid rgba(0,224,255,0.2); border-radius: 8px; cursor: pointer;">
      <div style="display: flex; gap: 1rem; margin-bottom: 0.75rem;">
        <input type="checkbox" class="person-checkbox" data-person-id="${person.id}" ${state.selectedIds.has(person.id) ? 'checked' : ''} onclick="event.stopPropagation()" style="cursor: pointer; width: 18px; height: 18px; align-self: flex-start;">
        ${avatar}
        <div style="flex: 1; min-width: 0;">
          <div style="color: white; font-weight: 600; margin-bottom: 0.25rem;">${esc(person.name) || 'Unnamed'}</div>
          <div style="color: rgba(255,255,255,0.6); font-size: 0.85rem; margin-bottom: 0.5rem;">${esc(person.email) || 'No email'}</div>
          <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
            ${rolePill}
            ${statusPills}
          </div>
        </div>
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 0.75rem; border-top: 1px solid rgba(0,224,255,0.1);">
        <span style="color: rgba(255,255,255,0.5); font-size: 0.8rem;">Created ${createdDate}</span>
        <button onclick="event.stopPropagation(); openPersonDrawer('${person.id}')" style="padding: 0.4rem 0.8rem; background: rgba(0,224,255,0.1); border: 1px solid rgba(0,224,255,0.3); border-radius: 6px; color: #00e0ff; cursor: pointer; font-size: 0.85rem;">
          <i class="fas fa-ellipsis-h"></i> Details
        </button>
      </div>
    </div>
  `;
}

/**
 * Helper functions for rendering
 */
function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }
  return parts[0].charAt(0).toUpperCase();
}

function getAvatarHTML(person, initials, size) {
  const imageUrl = person.image_url || person.image_path || person.avatar_storage_path;
  if (imageUrl) {
    return `<img src="${esc(imageUrl)}" style="width: ${size}px; height: ${size}px; border-radius: 50%; object-fit: cover;" alt="${esc(person.name)}">`;
  }
  return `<div style="width: ${size}px; height: ${size}px; border-radius: 50%; background: linear-gradient(135deg, #00e0ff, #0080ff); display: flex; align-items: center; justify-content: center; font-weight: bold; color: white; font-size: ${size * 0.4}px;">${initials}</div>`;
}

function getRolePill(role) {
  const colors = {
    'Admin': { bg: 'rgba(255,215,0,0.2)', border: 'rgba(255,215,0,0.4)', text: '#ffd700' },
    'Member': { bg: 'rgba(0,224,255,0.2)', border: 'rgba(0,224,255,0.4)', text: '#00e0ff' }
  };
  const color = colors[role] || colors['Member'];
  return `<span style="padding: 0.25rem 0.75rem; background: ${color.bg}; border: 1px solid ${color.border}; border-radius: 12px; color: ${color.text}; font-size: 0.8rem; font-weight: 600; white-space: nowrap;">${role || 'Member'}</span>`;
}

function getStatusPills(person) {
  const pills = [];
  
  // Visibility
  if (person.is_hidden) {
    pills.push('<span style="padding: 0.25rem 0.75rem; background: rgba(255,107,107,0.2); border: 1px solid rgba(255,107,107,0.4); border-radius: 12px; color: #ff6b6b; font-size: 0.75rem; font-weight: 600; white-space: nowrap;"><i class="fas fa-eye-slash"></i> Hidden</span>');
  } else {
    pills.push('<span style="padding: 0.25rem 0.75rem; background: rgba(0,255,136,0.2); border: 1px solid rgba(0,255,136,0.4); border-radius: 12px; color: #00ff88; font-size: 0.75rem; font-weight: 600; white-space: nowrap;"><i class="fas fa-eye"></i> Visible</span>');
  }
  
  // Active/Disabled
  if (person.is_disabled) {
    pills.push('<span style="padding: 0.25rem 0.75rem; background: rgba(255,107,107,0.2); border: 1px solid rgba(255,107,107,0.4); border-radius: 12px; color: #ff6b6b; font-size: 0.75rem; font-weight: 600; white-space: nowrap;"><i class="fas fa-ban"></i> Disabled</span>');
  } else {
    pills.push('<span style="padding: 0.25rem 0.75rem; background: rgba(0,255,136,0.2); border: 1px solid rgba(0,255,136,0.4); border-radius: 12px; color: #00ff88; font-size: 0.75rem; font-weight: 600; white-space: nowrap;"><i class="fas fa-check-circle"></i> Active</span>');
  }
  
  // Claimed/Unclaimed
  if (person.user_id) {
    pills.push('<span style="padding: 0.25rem 0.75rem; background: rgba(168,85,247,0.2); border: 1px solid rgba(168,85,247,0.4); border-radius: 12px; color: #a855f7; font-size: 0.75rem; font-weight: 600; white-space: nowrap;"><i class="fas fa-link"></i> Claimed</span>');
  } else {
    pills.push('<span style="padding: 0.25rem 0.75rem; background: rgba(255,170,0,0.2); border: 1px solid rgba(255,170,0,0.4); border-radius: 12px; color: #ffaa00; font-size: 0.75rem; font-weight: 600; white-space: nowrap;"><i class="fas fa-unlink"></i> Unclaimed</span>');
  }
  
  return pills.join(' ');
}

/**
 * Update pagination controls
 */
function updatePagination() {
  const prevBtn = document.getElementById('prev-page-btn');
  const nextBtn = document.getElementById('next-page-btn');
  const pageInfo = document.getElementById('page-info');
  
  const maxPage = Math.ceil(state.totalCount / state.pageSize) - 1;
  
  if (prevBtn) {
    prevBtn.disabled = state.page === 0;
    prevBtn.style.opacity = state.page === 0 ? '0.5' : '1';
    prevBtn.style.cursor = state.page === 0 ? 'not-allowed' : 'pointer';
  }
  
  if (nextBtn) {
    nextBtn.disabled = state.page >= maxPage;
    nextBtn.style.opacity = state.page >= maxPage ? '0.5' : '1';
    nextBtn.style.cursor = state.page >= maxPage ? 'not-allowed' : 'pointer';
  }
  
  if (pageInfo) {
    pageInfo.textContent = `Page ${state.page + 1} of ${Math.max(1, maxPage + 1)}`;
  }
}

/**
 * Update bulk action bar visibility
 */
function updateBulkActionBar() {
  const bulkBar = document.getElementById('bulk-action-bar');
  const bulkCount = document.getElementById('bulk-count');
  
  if (bulkBar && bulkCount) {
    if (state.selectedIds.size > 0) {
      bulkBar.style.display = 'block';
      bulkCount.textContent = `${state.selectedIds.size} selected`;
    } else {
      bulkBar.style.display = 'none';
    }
  }
}

/**
 * Show invite/add person modal
 */
function showInviteModal() {
  const modal = document.createElement('div');
  modal.id = 'invite-modal';
  modal.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10006;
    backdrop-filter: blur(10px);
  `;
  
  modal.innerHTML = `
    <div style="background: linear-gradient(135deg, rgba(10,14,39,0.98), rgba(26,26,46,0.98)); border: 2px solid rgba(0,255,136,0.5); border-radius: 16px; padding: 2rem; max-width: 500px; width: 90%; box-shadow: 0 25px 70px rgba(0,0,0,0.7);">
      <h3 style="color: #00ff88; font-size: 1.5rem; margin-bottom: 1rem;">
        <i class="fas fa-user-plus"></i> Invite / Add Person
      </h3>
      <p style="color: rgba(255,255,255,0.7); margin-bottom: 1.5rem; line-height: 1.6;">
        Create a new community profile with an email. The user will be able to connect to their profile when logging in for the first time.
      </p>
      
      <div style="margin-bottom: 1.5rem;">
        <label style="color: #00ff88; font-weight: 600; display: block; margin-bottom: 0.5rem;">Email Address *</label>
        <input type="email" id="invite-email-input" placeholder="user@example.com" style="width: 100%; padding: 0.75rem; background: rgba(0,0,0,0.3); border: 1px solid rgba(0,255,136,0.3); border-radius: 8px; color: white; font-size: 1rem;">
      </div>
      
      <div style="margin-bottom: 1.5rem;">
        <label style="color: #00ff88; font-weight: 600; display: block; margin-bottom: 0.5rem;">Name (optional)</label>
        <input type="text" id="invite-name-input" placeholder="John Doe" style="width: 100%; padding: 0.75rem; background: rgba(0,0,0,0.3); border: 1px solid rgba(0,255,136,0.3); border-radius: 8px; color: white; font-size: 1rem;">
      </div>
      
      <div id="invite-status" style="margin-bottom: 1.5rem; font-size: 0.9rem;"></div>
      
      <div style="display: flex; gap: 1rem; justify-content: flex-end;">
        <button id="invite-cancel-btn" style="padding: 0.75rem 1.5rem; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.3); border-radius: 8px; color: white; font-weight: 600; cursor: pointer;">
          Cancel
        </button>
        <button id="invite-submit-btn" style="padding: 0.75rem 1.5rem; background: linear-gradient(135deg, #00ff88, #00e0ff); border: none; border-radius: 8px; color: #000; font-weight: 700; cursor: pointer;">
          <i class="fas fa-plus"></i> Add Person
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Focus email input
  const emailInput = document.getElementById('invite-email-input');
  if (emailInput) emailInput.focus();
  
  // Wire up buttons
  const cancelBtn = document.getElementById('invite-cancel-btn');
  const submitBtn = document.getElementById('invite-submit-btn');
  
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => modal.remove());
  }
  
  if (submitBtn) {
    submitBtn.addEventListener('click', async () => {
      const email = emailInput?.value.trim();
      const name = document.getElementById('invite-name-input')?.value.trim();
      const statusEl = document.getElementById('invite-status');
      
      if (!email) {
        if (statusEl) statusEl.innerHTML = '<span style="color: #ff6b6b;"><i class="fas fa-exclamation-circle"></i> Please enter an email address</span>';
        return;
      }
      
      if (!email.includes('@')) {
        if (statusEl) statusEl.innerHTML = '<span style="color: #ff6b6b;"><i class="fas fa-exclamation-circle"></i> Please enter a valid email address</span>';
        return;
      }
      
      if (statusEl) statusEl.innerHTML = '<span style="color: #00e0ff;"><i class="fas fa-spinner fa-spin"></i> Adding person...</span>';
      submitBtn.disabled = true;
      
      const { data, error } = await createPerson({ email, name: name || null });
      
      if (error) {
        if (statusEl) statusEl.innerHTML = `<span style="color: #ff6b6b;"><i class="fas fa-exclamation-circle"></i> ${esc(error.message)}</span>`;
        submitBtn.disabled = false;
        return;
      }
      
      if (statusEl) statusEl.innerHTML = '<span style="color: #00ff88;"><i class="fas fa-check-circle"></i> Successfully added!</span>';
      
      // Reload data and close modal after delay
      setTimeout(() => {
        modal.remove();
        loadPeopleData();
      }, 1000);
    });
  }
  
  // Close on backdrop click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
}

/**
 * Open person details drawer
 */
async function openPersonDrawer(personId) {
  const drawer = document.getElementById('person-drawer');
  if (!drawer) return;
  
  state.drawerPersonId = personId;
  
  drawer.innerHTML = '<div style="padding: 2rem; text-align: center; color: #00e0ff;"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';
  drawer.style.display = 'block';
  
  const { data: person, error } = await getPerson(personId);
  
  if (error || !person) {
    drawer.innerHTML = `<div style="padding: 2rem; text-align: center; color: #ff6b6b;"><i class="fas fa-exclamation-circle"></i> Error loading person</div>`;
    return;
  }
  
  renderPersonDrawer(person);
}

/**
 * Render person drawer content
 */
function renderPersonDrawer(person) {
  const drawer = document.getElementById('person-drawer');
  if (!drawer) return;
  
  const initials = getInitials(person.name);
  const avatar = getAvatarHTML(person, initials, 80);
  
  drawer.innerHTML = `
    <div style="padding: 2rem;">
      <!-- Header -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; padding-bottom: 1rem; border-bottom: 2px solid rgba(0,224,255,0.3);">
        <h3 style="color: #00e0ff; font-size: 1.5rem; margin: 0;">
          <i class="fas fa-user-edit"></i> Edit Profile
        </h3>
        <button onclick="closePersonDrawer()" style="background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.3); color: white; width: 36px; height: 36px; border-radius: 50%; cursor: pointer; font-size: 1.1rem;">
          <i class="fas fa-times"></i>
        </button>
      </div>
      
      <!-- Avatar -->
      <div style="text-align: center; margin-bottom: 2rem;">
        ${avatar}
        <div style="color: white; font-size: 1.25rem; font-weight: 600; margin-top: 1rem;">${esc(person.name) || 'Unnamed'}</div>
        <div style="color: rgba(255,255,255,0.6); font-size: 0.9rem;">${esc(person.email) || 'No email'}</div>
      </div>
      
      <!-- Editable Fields -->
      <form id="person-edit-form" style="display: grid; gap: 1.25rem;">
        <div>
          <label style="color: #00e0ff; font-weight: 600; display: block; margin-bottom: 0.5rem;">Name</label>
          <input type="text" name="name" value="${esc(person.name)}" style="width: 100%; padding: 0.75rem; background: rgba(0,0,0,0.3); border: 1px solid rgba(0,224,255,0.3); border-radius: 8px; color: white; font-size: 1rem;">
        </div>

        <div>
          <label style="color: #00e0ff; font-weight: 600; display: block; margin-bottom: 0.5rem;">Email</label>
          <input type="email" name="email" value="${esc(person.email)}" style="width: 100%; padding: 0.75rem; background: rgba(0,0,0,0.3); border: 1px solid rgba(0,224,255,0.3); border-radius: 8px; color: white; font-size: 1rem;">
        </div>

        <div>
          <label style="color: #00e0ff; font-weight: 600; display: block; margin-bottom: 0.5rem;">Bio</label>
          <textarea name="bio" rows="3" style="width: 100%; padding: 0.75rem; background: rgba(0,0,0,0.3); border: 1px solid rgba(0,224,255,0.3); border-radius: 8px; color: white; font-size: 1rem; resize: vertical;">${esc(person.bio)}</textarea>
        </div>

        <div>
          <label style="color: #00e0ff; font-weight: 600; display: block; margin-bottom: 0.5rem;">Skills (comma-separated)</label>
          <input type="text" name="skills" value="${esc(person.skills)}" placeholder="e.g., JavaScript, Python, Design" style="width: 100%; padding: 0.75rem; background: rgba(0,0,0,0.3); border: 1px solid rgba(0,224,255,0.3); border-radius: 8px; color: white; font-size: 1rem;">
        </div>

        <div>
          <label style="color: #00e0ff; font-weight: 600; display: block; margin-bottom: 0.5rem;">Interests (comma-separated)</label>
          <input type="text" name="interests" value="${esc(person.interests)}" placeholder="e.g., AI, Web Development, Gaming" style="width: 100%; padding: 0.75rem; background: rgba(0,0,0,0.3); border: 1px solid rgba(0,224,255,0.3); border-radius: 8px; color: white; font-size: 1rem;">
        </div>
        
        <div>
          <label style="color: #00e0ff; font-weight: 600; display: block; margin-bottom: 0.5rem;">Availability</label>
          <input type="text" name="availability" value="${person.availability || ''}" placeholder="e.g., Weekends, Evenings" style="width: 100%; padding: 0.75rem; background: rgba(0,0,0,0.3); border: 1px solid rgba(0,224,255,0.3); border-radius: 8px; color: white; font-size: 1rem;">
        </div>
        
        <div>
          <label style="color: #00e0ff; font-weight: 600; display: block; margin-bottom: 0.5rem;">Image URL</label>
          <input type="url" name="image_url" value="${person.image_url || ''}" style="width: 100%; padding: 0.75rem; background: rgba(0,0,0,0.3); border: 1px solid rgba(0,224,255,0.3); border-radius: 8px; color: white; font-size: 1rem;">
        </div>
        
        <!-- Role Dropdown -->
        <div>
          <label style="color: #ffd700; font-weight: 600; display: block; margin-bottom: 0.5rem;">
            <i class="fas fa-crown"></i> Role
          </label>
          <select name="user_role" style="width: 100%; padding: 0.75rem; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,215,0,0.3); border-radius: 8px; color: white; font-size: 1rem; cursor: pointer;">
            <option value="Member" ${person.user_role === 'Member' ? 'selected' : ''}>Member</option>
            <option value="Admin" ${person.user_role === 'Admin' ? 'selected' : ''}>Admin</option>
          </select>
        </div>
        
        <!-- Toggles -->
        <div style="padding: 1rem; background: rgba(0,0,0,0.2); border-radius: 8px;">
          <label style="display: flex; align-items: center; gap: 0.75rem; cursor: pointer; margin-bottom: 0.75rem;">
            <input type="checkbox" name="is_hidden" ${person.is_hidden ? 'checked' : ''} style="width: 20px; height: 20px; cursor: pointer;">
            <span style="color: white; font-weight: 600;">Hidden (not visible to community)</span>
          </label>
          
          <label style="display: flex; align-items: center; gap: 0.75rem; cursor: pointer; margin-bottom: 0.75rem;">
            <input type="checkbox" name="is_disabled" ${person.is_disabled ? 'checked' : ''} style="width: 20px; height: 20px; cursor: pointer;">
            <span style="color: white; font-weight: 600;">Disabled (cannot log in)</span>
          </label>
          
          <label style="display: flex; align-items: center; gap: 0.75rem; cursor: pointer;">
            <input type="checkbox" name="newsletter_opt_in" ${person.newsletter_opt_in ? 'checked' : ''} style="width: 20px; height: 20px; cursor: pointer;">
            <span style="color: white; font-weight: 600;">Newsletter opt-in</span>
          </label>
        </div>
        
        <!-- Read-only Info -->
        <div style="padding: 1rem; background: rgba(0,224,255,0.05); border: 1px solid rgba(0,224,255,0.2); border-radius: 8px;">
          <h4 style="color: #00e0ff; font-size: 1rem; margin-bottom: 0.75rem;">Read-Only Information</h4>
          <div style="display: grid; gap: 0.5rem; font-size: 0.85rem;">
            <div style="color: rgba(255,255,255,0.6);">ID: <span style="color: white;">${person.id}</span></div>
            <div style="color: rgba(255,255,255,0.6);">User ID: <span style="color: white;">${person.user_id || 'Not claimed'}</span></div>
            <div style="color: rgba(255,255,255,0.6);">Created: <span style="color: white;">${new Date(person.created_at).toLocaleString()}</span></div>
            <div style="color: rgba(255,255,255,0.6);">Updated: <span style="color: white;">${person.updated_at ? new Date(person.updated_at).toLocaleString() : 'Never'}</span></div>
            <div style="color: rgba(255,255,255,0.6);">Last Login: <span style="color: white;">${person.last_login ? new Date(person.last_login).toLocaleString() : 'Never'}</span></div>
            <div style="color: rgba(255,255,255,0.6);">Profile Completed: <span style="color: white;">${person.profile_completed ? 'Yes' : 'No'}</span></div>
            <div style="color: rgba(255,255,255,0.6);">XP: <span style="color: white;">${person.xp || 0}</span></div>
            <div style="color: rgba(255,255,255,0.6);">Level: <span style="color: white;">${person.level || 1}</span></div>
            <div style="color: rgba(255,255,255,0.6);">Streak: <span style="color: white;">${person.streak || 0}</span></div>
          </div>
        </div>
        
        <!-- Action Buttons -->
        <div style="display: flex; gap: 1rem; padding-top: 1rem; border-top: 1px solid rgba(0,224,255,0.2);">
          <button type="button" onclick="closePersonDrawer()" style="flex: 1; padding: 0.75rem; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.3); border-radius: 8px; color: white; font-weight: 600; cursor: pointer;">
            Cancel
          </button>
          <button type="submit" style="flex: 1; padding: 0.75rem; background: linear-gradient(135deg, #00e0ff, #0080ff); border: none; border-radius: 8px; color: white; font-weight: 700; cursor: pointer;">
            <i class="fas fa-save"></i> Save Changes
          </button>
        </div>
        
        <div id="drawer-status" style="font-size: 0.9rem; text-align: center;"></div>
      </form>
    </div>
  `;
  
  // Wire up form submission
  const form = document.getElementById('person-edit-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await handlePersonUpdate(person.id, form);
    });
  }
}

/**
 * Handle person update from drawer form
 */
async function handlePersonUpdate(personId, form) {
  const statusEl = document.getElementById('drawer-status');
  const formData = new FormData(form);
  
  // Build patch object with proper data cleaning
  const patch = {
    name: formData.get('name')?.trim() || null,
    email: formData.get('email')?.trim() || null,
    bio: formData.get('bio')?.trim() || null,
    skills: formData.get('skills')?.trim() ? formData.get('skills').trim().split(',').map(s => s.trim()).filter(s => s) : null,
    interests: formData.get('interests')?.trim() ? formData.get('interests').trim().split(',').map(s => s.trim()).filter(s => s) : null,
    availability: formData.get('availability')?.trim() || null,
    image_url: formData.get('image_url')?.trim() || null,
    user_role: formData.get('user_role'),
    is_hidden: formData.get('is_hidden') === 'on',
    is_disabled: formData.get('is_disabled') === 'on',
    newsletter_opt_in: formData.get('newsletter_opt_in') === 'on'
  };
  
  // Remove null values for required fields
  if (!patch.name) delete patch.name;
  if (!patch.email) delete patch.email;
  
  // Check for self-demotion from Admin
  const currentUser = window.supabase?.auth?.user?.();
  if (currentUser && patch.user_role !== 'Admin') {
    const { data: currentPerson } = await getPerson(personId);
    if (currentPerson?.user_id === currentUser.id && currentPerson?.user_role === 'Admin') {
      const confirmation = prompt('You are about to demote yourself from Admin. Type "DEMOTE" to confirm:');
      if (confirmation !== 'DEMOTE') {
        if (statusEl) statusEl.innerHTML = '<span style="color: #ffaa00;"><i class="fas fa-info-circle"></i> Self-demotion cancelled</span>';
        return;
      }
    }
  }
  
  // Check for disabling
  if (patch.is_disabled) {
    const confirmed = confirm('Are you sure you want to disable this account? They will not be able to log in.');
    if (!confirmed) {
      if (statusEl) statusEl.innerHTML = '<span style="color: #ffaa00;"><i class="fas fa-info-circle"></i> Action cancelled</span>';
      return;
    }
  }
  
  if (statusEl) statusEl.innerHTML = '<span style="color: #00e0ff;"><i class="fas fa-spinner fa-spin"></i> Saving...</span>';
  
  const { data, error } = await updatePerson(personId, patch);
  
  if (error) {
    if (statusEl) statusEl.innerHTML = `<span style="color: #ff6b6b;"><i class="fas fa-exclamation-circle"></i> ${error.message}</span>`;
    return;
  }
  
  if (statusEl) statusEl.innerHTML = '<span style="color: #00ff88;"><i class="fas fa-check-circle"></i> Saved successfully!</span>';
  
  // Reload data and close drawer after delay
  setTimeout(() => {
    closePersonDrawer();
    loadPeopleData();
  }, 1000);
}

/**
 * Close person drawer
 */
window.closePersonDrawer = function() {
  const drawer = document.getElementById('person-drawer');
  if (drawer) {
    drawer.style.display = 'none';
    state.drawerPersonId = null;
  }
};

/**
 * Handle bulk set role
 */
async function handleBulkSetRole() {
  const role = prompt('Enter role (Member or Admin):');
  if (!role || (role !== 'Member' && role !== 'Admin')) {
    alert('Invalid role. Please enter "Member" or "Admin".');
    return;
  }
  
  const confirmed = confirm(`Set role to "${role}" for ${state.selectedIds.size} selected people?`);
  if (!confirmed) return;
  
  const results = await bulkUpdate(Array.from(state.selectedIds), { user_role: role });
  
  alert(`Bulk update complete:\n✅ Success: ${results.success}\n❌ Failed: ${results.failed}`);
  
  if (results.failed > 0) {
    console.error('Bulk update errors:', results.errors);
  }
  
  // Clear selection and reload
  state.selectedIds.clear();
  updateBulkActionBar();
  loadPeopleData();
}

/**
 * Handle bulk update
 */
async function handleBulkUpdate(patch) {
  const action = Object.keys(patch)[0];
  const value = patch[action];
  
  let message = '';
  if (action === 'is_hidden') {
    message = value ? 'Hide' : 'Unhide';
  } else if (action === 'is_disabled') {
    message = value ? 'Disable' : 'Enable';
  }
  
  const confirmed = confirm(`${message} ${state.selectedIds.size} selected people?`);
  if (!confirmed) return;
  
  const results = await bulkUpdate(Array.from(state.selectedIds), patch);
  
  alert(`Bulk update complete:\n✅ Success: ${results.success}\n❌ Failed: ${results.failed}`);
  
  if (results.failed > 0) {
    console.error('Bulk update errors:', results.errors);
  }
  
  // Clear selection and reload
  state.selectedIds.clear();
  updateBulkActionBar();
  loadPeopleData();
}

/**
 * Handle bulk disable with confirmation
 */
async function handleBulkDisable() {
  const confirmed = confirm(`Disable ${state.selectedIds.size} selected people? They will not be able to log in.`);
  if (!confirmed) return;
  
  await handleBulkUpdate({ is_disabled: true });
}

/**
 * Expose openPersonDrawer globally for onclick handlers
 */
window.openPersonDrawer = openPersonDrawer;

// Expose the module globally for the admin panel to use
window.AdminPeoplePanel = {
  renderPeoplePanel
};

console.log('✅ Admin People Panel Loaded');
