// ================================================================
// SYNAPSE FILTER UI — Wires filter chips to graph rendering
// ================================================================
// Connects the filter bar DOM to synapse-filter.js state and applies
// visual dimming/brightening to the live graph via the node renderer.
// ================================================================

import {
  FILTER_MODES,
  FILTER_VISUALS,
  getSynapseFilter,
  setSynapseFilter,
  onFilterChange,
  computeFilteredNodeState,
} from './synapse-filter.js';

import {
  getContext,
  hasContext,
  clearContext,
  onContextChange,
} from './synapse-context.js';

let _initialized = false;
let _userId = null;

// Cached enrichment data (populated async, updated on events)
const _extra = {
  acceptedPeerIds: null,
  projectCollaboratorIds: null,
  orgMemberIds: null,
  _sharedOrgNames: null,
  oppRelevantIds: null,
  oppSkills: null,
};

// Per-node explanation context (rebuilt on each filter application)
// Map<nodeId, { reason: string, detail: string }>
let _nodeContext = new Map();

// Pre-computed counts per filter (updated when enrichment data loads)
const _filterCounts = {
  connected: 0,
  projects: 0,
  themes: 0,
  orgs: 0,
  opps: 0,
  events: 0,
};

// Header labels per filter
const FILTER_HEADERS = {
  [FILTER_MODES.CONNECTED]: 'Your Network',
  [FILTER_MODES.PROJECTS]:  'Collaborators',
  [FILTER_MODES.THEMES]:    'Shared Interests',
  [FILTER_MODES.ORGS]:      'Org Members',
  [FILTER_MODES.OPPS]:      'Opportunities',
  [FILTER_MODES.EVENTS]:    'Event Connections',
};

// ----------------------------------------------------------------
// Initialization
// ----------------------------------------------------------------

export function initSynapseFilterUI(userId) {
  if (_initialized) return;
  _initialized = true;
  _userId = userId;

  _wireChips();
  onFilterChange(_onFilterChanged);
  onContextChange(_onContextChanged);

  // Load enrichment data in background
  _loadEnrichmentData(userId);

  // Re-apply filter when graph finishes loading / re-rendering
  window.addEventListener('unified-network-ready', () => {
    _applyCurrentFilter();
  }, { once: true });

  console.log('[SynapseFilter] UI initialized');
}

// ----------------------------------------------------------------
// Chip wiring
// ----------------------------------------------------------------

function _wireChips() {
  const chips = document.querySelectorAll('#synapse-filter-bar .synapse-filter-chip');
  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      const mode = chip.dataset.filter;
      if (mode) setSynapseFilter(mode);
    });
  });
}

