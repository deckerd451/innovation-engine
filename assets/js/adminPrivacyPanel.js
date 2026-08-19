// ================================================================
// ADMIN PRIVACY & VISIBILITY PANEL
// ================================================================
// Lets an admin control, per person, whether they are listed/searchable
// across Synapse (community.is_hidden -- reused, already the contract
// enforced by search/matching/suggestions/graph) and whether their photo
// is shown to other members (community.photo_visible -- new, independent
// of is_hidden; see supabase/sql/migrations/20260819_admin_analytics_privacy.sql).
//
// Reuses adminPeopleService.js's existing listPeople/setHidden mutators
// and adds one new setPhotoVisible, rather than a parallel query layer.

import { listPeople, setHidden, setPhotoVisible } from './adminPeopleService.js';

function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

let state = { search: '' };
let container = null;
let searchDebounce = null;

function rowHtml(person) {
  const listed = !person.is_hidden;
  const photoVisible = person.photo_visible !== false;
  return `
    <tr data-id="${esc(person.id)}">
      <td class="admin-privacy-name">
        <div class="admin-privacy-name-primary">${esc(person.name || 'Unnamed')}</div>
        <div class="admin-privacy-name-secondary">${esc(person.email || '')}</div>
      </td>
      <td>
        <label class="admin-toggle">
          <input type="checkbox" data-action="toggle-listed" ${listed ? 'checked' : ''}>
          <span>${listed ? 'Listed' : 'Hidden'}</span>
        </label>
      </td>
      <td>
        <label class="admin-toggle">
          <input type="checkbox" data-action="toggle-photo" ${photoVisible ? 'checked' : ''}>
          <span>${photoVisible ? 'Photo visible' : 'Photo hidden'}</span>
        </label>
      </td>
    </tr>
  `;
}

async function loadAndRender() {
  const tbody = container.querySelector('#admin-privacy-tbody');
  const status = container.querySelector('#admin-privacy-status');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="3" class="admin-privacy-empty"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>`;

  const { data, count, error } = await listPeople({ search: state.search, page: 0, pageSize: 100 });

  if (error) {
    tbody.innerHTML = `<tr><td colspan="3" class="admin-privacy-empty">Failed to load people.</td></tr>`;
    return;
  }

  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="3" class="admin-privacy-empty">No matching people.</td></tr>`;
    return;
  }

  tbody.innerHTML = data.map(rowHtml).join('');
  if (status) status.textContent = `${count} ${count === 1 ? 'person' : 'people'}${state.search ? ` matching "${state.search}"` : ''}`;
}

async function handleToggle(e) {
  const input = e.target.closest('input[data-action]');
  if (!input) return;

  const row = input.closest('tr');
  const id = row?.dataset.id;
  if (!id) return;

  const action = input.dataset.action;
  input.disabled = true;

  let result;
  if (action === 'toggle-listed') {
    // Checked = listed, so is_hidden is the inverse of the checkbox state.
    result = await setHidden(id, !input.checked);
  } else if (action === 'toggle-photo') {
    result = await setPhotoVisible(id, input.checked);
  }

  input.disabled = false;

  if (result?.error) {
    input.checked = !input.checked; // revert on failure
    if (window.log?.isDebugMode?.() || window.__DEBUG_ADMIN_CHECKS__) {
      console.error('❌ Privacy toggle failed:', result.error);
    }
    return;
  }

  const label = input.closest('label')?.querySelector('span');
  if (label) {
    if (action === 'toggle-listed') label.textContent = input.checked ? 'Listed' : 'Hidden';
    if (action === 'toggle-photo') label.textContent = input.checked ? 'Photo visible' : 'Photo hidden';
  }
}

export function renderPrivacyPanel(targetEl) {
  container = targetEl;
  container.innerHTML = `
    <div class="admin-privacy-panel">
      <div class="admin-privacy-intro">
        <h3><i class="fas fa-user-shield"></i> Privacy &amp; Visibility</h3>
        <p>
          Controls whether a member is listed/searchable across Synapse (graph, Explore, Search,
          People Worth Knowing) and whether their profile photo is shown to other members.
          A member always sees their own profile and photo regardless of these settings.
        </p>
      </div>
      <div class="admin-privacy-toolbar">
        <input type="text" id="admin-privacy-search" class="admin-privacy-search" placeholder="Search by name or email...">
        <span id="admin-privacy-status" class="admin-privacy-status"></span>
      </div>
      <div class="admin-privacy-table-wrap">
        <table class="admin-privacy-table">
          <thead>
            <tr><th>Person</th><th>Listed / searchable</th><th>Photo visibility</th></tr>
          </thead>
          <tbody id="admin-privacy-tbody"></tbody>
        </table>
      </div>
    </div>
  `;

  const searchInput = container.querySelector('#admin-privacy-search');
  searchInput?.addEventListener('input', (e) => {
    clearTimeout(searchDebounce);
    const value = e.target.value;
    searchDebounce = setTimeout(() => {
      state.search = value;
      loadAndRender();
    }, 250);
  });

  container.querySelector('#admin-privacy-tbody')?.addEventListener('change', handleToggle);

  loadAndRender();
}

window.AdminPrivacyPanel = { renderPrivacyPanel };

console.log('✅ Admin Privacy Panel Loaded');
