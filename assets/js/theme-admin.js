/**
 * Theme Circles Admin Interface
 * Full CRUD operations for managing theme circles
 */

import { showSynapseNotification } from "./synapse/ui.js";

let supabase = null;
let currentUserProfile = null;
let themesData = [];

// ============================================================================
// INITIALIZATION
// ============================================================================

export async function initThemeAdmin() {
  supabase = window.supabase;
  if (!supabase) {
    console.warn("⚠️ Supabase not available for theme admin");
    return;
  }

  // Listen for profile loaded event
  window.addEventListener('profile-loaded', (e) => {
    currentUserProfile = e.detail.profile;
  });

  // Make functions available globally
  window.openThemeAdminModal = openThemeAdminModal;
  window.closeThemeAdminModal = closeThemeAdminModal;

  console.log("✅ Theme admin initialized");
}

// ============================================================================
// ADMIN CHECK
// ============================================================================

function isAdmin() {
  // Debug override for testing
  if (window.isAdminOverride) {
    console.log('🔓 Admin access granted via override');
    return true;
  }

  // Check multiple sources for admin status
  const adminEmails = ['dmhamilton1@live.com'];

  // Check auth email from localStorage
  try {
    const authKeys = Object.keys(localStorage).filter(k => k.includes('supabase.auth'));
    for (const key of authKeys) {
      const data = localStorage.getItem(key);
      if (data) {
        const parsed = JSON.parse(data);
        const email = parsed?.currentSession?.user?.email || parsed?.user?.email;
        if (email && adminEmails.includes(email.toLowerCase())) {
          console.log('✅ Admin access granted via email:', email);
          return true;
        }
      }
    }
  } catch (e) {
    console.warn('⚠️ Error checking localStorage auth:', e);
  }

  // Check role from various sources
  const role = currentUserProfile?.role ||
               window?.appState?.communityProfile?.role ||
               window?.appState?.profile?.role ||
               localStorage.getItem('userRole');

  if (role && ['admin', 'superadmin', 'owner'].includes(role.toLowerCase())) {
    console.log('✅ Admin access granted via role:', role);
    return true;
  }

  // Check Supabase session directly
  if (window.supabase) {
    try {
      const session = window.supabase.auth?.session?.();
      const email = session?.user?.email;
      if (email && adminEmails.includes(email.toLowerCase())) {
        console.log('✅ Admin access granted via Supabase session:', email);
        return true;
      }
    } catch (e) {
      console.warn('⚠️ Error checking Supabase session:', e);
    }
  }

  console.warn('❌ Admin access denied. Email:', currentUserProfile?.email, 'Role:', role);
  return false;
}

// ============================================================================
// MODAL UI
// ============================================================================

export async function openThemeAdminModal() {
  if (!isAdmin()) {
    alert("Admin access required");
    return;
  }

  // Remove existing modal if present
  closeThemeAdminModal();

  // Load themes data
  await loadAllThemes();

  // Create modal
  const modal = document.createElement('div');
  modal.id = 'theme-admin-modal';
  modal.className = 'modal active';
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 900px; max-height: 90vh; overflow-y: auto;">
      <button class="modal-close" onclick="window.closeThemeAdminModal()">
        <i class="fas fa-times"></i>
      </button>

      <div class="modal-header">
        <h2 style="color: #00e0ff; margin: 0 0 0.5rem 0;">
          <i class="fas fa-bullseye"></i> Theme Circles Admin
        </h2>
        <p style="color: rgba(255,255,255,0.7); margin: 0; font-size: 0.9rem;">
          Create and manage theme circles for your community
        </p>
      </div>

      <div class="theme-admin-tabs" style="margin: 1.5rem 0;">
        <button class="tab-btn active" data-tab="create">
          <i class="fas fa-plus-circle"></i> Create New
        </button>
        <button class="tab-btn" data-tab="manage">
          <i class="fas fa-list"></i> Manage Existing
        </button>
      </div>

      <div id="theme-tab-create" class="theme-tab-content active">
        ${renderCreateForm()}
      </div>

      <div id="theme-tab-manage" class="theme-tab-content" style="display: none;">
        ${renderThemesList()}
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  wireModalEvents();
}

