/**
 * ================================================================
 * INTELLIGENCE DEBUG SHIM
 * ================================================================
 * Provides a console-accessible debug hook for the Daily
 * Intelligence Engine.  NOT wired into any UI.
 *
 * Usage (browser console):
 *   await window.generateDailyBriefDebug()
 *   await window.generateDailyBriefDebug({ debug: true })
 *   await window.generateDailyBriefDebug({ windowDays: 7, maxItems: 3 })
 *
 * Output:
 *   - Section item counts
 *   - Top headlines per section
 *   - Example why payload for first combination_opportunity item
 *   - Full brief object available as window.__lastBrief
 * ================================================================
 */

import { generateDailyBrief, getWhy } from './intelligenceEngine.js';

/**
 * Resolve the current auth user id from existing auth system.
 * Prefers window.__authReady / window.currentAuthUser, then
 * falls back to supabase.auth.getUser().
 */
async function _resolveAuthUserId() {
  // 1. Try the cached auth user (set by auth.js after login)
  if (window.currentAuthUser?.id) {
    return window.currentAuthUser.id;
  }

  // 2. Try bootstrapSession if available
  if (window.bootstrapSession) {
    try {
      const authUser = await window.bootstrapSession.getAuthUser();
      if (authUser?.id) return authUser.id;
    } catch { /* fallthrough */ }
  }

  // 3. Direct supabase call as last resort
  if (window.supabase) {
    try {
      const { data, error } = await window.supabase.auth.getUser();
      if (!error && data?.user?.id) return data.user.id;
    } catch { /* fallthrough */ }
  }

  return null;
}

/**
 * Main debug function — exposed on window.
 *
 * @param {Object} [opts]
 * @param {number}  [opts.windowDays=14] — look-back window
 * @param {number}  [opts.maxItems=5]    — items per section
 * @param {boolean} [opts.debug=false]   — verbose engine logs
 * @returns {Promise<Object>}            — the generated brief
 */
async function generateDailyBriefDebug(opts = {}) {
  console.group('%c[IE Debug] Daily Intelligence Brief', 'color:#6ee7f7;font-weight:bold;font-size:14px');

  try {
    // Resolve auth user
    const userAuthId = await _resolveAuthUserId();
    if (!userAuthId) {
      console.error('[IE Debug] No authenticated user found. Please log in first.');
      console.groupEnd();
      return null;
    }
    console.log('[IE Debug] Auth user id:', userAuthId);

    // Generate brief
    console.log('[IE Debug] Generating brief…');
    const brief = await generateDailyBrief({
      userAuthId,
      windowDays: opts.windowDays ?? 14,
      maxItems:   opts.maxItems   ?? 5,
      debug:      opts.debug      ?? false,
    });

    // ── Section summary ──────────────────────────────────────────
    console.group('%c[IE Debug] Section Counts', 'color:#a3e635;font-weight:bold');
    for (const [section, items] of Object.entries(brief.sections)) {
      console.log(`  ${section.padEnd(30)} ${items.length} item(s)`);
    }
    console.groupEnd();

    // ── Top headlines per section ────────────────────────────────
    console.group('%c[IE Debug] Top Headlines', 'color:#facc15;font-weight:bold');
    for (const [section, items] of Object.entries(brief.sections)) {
      if (items.length === 0) continue;
      console.group(`▶ ${section}`);
      items.slice(0, 3).forEach((item, i) => {
        console.log(`  ${i + 1}. [${(item.confidence * 100).toFixed(0)}% confidence] ${item.headline}`);
        if (item.subhead) console.log(`     └─ ${item.subhead}`);
      });
      console.groupEnd();
    }
    console.groupEnd();

    // ── Example why payload ──────────────────────────────────────
    const combos = brief.sections.combination_opportunities;
    if (combos.length > 0) {
      const firstCombo = combos[0];
      console.group('%c[IE Debug] Example Why Payload (first combo item)', 'color:#f472b6;font-weight:bold');
      console.log('  Item headline:', firstCombo.headline);
      console.log('  why_key:      ', firstCombo.why_key);
      const payload = getWhy(firstCombo.why_key);
      if (payload) {
        console.log('  Factors:');
        (payload.factors || []).forEach(f => console.log('    •', f));
        console.log('  Keywords:',    payload.keywords?.join(', ') || '—');
        console.log('  Paths:',       payload.paths?.join(' | ') || '—');
        console.log('  Signals:',     payload.signals || {});
        console.log('  Scores:',      payload.scores  || {});
      } else {
        console.warn('  Why payload not found (may have been cleared)');
      }
      console.groupEnd();
    }

    // ── Meta ─────────────────────────────────────────────────────
    console.group('%c[IE Debug] Meta', 'color:#94a3b8;font-weight:bold');
    console.log('  generated_at:        ', brief.generated_at);
    console.log('  elapsed_ms:          ', brief.meta.elapsed_ms);
    console.log('  networkAwakeScore:   ', brief.meta.networkAwakeScore?.toFixed(3));
    console.log('  used_sources:        ', brief.meta.used_sources.join(', '));
    console.log('  windowDays:          ', brief.meta.windowDays);
    console.log('  user:                ', brief.user?.name, '/', brief.user?.role);
    console.groupEnd();

    console.log('%c[IE Debug] Full brief available at window.__lastBrief', 'color:#94a3b8');
    window.__lastBrief = brief;

    console.groupEnd();
    return brief;

  } catch (err) {
    console.error('[IE Debug] Error generating brief:', err);
    console.groupEnd();
    throw err;
  }
}

// Expose on window — the only intentional global from this module
window.generateDailyBriefDebug = generateDailyBriefDebug;

// Also expose getWhy for ad-hoc console exploration
window.__getWhy = getWhy;

console.log(
  '%c[IE Debug] Ready. Run: await window.generateDailyBriefDebug()',
  'color:#6ee7f7;font-style:italic'
);
