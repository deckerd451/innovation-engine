// ================================================================
// Dashboard Organizations Panel
// Extracted from dashboard-actions.js for maintainability.
// Handles the floating Organizations panel: browse, my orgs, create.
//
// Dependencies (all via window.*):
//   window.supabase            — database client
//   window.currentUserProfile  — logged-in community profile
//   window.refreshSynapseConnections (optional) — graph refresh
// ================================================================

// Toast bridge — mirrors the one in dashboard-actions.js
function _toast(msg) {
  if (!msg) return;
  const s = String(msg);
  const t = window.showToast;
  if (!t) { console.warn('[orgs]', s); return; }
  if (/success|saved|created|updated|joined|removed|assigned|extended|archived|deleted|reinstated|healthy|active/i.test(s)) {
    t(s, 'success');
  } else if (/fail|error|invalid|unable|cannot|not found|not available|please log in|required|permission|unknown/i.test(s)) {
    t(s, 'error');
  } else if (/warning|⚠️|not currently|being set up|try again|check console/i.test(s)) {
    t(s, 'warning');
  } else {
    t(s, 'info');
  }
}

// -----------------------------
// Organizations Panel
// -----------------------------
function showOrganizationsPanel() {
  // Remove existing panel if present
  let panel = document.getElementById('organizations-panel');
  if (panel) {
    panel.remove();
    return;
  }

  panel = document.createElement('div');
  panel.id = 'organizations-panel';
  panel.style.cssText = `
    position: fixed;
    inset: 20px;
    background: linear-gradient(135deg, rgba(10,14,39,0.98), rgba(26,26,46,0.98));
    border: 2px solid rgba(168,85,247,0.5);
    border-radius: 16px;
    padding: 2rem;
    box-shadow: 0 25px 70px rgba(0,0,0,0.7);
    z-index: 10003;
    backdrop-filter: blur(20px);
    overflow-y: auto;
  `;

  panel.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; border-bottom: 2px solid rgba(168,85,247,0.3); padding-bottom: 1rem;">
      <h2 style="color: #a855f7; margin: 0; font-size: 1.75rem;">
        <i class="fas fa-building"></i> Organizations
      </h2>
      <button onclick="document.getElementById('organizations-panel').remove()"
        style="background: rgba(255,255,255,0.1); border: 2px solid rgba(255,255,255,0.3);
        color: white; width: 40px; height: 40px; border-radius: 50%; cursor: pointer; font-size: 1.25rem;">
        <i class="fas fa-times"></i>
      </button>
    </div>

    <!-- Tabs -->
    <div style="display: flex; gap: 1rem; margin-bottom: 2rem; border-bottom: 1px solid rgba(255,255,255,0.1);">
      <button class="orgs-tab active-orgs-tab" data-tab="browse" style="padding: 0.75rem 1.5rem; background: rgba(168,85,247,0.1); border: none; border-bottom: 3px solid #a855f7; color: #a855f7; cursor: pointer; font-weight: 600; transition: all 0.2s;">
        <i class="fas fa-search"></i> Browse Orgs
      </button>
      <button class="orgs-tab" data-tab="my-orgs" style="padding: 0.75rem 1.5rem; background: transparent; border: none; border-bottom: 3px solid transparent; color: rgba(255,255,255,0.6); cursor: pointer; font-weight: 600; transition: all 0.2s;">
        <i class="fas fa-user-tag"></i> My Orgs
      </button>
      <button class="orgs-tab" data-tab="create" style="padding: 0.75rem 1.5rem; background: transparent; border: none; border-bottom: 3px solid transparent; color: rgba(255,255,255,0.6); cursor: pointer; font-weight: 600; transition: all 0.2s;">
        <i class="fas fa-plus"></i> Create Org
      </button>
    </div>

    <!-- Tab Content -->
    <div id="orgs-tab-content" style="padding: 1rem 0;">
      <!-- Content will be loaded dynamically -->
    </div>
  `;

  document.body.appendChild(panel);

  // Wire up tabs
  panel.querySelectorAll('.orgs-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      panel.querySelectorAll('.orgs-tab').forEach(t => {
        t.style.background = 'transparent';
        t.style.borderBottomColor = 'transparent';
        t.style.color = 'rgba(255,255,255,0.6)';
        t.classList.remove('active-orgs-tab');
      });
      tab.style.background = 'rgba(168,85,247,0.1)';
      tab.style.borderBottomColor = '#a855f7';
      tab.style.color = '#a855f7';
      tab.classList.add('active-orgs-tab');

      const tabName = tab.dataset.tab;
      loadOrgsTabContent(tabName);
    });
  });

  // Load initial tab
  loadOrgsTabContent('browse');
}

async function loadOrgsTabContent(tabName) {
  const content = document.getElementById('orgs-tab-content');
  if (!content) return;

  const supabase = window.supabase;
  if (!supabase) {
    content.innerHTML = '<p style="color: #ff6b6b;">Database connection not available</p>';
    return;
  }

  if (tabName === 'browse') {
    content.innerHTML = `
      <div style="text-align: center; padding: 2rem;">
        <i class="fas fa-spinner fa-spin" style="font-size: 2rem; color: #a855f7;"></i>
        <p style="color: rgba(255,255,255,0.7); margin-top: 1rem;">Loading organizations...</p>
      </div>
    `;

    try {
      const { data: organizations, error } = await supabase
        .from('organizations')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;

      if (!organizations || organizations.length === 0) {
        content.innerHTML = `
          <div style="text-align: center; padding: 3rem;">
            <i class="fas fa-building" style="font-size: 3rem; color: rgba(168,85,247,0.3); margin-bottom: 1rem;"></i>
            <p style="color: rgba(255,255,255,0.5);">No organizations yet</p>
            <p style="color: rgba(255,255,255,0.3); font-size: 0.9rem;">Be the first to create one!</p>
          </div>
        `;
        return;
      }

      let html = '<div style="display: grid; gap: 1rem;">';
      for (const org of organizations) {
        html += `
          <div style="background: rgba(168,85,247,0.05); border: 1px solid rgba(168,85,247,0.2); border-radius: 12px; padding: 1.25rem;">
            <div style="display: flex; align-items: center; gap: 1rem;">
              <div style="width: 50px; height: 50px; border-radius: 10px; background: rgba(168,85,247,0.2); border: 2px solid rgba(168,85,247,0.4); display: flex; align-items: center; justify-content: center; font-size: 1.5rem; flex-shrink: 0;">
                ${org.logo_url ? `<img src="${escapeHtml(org.logo_url)}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 8px;">` : '<i class="fas fa-building" style="color: #a855f7;"></i>'}
              </div>
              <div style="flex: 1; min-width: 0;">
                <div style="color: #fff; font-weight: 600; font-size: 1.1rem; margin-bottom: 0.25rem;">${escapeHtml(org.name)}</div>
                <div style="color: rgba(255,255,255,0.6); font-size: 0.85rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                  ${org.industry ? `<span style="color: #a855f7;"><i class="fas fa-tag"></i> ${escapeHtml(Array.isArray(org.industry) ? org.industry.join(', ') : org.industry)}</span>` : ''}
                  ${org.location ? `<span style="margin-left: 1rem;"><i class="fas fa-map-marker-alt"></i> ${escapeHtml(org.location)}</span>` : ''}
                </div>
                ${org.description ? `<div style="color: rgba(255,255,255,0.5); font-size: 0.85rem; margin-top: 0.5rem; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">${escapeHtml(org.description)}</div>` : ''}
              </div>
              <button onclick="joinOrganization('${org.id}')" style="background: linear-gradient(135deg, #a855f7, #8b5cf6); border: none; border-radius: 8px; padding: 0.5rem 1rem; color: white; font-weight: 600; cursor: pointer; white-space: nowrap;">
                <i class="fas fa-plus"></i> Join
              </button>
            </div>
          </div>
        `;
      }
      html += '</div>';
      content.innerHTML = html;

    } catch (error) {
      console.error('Error loading organizations:', error);
      content.innerHTML = '<p style="color: #ff6b6b;">Error loading organizations</p>';
    }

  } else if (tabName === 'my-orgs') {
    content.innerHTML = `
      <div style="text-align: center; padding: 2rem;">
        <i class="fas fa-spinner fa-spin" style="font-size: 2rem; color: #a855f7;"></i>
        <p style="color: rgba(255,255,255,0.7); margin-top: 1rem;">Loading your organizations...</p>
      </div>
    `;

    try {
      // Get current user
      const currentUser = window.currentUserProfile;
      if (!currentUser) {
        content.innerHTML = '<p style="color: #ff6b6b;">Please log in to see your organizations</p>';
        return;
      }

      // Get user's organization memberships
      const { data: memberships, error: membershipsError } = await supabase
        .from('organization_members')
        .select('organization_id, role')
        .eq('community_id', currentUser.id);

      if (membershipsError) {
        // Handle table not exists error
        if (membershipsError.code === '42P01' || membershipsError.message?.includes('does not exist') ||
            membershipsError.code === 'PGRST116' || String(membershipsError.code) === '500') {
          content.innerHTML = `
            <div style="text-align: center; padding: 3rem;">
              <i class="fas fa-tools" style="font-size: 3rem; color: rgba(168,85,247,0.3); margin-bottom: 1rem;"></i>
              <p style="color: rgba(255,255,255,0.5);">Organization membership is being set up</p>
              <p style="color: rgba(255,255,255,0.3); font-size: 0.9rem;">Please check back later or contact an administrator.</p>
            </div>
          `;
          return;
        }
        throw membershipsError;
      }

      if (!memberships || memberships.length === 0) {
        content.innerHTML = `
          <div style="text-align: center; padding: 3rem;">
            <i class="fas fa-user-tag" style="font-size: 3rem; color: rgba(168,85,247,0.3); margin-bottom: 1rem;"></i>
            <p style="color: rgba(255,255,255,0.5);">You haven't joined any organizations yet</p>
            <p style="color: rgba(255,255,255,0.3); font-size: 0.9rem;">Browse organizations to find ones to join!</p>
          </div>
        `;
        return;
      }

      // Get organization details
      const orgIds = memberships.map(m => m.organization_id);
      const { data: organizations, error: orgsError } = await supabase
        .from('organizations')
        .select('*')
        .in('id', orgIds);

      if (orgsError) throw orgsError;

      let html = '<div style="display: grid; gap: 1rem;">';
      for (const org of organizations) {
        const membership = memberships.find(m => m.organization_id === org.id);
        html += `
          <div style="background: rgba(168,85,247,0.08); border: 1px solid rgba(168,85,247,0.3); border-radius: 12px; padding: 1.25rem;">
            <div style="display: flex; align-items: center; gap: 1rem;">
              <div style="width: 50px; height: 50px; border-radius: 10px; background: rgba(168,85,247,0.2); border: 2px solid rgba(168,85,247,0.4); display: flex; align-items: center; justify-content: center; font-size: 1.5rem; flex-shrink: 0;">
                ${org.logo_url ? `<img src="${escapeHtml(org.logo_url)}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 8px;">` : '<i class="fas fa-building" style="color: #a855f7;"></i>'}
              </div>
              <div style="flex: 1; min-width: 0;">
                <div style="color: #fff; font-weight: 600; font-size: 1.1rem; margin-bottom: 0.25rem;">${escapeHtml(org.name)}</div>
                <div style="color: #a855f7; font-size: 0.85rem;">
                  <i class="fas fa-user-shield"></i> ${escapeHtml(membership?.role || 'member')}
                </div>
              </div>
              <button onclick="leaveOrganization('${org.id}')" style="background: rgba(255,107,107,0.2); border: 1px solid rgba(255,107,107,0.4); border-radius: 8px; padding: 0.5rem 1rem; color: #ff6b6b; font-weight: 600; cursor: pointer; white-space: nowrap;">
                <i class="fas fa-sign-out-alt"></i> Leave
              </button>
            </div>
          </div>
        `;
      }
      html += '</div>';
      content.innerHTML = html;

    } catch (error) {
      console.error('Error loading user organizations:', error);
      content.innerHTML = '<p style="color: #ff6b6b;">Error loading your organizations</p>';
    }

  } else if (tabName === 'create') {
    content.innerHTML = `
      <div style="max-width: 500px; margin: 0 auto;">
        <h3 style="color: #a855f7; margin-bottom: 1.5rem;"><i class="fas fa-plus-circle"></i> Create New Organization</h3>
        <form id="create-org-form">
          <div style="margin-bottom: 1rem;">
            <label style="display: block; color: #aaa; margin-bottom: 0.5rem;">Organization Name *</label>
            <input type="text" id="org-name" required
              style="width: 100%; padding: 0.75rem; background: rgba(168,85,247,0.05);
              border: 1px solid rgba(168,85,247,0.2); border-radius: 8px; color: white; font-family: inherit;">
          </div>

          <div style="margin-bottom: 1rem;">
            <label style="display: block; color: #aaa; margin-bottom: 0.5rem;">Description</label>
            <textarea id="org-description" rows="3"
              style="width: 100%; padding: 0.75rem; background: rgba(168,85,247,0.05);
              border: 1px solid rgba(168,85,247,0.2); border-radius: 8px; color: white; font-family: inherit; resize: vertical;"></textarea>
          </div>

          <div style="margin-bottom: 1rem;">
            <label style="display: block; color: #aaa; margin-bottom: 0.5rem;">Industry</label>
            <input type="text" id="org-industry" placeholder="e.g., Technology, Healthcare, Education"
              style="width: 100%; padding: 0.75rem; background: rgba(168,85,247,0.05);
              border: 1px solid rgba(168,85,247,0.2); border-radius: 8px; color: white; font-family: inherit;">
          </div>

          <div style="margin-bottom: 1rem;">
            <label style="display: block; color: #aaa; margin-bottom: 0.5rem;">Location</label>
            <input type="text" id="org-location" placeholder="e.g., Charleston, SC"
              style="width: 100%; padding: 0.75rem; background: rgba(168,85,247,0.05);
              border: 1px solid rgba(168,85,247,0.2); border-radius: 8px; color: white; font-family: inherit;">
          </div>

          <div style="margin-bottom: 1rem;">
            <label style="display: block; color: #aaa; margin-bottom: 0.5rem;">Website</label>
            <input type="url" id="org-website" placeholder="https://..."
              style="width: 100%; padding: 0.75rem; background: rgba(168,85,247,0.05);
              border: 1px solid rgba(168,85,247,0.2); border-radius: 8px; color: white; font-family: inherit;">
          </div>

          <div style="display: flex; gap: 0.5rem; margin-top: 1.5rem;">
            <button type="submit" style="flex: 1; padding: 0.75rem; background: linear-gradient(135deg, #a855f7, #8b5cf6); border: none; border-radius: 8px; color: white; font-weight: 600; cursor: pointer;">
              <i class="fas fa-plus"></i> Create Organization
            </button>
          </div>
        </form>
      </div>
    `;

    // Wire up form submission
    document.getElementById('create-org-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      debugger; // ← PATH B: remove after confirming which handler fires
      console.warn('[dashboard-actions] PATH B create-org-form fired — this is the STALE handler, not organization-manager.js');
      await createOrganization();
    });
  }
}

// STALE PATH — does not use OrganizationManager, does not set created_by.
// If you see [dashboard-actions PATH B] in the console, this is your bug source.
// Fix: replace the body with a delegation to window.OrganizationManager.createOrganization()
// See the TODO comment at the end of this function.
async function createOrganization() {
  console.group('[dashboard-actions] createOrganization() — STALE PATH B');
  console.log('window.supabase:', !!window.supabase);
  console.log('window.currentUserProfile:', window.currentUserProfile);

  const supabase = window.supabase;
  if (!supabase) {
    console.error('[dashboard-actions] BLOCKED — supabase not on window');
    console.groupEnd();
    _toast('Database connection not available');
    return;
  }

  const currentUser = window.currentUserProfile;
  if (!currentUser) {
    console.error('[dashboard-actions] BLOCKED — window.currentUserProfile is null');
    console.groupEnd();
    _toast('Please log in to create an organization');
    return;
  }

  console.log('currentUser.id (used as community_id):', currentUser.id);

  const name = document.getElementById('org-name')?.value?.trim();
  const description = document.getElementById('org-description')?.value?.trim();
  const industryRaw = document.getElementById('org-industry')?.value?.trim();
  const industry = parseTextArray(industryRaw);
  const location = document.getElementById('org-location')?.value?.trim();
  const website = document.getElementById('org-website')?.value?.trim();

  if (!name) {
    console.error('[dashboard-actions] BLOCKED — name is empty');
    console.groupEnd();
    _toast('Organization name is required');
    return;
  }

  // Generate a unique slug
  let slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  // Check if slug exists and make unique if needed
  const { data: existing } = await supabase
    .from('organizations')
    .select('slug')
    .eq('slug', slug)
    .maybeSingle();

  if (existing) {
    slug = `${slug}-${Date.now().toString(36)}`;
  }

  const insertPayload = {
    name,
    slug,
    description: description || null,
    industry: industry && industry.length ? industry : null,
    location: location || null,
    website: website || null,
    // NOTE: created_by is intentionally omitted here — the DB trigger will set it.
    // To fix this properly, delegate to window.OrganizationManager.createOrganization().
  };
  console.log('[dashboard-actions] INSERT payload:', insertPayload);

  try {
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert([insertPayload])
      .select()
      .single();

    if (orgError) {
      console.error('[dashboard-actions] INSERT error:', orgError);
      throw orgError;
    }

    console.log('[dashboard-actions] INSERT succeeded:', org.id, '| created_by:', org.created_by);

    // Add creator as owner
    const memberPayload = { organization_id: org.id, community_id: currentUser.id, role: 'owner' };
    console.log('[dashboard-actions] organization_members INSERT payload:', memberPayload);
    const { error: memberError } = await supabase
      .from('organization_members')
      .insert([memberPayload]);

    if (memberError) {
      console.error('[dashboard-actions] organization_members INSERT FAILED — org will not appear in my-orgs tab:', memberError);
    } else {
      console.log('[dashboard-actions] organization_members INSERT succeeded');
    }

    console.groupEnd();
    _toast('Organization created successfully!' +
      (await checkOrgMembersTableExists(supabase) ? '' : '\n\nNote: Membership features are being set up.'));

    // Refresh the organizations list
    loadOrgsTabContent('browse');

    // Refresh synapse view
    if (typeof window.refreshSynapseConnections === 'function') {
      window.refreshSynapseConnections();
    }

  } catch (error) {
    console.error('[dashboard-actions] createOrganization THREW:', error);
    console.groupEnd();
    _toast('Failed to create organization: ' + (error.message || 'Unknown error'));
  }
}

async function joinOrganization(orgId) {
  const supabase = window.supabase;
  if (!supabase) {
    _toast('Database connection not available');
    return;
  }

  const currentUser = window.currentUserProfile;
  if (!currentUser) {
    _toast('Please log in to join an organization');
    return;
  }

  try {
    // Check if already a member
    const { data: existing, error: checkError } = await supabase
      .from('organization_members')
      .select('id')
      .eq('organization_id', orgId)
      .eq('community_id', currentUser.id)
      .maybeSingle();

    // Handle case where table might not exist (500 error or PGRST116)
    if (checkError) {
      console.error('Error checking membership:', checkError);
      if (checkError.code === '42P01' || checkError.message?.includes('does not exist') ||
          checkError.code === 'PGRST116' || checkError.message?.includes('relation') ||
          String(checkError.code) === '500') {
        _toast('Organization membership feature is being set up. Please try again later or contact an administrator.');
        return;
      }
      // For other errors, continue to try joining
    }

    if (existing) {
      _toast('You are already a member of this organization');
      return;
    }

    // Add membership
    const { error } = await supabase
      .from('organization_members')
      .insert([{
        organization_id: orgId,
        community_id: currentUser.id,
        role: 'member'
      }]);

    if (error) {
      // Handle specific error codes
      if (error.code === '42P01' || error.message?.includes('does not exist') ||
          error.code === 'PGRST116' || String(error.code) === '500') {
        _toast('Organization membership feature is being set up. Please try again later or contact an administrator.');
        return;
      }
      throw error;
    }

    _toast('You have joined the organization!');

    // Refresh the list
    loadOrgsTabContent('browse');

    // Refresh synapse view
    if (typeof window.refreshSynapseConnections === 'function') {
      window.refreshSynapseConnections();
    }

  } catch (error) {
    console.error('Error joining organization:', error);
    _toast('Failed to join organization: ' + (error.message || 'Unknown error'));
  }
}

async function leaveOrganization(orgId) {
  if (!confirm('Are you sure you want to leave this organization?')) {
    return;
  }

  const supabase = window.supabase;
  if (!supabase) {
    _toast('Database connection not available');
    return;
  }

  const currentUser = window.currentUserProfile;
  if (!currentUser) {
    _toast('Please log in');
    return;
  }

  try {
    const { error } = await supabase
      .from('organization_members')
      .delete()
      .eq('organization_id', orgId)
      .eq('community_id', currentUser.id);

    if (error) {
      // Handle table not exists error
      if (error.code === '42P01' || error.message?.includes('does not exist') ||
          error.code === 'PGRST116' || String(error.code) === '500') {
        _toast('Organization membership feature is being set up. Please try again later.');
        return;
      }
      throw error;
    }

    _toast('You have left the organization');

    // Refresh the list
    loadOrgsTabContent('my-orgs');

    // Refresh synapse view
    if (typeof window.refreshSynapseConnections === 'function') {
      window.refreshSynapseConnections();
    }

  } catch (error) {
    console.error('Error leaving organization:', error);
    _toast('Failed to leave organization: ' + (error.message || 'Unknown error'));
  }
}

// Converts comma-separated text or JSON array string into a clean text[]
function parseTextArray(raw) {
  if (!raw) return null;

  // Already an array
  if (Array.isArray(raw)) {
    const cleaned = raw.map(v => String(v).trim()).filter(Boolean);
    return cleaned.length ? Array.from(new Set(cleaned)) : null;
  }

  const s = String(raw).trim();
  if (!s) return null;

  // JSON array input: ["Tech","Health"]
  if (s.startsWith('[') && s.endsWith(']')) {
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr)) {
        const cleaned = arr.map(v => String(v).trim()).filter(Boolean);
        return cleaned.length ? Array.from(new Set(cleaned)) : null;
      }
    } catch (_) {
      // fall through to comma-split
    }
  }

  // Comma/semicolon separated: Tech, Health; Education
  const parts = s.split(/[;,]/g).map(v => v.trim()).filter(Boolean);
  return parts.length ? Array.from(new Set(parts)) : null;
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Helper to check if organization_members table exists
async function checkOrgMembersTableExists(supabase) {
  try {
    const { error } = await supabase
      .from('organization_members')
      .select('id')
      .limit(1);
    return !error;
  } catch {
    return false;
  }
}

// Make organization functions globally available
window.showOrganizationsPanel = showOrganizationsPanel;
window.joinOrganization = joinOrganization;
window.leaveOrganization = leaveOrganization;

// Simple notification helper if not already defined
if (typeof window.showNotification !== 'function') {
  window.showNotification = function(message, type = 'info') {
    console.log(`[${type.toUpperCase()}] ${message}`);
    if (typeof window.showToastNotification === 'function') {
      window.showToastNotification(message, type);
    } else {
      if (type === 'error') {
        _toast(message);
      }
    }
  };
}
