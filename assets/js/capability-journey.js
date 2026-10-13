// Privacy-safe instrumentation for the goal -> capability -> outcome loop.
// Deliberately records no goals, names, notes, costs, or member content.
(function () {
  'use strict';
  if (window.CapabilityJourney) return;

  const ALLOWED = new Set([
    'goal_entered',
    'capability_viewed',
    'capability_selected',
    'tasks_imported',
    'outcome_recorded',
  ]);

  function emit(name, metadata = {}) {
    if (!ALLOWED.has(name)) return false;
    const detail = { name, ...metadata, recordedAt: Date.now() };
    // The DOM event is useful for existing telemetry and deterministic tests.
    window.dispatchEvent(new CustomEvent('innovation-engine:capability-journey', { detail }));
    // Existing telemetry integrations can opt in without receiving sensitive data.
    if (typeof window.trackEvent === 'function') {
      try { window.trackEvent(`capability_${name}`, detail); } catch (_) { /* telemetry must not block work */ }
    }
    return true;
  }

  window.CapabilityJourney = Object.freeze({ emit, allowed: ALLOWED });
})();