export function closeThemeAdminModal() {
  const modal = document.getElementById('theme-admin-modal');
  if (modal) modal.remove();
}

function renderCreateForm() {
  return `
    <form id="theme-create-form" style="display: grid; gap: 1.25rem;">
      <div class="form-group">
        <label for="theme-title" style="color: #00e0ff; font-weight: 600; display: block; margin-bottom: 0.5rem;">
          Theme Title *
        </label>
        <input
          type="text"
          id="theme-title"
          name="title"
          placeholder="e.g., AI in Healthcare"
          required
          style="width: 100%; padding: 0.75rem; background: rgba(0,0,0,0.3); border: 1px solid rgba(0,224,255,0.3);
                 border-radius: 8px; color: #fff; font-size: 1rem;"
        />
      </div>

      <div class="form-group">
        <label for="theme-description" style="color: #00e0ff; font-weight: 600; display: block; margin-bottom: 0.5rem;">
          Description
        </label>
        <textarea
          id="theme-description"
          name="description"
          placeholder="What is this theme about?"
          rows="4"
          style="width: 100%; padding: 0.75rem; background: rgba(0,0,0,0.3); border: 1px solid rgba(0,224,255,0.3);
                 border-radius: 8px; color: #fff; font-size: 1rem; resize: vertical;"
        ></textarea>
      </div>

      <div class="form-group">
        <label for="theme-tags" style="color: #00e0ff; font-weight: 600; display: block; margin-bottom: 0.5rem;">
          Tags (comma-separated)
        </label>
        <input
          type="text"
          id="theme-tags"
          name="tags"
          placeholder="ai, healthcare, innovation"
          style="width: 100%; padding: 0.75rem; background: rgba(0,0,0,0.3); border: 1px solid rgba(0,224,255,0.3);
                 border-radius: 8px; color: #fff; font-size: 1rem;"
        />
      </div>

      <div class="form-group">
        <label for="theme-duration" style="color: #00e0ff; font-weight: 600; display: block; margin-bottom: 0.5rem;">
          Duration (days) *
        </label>
        <input
          type="number"
          id="theme-duration"
          name="duration"
          min="1"
          max="90"
          value="7"
          required
          style="width: 100%; padding: 0.75rem; background: rgba(0,0,0,0.3); border: 1px solid rgba(0,224,255,0.3);
                 border-radius: 8px; color: #fff; font-size: 1rem;"
        />
        <small style="color: rgba(255,255,255,0.6); display: block; margin-top: 0.25rem;">
          How long should this theme remain active? (1-90 days)
        </small>
      </div>

      <div class="form-row" style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
        <div class="form-group">
          <label for="theme-cta-text" style="color: #00e0ff; font-weight: 600; display: block; margin-bottom: 0.5rem;">
            CTA Button Text
          </label>
          <input
            type="text"
            id="theme-cta-text"
            name="cta_text"
            placeholder="e.g., Join Slack"
            style="width: 100%; padding: 0.75rem; background: rgba(0,0,0,0.3); border: 1px solid rgba(0,224,255,0.3);
                   border-radius: 8px; color: #fff; font-size: 1rem;"
          />
        </div>

        <div class="form-group">
          <label for="theme-cta-link" style="color: #00e0ff; font-weight: 600; display: block; margin-bottom: 0.5rem;">
            CTA Button Link
          </label>
          <input
            type="url"
            id="theme-cta-link"
            name="cta_link"
            placeholder="https://slack.com/invite..."
            style="width: 100%; padding: 0.75rem; background: rgba(0,0,0,0.3); border: 1px solid rgba(0,224,255,0.3);
                   border-radius: 8px; color: #fff; font-size: 1rem;"
          />
        </div>
      </div>

      <div class="form-actions" style="display: flex; gap: 1rem; justify-content: flex-end; margin-top: 1rem;">
        <button
          type="button"
          onclick="window.closeThemeAdminModal()"
          style="padding: 0.75rem 1.5rem; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.3);
                 border-radius: 8px; color: #fff; cursor: pointer; font-weight: 600;"
        >
          Cancel
        </button>
        <button
          type="submit"
          style="padding: 0.75rem 1.5rem; background: linear-gradient(135deg, #00e0ff, #00a8cc); border: none;
                 border-radius: 8px; color: #000; cursor: pointer; font-weight: 700;"
        >
          <i class="fas fa-plus-circle"></i> Create Theme Circle
        </button>
      </div>
    </form>
  `;
}

