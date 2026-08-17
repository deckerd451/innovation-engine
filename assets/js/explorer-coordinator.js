// ================================================================
// EXPLORER COORDINATOR — shared Network Explorer selection state
// ================================================================
// Coordinates the sidebar, people-only graph, detail panel, context lenses,
// and graph filters. Domain data and filtering remain owned by their existing
// modules (StateManager, SynapseContext, and SynapseFilter).

const _listeners = new Set();

const _state = {
  activeMode: 'people',
  selectedEntity: { type: null, id: null, label: null },
  focusedPersonId: null,
  contextLens: null,
  graphFilter: 'all',
};

function _snapshot() {
  return {
    ..._state,
    selectedEntity: { ..._state.selectedEntity },
    contextLens: _state.contextLens ? { ..._state.contextLens } : null,
  };
}

function _emit(reason) {
  const state = _snapshot();
  _listeners.forEach(listener => {
    try { listener(state, reason); } catch (error) {
      console.error('[ExplorerCoordinator] listener failed:', error);
    }
  });
  window.dispatchEvent(new CustomEvent('explorer-state-changed', {
    detail: { state, reason },
  }));
}

function _entity(type, id, label) {
  return {
    type: type || null,
    id: id == null ? null : String(id),
    label: label || null,
  };
}

function getState() {
  return _snapshot();
}

function subscribe(listener) {
  if (typeof listener !== 'function') return () => {};
  _listeners.add(listener);
  listener(_snapshot(), 'subscribe');
  return () => _listeners.delete(listener);
}

function setActiveMode(mode) {
  if (!mode || _state.activeMode === mode) return;
  _state.activeMode = mode;
  _emit('active-mode');
}

function selectPerson({ id, label, node = null } = {}, options = {}) {
  if (!id) return;
  const personId = String(id);
  _state.selectedEntity = _entity('person', personId, label || node?.name);
  _state.focusedPersonId = personId;
  _emit('person-selected');

  if (options.focusGraph !== false) {
    window.GraphController?.focusNode?.(personId, { openPanel: false });
  }
  if (options.openPanel !== false && typeof window.openNodePanel === 'function') {
    window.openNodePanel(node || { id: personId, type: 'person', name: label });
  }
}

async function selectContext(type, { id, label } = {}, options = {}) {
  if (!['project', 'theme', 'organization'].includes(type) || !id) return;

  const entity = _entity(type, id, label);
  _state.selectedEntity = entity;
  _emit('context-selected');

  if (type === 'theme') {
    window.SynapseContext?.setTheme?.(label || id, id);
  } else if (type === 'project') {
    await window.SynapseContext?.setProject?.(id, label);
  } else {
    await window.SynapseContext?.setOrg?.(id, label);
  }

  if (options.openPanel !== false && type !== 'theme' && typeof window.openNodePanel === 'function') {
    window.openNodePanel({ id, type, name: label });
  }
}

// Called by SynapseContext for both set and clear operations.
function syncContext(context) {
  const previous = _state.contextLens;
  _state.contextLens = context?.type ? {
    type: context.type,
    id: context.id == null ? null : String(context.id),
    label: context.name || null,
  } : null;

  if (!_state.contextLens && previous &&
      _state.selectedEntity.type === previous.type &&
      String(_state.selectedEntity.id) === String(previous.id)) {
    _state.selectedEntity = _entity(null, null, null);
  }
  _emit(context?.type ? 'context-synced' : 'context-cleared');
}

function syncFocusedPerson(nodeId) {
  _state.focusedPersonId = nodeId == null ? null : String(nodeId);
  if (!nodeId) {
    if (_state.selectedEntity.type === 'person') {
      _state.selectedEntity = _entity(null, null, null);
    }
    _emit('person-focus-cleared');
    return;
  }

  if (_state.selectedEntity.type !== 'person' ||
      String(_state.selectedEntity.id) !== String(nodeId)) {
    _state.selectedEntity = _entity('person', nodeId, null);
  }
  _emit('person-focus-synced');
}

function setGraphFilter(filter) {
  const next = filter || 'all';
  if (_state.graphFilter === next) return;
  _state.graphFilter = next;
  _emit('graph-filter');
}

function clearSelection({ clearContext = false, clearFocus = true } = {}) {
  if (clearContext && window.SynapseContext?.has?.()) {
    // SynapseContext will call syncContext(null), which emits the final state.
    window.SynapseContext.clear();
  }

  _state.selectedEntity = _entity(null, null, null);
  if (clearFocus) _state.focusedPersonId = null;
  _emit('selection-cleared');
}

window.ExplorerCoordinator = {
  getState,
  subscribe,
  setActiveMode,
  selectPerson,
  selectContext,
  syncContext,
  syncFocusedPerson,
  setGraphFilter,
  clearSelection,
};

export {
  getState,
  subscribe,
  setActiveMode,
  selectPerson,
  selectContext,
  syncContext,
  syncFocusedPerson,
  setGraphFilter,
  clearSelection,
};
