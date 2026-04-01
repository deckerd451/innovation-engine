// ================================================================
// SYNAPSE FILTER UI — Wires filter chips to graph rendering
// ================================================================
// Connects the filter bar DOM to synapse-filter.js state and applies
// visual dimming/brightening to the live graph via the node renderer.
// ================================================================

import {
  FILTER_MODES,
  getSynapseFilter,
  setSynapseFilter,
  onFilterChange,
  computeFilteredNodeState,
} from './synapse-filter.js';

let _initialized = false;
let _userId = null;

// Cached enrichment data (populated async, updated on events)
const _extra = {
  acceptedPeerIds: null,
  projectCollaboratorIds: null,
  oppRelevantIds: null,
  oppSkills: null,
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
// Filter application — reads graph data, computes state, applies visuals
// ----------------------------------------------------------------

function _onFilterChanged(mode) {
  _updateChipStates(mode);
  _applyCurrentFilter();
}

function _applyCurrentFilter() {
  const mode = getSynapseFilter();
  const store = window.graphDataStore;
  if (!store || typeof store.getAllNodes !== 'function') return;

  const nodes = store.getAllNodes();
  const edges = store.getAllEdges();
  if (!nodes.length) return;

  const filtered = computeFilteredNodeState(mode, { nodes, edges }, _userId, _extra);

  // Persist filter state globally so the NodeRenderer can read it every tick.
  // This is the canonical contract: renderer checks window.__synapseFilterState
  // on each frame and applies opacity accordingly.
  window.__synapseFilterState = filtered;

  console.log(`[SynapseFilter] Applied: mode=${filtered.mode}, active=${filtered.activeNodeIds.size}, dim=${filtered.dimNodeIds.size}, activeEdges=${filtered.activeEdgeKeys.size}, dimEdges=${filtered.dimEdgeKeys.size}`);

  // Apply edge styling via D3 (edges are not overwritten per-tick by renderLinks merge)
  _applyFilteredEdges(filtered);
}

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

  svg.selectAll('.link').each(function (d) {
    if (!d) return;
    const key = _edgeKey(d);
    const el = d3.select(this);

    if (isAll) {
      el.transition().duration(300)
        .style('opacity', null)
        .style('stroke-width', null);
    } else if (filtered.activeEdgeKeys.has(key)) {
      el.transition().duration(300)
        .style('opacity', 0.6)
        .style('stroke-width', '1.8px');
    } else {
      el.transition().duration(300)
        .style('opacity', 0.03)
        .style('stroke-width', '0.4px');
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
    const [connRes, projMembersRes, myProjRes, oppsRes] = await Promise.all([
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
      // Opportunities
      supabase
        .from('opportunities')
        .select('id, organization_id, skills')
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
};