function renderThemesList() {
  if (!themesData || themesData.length === 0) {
    return `
      <div style="text-align: center; padding: 3rem; color: rgba(255,255,255,0.6);">
        <i class="fas fa-bullseye" style="font-size: 3rem; margin-bottom: 1rem; opacity: 0.3;"></i>
        <p>No theme circles yet. Create your first one!</p>
      </div>
    `;
  }

  const now = new Date();
  const activeThemes = themesData.filter(t => new Date(t.expires_at) > now && t.status === 'active');
  const expiredThemes = themesData.filter(t => new Date(t.expires_at) <= now || t.status !== 'active');

  return `
    <div class="themes-list">
      ${activeThemes.length > 0 ? `
        <div class="themes-section" style="margin-bottom: 2rem;">
          <h3 style="color: #00ff88; font-size: 1.1rem; margin-bottom: 1rem;">
            <i class="fas fa-check-circle"></i> Active Themes (${activeThemes.length})
          </h3>
          <div class="themes-grid" style="display: grid; gap: 1rem;">
            ${activeThemes.map(theme => renderThemeCard(theme)).join('')}
          </div>
        </div>
      ` : ''}

      ${expiredThemes.length > 0 ? `
        <div class="themes-section">
          <h3 style="color: rgba(255,255,255,0.5); font-size: 1.1rem; margin-bottom: 1rem;">
            <i class="fas fa-archive"></i> Expired/Inactive (${expiredThemes.length})
          </h3>
          <div class="themes-grid" style="display: grid; gap: 1rem;">
            ${expiredThemes.map(theme => renderThemeCard(theme, true)).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

function renderThemeCard(theme, isExpired = false) {
  const now = Date.now();
  const expires = new Date(theme.expires_at).getTime();
  const remaining = expires - now;
  const hoursRemaining = Math.floor(remaining / (1000 * 60 * 60));
  const daysRemaining = Math.floor(hoursRemaining / 24);
  const timeText = daysRemaining > 1 ? `${daysRemaining} days left` :
                   daysRemaining === 1 ? `1 day left` :
                   hoursRemaining > 0 ? `${hoursRemaining} hours left` : 'Expired';

  return `
    <div class="theme-card" data-theme-id="${theme.id}" style="
      background: ${isExpired ? 'rgba(0,0,0,0.2)' : 'rgba(0,224,255,0.05)'};
      border: 1px solid ${isExpired ? 'rgba(255,255,255,0.1)' : 'rgba(0,224,255,0.3)'};
      border-radius: 12px;
      padding: 1.25rem;
      ${isExpired ? 'opacity: 0.6;' : ''}
    ">
      <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.75rem;">
        <div style="flex: 1;">
          <h4 style="color: ${isExpired ? 'rgba(255,255,255,0.5)' : '#00e0ff'}; margin: 0 0 0.5rem 0; font-size: 1.1rem;">
            ${escapeHtml(theme.title)}
          </h4>
          ${theme.description ? `
            <p style="color: rgba(255,255,255,0.7); margin: 0; font-size: 0.9rem;">
              ${escapeHtml(theme.description)}
            </p>
          ` : ''}
        </div>
        <span style="
          padding: 0.25rem 0.75rem;
          background: ${isExpired ? 'rgba(255,107,107,0.2)' : 'rgba(0,224,255,0.2)'};
          border: 1px solid ${isExpired ? 'rgba(255,107,107,0.5)' : 'rgba(0,224,255,0.5)'};
          border-radius: 12px;
          font-size: 0.75rem;
          color: ${isExpired ? '#ff6b6b' : '#00e0ff'};
          white-space: nowrap;
        ">
          ${timeText}
        </span>
      </div>

      ${theme.tags && theme.tags.length > 0 ? `
        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.75rem;">
          ${theme.tags.map(tag => `
            <span style="
              padding: 0.25rem 0.5rem;
              background: rgba(0,224,255,0.1);
              border: 1px solid rgba(0,224,255,0.3);
              border-radius: 4px;
              font-size: 0.75rem;
              color: rgba(0,224,255,0.8);
            ">
              ${escapeHtml(tag)}
            </span>
          `).join('')}
        </div>
      ` : ''}

      <!-- Projects Section -->
      <div style="
        background: rgba(0,0,0,0.2);
        border-radius: 6px;
        padding: 0.75rem;
        margin-bottom: 0.75rem;
      ">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
          <span style="color: rgba(255,255,255,0.7); font-size: 0.85rem;">
            <i class="fas fa-lightbulb"></i> Projects: ${theme.assigned_projects?.length || 0}
          </span>
          <button
            class="btn-manage-projects"
            data-theme-id="${theme.id}"
            style="
              padding: 0.35rem 0.75rem;
              background: rgba(0,224,255,0.1);
              border: 1px solid rgba(0,224,255,0.3);
              border-radius: 4px;
              color: #00e0ff;
              cursor: pointer;
              font-size: 0.75rem;
            "
          >
            <i class="fas fa-cog"></i> Manage
          </button>
        </div>
        ${theme.assigned_projects && theme.assigned_projects.length > 0 ? `
          <div style="color: rgba(255,255,255,0.6); font-size: 0.75rem;">
            ${theme.assigned_projects.slice(0, 3).map(p => `• ${escapeHtml(p.title)}`).join('<br>')}
            ${theme.assigned_projects.length > 3 ? `<br>• ...and ${theme.assigned_projects.length - 3} more` : ''}
          </div>
        ` : `
          <div style="color: rgba(255,255,255,0.4); font-size: 0.75rem; font-style: italic;">
            No projects assigned yet
          </div>
        `}
      </div>

      <div style="display: flex; gap: 0.5rem; margin-top: 1rem;">
        <button
          class="btn-edit-theme"
          data-theme-id="${theme.id}"
          style="
            flex: 1;
            padding: 0.5rem 1rem;
            background: rgba(0,224,255,0.1);
            border: 1px solid rgba(0,224,255,0.3);
            border-radius: 6px;
            color: #00e0ff;
            cursor: pointer;
            font-size: 0.85rem;
          "
        >
          <i class="fas fa-edit"></i> Edit
        </button>
        ${!isExpired ? `
          <button
            class="btn-extend-theme"
            data-theme-id="${theme.id}"
            style="
              flex: 1;
              padding: 0.5rem 1rem;
              background: rgba(0,255,136,0.1);
              border: 1px solid rgba(0,255,136,0.3);
              border-radius: 6px;
              color: #00ff88;
              cursor: pointer;
              font-size: 0.85rem;
            "
          >
            <i class="fas fa-clock"></i> Extend
          </button>
        ` : ''}
        <button
          class="btn-${isExpired ? 'delete' : 'archive'}-theme"
          data-theme-id="${theme.id}"
          style="
            padding: 0.5rem 1rem;
            background: rgba(255,107,107,0.1);
            border: 1px solid rgba(255,107,107,0.3);
            border-radius: 6px;
            color: #ff6b6b;
            cursor: pointer;
            font-size: 0.85rem;
          "
        >
          <i class="fas fa-${isExpired ? 'trash' : 'archive'}"></i>
        </button>
      </div>
    </div>
  `;
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

function wireModalEvents() {
  const modal = document.getElementById('theme-admin-modal');
  if (!modal) return;

  // Tab switching
  modal.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const tab = e.currentTarget.dataset.tab;
      switchTab(tab);
    });
  });

  // Form submission
  const form = modal.querySelector('#theme-create-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await handleCreateTheme(form);
    });
  }

  // Theme management buttons (delegated)
  modal.addEventListener('click', async (e) => {
    const editBtn = e.target.closest('.btn-edit-theme');
    const extendBtn = e.target.closest('.btn-extend-theme');
    const archiveBtn = e.target.closest('.btn-archive-theme');
    const deleteBtn = e.target.closest('.btn-delete-theme');
    const manageProjectsBtn = e.target.closest('.btn-manage-projects');

    if (editBtn) {
      const themeId = editBtn.dataset.themeId;
      await handleEditTheme(themeId);
    } else if (extendBtn) {
      const themeId = extendBtn.dataset.themeId;
      await handleExtendTheme(themeId);
    } else if (archiveBtn) {
      const themeId = archiveBtn.dataset.themeId;
      await handleArchiveTheme(themeId);
    } else if (deleteBtn) {
      const themeId = deleteBtn.dataset.themeId;
      await handleDeleteTheme(themeId);
    } else if (manageProjectsBtn) {
      const themeId = manageProjectsBtn.dataset.themeId;
      await handleManageProjects(themeId);
    }
  });
}

