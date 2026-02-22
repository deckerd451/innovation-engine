// ============================================================================
// START SEQUENCE — DAILY DIGEST  (v2: Intelligence Engine + Mobile Split)
// ============================================================================
// Wires the Daily Intelligence Engine (generateDailyBrief) into the existing
// sequential digest UI.  Renders the brief ABOVE the network overview section.
// On mobile (≤768 px) activates a split-screen layout:
//   top  = Synapse graph   (#ie-split-synapse)
//   bottom = Intelligence  (#ie-split-intelligence — digest + brief)
// Desktop layout is completely unchanged.
// ============================================================================

console.log('%c📰 START Daily Digest - Loading (v2)', 'color:#0f8; font-weight:bold;');

// ============================================================================
// ENGINE LOADER — dynamic import so this stays a classic (non-module) script
// while still loading the ES-module engine.
// _SCRIPT_BASE is captured synchronously while document.currentScript is valid.
// ============================================================================
const _SCRIPT_BASE = (() => {
  try {
    const src = document.currentScript && document.currentScript.src || '';
    return src.replace(/\/[^/?#]+(\?[^#]*)?(#.*)?$/, '/');
  } catch (_) { return ''; }
})();

let _briefEnginePromise = null;

/**
 * Load (and cache) the intelligence engine ES module.
 * Returns promise resolving to { generateDailyBrief, getWhy }.
 */
async function _loadBriefEngine() {
  if (!_briefEnginePromise) {
    const url = _SCRIPT_BASE + 'intelligence/daily-brief-engine.js';
    _briefEnginePromise = import(url).catch(err => {
      _briefEnginePromise = null;   // allow retry
      throw err;
    });
  }
  return _briefEnginePromise;
}

// ============================================================================
// SAFE TEXT ESCAPE — used whenever user-supplied strings go into innerHTML
// ============================================================================
function _esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ============================================================================
// MOBILE SPLIT — module-level state (one instance per page lifetime)
// ============================================================================

/** Returns true when the viewport is in the mobile split range. */
const isMobileSplit = () => window.matchMedia('(max-width: 768px)').matches;

let _splitBuilt = false;
let _splitOrig  = { synapseParent: null, synapseSibling: null,
                    digestParent: null,  digestSibling: null,
                    leftNav: null, leftNavParent: null, leftNavSibling: null,
                    rightNav: null, rightNavParent: null, rightNavSibling: null };

/** Inject split styles into <head> once — no external CSS file. */
function _injectSplitStyles() {
  if (document.getElementById('ie-mobile-split-styles')) return;
  const s = document.createElement('style');
  s.id = 'ie-mobile-split-styles';
  s.textContent = `
    #ie-mobile-split {
      position: fixed;
      inset: 0;
      display: flex;
      flex-direction: column;
      background: #05070b;
      z-index: 9999;
    }
    #ie-split-synapse {
      position: relative;
      flex: 0 0 45vh;
      min-height: 240px;
      border-bottom: 1px solid rgba(255,255,255,0.08);
      overflow: hidden;
    }
    #ie-split-intelligence {
      flex: 1 1 auto;
      overflow: auto;
      padding: 12px;
      padding-bottom: env(safe-area-inset-bottom);
    }
  `;
  document.head.appendChild(s);
}

/**
 * Build the mobile split layout.
 * Moves #synapse-main-view  → #ie-split-synapse   (top 45 vh).
 * Moves #start-options-container → #ie-split-intelligence (scrollable bottom).
 * Stores original parent + nextSibling for restoration.
 * Never throws — missing synapse is handled gracefully.
 */
function _buildSplit() {
  if (_splitBuilt || document.getElementById('ie-mobile-split')) return;

  const synapse = document.getElementById('synapse-main-view');
  // #start-options-container only exists in the modal flow; the notification-
  // panel path builds the split without it and injects its own content.
  const digest  = document.getElementById('start-options-container');

  _injectSplitStyles();

  const split   = document.createElement('div');
  split.id = 'ie-mobile-split';

  const topPane = document.createElement('div');
  topPane.id = 'ie-split-synapse';

  const botPane = document.createElement('div');
  botPane.id = 'ie-split-intelligence';

  // Only add the synapse top-pane when the graph element actually exists;
  // an empty 45 vh pane would waste most of the screen on pages without it.
  if (synapse) split.appendChild(topPane);
  split.appendChild(botPane);
  document.body.appendChild(split);

  // Move digest container — only when it exists (modal flow).
  if (digest) {
    _splitOrig.digestParent  = digest.parentNode;
    _splitOrig.digestSibling = digest.nextSibling || null;
    botPane.appendChild(digest);
  }

  // Move synapse graph (may not exist on every page)
  if (synapse) {
    _splitOrig.synapseParent  = synapse.parentNode;
    _splitOrig.synapseSibling = synapse.nextSibling || null;
    topPane.appendChild(synapse);

    // Signal synapse to repaint at new dimensions
    window.dispatchEvent(new Event('resize'));
    [window.__synapseResize, window.Synapse && window.Synapse.resize,
     window.CH && window.CH.resizeGraph]
      .forEach(fn => { if (typeof fn === 'function') { try { fn(); } catch (_) {} } });

    // Move HUD nav bars into the top pane so they stay visible above the
    // z-index:9999 split overlay.  #ie-split-synapse is position:relative so
    // the elements' position:absolute anchors to the pane, not the viewport.
    var rightNavEl = document.getElementById('btn-start-nav') &&
                     document.getElementById('btn-start-nav').parentNode;
    var leftNavEl  = document.getElementById('user-profile-combined') &&
                     document.getElementById('user-profile-combined').parentNode;
    if (rightNavEl) {
      _splitOrig.rightNav        = rightNavEl;
      _splitOrig.rightNavParent  = rightNavEl.parentNode;
      _splitOrig.rightNavSibling = rightNavEl.nextSibling || null;
      topPane.appendChild(rightNavEl);
    }
    if (leftNavEl) {
      _splitOrig.leftNav        = leftNavEl;
      _splitOrig.leftNavParent  = leftNavEl.parentNode;
      _splitOrig.leftNavSibling = leftNavEl.nextSibling || null;
      topPane.appendChild(leftNavEl);
    }
  }

  // Hide the (now-empty) modal chrome so it doesn't float over the split
  const modal    = document.getElementById('start-modal');
  const backdrop = document.getElementById('start-modal-backdrop');
  if (modal)    modal.style.display    = 'none';
  if (backdrop) backdrop.style.display = 'none';

  _splitBuilt = true;
}

/**
 * Tear down the split and restore all nodes to their original parents.
 * Safe to call even when split was never built.
 */
function _destroySplit() {
  if (!_splitBuilt) return;

  const split = document.getElementById('ie-mobile-split');
  if (!split) { _splitBuilt = false; return; }

  // Restore digest container
  const digest = document.getElementById('start-options-container');
  if (digest && _splitOrig.digestParent) {
    _splitOrig.digestParent.insertBefore(digest, _splitOrig.digestSibling);
  }

  // Restore synapse
  const synapse = document.getElementById('synapse-main-view');
  if (synapse && _splitOrig.synapseParent) {
    _splitOrig.synapseParent.insertBefore(synapse, _splitOrig.synapseSibling);
    window.dispatchEvent(new Event('resize'));
    [window.__synapseResize, window.Synapse && window.Synapse.resize,
     window.CH && window.CH.resizeGraph]
      .forEach(fn => { if (typeof fn === 'function') { try { fn(); } catch (_) {} } });
  }

  // Restore HUD nav bars — must happen BEFORE split.remove() so elements are
  // still in the DOM when we re-insert them into their original parents.
  if (_splitOrig.rightNav && _splitOrig.rightNavParent) {
    _splitOrig.rightNavParent.insertBefore(_splitOrig.rightNav, _splitOrig.rightNavSibling);
  }
  if (_splitOrig.leftNav && _splitOrig.leftNavParent) {
    _splitOrig.leftNavParent.insertBefore(_splitOrig.leftNav, _splitOrig.leftNavSibling);
  }

  split.remove();

  // Restore modal chrome visibility — _buildSplit() hid these; without
  // restoring them the modal is invisible the next time it is opened.
  const modal    = document.getElementById('start-modal');
  const backdrop = document.getElementById('start-modal-backdrop');
  if (modal)    modal.style.display    = '';
  if (backdrop) backdrop.style.display = '';

  // Remove the injected split stylesheet so it doesn't accumulate or
  // conflict if the split is rebuilt after a resize cycle.
  const splitStyle = document.getElementById('ie-mobile-split-styles');
  if (splitStyle) splitStyle.remove();

  _splitOrig  = { synapseParent: null, synapseSibling: null,
                  digestParent: null,  digestSibling: null,
                  leftNav: null, leftNavParent: null, leftNavSibling: null,
                  rightNav: null, rightNavParent: null, rightNavSibling: null };
  _splitBuilt = false;
}

// Resize listener — enter/leave mobile, never leaks duplicate nodes
;(function _setupResizeHandler() {
  let _prev = isMobileSplit();
  window.addEventListener('resize', function () {
    const curr = isMobileSplit();
    if (curr && !_prev && !_splitBuilt) {
      // Entered mobile while digest is visible
      if (document.getElementById('start-options-container')) _buildSplit();
    } else if (!curr && _prev) {
      // Left mobile — restore
      _destroySplit();
    }
    _prev = curr;
  });
}());

// ============================================================================
// BRIEF DOM RENDERER
// All user-supplied text goes through textContent — never innerHTML injection.
// ============================================================================

/**
 * Lazy-render the Why? explanation into `container` on first click.
 * Fetches getWhy(why_key) from the already-loaded engine module.
 */
async function _renderWhyExpansion(container, why_key) {
  try {
    const { getWhy } = await _loadBriefEngine();
    const payload = getWhy(why_key);

    if (!payload) {
      const msg = document.createElement('div');
      msg.style.cssText = 'color:rgba(255,255,255,0.38);font-size:0.78rem;padding:0.3rem 0;';
      msg.textContent   = 'Explanation not available.';
      container.appendChild(msg);
      return;
    }

    const box = document.createElement('div');
    box.style.cssText = [
      'background:rgba(0,14,32,0.88)',
      'border:1px solid rgba(0,224,255,0.14)',
      'border-radius:6px',
      'padding:0.65rem 0.75rem',
      'margin-top:0.45rem',
      'font-size:0.78rem',
      'line-height:1.48',
    ].join(';');

    // Factors list
    if (payload.factors && payload.factors.length) {
      const fTitle = document.createElement('div');
      fTitle.style.cssText = 'color:#00e0ff;font-weight:600;margin-bottom:0.22rem;';
      fTitle.textContent   = 'Factors:';
      box.appendChild(fTitle);

      const ul = document.createElement('ul');
      ul.style.cssText = 'color:rgba(255,255,255,0.68);margin:0 0 0.4rem 1.1rem;padding:0;';
      payload.factors.forEach(function (f) {
        const li = document.createElement('li');
        li.textContent = f;    // user-generated string — textContent only
        ul.appendChild(li);
      });
      box.appendChild(ul);
    }

    // Keywords
    if (payload.keywords && payload.keywords.length) {
      const kw = document.createElement('div');
      kw.style.cssText = 'color:rgba(255,255,255,0.42);margin-bottom:0.22rem;';
      kw.textContent   = 'Keywords: ' + payload.keywords.join(', ');
      box.appendChild(kw);
    }

    // Graph paths
    if (payload.paths && payload.paths.length) {
      const p = document.createElement('div');
      p.style.cssText = [
        'color:rgba(0,224,255,0.52)',
        'font-family:monospace',
        'font-size:0.72rem',
        'margin-bottom:0.22rem',
        'word-break:break-all',
      ].join(';');
      p.textContent = payload.paths.join(' | ');
      box.appendChild(p);
    }

    // Sub-scores
    if (payload.scores) {
      var entries = Object.entries(payload.scores)
        .filter(function (kv) { return kv[1] !== null && kv[1] !== undefined; })
        .map(function (kv) {
          var v = kv[1];
          return kv[0] + ': ' + (typeof v === 'number' ? (v * 100).toFixed(0) + '%' : v);
        }).join(' · ');
      if (entries) {
        const sc = document.createElement('div');
        sc.style.cssText = 'color:rgba(255,255,255,0.32);font-size:0.72rem;';
        sc.textContent   = entries;
        box.appendChild(sc);
      }
    }

    container.appendChild(box);
  } catch (_err) {
    const msg = document.createElement('div');
    msg.style.cssText = 'color:rgba(255,90,90,0.55);font-size:0.78rem;';
    msg.textContent   = 'Could not load explanation.';
    container.appendChild(msg);
  }
}

/**
 * Build a single ReportItem card.
 * Headline/subhead use textContent; structural chrome uses inline styles only.
 */
function _renderBriefItem(item) {
  const card = document.createElement('div');
  card.style.cssText = [
    'background:rgba(0,0,0,0.32)',
    'border:1px solid rgba(255,255,255,0.07)',
    'border-radius:8px',
    'padding:0.68rem 0.82rem',
    'margin-bottom:0.42rem',
    'transition:border-color 0.15s,background 0.15s',
  ].join(';');

  // Headline (user text — textContent)
  const hl = document.createElement('div');
  hl.style.cssText = 'color:rgba(255,255,255,0.87);font-size:0.87rem;line-height:1.45;';
  hl.textContent   = item.headline;
  card.appendChild(hl);

  // Optional subhead
  if (item.subhead) {
    const sub = document.createElement('div');
    sub.style.cssText = 'color:rgba(255,255,255,0.42);font-size:0.77rem;margin-top:0.18rem;';
    sub.textContent   = item.subhead;
    card.appendChild(sub);
  }

  // Why? toggle — lazy-loads explanation on first click.
  // Clicking anywhere on the card (or the button) toggles the pane.
  if (item.why_key) {
    card.style.cursor = 'pointer';
    card.addEventListener('mouseenter', function () {
      card.style.background    = 'rgba(0,224,255,0.06)';
      card.style.borderColor   = 'rgba(0,224,255,0.25)';
    });
    card.addEventListener('mouseleave', function () {
      card.style.background    = 'rgba(0,0,0,0.32)';
      card.style.borderColor   = 'rgba(255,255,255,0.07)';
    });

    const whyBtn = document.createElement('button');
    whyBtn.style.cssText = [
      'background:none',
      'border:1px solid rgba(0,224,255,0.28)',
      'border-radius:4px',
      'color:rgba(0,224,255,0.68)',
      'font-size:0.72rem',
      'padding:0.17rem 0.44rem',
      'cursor:pointer',
      'margin-top:0.38rem',
      'transition:border-color 0.15s',
    ].join(';');
    whyBtn.textContent = 'Why?';

    const whyPane = document.createElement('div');
    whyPane.style.display = 'none';
    var loaded = false;

    function toggleWhy(e) {
      if (e) e.stopPropagation();
      var open = whyPane.style.display !== 'none';
      if (open) {
        whyPane.style.display = 'none';
        whyBtn.textContent    = 'Why?';
      } else {
        if (!loaded) {
          loaded = true;
          _renderWhyExpansion(whyPane, item.why_key);   // async — fills pane when ready
        }
        whyPane.style.display = 'block';
        whyBtn.textContent    = 'Hide';
      }
    }

    whyBtn.addEventListener('click', toggleWhy);
    card.addEventListener('click', function (e) {
      // Only trigger if the click wasn't on the button itself
      if (e.target !== whyBtn && !whyBtn.contains(e.target)) toggleWhy(e);
    });

    card.appendChild(whyBtn);
    card.appendChild(whyPane);
  }

  return card;
}

/**
 * Build one named section (up to 3 items).
 * Returns null when items array is empty (caller skips appending).
 */
function _renderBriefSection(meta, items) {
  var top3 = items.slice(0, 3);
  if (top3.length === 0) return null;

  const section = document.createElement('div');
  section.style.cssText = 'margin-bottom:0.88rem;';

  const label = document.createElement('div');
  label.style.cssText = [
    'color:rgba(255,255,255,0.48)',
    'font-size:0.71rem',
    'font-weight:600',
    'text-transform:uppercase',
    'letter-spacing:0.06em',
    'margin-bottom:0.38rem',
  ].join(';');
  label.textContent = meta.icon + ' ' + meta.title;
  section.appendChild(label);

  top3.forEach(function (item) {
    section.appendChild(_renderBriefItem(item));
  });

  return section;
}

/**
 * Assemble the complete Daily Brief DOM block from a Brief object.
 * Returns an HTMLElement — safe to appendChild anywhere.
 */
function renderDailyBriefBlock(brief) {
  var SECTIONS = [
    { key: 'signals_moving',            title: 'Signals Moving',            icon: '⚡' },
    { key: 'your_pattern',              title: 'Your Pattern',              icon: '📊' },
    { key: 'combination_opportunities', title: 'Combination Opportunities', icon: '🔀' },
    { key: 'opportunities_for_you',     title: 'For You',                   icon: '🎯' },
    { key: 'blind_spots',               title: 'Blind Spots',               icon: '👁' },
  ];

  const wrapper = document.createElement('div');
  wrapper.className    = 'ie-daily-brief';
  wrapper.style.cssText = [
    'background:rgba(0,8,22,0.70)',
    'border:1px solid rgba(0,224,255,0.17)',
    'border-radius:12px',
    'padding:0.95rem 1.05rem 0.55rem',
    'margin-bottom:1.2rem',
  ].join(';');

  // ── Header ────────────────────────────────────────────────────
  const hdr = document.createElement('div');
  hdr.style.cssText = 'display:flex;align-items:center;gap:0.48rem;margin-bottom:0.82rem;';

  const hdrIcon = document.createElement('span');
  hdrIcon.textContent  = '🧠';
  hdrIcon.style.fontSize = '1.08rem';

  const hdrTitle = document.createElement('span');
  hdrTitle.style.cssText = 'color:#00e0ff;font-size:0.93rem;font-weight:700;';
  hdrTitle.textContent   = 'Daily Intelligence Brief';

  hdr.appendChild(hdrIcon);
  hdr.appendChild(hdrTitle);

  // Network awake score (right-aligned)
  var awake = (brief.meta && brief.meta.networkAwakeScore) || 0;
  if (awake > 0) {
    const awakeEl = document.createElement('span');
    awakeEl.style.cssText = 'color:rgba(0,255,136,0.65);font-size:0.71rem;margin-left:auto;';
    awakeEl.textContent   = Math.round(awake * 100) + '% network active';
    hdr.appendChild(awakeEl);
  }

  wrapper.appendChild(hdr);

  // ── Sections ──────────────────────────────────────────────────
  var rendered = 0;
  SECTIONS.forEach(function (meta) {
    var items = (brief.sections && brief.sections[meta.key]) || [];
    var sec   = _renderBriefSection(meta, items);
    if (sec) { wrapper.appendChild(sec); rendered++; }
  });

  // Empty-state fallback
  if (rendered === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'color:rgba(255,255,255,0.38);font-size:0.84rem;padding:0.22rem 0;';
    empty.textContent   = 'No signals detected yet — check back as the network grows.';
    wrapper.appendChild(empty);
  }

  return wrapper;
}

// ============================================================================
// MAIN CLASS
// ============================================================================

class StartDailyDigest {
  constructor() {
    this.userData    = null;
    this.currentStep = 0;
    this.steps       = [];
    this.container   = null;
  }

  // ──────────────────────────────────────────────────────────────
  // render() — entry point called by start-ui-enhanced.js
  // Returns HTML string; schedules async post-render work.
  // ──────────────────────────────────────────────────────────────
  async render(data) {
    this.userData = data;
    this.steps    = await this.buildSteps(data);
    this.currentStep = 0;

    // setTimeout(0) ensures _postRender runs AFTER the caller sets
    // container.innerHTML — so the DOM is ready when we access it.
    setTimeout(() => { this._postRender(); }, 0);

    return `
      <div class="sequential-digest-container">
        ${this.renderProgressBar()}
        <div id="step-content" class="step-content">
          ${await this.renderCurrentStep()}
        </div>
        ${this.renderNavigation()}
      </div>
    `;
  }

  /**
   * Runs after HTML is in DOM.
   * 1. Build mobile split if on a narrow viewport.
   * 2. Generate + inject the Daily Intelligence Brief.
   */
  async _postRender() {
    try {
      if (isMobileSplit() && !_splitBuilt) _buildSplit();
      await this._generateAndRenderBrief();
    } catch (_err) {
      // _generateAndRenderBrief has its own error handling; this is a belt-
      // and-suspenders catch so _postRender itself never propagates.
    }
  }

  /**
   * Resolve auth → call generateDailyBrief → inject block into #ie-brief-root.
   * Every error path renders a graceful non-fatal message.
   */
  async _generateAndRenderBrief(rootOverride) {
    const root = rootOverride || document.getElementById('ie-brief-root');
    if (!root) return;

    // Loading indicator
    root.textContent = '';
    const loading = document.createElement('div');
    loading.style.cssText = 'color:rgba(255,255,255,0.32);font-size:0.81rem;padding:0.35rem 0;';
    loading.textContent   = '⚡ Generating Daily Intelligence Brief…';
    root.appendChild(loading);

    try {
      const { generateDailyBrief } = await _loadBriefEngine();

      // Get auth user — prefer event detail, fall back to supabase.auth.getUser()
      var uid = null;
      if (window.supabase) {
        try {
          var authRes = await window.supabase.auth.getUser();
          uid = authRes && authRes.data && authRes.data.user && authRes.data.user.id || null;
        } catch (_) { /* supabase not ready */ }
      }

      if (!uid) {
        root.textContent = '';
        const msg = document.createElement('div');
        msg.style.cssText = 'color:rgba(255,255,255,0.38);font-size:0.84rem;padding:0.28rem 0;';
        msg.textContent   = 'Log in to unlock your Daily Brief.';
        root.appendChild(msg);
        return;
      }

      var brief;
      try {
        brief = await generateDailyBrief({ userAuthId: uid, debug: false });
      } catch (engineErr) {
        root.textContent = '';
        const el = document.createElement('div');
        el.style.cssText = 'color:rgba(255,255,255,0.38);font-size:0.84rem;padding:0.28rem 0;';
        var msg = engineErr && engineErr.message || '';
        if (msg.indexOf('community profile') !== -1 || msg.indexOf('No community') !== -1) {
          el.textContent = 'Complete your profile to unlock your Daily Brief.';
        } else {
          el.textContent = '⚠ Daily Brief unavailable — the rest of your digest is ready.';
          console.warn('[DailyBrief] Engine error:', msg);
        }
        root.appendChild(el);
        return;
      }

      root.textContent = '';
      root.appendChild(renderDailyBriefBlock(brief));

    } catch (err) {
      console.warn('[DailyBrief] Unexpected error:', err);
      root.textContent = '';
      const el = document.createElement('div');
      el.style.cssText = 'color:rgba(255,107,107,0.5);font-size:0.79rem;padding:0.18rem 0;';
      el.textContent   = '⚠ Daily Brief unavailable. The rest of your digest is ready.';
      root.appendChild(el);
    }
  }

  // ──────────────────────────────────────────────────────────────
  // Step builder  (Overview → Completion)
  // ──────────────────────────────────────────────────────────────
  async buildSteps(data) {
    return [
      {
        id: 'overview',
        title: 'Overview',
        icon: '👋',
        render: () => this.renderOverviewStep(data),
      },
      {
        id: 'completion',
        title: 'Complete',
        icon: '🎉',
        render: () => this.renderCompletionStep(),
      },
    ];
  }

  // ──────────────────────────────────────────────────────────────
  // Progress bar
  // ──────────────────────────────────────────────────────────────
  renderProgressBar() {
    const progress = ((this.currentStep + 1) / this.steps.length) * 100;
    return `
      <div style="margin-bottom:2rem;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;">
          <div style="color:rgba(255,255,255,0.6);font-size:0.9rem;">
            Step ${this.currentStep + 1} of ${this.steps.length}
          </div>
          <div style="color:#00e0ff;font-size:0.9rem;font-weight:600;">
            ${Math.round(progress)}% Complete
          </div>
        </div>
        <div style="width:100%;height:8px;background:rgba(255,255,255,0.1);border-radius:4px;overflow:hidden;">
          <div style="width:${progress}%;height:100%;
            background:linear-gradient(90deg,#00e0ff,#00ff88);
            transition:width 0.5s ease;border-radius:4px;"></div>
        </div>
      </div>
    `;
  }

  async renderCurrentStep() {
    if (this.currentStep >= this.steps.length) return this.renderCompletionStep();
    return await this.steps[this.currentStep].render();
  }

  // ──────────────────────────────────────────────────────────────
  // STEP 1 — Overview
  // #ie-brief-root sits at the very top of the content area so the
  // Daily Brief renders ABOVE the network stats / suggestions.
  // Existing suggestion-fetching logic is not altered here.
  // ──────────────────────────────────────────────────────────────
  async renderOverviewStep(data) {
    const profile        = data.profile        || {};
    const momentum       = data.momentum       || {};
    const streak         = momentum.streak     || {};
    const immediate      = data.immediate_actions || {};
    const unreadMessages = (immediate.unread_messages && immediate.unread_messages.count) || 0;

    const hour     = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

    let counts = { connections: 0, themes: 0, projects: 0, opportunities: 0 };
    try { counts = await this.fetchActualCounts(); }
    catch (err) { console.warn('Failed to fetch counts:', err); }

    return `
      <div style="padding:2rem;">

        <!-- ══ DAILY INTELLIGENCE BRIEF placeholder ══════════════════
             Filled asynchronously by _generateAndRenderBrief() after
             this HTML is injected into the DOM.  Sits above all other
             content so the brief renders ABOVE the suggestions block. -->
        <div id="ie-brief-root" style="margin-bottom:0.25rem;min-height:0;"></div>

        <!-- Greeting -->
        <div style="text-align:center;margin-bottom:2rem;">
          <div style="font-size:3.5rem;margin-bottom:0.75rem;animation:fadeInScale 0.6s ease;">
            ${this.getGreetingEmoji()}
          </div>
          <h2 style="color:#00e0ff;margin:0 0 1rem 0;font-size:1.8rem;animation:fadeIn 0.8s ease;">
            ${greeting}, ${_esc(profile.name || 'there')}!
          </h2>
          ${streak.current > 0 ? `
            <div style="display:inline-flex;align-items:center;gap:0.5rem;
              background:linear-gradient(135deg,rgba(255,100,0,0.2),rgba(255,150,0,0.1));
              border:2px solid rgba(255,100,0,0.4);border-radius:12px;
              padding:0.75rem 1.5rem;animation:fadeIn 1s ease;">
              <span style="font-size:1.5rem;">🔥</span>
              <span style="color:#fff;font-weight:700;font-size:1.2rem;">${streak.current}-day streak!</span>
            </div>
          ` : ''}
        </div>

        <!-- Network at a Glance -->
        <div style="margin-bottom:2rem;">
          <h3 style="color:#00e0ff;margin:0 0 1rem 0;font-size:1.3rem;text-align:center;">
            Your Network at a Glance
          </h3>
          <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:1rem;margin-bottom:1rem;">
            ${this.renderStatCard('Connections',   counts.connections,   'users',    '#00e0ff', 'viewConnections')}
            ${this.renderStatCard('Projects',      counts.projects,      'rocket',   '#a855f7', 'viewProjects')}
            ${this.renderStatCard('Themes',        counts.themes,        'bullseye', '#ffaa00', 'viewThemes')}
            ${this.renderStatCard('Opportunities', counts.opportunities, 'briefcase','#00ff88', 'viewOpportunities')}
          </div>
          <div style="text-align:center;margin-top:1.5rem;">
            <a href="/innovation-engine/explore.html" style="
              display:inline-block;
              background:linear-gradient(135deg,#00e0ff,#00ff88);
              border:none;border-radius:12px;color:#000;
              padding:1rem 2rem;font-weight:700;font-size:1rem;
              cursor:pointer;text-decoration:none;transition:all 0.3s;
              box-shadow:0 4px 15px rgba(0,224,255,0.4);
              width:100%;max-width:400px;"
              onmouseenter="this.style.transform='translateY(-2px)';this.style.boxShadow='0 6px 20px rgba(0,224,255,0.6)';"
              onmouseleave="this.style.transform='translateY(0)';this.style.boxShadow='0 4px 15px rgba(0,224,255,0.4)';">
              <i class="fas fa-compass" style="margin-right:0.5rem;"></i>
              Explore Opportunities
            </a>
          </div>
        </div>

        <!-- Unread Messages -->
        ${unreadMessages > 0 ? `
          <div style="
            background:linear-gradient(135deg,rgba(255,170,0,0.2),rgba(255,136,0,0.1));
            border:2px solid rgba(255,170,0,0.4);border-radius:12px;
            padding:1.25rem;margin-bottom:1rem;
            display:flex;align-items:center;justify-content:space-between;
            cursor:pointer;transition:all 0.3s;"
            onclick="window.StartDailyDigest.openMessaging()"
            onmouseenter="this.style.background='linear-gradient(135deg,rgba(255,170,0,0.3),rgba(255,136,0,0.2))';this.style.transform='translateY(-2px)';"
            onmouseleave="this.style.background='linear-gradient(135deg,rgba(255,170,0,0.2),rgba(255,136,0,0.1))';this.style.transform='translateY(0)';">
            <div style="display:flex;align-items:center;gap:1rem;">
              <div style="font-size:2rem;">💬</div>
              <div>
                <div style="color:#ffaa00;font-weight:700;font-size:1.1rem;">
                  Unread Messages: ${unreadMessages}
                </div>
                <div style="color:rgba(255,255,255,0.7);font-size:0.9rem;">Click to view</div>
              </div>
            </div>
            <i class="fas fa-chevron-right" style="color:#ffaa00;font-size:1.2rem;"></i>
          </div>
        ` : ''}
      </div>
    `;
  }

  // ──────────────────────────────────────────────────────────────
  // STEP 2 — Completion
  // ──────────────────────────────────────────────────────────────
  renderCompletionStep() {
    return `
      <div style="padding:3rem 2rem;text-align:center;">
        <div style="font-size:4rem;margin-bottom:1rem;animation:bounceIn 0.8s ease;">🎉</div>
        <h3 style="color:#00ff88;margin:0 0 0.5rem 0;font-size:1.8rem;">You're All Caught Up!</h3>
        <p style="color:rgba(255,255,255,0.7);margin:0 0 2rem 0;font-size:1.05rem;line-height:1.6;">
          This digest summarises your network activity, intelligence signals, and growth opportunities.
        </p>
        <div style="background:linear-gradient(135deg,rgba(0,224,255,0.1),rgba(0,255,136,0.1));
          border:2px solid rgba(0,224,255,0.3);border-radius:16px;padding:1.5rem;margin-bottom:2rem;">
          <p style="color:rgba(255,255,255,0.8);margin:0 0 0.5rem 0;font-size:0.95rem;font-weight:600;">
            Download Report
          </p>
          <p style="color:rgba(255,255,255,0.6);margin:0;font-size:0.9rem;line-height:1.5;">
            Get a PDF summary of your network insights and engagement metrics
          </p>
        </div>
        <div style="display:flex;gap:1rem;justify-content:center;flex-wrap:wrap;">
          <button onclick="window.StartDailyDigest.previousStep()" style="
            background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.3);
            border-radius:12px;color:rgba(255,255,255,0.8);padding:1rem 2rem;
            font-weight:600;font-size:1rem;cursor:pointer;transition:all 0.3s;"
            onmouseenter="this.style.background='rgba(255,255,255,0.15)';"
            onmouseleave="this.style.background='rgba(255,255,255,0.1)';">
            ← Back
          </button>
          <button onclick="window.StartDailyDigest.closeAndExplore()" style="
            background:linear-gradient(135deg,#00e0ff,#00ff88);border:none;
            border-radius:12px;color:#000;padding:1rem 2rem;
            font-weight:700;font-size:1rem;cursor:pointer;transition:all 0.3s;
            box-shadow:0 4px 15px rgba(0,224,255,0.4);"
            onmouseenter="this.style.transform='translateY(-2px)';this.style.boxShadow='0 6px 20px rgba(0,224,255,0.6)';"
            onmouseleave="this.style.transform='translateY(0)';this.style.boxShadow='0 4px 15px rgba(0,224,255,0.4)';">
            Let's Go! →
          </button>
          <button onclick="window.StartDailyDigest.downloadReport()" style="
            background:rgba(255,170,0,0.2);border:2px solid rgba(255,170,0,0.4);
            border-radius:12px;color:#ffaa00;padding:1rem 2rem;
            font-weight:600;font-size:1rem;cursor:pointer;transition:all 0.3s;"
            onmouseenter="this.style.background='rgba(255,170,0,0.3)';"
            onmouseleave="this.style.background='rgba(255,170,0,0.2)';">
            <i class="fas fa-download" style="margin-right:0.5rem;"></i>
            Download Report
          </button>
        </div>
      </div>
    `;
  }

  // ──────────────────────────────────────────────────────────────
  // Navigation bar
  // ──────────────────────────────────────────────────────────────
  renderNavigation() {
    const isFirst = this.currentStep === 0;
    const isLast  = this.currentStep >= this.steps.length - 1;
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;
        margin-top:2rem;padding-top:1.5rem;border-top:1px solid rgba(255,255,255,0.1);">
        <button id="prev-step-btn" onclick="window.StartDailyDigest.previousStep()" style="
          background:${isFirst ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.1)'};
          border:1px solid rgba(255,255,255,0.2);border-radius:8px;
          color:${isFirst ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.8)'};
          padding:0.75rem 1.5rem;font-weight:600;
          cursor:${isFirst ? 'not-allowed' : 'pointer'};
          transition:all 0.2s;display:flex;align-items:center;gap:0.5rem;"
          ${isFirst ? 'disabled' : ''}>
          ← Back
        </button>
        <div style="display:flex;gap:0.5rem;">
          ${this.steps.map((_, i) => `
            <div style="width:8px;height:8px;border-radius:50%;
              background:${i === this.currentStep ? '#00e0ff' : 'rgba(255,255,255,0.2)'};
              transition:all 0.3s;"></div>
          `).join('')}
        </div>
        <button id="next-step-btn" onclick="window.StartDailyDigest.nextStep()" style="
          background:linear-gradient(135deg,#00e0ff,#00ff88);border:none;
          border-radius:8px;color:#000;padding:0.75rem 1.5rem;
          font-weight:700;cursor:pointer;transition:all 0.2s;
          display:flex;align-items:center;gap:0.5rem;">
          ${isLast ? 'Finish' : 'Next'} →
        </button>
      </div>
    `;
  }

  // ──────────────────────────────────────────────────────────────
  // Navigation methods
  // ──────────────────────────────────────────────────────────────
  async nextStep() {
    this.currentStep++;
    await this.updateStepContent();
  }

  async previousStep() {
    if (this.currentStep > 0) {
      this.currentStep--;
      await this.updateStepContent();
    }
  }

  async updateStepContent() {
    const container = document.querySelector('.sequential-digest-container');
    if (!container) return;

    const progressBar = container.firstElementChild;
    const stepContent = document.getElementById('step-content');
    const navigation  = container.lastElementChild;

    // Guard: stepContent can be null if the DOM was replaced between steps
    if (!stepContent) return;

    stepContent.style.opacity   = '0';
    stepContent.style.transform = 'translateY(20px)';

    setTimeout(async () => {
      progressBar.outerHTML = this.renderProgressBar();
      stepContent.innerHTML = await this.renderCurrentStep();
      navigation.outerHTML  = this.renderNavigation();

      setTimeout(() => {
        stepContent.style.opacity   = '1';
        stepContent.style.transform = 'translateY(0)';
      }, 50);

      // Re-run brief injection when the user navigates back to Overview
      const step = this.steps[this.currentStep];
      if (step && step.id === 'overview') {
        await this._generateAndRenderBrief();
      }
    }, 300);
  }

  // ──────────────────────────────────────────────────────────────
  // Utilities
  // ──────────────────────────────────────────────────────────────
  getGreetingEmoji() {
    const h = new Date().getHours();
    return h < 12 ? '🌅' : h < 18 ? '☀️' : '🌙';
  }

  renderStatCard(label, value, icon, color, handler) {
    const clickAttr = handler
      ? `onclick="window.StartDailyDigest.${handler}()" style="cursor:pointer;"`
      : '';
    const hoverAttr = handler ? `
      onmouseenter="this.style.transform='translateY(-2px)';this.style.borderColor='${color}';"
      onmouseleave="this.style.transform='translateY(0)';this.style.borderColor='${color}40';"
    ` : '';
    return `
      <div ${clickAttr} ${hoverAttr} style="
        background:rgba(0,0,0,0.3);border:2px solid ${color}40;
        border-radius:12px;padding:1.5rem;text-align:center;transition:all 0.2s;">
        <i class="fas fa-${icon}" style="color:${color};font-size:2rem;margin-bottom:0.75rem;display:block;"></i>
        <div style="color:#fff;font-size:2rem;font-weight:700;margin-bottom:0.5rem;">${value}</div>
        <div style="color:rgba(255,255,255,0.7);font-size:0.95rem;">${label}</div>
      </div>
    `;
  }

  async fetchActualCounts() {
    if (!window.supabase) return { connections: 0, themes: 0, projects: 0, opportunities: 0 };

    const { data: { user } } = await window.supabase.auth.getUser();
    if (!user) return { connections: 0, themes: 0, projects: 0, opportunities: 0 };

    const { data: profile } = await window.supabase
      .from('community').select('id').eq('user_id', user.id).single();
    if (!profile) return { connections: 0, themes: 0, projects: 0, opportunities: 0 };

    const id = profile.id;
    const [c, t, p, o] = await Promise.all([
      window.supabase.from('connections')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'accepted')
        .or(`from_user_id.eq.${id},to_user_id.eq.${id}`),
      window.supabase.from('theme_participants')
        .select('theme_id', { count: 'exact', head: true })
        .eq('community_id', id),
      window.supabase.from('project_members')
        .select('project_id', { count: 'exact', head: true })
        .eq('user_id', id),
      window.supabase.from('projects')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'open'),
    ]);

    return {
      connections:   c.count || 0,
      themes:        t.count || 0,
      projects:      p.count || 0,
      opportunities: o.count || 0,
    };
  }

  // ──────────────────────────────────────────────────────────────
  // Action handlers (called from inline onclick in rendered HTML)
  // ──────────────────────────────────────────────────────────────
  openMessaging() {
    if (window.EnhancedStartUI) window.EnhancedStartUI.close();
    setTimeout(() => {
      if (window.EnhancedStartUI) {
        window.EnhancedStartUI.handleAction('openMessaging',
          { preventDefault: function () {}, stopPropagation: function () {} });
      }
    }, 300);
  }

  viewConnections() {
    if (window.EnhancedStartUI) window.EnhancedStartUI.close();
    setTimeout(() => { if (window.filterByNodeType) window.filterByNodeType('person'); }, 300);
  }

  viewThemes() {
    if (window.EnhancedStartUI) window.EnhancedStartUI.close();
    setTimeout(() => {
      if (window.showView) window.showView('synapse');
      setTimeout(() => {
        if (window.filterSynapseByCategory) window.filterSynapseByCategory('themes');
      }, 500);
    }, 300);
  }

  viewProjects() {
    if (window.EnhancedStartUI) window.EnhancedStartUI.close();
    setTimeout(() => { if (window.filterByNodeType) window.filterByNodeType('project'); }, 300);
  }

  viewOpportunities() {
    if (window.EnhancedStartUI) window.EnhancedStartUI.close();
    setTimeout(() => {
      if (window.showView) window.showView('opportunities');
      else if (window.filterByNodeType) window.filterByNodeType('project');
    }, 300);
  }

  /** Close the digest, tearing down any mobile split first. */
  closeAndExplore() {
    _destroySplit();
    if (window.EnhancedStartUI) window.EnhancedStartUI.close();
  }

  downloadReport() {
    this.showToast('Report download feature coming soon!', 'info');
  }

  showToast(message, type) {
    type = type || 'info';
    const colors = { info: '#00e0ff', success: '#00ff88', warning: '#ffaa00', error: '#ff6b6b' };
    const color  = colors[type] || colors.info;
    const toast  = document.createElement('div');
    toast.style.cssText = `
      position:fixed;bottom:2rem;right:2rem;
      background:${color};
      color:${(type === 'info' || type === 'warning') ? '#000' : '#fff'};
      padding:1rem 1.5rem;border-radius:12px;font-weight:600;
      z-index:100001;box-shadow:0 8px 25px rgba(0,0,0,0.5);
      animation:slideIn 0.3s ease;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(function () {
      toast.style.animation = 'slideOut 0.3s ease';
      setTimeout(function () { if (toast.parentNode) toast.remove(); }, 300);
    }, 3000);
  }
}

// ============================================================================
// GLOBAL INSTANCE
// ============================================================================

window.StartDailyDigest = new StartDailyDigest();

// Public helper — render the brief into any caller-supplied element.
// Used by the notification panel so the brief appears inline without
// needing to open the full START modal.
window.StartDailyDigest.generateBriefInto = function (el) {
  return window.StartDailyDigest._generateAndRenderBrief(el);
};

// Expose mobile-split helpers so unified-notification-system.js can build
// the full-screen split from the bell-button path on mobile.
window.StartDailyDigest._buildSplit   = _buildSplit;
window.StartDailyDigest._destroySplit = _destroySplit;
window.StartDailyDigest.isMobileSplit = isMobileSplit;

// Wrap window.closeStartModal (set by the inline <script> in index.html at
// ~line 2107) so the mobile split is torn down whenever the modal closes.
// We defer until load so the original definition is guaranteed to exist.
window.addEventListener('load', function () {
  var _origClose = window.closeStartModal;
  window.closeStartModal = function () {
    _destroySplit();
    if (typeof _origClose === 'function') _origClose.call(this);
  };
}, { once: true });

// ============================================================================
// CSS ANIMATIONS (injected once, idempotent)
// ============================================================================
if (!document.getElementById('start-daily-digest-styles')) {
  const styleEl = document.createElement('style');
  styleEl.id = 'start-daily-digest-styles';
  styleEl.textContent = `
    .step-content {
      transition: opacity 0.3s ease, transform 0.3s ease;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes fadeInScale {
      from { opacity: 0; transform: scale(0.8); }
      to   { opacity: 1; transform: scale(1); }
    }
    @keyframes bounceIn {
      0%   { opacity: 0; transform: scale(0.3); }
      50%  { transform: scale(1.05); }
      70%  { transform: scale(0.9); }
      100% { opacity: 1; transform: scale(1); }
    }
    @keyframes slideIn {
      from { transform: translateX(400px); opacity: 0; }
      to   { transform: translateX(0);     opacity: 1; }
    }
    @keyframes slideOut {
      from { transform: translateX(0);     opacity: 1; }
      to   { transform: translateX(400px); opacity: 0; }
    }
    @keyframes zoomIn {
      from { opacity: 0; transform: scale(0.5); }
      to   { opacity: 1; transform: scale(1); }
    }
    @keyframes fadeOut {
      from { opacity: 1; }
      to   { opacity: 0; }
    }
  `;
  document.head.appendChild(styleEl);
}

// ============================================================================
// DEBUG HOOKS (window-exposed, no secrets emitted)
// ============================================================================

/** Manually trigger brief generation and log the raw result. */
window.__debugGenerateDailyBrief = async function () {
  try {
    const { generateDailyBrief } = await _loadBriefEngine();
    const authRes = await window.supabase.auth.getUser();
    const uid     = authRes && authRes.data && authRes.data.user && authRes.data.user.id;
    const brief   = await generateDailyBrief({ userAuthId: uid, debug: true });
    console.log('[DailyBrief Debug]', brief);
    return brief;
  } catch (err) {
    console.error('[DailyBrief Debug] Error:', err);
  }
};

/** Inspect mobile split state. */
window.__debugMobileSplit = function () {
  return {
    isMobile:   isMobileSplit(),
    hasSplit:   !!document.getElementById('ie-mobile-split'),
    splitBuilt: _splitBuilt,
  };
};

console.log('✅ START Daily Digest ready (v2: Intelligence Engine + Mobile Split)');
