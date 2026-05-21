// ================================================================
// SYNAPSE FILTER — Graph Lens System (v1)
// ================================================================
// Single source of truth for Synapse filter mode.
// Pure logic module: computes which nodes/edges are active or dimmed
// for each filter lens. No DOM or rendering concerns.
// ================================================================

const FILTER_MODES = Object.freeze({
  ALL:        'all',
  CONNECTED:  'connected',
  PROJECTS:   'projects',
  THEMES:     'themes',
  ORGS:       'orgs',
  OPPS:       'opps',
  EVENTS:     'events',
});

let _currentMode = FILTER_MODES.ALL;
const _listeners = new Set();

// ----------------------------------------------------------------
// Public API
// ----------------------------------------------------------------

/** Get current filter mode */
export function getSynapseFilter() {
  return _currentMode;
}

/** Set filter mode. Passing the current mode toggles back to ALL. */
export function setSynapseFilter(mode) {
  if (!Object.values(FILTER_MODES).includes(mode)) {
    console.warn('[SynapseFilter] Unknown mode:', mode);
    return;
  }
  const prev = _currentMode;
  _currentMode = (mode === _currentMode) ? FILTER_MODES.ALL : mode;
  if (_currentMode !== prev) {
    _listeners.forEach(fn => { try { fn(_currentMode, prev); } catch (e) { console.error(e); } });
  }
}

