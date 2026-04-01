// ================================================================
// SYNAPSE CONTEXT — Entity Lens State (Projects / Orgs / Themes)
// ================================================================
// Manages selected project, org, or theme as a "context lens" that
// highlights related people in the people-only Synapse graph.
// These entities are NOT graph nodes — they drive graph highlighting.
// ================================================================

const _state = {
  type: null,   // 'project' | 'organization' | 'theme' | null
  id: null,     // entity ID (or theme string for themes)
  name: null,   // display name
  memberIds: null, // Set<string> — people IDs to highlight
};

const _listeners = new Set();

// ----------------------------------------------------------------
// Public API
// ----------------------------------------------------------------

export function getContext() {
  return { ..._state };
}

export function hasContext() {
  return _state.type !== null;
}

/** Clear the active context lens. */
export function clearContext() {
  if (!_state.type) return;
  const prev = { ..._state };
  _state.type = null;
  _state.id = null;
  _state.name = null;
  _state.memberIds = null;
  console.log('[Context] Cleared');
  _notify(null, prev);
}

/**
 * Set a project context lens.
 * Resolves project members from Supabase and highlights them.
 */
export async function setProjectContext(projectId, projectName) {
  const supabase = window.supabase;
  if (!supabase || !projectId) return;

  const { data, error } = await supabase
    .from('project_members')
    .select('user_id')
    .eq('project_id', projectId);

  const memberIds = new Set((data || []).map(d => d.user_id).filter(Boolean));

  _state.type = 'project';
  _state.id = projectId;
  _state.name = projectName || 'Project';
  _state.memberIds = memberIds;

  console.log(`[Context] Project selected: ${projectId} → highlighting ${memberIds.size} members`);
  _notify(_state);
}

/**
 * Set an organization context lens.
 * Resolves org members from Supabase and highlights them.
 */
export async function setOrgContext(orgId, orgName) {
  const supabase = window.supabase;
  if (!supabase || !orgId) return;

  const { data, error } = await supabase
    .from('organization_members')
    .select('community_id')
    .eq('organization_id', orgId);

  const memberIds = new Set((data || []).map(d => d.community_id).filter(Boolean));

  _state.type = 'organization';
  _state.id = orgId;
  _state.name = orgName || 'Organization';
  _state.memberIds = memberIds;

  console.log(`[Context] Org selected: ${orgId} → highlighting ${memberIds.size} members`);
  _notify(_state);
}

/**
 * Set a theme/skill context lens.
 * Finds people with matching skills from graph node data.
 */
export function setThemeContext(themeString) {
  if (!themeString) return;

  const needle = themeString.trim().toLowerCase();
  const store = window.graphDataStore;
  const memberIds = new Set();

  if (store && typeof store.getAllNodes === 'function') {
    store.getAllNodes().forEach(n => {
      if (n.type !== 'person') return;
      const raw = n._raw || n;
      const sources = [raw.skills, raw.interests, raw.themes];
      for (const src of sources) {
        if (Array.isArray(src)) {
          if (src.some(s => String(s).trim().toLowerCase().includes(needle))) {
            memberIds.add(n.id);
            return;
          }
        } else if (typeof src === 'string' && src.toLowerCase().includes(needle)) {
          memberIds.add(n.id);
          return;
        }
      }
    });
  }

  _state.type = 'theme';
  _state.id = themeString;
  _state.name = themeString;
  _state.memberIds = memberIds;

  console.log(`[Context] Theme selected: "${themeString}" → highlighting ${memberIds.size} people`);
  _notify(_state);
}

/** Subscribe to context changes. Returns unsubscribe function. */
export function onContextChange(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

function _notify(ctx, prev) {
  _listeners.forEach(fn => { try { fn(ctx, prev); } catch (e) { console.error(e); } });
}

// Global exposure
window.SynapseContext = {
  get: getContext,
  has: hasContext,
  clear: clearContext,
  setProject: setProjectContext,
  setOrg: setOrgContext,
  setTheme: setThemeContext,
};