function _updateChipStates(mode) {
  const chips = document.querySelectorAll('#synapse-filter-bar .synapse-filter-chip');
  chips.forEach(chip => {
    const isActive = chip.dataset.filter === mode;
    chip.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
}

// ----------------------------------------------------------------
// Context lens integration
// ----------------------------------------------------------------

function _onContextChanged(ctx) {
  _renderContextChip(ctx);
  _applyCurrentFilter();
}

function _renderContextChip(ctx) {
  const bar = document.getElementById('synapse-filter-bar');
  if (!bar) return;

  // Remove existing context chip
  const existing = bar.querySelector('.synapse-context-chip');
  if (existing) existing.remove();

  if (!ctx || !ctx.type) return;

  const icons = { project: 'fa-project-diagram', organization: 'fa-building', theme: 'fa-palette' };
  const colors = { project: '#00ff88', organization: '#00e0ff', theme: '#a855f7' };
  const icon = icons[ctx.type] || 'fa-filter';
  const color = colors[ctx.type] || '#fff';

  const chip = document.createElement('button');
  chip.className = 'synapse-filter-chip synapse-context-chip';
  chip.setAttribute('aria-pressed', 'true');
  chip.style.cssText = `color:${color}; border-color:${color}50; background:${color}18;`;
  chip.innerHTML = `<i class="fas ${icon}"></i><span>${_escapeHtmlSimple(ctx.name)}</span><i class="fas fa-times" style="opacity:0.6;margin-left:2px;font-size:0.6rem"></i>`;
  chip.title = `${ctx.type}: ${ctx.name} — click to remove`;
  chip.addEventListener('click', () => clearContext());
  bar.appendChild(chip);
}

function _escapeHtmlSimple(s) {
  const d = document.createElement('span');
  d.textContent = s || '';
  return d.innerHTML;
}


// ----------------------------------------------------------------
// Filter application — reads graph data, computes state, applies visuals
// ----------------------------------------------------------------

function _onFilterChanged(mode) {
  _updateChipStates(mode);
  _applyCurrentFilter();
  _updateHeader(mode);
}

function _applyCurrentFilter() {
  const mode = getSynapseFilter();
  const store = window.graphDataStore;
  if (!store || typeof store.getAllNodes !== 'function') return;

  const nodes = store.getAllNodes();
  const edges = store.getAllEdges();
  if (!nodes.length) return;

  const filtered = computeFilteredNodeState(mode, { nodes, edges }, _userId, _extra);

  // --- Context lens integration ---
  // If a context lens is active, narrow the highlighted set to context members.
  const ctx = getContext();
  if (ctx.type && ctx.memberIds && ctx.memberIds.size > 0) {
    const contextIds = ctx.memberIds;
    const allNodeIds = new Set(nodes.map(n => n.id));

    if (mode !== FILTER_MODES.ALL) {
      // Intersect filter + context
      const intersected = new Set();
      filtered.activeNodeIds.forEach(id => {
        if (id === _userId || contextIds.has(id)) intersected.add(id);
      });
      filtered.activeNodeIds = intersected;
    } else {
      // Context alone drives highlighting
      filtered.activeNodeIds = new Set([_userId, ...contextIds]);
    }

    // Recompute dim/edge sets
    filtered.dimNodeIds = new Set();
    allNodeIds.forEach(id => { if (!filtered.activeNodeIds.has(id)) filtered.dimNodeIds.add(id); });
    filtered.activeEdgeKeys = new Set();
    filtered.dimEdgeKeys = new Set();
    edges.forEach(e => {
      const s = e.source?.id ?? e.source;
      const t = e.target?.id ?? e.target;
      const key = `${s}-${t}`;
      if (filtered.activeNodeIds.has(s) && filtered.activeNodeIds.has(t)) {
        filtered.activeEdgeKeys.add(key);
      } else {
        filtered.dimEdgeKeys.add(key);
      }
    });

    // Override mode so renderer applies filter visuals
    if (mode === FILTER_MODES.ALL) {
      filtered.mode = '__context';
      const ctxColors = { project: '#00ff88', organization: '#00e0ff', theme: '#a855f7' };
      const color = ctxColors[ctx.type] || '#00e0ff';
      filtered.visuals = { glowColor: color, strokeColor: color, edgeColor: `${color}88` };
    }
  }

  // Persist filter state globally so the NodeRenderer can read it every tick.
  window.__synapseFilterState = filtered;

  // Build per-node explanation context
  _buildNodeContext(filtered.mode === '__context' ? '__context' : mode, nodes, filtered.activeNodeIds);

  // Update header
  if (ctx.type) {
    const ctxLabel = ctx.type === 'project' ? 'Project' : ctx.type === 'organization' ? 'Organization' : 'Theme';
    const color = filtered.visuals?.glowColor || '#fff';
    const header = document.getElementById('synapse-filter-header');
    if (header) {
      header.innerHTML = `<span style="color:${color}">${ctxLabel}: ${_escapeHtmlSimple(ctx.name)}</span> — <span class="filter-header-count">${Math.max(0, filtered.activeNodeIds.size - 1)}</span> people`;
      header.classList.add('visible');
    }
  } else {
    _updateHeader(mode, filtered.activeNodeIds.size - 1);
  }

  console.log(`[SynapseFilter] Applied: mode=${filtered.mode}, active=${filtered.activeNodeIds.size}, dim=${filtered.dimNodeIds.size}${ctx.type ? `, context=${ctx.type}:${ctx.name}` : ''}`);

  // Apply edge styling via D3
  _applyFilteredEdges(filtered);
}

// ----------------------------------------------------------------
// Header + count badges
// ----------------------------------------------------------------

function _updateHeader(mode, count) {
  const header = document.getElementById('synapse-filter-header');
  if (!header) return;

  if (mode === FILTER_MODES.ALL || !FILTER_HEADERS[mode]) {
    header.classList.remove('visible');
    header.textContent = '';
    return;
  }

  const label = FILTER_HEADERS[mode];
  const n = typeof count === 'number' ? count : (_filterCounts[mode] || 0);
  const vis = FILTER_VISUALS[mode];
  const color = vis?.glowColor || '#fff';

  header.innerHTML = `<span style="color:${color}">${label}</span> — <span class="filter-header-count">${Math.max(0, n)}</span> people`;
  header.classList.add('visible');
}

function _updateAllChipCounts() {
  Object.keys(_filterCounts).forEach(mode => {
    const badge = document.querySelector(`.synapse-filter-count[data-count="${mode}"]`);
    if (badge) {
      const c = _filterCounts[mode];
      badge.textContent = c > 0 ? c : '';
    }
  });
}

// ----------------------------------------------------------------
// Per-node explanation context
// ----------------------------------------------------------------

function _buildNodeContext(mode, nodes, activeNodeIds) {
  _nodeContext.clear();
  if (mode === FILTER_MODES.ALL) return;

  const store = window.graphDataStore;

  nodes.forEach(n => {
    if (!activeNodeIds.has(n.id) || n.id === _userId) return;

    let reason = '';
    let detail = '';

    switch (mode) {
      case FILTER_MODES.CONNECTED:
        reason = 'Accepted connection';
        break;

      case FILTER_MODES.PROJECTS: {
        // Find shared project names
        const names = _extra._sharedProjectNames?.get(n.id);
        if (names && names.length > 0) {
          reason = 'Shared project';
          detail = names.slice(0, 3).join(', ');
        } else {
          reason = 'Project collaborator';
        }
        break;
      }

      case FILTER_MODES.THEMES: {
        // Find overlapping skills
        const mySkills = _extractNodeSkills(nodes.find(nd => nd.id === _userId));
        const theirSkills = _extractNodeSkills(n);
        const shared = [...theirSkills].filter(s => mySkills.has(s));
        if (shared.length > 0) {
          reason = 'Shared interests';
          detail = shared.slice(0, 4).join(', ');
        } else {
          reason = 'Thematic match';
        }
        break;
      }

      case FILTER_MODES.ORGS: {
        const names = _extra._sharedOrgNames?.get(n.id);
        reason = 'Shared organization';
        if (names && names.length > 0) detail = names.slice(0, 3).join(', ');
        break;
      }

      case FILTER_MODES.OPPS:
        if (_extra.oppRelevantIds?.has(n.id)) {
          reason = 'Linked to opportunity';
        } else {
          reason = 'Opportunity-relevant skills';
        }
        break;

      case FILTER_MODES.EVENTS: {
        const evMeta = _extra._eventMeta?.get(n.id);
        if (evMeta?.signalType === 'qr_confirmed') {
          reason = 'Met at event (QR)';
        } else {
          reason = 'Nearby at event';
        }
        break;
      }
    }

    if (reason) _nodeContext.set(n.id, { reason, detail });
  });
}

function _extractNodeSkills(node) {
  const skills = new Set();
  if (!node) return skills;
  const raw = node._raw || node;
  [raw.skills, raw.interests, raw.themes].forEach(src => {
    if (Array.isArray(src)) {
      src.forEach(s => { if (typeof s === 'string' && s.trim()) skills.add(s.trim().toLowerCase()); });
    } else if (typeof src === 'string' && src.trim()) {
      src.split(',').forEach(s => { if (s.trim()) skills.add(s.trim().toLowerCase()); });
    }
  });
  return skills;
}

/**
 * Get filter context for a node (used by node panel).
 * Returns { reason, detail } or null if no filter active or node not in active set.
 */
export function getNodeFilterContext(nodeId) {
  return _nodeContext.get(nodeId) || null;
}

// ----------------------------------------------------------------
// Edge styling
// ----------------------------------------------------------------

/**
 * Apply filter state to edges only.
 * Node opacity is handled by the NodeRenderer reading window.__synapseFilterState
 * on every tick, so we don't touch nodes here (they'd just get overwritten).
 */
function _applyFilteredEdges(filtered) {
  const d3 = window.d3;
  if (!d3) return;

  const svg = d3.select('#synapse-svg');
  if (svg.empty()) return;

  const isAll = filtered.mode === FILTER_MODES.ALL;
  const edgeColor = filtered.visuals?.edgeColor || 'rgba(0, 224, 255, 0.55)';

  svg.selectAll('.link').each(function (d) {
    if (!d) return;
    const key = _edgeKey(d);
    const el = d3.select(this);

    if (isAll) {
      el.transition().duration(300)
        .style('opacity', null)
        .style('stroke-width', null)
        .attr('stroke', d.type === 'connection' ? 'rgba(0, 224, 255, 0.25)' : 'rgba(255, 255, 255, 0.1)');
    } else if (filtered.activeEdgeKeys.has(key)) {
      el.transition().duration(300)
        .style('opacity', 0.7)
        .style('stroke-width', '1.8px')
        .attr('stroke', edgeColor);
    } else {
      el.transition().duration(300)
        .style('opacity', 0.02)
        .style('stroke-width', '0.3px')
        .attr('stroke', 'rgba(255,255,255,0.05)');
    }
  });
}

function _edgeKey(e) {
  const s = e.source?.id ?? e.source;
  const t = e.target?.id ?? e.target;
  return `${s}-${t}`;
}

// ----------------------------------------------------------------
// Enrichment data loading (async, non-blocking)
// ----------------------------------------------------------------

async function _loadEnrichmentData(userId) {
  const supabase = window.supabase;
  if (!supabase || !userId) return;

  try {
    const [connRes, projMembersRes, myProjRes, myOrgsRes, oppsRes, nearifyRes] = await Promise.all([
      // Accepted connections
      supabase
        .from('connections')
        .select('from_user_id, to_user_id')
        .or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`)
        .eq('status', 'accepted'),
      // All project memberships (for collaborator detection)
      supabase
        .from('project_members')
        .select('user_id, project_id'),
      // Current user's project memberships
      supabase
        .from('project_members')
        .select('project_id')
        .eq('user_id', userId),
      // Current user's org memberships
      supabase
        .from('organization_members')
        .select('organization_id')
        .eq('community_id', userId),
      // Opportunities
      supabase
        .from('opportunities')
        .select('id, organization_id, skills')
        .then(r => r)
        .catch(() => ({ data: null })),
      // Nearify event peers — use positive filter (NOT IN syntax is fragile in Supabase JS v2)
      supabase
        .from('interaction_edges')
        .select('from_user_id, to_user_id, type, status, meta')
        .or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`)
        .in('status', ['suggested', 'confirmed', 'accepted', 'promoted'])
        .then(r => r)
        .catch(() => ({ data: null })),
    ]);

    // Accepted peers
    if (connRes.data) {
      _extra.acceptedPeerIds = new Set(
        connRes.data.map(c => c.from_user_id === userId ? c.to_user_id : c.from_user_id)
      );
    }

    // Project collaborators: people who share at least one project with user
    if (projMembersRes.data && myProjRes.data) {
      const myProjectIds = new Set(myProjRes.data.map(p => p.project_id));
      const collaborators = new Set();
      projMembersRes.data.forEach(pm => {
        if (pm.user_id !== userId && myProjectIds.has(pm.project_id)) {
          collaborators.add(pm.user_id);
        }
      });
      _extra.projectCollaboratorIds = collaborators;

      // Build per-user shared project name map for node context
      const sharedProjectNames = new Map();
      const myProjIdArr = [...myProjectIds];
      if (myProjIdArr.length > 0) {
        const { data: projData } = await supabase
          .from('projects')
          .select('id, title')
          .in('id', myProjIdArr);
        const projNameMap = new Map((projData || []).map(p => [p.id, p.title || 'Untitled']));

        // For each collaborator, find which projects they share
        projMembersRes.data.forEach(pm => {
          if (pm.user_id !== userId && myProjectIds.has(pm.project_id)) {
            const name = projNameMap.get(pm.project_id);
            if (name) {
              if (!sharedProjectNames.has(pm.user_id)) sharedProjectNames.set(pm.user_id, []);
              const arr = sharedProjectNames.get(pm.user_id);
              if (!arr.includes(name)) arr.push(name);
            }
          }
        });
      }
      _extra._sharedProjectNames = sharedProjectNames;
    }

    // Org co-members: all people who share an org with the current user
    if (myOrgsRes.data && myOrgsRes.data.length > 0) {
      const myOrgIds = myOrgsRes.data.map(r => r.organization_id);
      const [coMembersRes, orgNamesRes] = await Promise.all([
        supabase
          .from('organization_members')
          .select('community_id, organization_id')
          .in('organization_id', myOrgIds),
        supabase
          .from('organizations')
          .select('id, name')
          .in('id', myOrgIds),
      ]);

      const orgNameMap = new Map((orgNamesRes.data || []).map(o => [o.id, o.name]));
      const orgMembers = new Set();
      const sharedOrgNames = new Map();

      (coMembersRes.data || []).forEach(om => {
        if (om.community_id === userId) return;
        orgMembers.add(om.community_id);
        const name = orgNameMap.get(om.organization_id);
        if (name) {
          if (!sharedOrgNames.has(om.community_id)) sharedOrgNames.set(om.community_id, []);
          const arr = sharedOrgNames.get(om.community_id);
          if (!arr.includes(name)) arr.push(name);
        }
      });

      _extra.orgMemberIds = orgMembers;
      _extra._sharedOrgNames = sharedOrgNames;
    }

    // Opportunity-relevant IDs and skills
    if (oppsRes.data) {
      const oppSkills = new Set();
      oppsRes.data.forEach(opp => {
        if (Array.isArray(opp.skills)) {
          opp.skills.forEach(s => { if (s) oppSkills.add(String(s).trim().toLowerCase()); });
        }
      });
      _extra.oppSkills = oppSkills;

      // Org IDs posting opportunities
      const orgIds = new Set(oppsRes.data.map(o => o.organization_id).filter(Boolean));
      // Resolve org members
      if (orgIds.size > 0) {
        const { data: orgMembers } = await supabase
          .from('organization_members')
          .select('community_id')
          .in('organization_id', [...orgIds]);
        const relevant = new Set();
        (orgMembers || []).forEach(om => relevant.add(om.community_id));
        _extra.oppRelevantIds = relevant;
      }
    }

    // Nearify event peer IDs
    if (nearifyRes.data) {
      const eventPeers = new Set();
      const eventMeta = new Map();
      nearifyRes.data.forEach(ie => {
        const peerId = ie.from_user_id === userId ? ie.to_user_id : ie.from_user_id;
        eventPeers.add(peerId);
        if (!eventMeta.has(peerId)) {
          eventMeta.set(peerId, {
            signalType: ie.meta?.signal_type || ie.type || 'proximity',
            eventId: ie.meta?.event_id || null,
            status: ie.status,
          });
        }
      });
      _extra.eventPeerIds = eventPeers;
      _extra._eventMeta = eventMeta;
    }

    // Update filter counts for chip badges
    _filterCounts.connected = _extra.acceptedPeerIds?.size || 0;
    _filterCounts.projects = _extra.projectCollaboratorIds?.size || 0;
    _filterCounts.orgs = _extra.orgMemberIds?.size || 0;
    _filterCounts.opps = _extra.oppRelevantIds?.size || 0;
    _filterCounts.events = _extra.eventPeerIds?.size || 0;

    // Themes count requires graph nodes — compute from current graph data
    const store = window.graphDataStore;
    if (store && typeof store.getAllNodes === 'function') {
      const nodes = store.getAllNodes();
      const me = nodes.find(n => n.id === userId);
      const mySkills = _extractNodeSkills(me);
      if (mySkills.size > 0) {
        let themeCount = 0;
        nodes.forEach(n => {
          if (n.id === userId) return;
          const theirs = _extractNodeSkills(n);
          for (const s of theirs) { if (mySkills.has(s)) { themeCount++; break; } }
        });
        _filterCounts.themes = themeCount;
      }
    }

    _updateAllChipCounts();

    // Re-apply filter now that enrichment data is available
    _applyCurrentFilter();
  } catch (err) {
    console.warn('[SynapseFilter] Enrichment data load failed:', err.message);
  }
}

// ----------------------------------------------------------------
// Global exposure for debugging
// ----------------------------------------------------------------

window.SynapseFilter = {
  get: getSynapseFilter,
  set: setSynapseFilter,
  modes: FILTER_MODES,
  getNodeContext: getNodeFilterContext,
};