/** Subscribe to filter changes. Returns unsubscribe function. */
export function onFilterChange(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

export { FILTER_MODES };

// ----------------------------------------------------------------
// Per-filter visual signature
// Each filter gets a distinct color so the user can immediately
// tell which lens is active from the graph's color palette.
// ----------------------------------------------------------------

const FILTER_VISUALS = Object.freeze({
  [FILTER_MODES.ALL]:       { glowColor: null,      strokeColor: null,      edgeColor: null,                        label: 'All' },
  [FILTER_MODES.CONNECTED]: { glowColor: '#00e0ff', strokeColor: '#00e0ff', edgeColor: 'rgba(0, 224, 255, 0.55)',   label: 'Connected' },
  [FILTER_MODES.PROJECTS]:  { glowColor: '#00ff88', strokeColor: '#00ff88', edgeColor: 'rgba(0, 255, 136, 0.50)',   label: 'Projects' },
  [FILTER_MODES.THEMES]:    { glowColor: '#a855f7', strokeColor: '#a855f7', edgeColor: 'rgba(168, 85, 247, 0.45)',  label: 'Skills' },
  [FILTER_MODES.ORGS]:      { glowColor: '#fb923c', strokeColor: '#fb923c', edgeColor: 'rgba(251, 146, 60, 0.50)',  label: 'Orgs' },
  [FILTER_MODES.OPPS]:      { glowColor: '#ffaa00', strokeColor: '#ffaa00', edgeColor: 'rgba(255, 170, 0, 0.50)',   label: 'Opps' },
  [FILTER_MODES.EVENTS]:    { glowColor: '#f43f5e', strokeColor: '#f43f5e', edgeColor: 'rgba(244, 63, 94, 0.50)',   label: 'Events' },
});

export { FILTER_VISUALS };

// ----------------------------------------------------------------
// Filter computation — returns { activeNodeIds, dimNodeIds,
//   activeEdgeKeys, dimEdgeKeys }
// ----------------------------------------------------------------

function _edgeKey(e) {
  const s = e.source?.id ?? e.source;
  const t = e.target?.id ?? e.target;
  return `${s}-${t}`;
}

function _edgeEndpoints(e) {
  return { s: e.source?.id ?? e.source, t: e.target?.id ?? e.target };
}


/**
 * Compute filtered node/edge state for the given mode.
 *
 * @param {string}   mode        — one of FILTER_MODES
 * @param {Object}   graphData   — { nodes: Node[], edges: Edge[] }
 * @param {string}   currentUserId
 * @param {Object}   [extra]     — optional pre-fetched enrichment data
 * @returns {FilteredState}
 */
export function computeFilteredNodeState(mode, graphData, currentUserId, extra = {}) {
  const { nodes = [], edges = [] } = graphData;
  const allNodeIds = new Set(nodes.map(n => n.id));

  if (mode === FILTER_MODES.ALL) {
    return {
      mode,
      activeNodeIds: allNodeIds,
      dimNodeIds: new Set(),
      activeEdgeKeys: new Set(edges.map(_edgeKey)),
      dimEdgeKeys: new Set(),
      visuals: FILTER_VISUALS[FILTER_MODES.ALL],
    };
  }

  let activeNodeIds;

  switch (mode) {
    case FILTER_MODES.CONNECTED:
      activeNodeIds = _computeConnected(nodes, edges, currentUserId, extra);
      break;
    case FILTER_MODES.PROJECTS:
      activeNodeIds = _computeProjects(nodes, edges, currentUserId, extra);
      break;
    case FILTER_MODES.THEMES:
      activeNodeIds = _computeThemes(nodes, edges, currentUserId, extra);
      break;
    case FILTER_MODES.ORGS:
      activeNodeIds = _computeOrgs(nodes, edges, currentUserId, extra);
      break;
    case FILTER_MODES.OPPS:
      activeNodeIds = _computeOpps(nodes, edges, currentUserId, extra);
      break;
    case FILTER_MODES.EVENTS:
      activeNodeIds = _computeEvents(nodes, edges, currentUserId, extra);
      break;
    default:
      activeNodeIds = allNodeIds;
  }

  // Current user is always active
  activeNodeIds.add(currentUserId);

  const dimNodeIds = new Set();
  allNodeIds.forEach(id => { if (!activeNodeIds.has(id)) dimNodeIds.add(id); });

  // Edges: active if both endpoints are active
  const activeEdgeKeys = new Set();
  const dimEdgeKeys = new Set();
  edges.forEach(e => {
    const { s, t } = _edgeEndpoints(e);
    const key = _edgeKey(e);
    if (activeNodeIds.has(s) && activeNodeIds.has(t)) {
      activeEdgeKeys.add(key);
    } else {
      dimEdgeKeys.add(key);
    }
  });

  return { mode, activeNodeIds, dimNodeIds, activeEdgeKeys, dimEdgeKeys, visuals: FILTER_VISUALS[mode] || FILTER_VISUALS[FILTER_MODES.ALL] };
}

// ----------------------------------------------------------------
// Per-filter computation helpers
// ----------------------------------------------------------------

/** Connected: accepted connections to current user */
function _computeConnected(nodes, edges, userId, extra) {
  const active = new Set();

  // Prefer Supabase-confirmed accepted peer IDs if available
  if (extra.acceptedPeerIds && extra.acceptedPeerIds.size > 0) {
    extra.acceptedPeerIds.forEach(id => active.add(id));
  } else {
    // Fallback: accepted connection edges from graph
    edges.forEach(e => {
      if (e.type !== 'connection' || e.status !== 'accepted') return;
      const { s, t } = _edgeEndpoints(e);
      if (s === userId) active.add(t);
      if (t === userId) active.add(s);
    });
  }
  return active;
}

/** Projects: people who share at least one project with current user */
function _computeProjects(nodes, edges, userId, extra) {
  const active = new Set();

  if (extra.projectCollaboratorIds && extra.projectCollaboratorIds.size > 0) {
    extra.projectCollaboratorIds.forEach(id => active.add(id));
  } else {
    // Fallback: project_membership edges (if they exist in graph)
    edges.forEach(e => {
      if (e.type !== 'project_membership') return;
      const { s, t } = _edgeEndpoints(e);
      if (s === userId) active.add(t);
      if (t === userId) active.add(s);
    });
  }
  return active;
}

/** Themes: people with overlapping skills/interests */
function _computeThemes(nodes, edges, userId, extra) {
  const active = new Set();
  const currentNode = nodes.find(n => n.id === userId);
  const mySkills = _extractSkills(currentNode);

  if (mySkills.size === 0) return active;

  nodes.forEach(n => {
    if (n.id === userId) return;
    const theirSkills = _extractSkills(n);
    // Check overlap
    for (const skill of theirSkills) {
      if (mySkills.has(skill)) {
        active.add(n.id);
        break;
      }
    }
  });

  return active;
}

/** Orgs: people who share at least one organization with current user */
function _computeOrgs(nodes, edges, userId, extra) {
  const active = new Set();

  if (extra.orgMemberIds && extra.orgMemberIds.size > 0) {
    extra.orgMemberIds.forEach(id => active.add(id));
  } else {
    // Fallback: organization-type edges in the graph
    edges.forEach(e => {
      if (e.type !== 'organization') return;
      const { s, t } = _edgeEndpoints(e);
      if (s === userId) active.add(t);
      if (t === userId) active.add(s);
    });
  }
  return active;
}

/** Opps: people/orgs linked to opportunities */
function _computeOpps(nodes, edges, userId, extra) {
  const active = new Set();

  if (extra.oppRelevantIds && extra.oppRelevantIds.size > 0) {
    extra.oppRelevantIds.forEach(id => active.add(id));
  }

  // Also include anyone with opportunity-relevant skills overlap
  if (extra.oppSkills && extra.oppSkills.size > 0) {
    nodes.forEach(n => {
      if (n.id === userId) return;
      const theirSkills = _extractSkills(n);
      for (const skill of theirSkills) {
        if (extra.oppSkills.has(skill)) {
          active.add(n.id);
          break;
        }
      }
    });
  }

  return active;
}

/** Events: people the current user interacted with at a Nearify event */
function _computeEvents(nodes, edges, userId, extra) {
  const active = new Set();

  if (extra.eventPeerIds && extra.eventPeerIds.size > 0) {
    extra.eventPeerIds.forEach(id => active.add(id));
  } else {
    // Fallback: nearify-type edges already loaded in the graph
    edges.forEach(e => {
      if (e.type !== 'nearify') return;
      const { s, t } = _edgeEndpoints(e);
      if (s === userId) active.add(t);
      if (t === userId) active.add(s);
    });
  }
  return active;
}

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

function _extractSkills(node) {
  const skills = new Set();
  if (!node) return skills;
  const raw = node._raw || node;
  const sources = [raw.skills, raw.interests, raw.themes];
  sources.forEach(src => {
    if (Array.isArray(src)) {
      src.forEach(s => { if (typeof s === 'string' && s.trim()) skills.add(s.trim().toLowerCase()); });
    } else if (typeof src === 'string' && src.trim()) {
      src.split(',').forEach(s => { if (s.trim()) skills.add(s.trim().toLowerCase()); });
    }
  });
  return skills;
}