function switchTab(tabName) {
  const modal = document.getElementById('theme-admin-modal');
  if (!modal) return;

  // Update tab buttons
  modal.querySelectorAll('.tab-btn').forEach(btn => {
    if (btn.dataset.tab === tabName) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Update tab content
  modal.querySelectorAll('.theme-tab-content').forEach(content => {
    if (content.id === `theme-tab-${tabName}`) {
      content.style.display = 'block';
      content.classList.add('active');
    } else {
      content.style.display = 'none';
      content.classList.remove('active');
    }
  });
}

// ============================================================================
// CRUD OPERATIONS
// ============================================================================

async function loadAllThemes() {
  if (!supabase) return;

  try {
    const { data, error } = await supabase
      .from('theme_circles')
      .select('*')
      .order('created_at', { ascending: false});

    if (error) throw error;

    themesData = data || [];

    // Load project counts for each theme
    for (const theme of themesData) {
      const { data: projects, error: projError } = await supabase
        .from('projects')
        .select('id, title, status')
        .eq('theme_id', theme.id)
        .in('status', ['active', 'in-progress', 'open']);

      if (!projError) {
        theme.assigned_projects = projects || [];
      } else {
        theme.assigned_projects = [];
      }
    }

  } catch (error) {
    console.error('Failed to load themes:', error);
    showSynapseNotification('Failed to load themes', 'error');
  }
}

async function handleCreateTheme(form) {
  if (!supabase) return;

  const formData = new FormData(form);
  const title = formData.get('title').trim();
  const description = formData.get('description').trim();
  const tagsRaw = formData.get('tags').trim();
  const duration = parseInt(formData.get('duration'), 10);
  const ctaText = formData.get('cta_text').trim();
  const ctaLink = formData.get('cta_link').trim();

  if (!title) {
    alert('Title is required');
    return;
  }

  const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [];
  const expiresAt = new Date(Date.now() + duration * 86400000).toISOString();

  const payload = {
    title,
    description: description || null,
    tags,
    expires_at: expiresAt,
    origin_type: 'admin',
    status: 'active',
    cta_text: ctaText || null,
    cta_link: ctaLink || null,
    activity_score: 0
  };

  try {
    const { error } = await supabase
      .from('theme_circles')
      .insert([payload]);

    if (error) throw error;

    showSynapseNotification('Theme circle created! ✨', 'success');

    // Reload themes and switch to manage tab
    await loadAllThemes();
    const manageTab = document.getElementById('theme-tab-manage');
    if (manageTab) {
      manageTab.innerHTML = renderThemesList();
    }
    switchTab('manage');

    // Clear form
    form.reset();

  } catch (error) {
    console.error('Failed to create theme:', error);
    showSynapseNotification(error.message || 'Failed to create theme', 'error');
  }
}

async function handleEditTheme(themeId) {
  const theme = themesData.find(t => t.id === themeId);
  if (!theme) return;

  const title = prompt('Theme title:', theme.title);
  if (!title) return;

  const description = prompt('Description:', theme.description || '');
  const tagsRaw = prompt('Tags (comma-separated):', (theme.tags || []).join(', '));

  const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [];

  try {
    const { error } = await supabase
      .from('theme_circles')
      .update({ title, description: description || null, tags })
      .eq('id', themeId);

    if (error) throw error;

    showSynapseNotification('Theme updated!', 'success');

    await loadAllThemes();
    const manageTab = document.getElementById('theme-tab-manage');
    if (manageTab) {
      manageTab.innerHTML = renderThemesList();
    }
    wireModalEvents();

  } catch (error) {
    console.error('Failed to update theme:', error);
    showSynapseNotification(error.message || 'Failed to update theme', 'error');
  }
}

async function handleExtendTheme(themeId) {
  const theme = themesData.find(t => t.id === themeId);
  if (!theme) return;

  const daysRaw = prompt('Extend by how many days?', '7');
  if (!daysRaw) return;

  const days = Math.max(1, Math.min(90, parseInt(daysRaw, 10)));
  const newExpiresAt = new Date(new Date(theme.expires_at).getTime() + days * 86400000).toISOString();

  try {
    const { error } = await supabase
      .from('theme_circles')
      .update({ expires_at: newExpiresAt })
      .eq('id', themeId);

    if (error) throw error;

    showSynapseNotification(`Extended by ${days} days! ⏰`, 'success');

    await loadAllThemes();
    const manageTab = document.getElementById('theme-tab-manage');
    if (manageTab) {
      manageTab.innerHTML = renderThemesList();
    }
    wireModalEvents();

  } catch (error) {
    console.error('Failed to extend theme:', error);
    showSynapseNotification(error.message || 'Failed to extend theme', 'error');
  }
}

async function handleArchiveTheme(themeId) {
  if (!confirm('Archive this theme? It will no longer appear in the network.')) return;

  try {
    const { error } = await supabase
      .from('theme_circles')
      .update({ status: 'archived' })
      .eq('id', themeId);

    if (error) throw error;

    showSynapseNotification('Theme archived', 'success');

    await loadAllThemes();
    const manageTab = document.getElementById('theme-tab-manage');
    if (manageTab) {
      manageTab.innerHTML = renderThemesList();
    }
    wireModalEvents();

  } catch (error) {
    console.error('Failed to archive theme:', error);
    showSynapseNotification(error.message || 'Failed to archive theme', 'error');
  }
}

async function handleDeleteTheme(themeId) {
  if (!confirm('Permanently delete this theme? This cannot be undone.')) return;

  try {
    // Delete associated participants first
    await supabase
      .from('theme_participants')
      .delete()
      .eq('theme_id', themeId);

    // Delete theme
    const { error } = await supabase
      .from('theme_circles')
      .delete()
      .eq('id', themeId);

    if (error) throw error;

    showSynapseNotification('Theme deleted', 'success');

    await loadAllThemes();
    const manageTab = document.getElementById('theme-tab-manage');
    if (manageTab) {
      manageTab.innerHTML = renderThemesList();
    }
    wireModalEvents();

  } catch (error) {
    console.error('Failed to delete theme:', error);
    showSynapseNotification(error.message || 'Failed to delete theme', 'error');
  }
}

async function handleManageProjects(themeId) {
  const theme = themesData.find(t => t.id === themeId);
  if (!theme) return;

  try {
    // Load all active projects
    const { data: allProjects, error } = await supabase
      .from('projects')
      .select('id, title, status, theme_id')
      .in('status', ['active', 'in-progress', 'open'])
      .order('title', { ascending: true });

    if (error) throw error;

    // Separate assigned and unassigned projects
    const assignedProjects = allProjects.filter(p => p.theme_id === themeId);
    const availableProjects = allProjects.filter(p => !p.theme_id || p.theme_id !== themeId);

    // Build project list text
    let message = `Managing projects for: ${theme.title}\n\n`;
    message += `ASSIGNED PROJECTS (${assignedProjects.length}):\n`;

    if (assignedProjects.length > 0) {
      assignedProjects.forEach((p, idx) => {
        message += `${idx + 1}. ${p.title}\n`;
      });
    } else {
      message += `(none)\n`;
    }

    message += `\nAVAILABLE PROJECTS (${availableProjects.length}):\n`;
    if (availableProjects.length > 0) {
      availableProjects.slice(0, 10).forEach((p, idx) => {
        message += `${idx + 1}. ${p.title}\n`;
      });
      if (availableProjects.length > 10) {
        message += `...and ${availableProjects.length - 10} more\n`;
      }
    } else {
      message += `(all projects are assigned to themes)\n`;
    }

    message += `\nOptions:\n`;
    message += `- Type "assign <number>" to assign an available project\n`;
    message += `- Type "remove <number>" to unassign an assigned project\n`;
    message += `- Click Cancel to close\n`;

    const input = prompt(message);
    if (!input) return;

    const parts = input.trim().toLowerCase().split(' ');
    const action = parts[0];
    const num = parseInt(parts[1]);

    if (action === 'assign' && num > 0 && num <= availableProjects.length) {
      const project = availableProjects[num - 1];
      await assignProjectToTheme(project.id, themeId, project.title);
    } else if (action === 'remove' && num > 0 && num <= assignedProjects.length) {
      const project = assignedProjects[num - 1];
      await unassignProjectFromTheme(project.id, project.title);
    } else {
      alert('Invalid command. Please use "assign <number>" or "remove <number>"');
    }

  } catch (error) {
    console.error('Failed to manage projects:', error);
    showSynapseNotification('Failed to load projects', 'error');
  }
}

async function assignProjectToTheme(projectId, themeId, projectTitle) {
  try {
    const { error } = await supabase
      .from('projects')
      .update({ theme_id: themeId })
      .eq('id', projectId);

    if (error) throw error;

    showSynapseNotification(`✓ Assigned: ${projectTitle}`, 'success');

    // Reload and refresh UI
    await loadAllThemes();
    const manageTab = document.getElementById('theme-tab-manage');
    if (manageTab) {
      manageTab.innerHTML = renderThemesList();
    }
    wireModalEvents();

  } catch (error) {
    console.error('Failed to assign project:', error);
    showSynapseNotification('Failed to assign project', 'error');
  }
}

async function unassignProjectFromTheme(projectId, projectTitle) {
  try {
    const { error } = await supabase
      .from('projects')
      .update({ theme_id: null })
      .eq('id', projectId);

    if (error) throw error;

    showSynapseNotification(`✓ Removed: ${projectTitle}`, 'success');

    // Reload and refresh UI
    await loadAllThemes();
    const manageTab = document.getElementById('theme-tab-manage');
    if (manageTab) {
      manageTab.innerHTML = renderThemesList();
    }
    wireModalEvents();

  } catch (error) {
    console.error('Failed to unassign project:', error);
    showSynapseNotification('Failed to unassign project', 'error');
  }
}

// ============================================================================
// UTILITIES
// ============================================================================

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

// ============================================================================
// AUTO-INITIALIZE
// ============================================================================

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initThemeAdmin);
} else {
  initThemeAdmin();
}
