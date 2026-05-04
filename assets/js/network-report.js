// ================================================================
// NETWORK REPORT TOOL
// Search for people, organizations, and opportunities.
// Build a curated contact/follow-up list and download it.
// ================================================================

(function () {
  'use strict';

  const CATEGORIES = ['all', 'people', 'organizations', 'opportunities', 'projects'];

  const CATEGORY_META = {
    all:           { label: 'All',           icon: 'fa-th-large',    color: '#00e0ff' },
    people:        { label: 'People',        icon: 'fa-users',       color: '#ffd700' },
    organizations: { label: 'Organizations', icon: 'fa-building',    color: '#ff6b6b' },
    opportunities: { label: 'Opportunities', icon: 'fa-bolt',        color: '#00ff88' },
    projects:      { label: 'Projects',      icon: 'fa-lightbulb',   color: '#aa88ff' },
  };

  // ── State ──────────────────────────────────────────────────────
  const _STORAGE_KEY = 'ie_nr_list_v1';

  let _isOpen        = false;
  let _category      = 'all';
  let _searchQuery   = '';
  let _searchTimer   = null;
  let _results       = [];
  let _reportItems   = []; // curated list
  let _reportCounter = 0;  // unique ids for report items

  // Nearify intelligence: community_id → { signalType, eventName, status }
  let _eventPeerMap    = new Map();
  let _eventPeersReady = false;

  // ── localStorage persistence ────────────────────────────────────
  function _saveList() {
    try {
      localStorage.setItem(_STORAGE_KEY, JSON.stringify({ items: _reportItems, counter: _reportCounter }));
    } catch (_) {}
  }

  function _loadList() {
    try {
      const raw = localStorage.getItem(_STORAGE_KEY);
      if (!raw) return;
      const { items, counter } = JSON.parse(raw);
      if (Array.isArray(items)) {
        _reportItems   = items;
        _reportCounter = Math.max(counter || 0, ...items.map(i => i.uid || 0), 0);
      }
    } catch (_) {}
  }

  // ── DOM helpers ─────────────────────────────────────────────────
  const $  = (sel, ctx) => (ctx || document).querySelector(sel);
  const $$ = (sel, ctx) => Array.from((ctx || document).querySelectorAll(sel));

  // ── Nearify intelligence ─────────────────────────────────────────
  async function _loadEventPeers() {
    if (_eventPeersReady || !window.supabase) return;

    try {
      const { data: { user } } = await window.supabase.auth.getUser();
      if (!user) return;

      const { data: row } = await window.supabase
        .from('community')
        .select('id')
        .eq('user_id', user.id)
        .single();
      if (!row) return;

      const { data: edges } = await window.supabase
        .from('interaction_edges')
        .select('from_user_id, to_user_id, status, meta')
        .or(`from_user_id.eq.${row.id},to_user_id.eq.${row.id}`)
        .not('status', 'in', '("ignored","blocked")');

      (edges || []).forEach(e => {
        const peerId = e.from_user_id === row.id ? e.to_user_id : e.from_user_id;
        if (!_eventPeerMap.has(peerId)) {
          _eventPeerMap.set(peerId, {
            signalType: e.meta?.signal_type || 'proximity',
            eventName:  e.meta?.event_name  || null,
            status:     e.status,
          });
        }
      });

      _eventPeersReady = true;

      // Re-render live results if a search is already showing
      if (_results.length > 0) _renderResults(_results);

    } catch (err) {
      console.warn('[NR] Nearify peer load failed:', err.message);
    }
  }

  // ── Open / close ────────────────────────────────────────────────
  function open() {
    const modal = $('#nr-modal');
    if (!modal) return;
    modal.classList.add('active');
    _isOpen = true;
    document.body.classList.add('ch-modal-open');
    _renderCategoryTabs();
    _renderReportList();
    _renderResults([]);
    const input = $('#nr-search-input');
    if (input) setTimeout(() => input.focus(), 100);
  }

  function close() {
    const modal = $('#nr-modal');
    if (!modal) return;
    modal.classList.remove('active');
    _isOpen = false;
    document.body.classList.remove('ch-modal-open');
  }

  // ── Category tabs ───────────────────────────────────────────────
  function _renderCategoryTabs() {
    const bar = $('#nr-category-bar');
    if (!bar) return;
    bar.innerHTML = CATEGORIES.map(cat => {
      const m = CATEGORY_META[cat];
      const active = cat === _category ? 'active' : '';
      return `
        <button class="nr-cat-btn ${active}" data-cat="${cat}"
          style="${active ? `border-color:${m.color}; color:${m.color};` : ''}">
          <i class="fas ${m.icon}"></i>
          <span>${m.label}</span>
        </button>`;
    }).join('');
    $$('.nr-cat-btn', bar).forEach(btn => {
      btn.addEventListener('click', () => {
        _category = btn.dataset.cat;
        _renderCategoryTabs();
        if (_searchQuery.length >= 2) _doSearch();
        else _renderResults([]);
      });
    });
  }

  // ── Search ───────────────────────────────────────────────────────
  function _onSearchInput(e) {
    _searchQuery = e.target.value;
    clearTimeout(_searchTimer);
    const terms = _parseTerms(_searchQuery);
    if (terms.length === 0) {
      _renderResults([]);
      return;
    }
    _showSearchLoading();
    _searchTimer = setTimeout(_doSearch, 350);
  }

  /** Split input on commas; drop blanks and single-char tokens. */
  function _parseTerms(raw) {
    return raw.split(',')
      .map(t => t.trim())
      .filter(t => t.length >= 2);
  }

  /** Build a Supabase .or() string for multiple terms across multiple columns. */
  function _buildOrFilter(terms, columns) {
    const parts = [];
    terms.forEach(t => {
      const safe = t.replace(/[%_]/g, '\\$&'); // escape wildcards
      columns.forEach(col => parts.push(`${col}.ilike.%${safe}%`));
    });
    return parts.join(',');
  }

  function _showSearchLoading() {
    const list = $('#nr-results-list');
    if (!list) return;
    list.innerHTML = `
      <div class="nr-loading">
        <i class="fas fa-spinner fa-spin"></i>
        <span>Searching…</span>
      </div>`;
  }

  /** Push a mapped person object onto the results array. */
  function _mapPerson(p) {
    return {
      type: 'people',
      id: `person-${p.id}`,
      dbId: p.id,
      name: p.name || 'Unknown',
      meta: p.bio || null,
      email: p.email || null,
      extra: Array.isArray(p.skills) ? p.skills.slice(0, 4).join(', ') : (p.skills || null),
      nearifyMeta: _eventPeerMap.get(p.id) || null,
    };
  }

  /** Normalise any TEXT / TEXT[] column to a plain lowercase string for matching. */
  function _toText(val) {
    if (Array.isArray(val)) return val.join(' ').toLowerCase();
    return (typeof val === 'string' ? val : '').toLowerCase();
  }

  async function _doSearch() {
    if (!window.supabase) { _renderResults([]); return; }
    const terms = _parseTerms(_searchQuery);
    if (terms.length === 0) { _renderResults([]); return; }
    const lowerTerms = terms.map(t => t.toLowerCase());
    const cat = _category;

    /** Returns true if any term appears anywhere in the combined haystack. */
    const hits = (...fields) =>
      lowerTerms.some(t => fields.some(f => _toText(f).includes(t)));

    // Fire all needed fetches in parallel
    const fetches = {};

    if (cat === 'all' || cat === 'people') {
      fetches.people = window.supabase
        .from('community')
        .select('id, name, bio, skills, email')
        .limit(300);
    }
    if (cat === 'all' || cat === 'organizations') {
      fetches.orgs = window.supabase
        .from('organizations')
        .select('*')
        .limit(300);
    }
    if (cat === 'all' || cat === 'opportunities') {
      fetches.opps = window.supabase
        .from('opportunities')
        .select('*')
        .limit(300);
    }
    if (cat === 'all' || cat === 'projects') {
      fetches.projects = window.supabase
        .from('projects')
        .select('*')
        .limit(300);
    }

    const resolved = {};
    await Promise.all(
      Object.entries(fetches).map(async ([key, query]) => {
        const { data, error } = await query;
        if (error) console.warn(`[NR] ${key} fetch error:`, error.message);
        resolved[key] = data || [];
      })
    );

    const results = [];

    // ── People ──────────────────────────────────────────────────────
    (resolved.people || []).forEach(p => {
      if (hits(p.name, p.bio, p.skills)) results.push(_mapPerson(p));
    });

    // ── Organizations ────────────────────────────────────────────────
    (resolved.orgs || []).forEach(o => {
      // Search all string/array values in the row
      const allFields = Object.values(o);
      if (hits(...allFields)) {
        results.push({
          type: 'organizations',
          id: `org-${o.id}`,
          dbId: o.id,
          name: o.name || 'Unknown',
          meta: o.description || o.location || 'No description',
          website: o.website || null,
          status: o.status || null,
        });
      }
    });

    // ── Opportunities ────────────────────────────────────────────────
    (resolved.opps || []).forEach(o => {
      // Search all string/array values in the row
      const allFields = Object.values(o);
      if (hits(...allFields)) {
        results.push({
          type: 'opportunities',
          id: `opp-${o.id}`,
          dbId: o.id,
          name: o.title || o.name || 'Untitled',
          meta: o.description || 'No description',
          oppType: o.type || o.opportunity_type || null,
          status: o.status || null,
        });
      }
    });

    // ── Projects ─────────────────────────────────────────────────────
    (resolved.projects || []).forEach(p => {
      // Search all string/array values in the row
      const allFields = Object.values(p);
      if (hits(...allFields)) {
        results.push({
          type: 'projects',
          id: `proj-${p.id}`,
          dbId: p.id,
          name: p.title || p.name || 'Untitled',
          meta: p.description || 'No description',
          status: p.status || null,
        });
      }
    });

    _results = results;
    _renderResults(results);
  }

  // ── Render results ───────────────────────────────────────────────
  function _renderResults(results) {
    const list = $('#nr-results-list');
    if (!list) return;

    const terms = _parseTerms(_searchQuery);
    if (results.length === 0 && terms.length > 0) {
      list.innerHTML = `<div class="nr-empty"><i class="fas fa-search"></i><span>No results for <em>${terms.map(_escHtml).join(', ')}</em></span></div>`;
      return;
    }
    if (results.length === 0) {
      const HINTS = {
        all:           ['AI', 'startup', 'design', 'mobile', 'climate'],
        people:        ['developer', 'designer', 'founder', 'product'],
        organizations: ['startup', 'nonprofit', 'tech', 'creative'],
        opportunities: ['internship', 'contract', 'grant', 'volunteer'],
        projects:      ['app', 'research', 'hardware', 'SaaS'],
      };
      const chips = (HINTS[_category] || HINTS.all)
        .map(h => `<button class="nr-suggestion-chip" data-term="${_escHtml(h)}">${_escHtml(h)}</button>`)
        .join('');
      list.innerHTML = `
        <div class="nr-empty">
          <i class="fas fa-search"></i>
          <span>Type to search, or use commas for multiple terms</span>
          <div class="nr-suggestions">
            <span class="nr-suggestions-label">Try:</span>
            ${chips}
          </div>
        </div>`;
      list.querySelectorAll('.nr-suggestion-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          const input = $('#nr-search-input');
          if (input) { input.value = chip.dataset.term; input.focus(); }
          _searchQuery = chip.dataset.term;
          _showSearchLoading();
          _doSearch();
        });
      });
      return;
    }

    // Group by type when showing 'all'
    let html = '';
    if (_category === 'all') {
      const grouped = {};
      results.forEach(r => {
        (grouped[r.type] = grouped[r.type] || []).push(r);
      });
      ['people', 'organizations', 'opportunities', 'projects'].forEach(type => {
        if (!grouped[type] || grouped[type].length === 0) return;
        const m = CATEGORY_META[type];
        html += `<div class="nr-group-label"><i class="fas ${m.icon}" style="color:${m.color};margin-right:0.4em;"></i>${m.label}</div>`;
        grouped[type].forEach(item => { html += _resultItemHTML(item); });
      });
    } else {
      results.forEach(item => { html += _resultItemHTML(item); });
    }

    list.innerHTML = html;
    $$('.nr-add-btn', list).forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.rid;
        const item = _results.find(r => r.id === id);
        if (item) _addToReport(item);
      });
    });
  }

  function _resultItemHTML(item) {
    const m = CATEGORY_META[item.type];
    const alreadyAdded = _reportItems.some(r => r.sourceId === item.id);
    const truncMeta = item.meta && item.meta.length > 80
      ? item.meta.slice(0, 80) + '…'
      : (item.meta || '');

    let badge = '';
    if (item.type === 'opportunities' && item.oppType) {
      badge = `<span class="nr-badge" style="background:rgba(0,255,136,0.12);color:#00ff88;border-color:rgba(0,255,136,0.3);">${item.oppType}</span>`;
    }
    if (item.type === 'organizations' && item.status) {
      badge = `<span class="nr-badge" style="background:rgba(255,107,107,0.12);color:#ff6b6b;border-color:rgba(255,107,107,0.3);">${item.status}</span>`;
    }
    if (item.type === 'people' && item.nearifyMeta) {
      const nm = item.nearifyMeta;
      const isQR = nm.signalType === 'qr_confirmed';
      const icon = isQR ? 'fa-qrcode' : 'fa-bluetooth-b';
      const label = isQR ? 'Met at event' : 'Nearby at event';
      const tip = nm.eventName ? _escHtml(nm.eventName) : 'Nearify event';
      badge += `<span class="nr-badge nr-badge-nearify" title="${tip}"><i class="fas ${icon}"></i> ${label}</span>`;
    }

    return `
      <div class="nr-result-item">
        <div class="nr-result-icon" style="color:${m.color};">
          <i class="fas ${m.icon}"></i>
        </div>
        <div class="nr-result-info">
          <div class="nr-result-name">${_escHtml(item.name)}</div>
          <div class="nr-result-meta">${_escHtml(truncMeta)}</div>
          ${badge}
        </div>
        <button class="nr-add-btn${alreadyAdded ? ' added' : ''}" data-rid="${item.id}"
          title="${alreadyAdded ? 'Already in list' : 'Add to report'}"
          ${alreadyAdded ? 'disabled' : ''}>
          <i class="fas ${alreadyAdded ? 'fa-check' : 'fa-plus'}"></i>
        </button>
      </div>`;
  }

  // ── Report list ──────────────────────────────────────────────────
  function _addToReport(item) {
    if (_reportItems.some(r => r.sourceId === item.id)) return;
    _reportItems.push({
      uid: ++_reportCounter,
      sourceId: item.id,
      type: item.type,
      name: item.name,
      meta: item.meta || '',
      email: item.email || null,
      website: item.website || null,
      oppType: item.oppType || null,
      status: item.status || null,
      extra: item.extra || null,
      nearifyMeta: item.nearifyMeta || null,
      addedAt: new Date().toISOString(),
    });
    _saveList();
    _renderReportList();
    // Refresh search results to show the checkmark
    _renderResults(_results);
    _updateCountBadge();
  }

  function _removeFromReport(uid) {
    _reportItems = _reportItems.filter(r => r.uid !== uid);
    _saveList();
    _renderReportList();
    _renderResults(_results);
    _updateCountBadge();
  }

  function _clearReport() {
    if (_reportItems.length === 0) return;
    if (!confirm(`Remove all ${_reportItems.length} item${_reportItems.length === 1 ? '' : 's'} and start over?`)) return;
    _reportItems   = [];
    _reportCounter = 0;
    _saveList();
    _renderReportList();
    _renderResults(_results);
    _updateCountBadge();
  }

  function _renderReportList() {
    const list = $('#nr-report-list');
    const countEl = $('#nr-report-count');
    if (!list) return;

    if (countEl) countEl.textContent = _reportItems.length;

    if (_reportItems.length === 0) {
      list.innerHTML = `
        <div class="nr-report-empty">
          <i class="fas fa-list-ul"></i>
          <span>Build your list</span>
          <ol class="nr-report-steps">
            <li>Search for people, orgs, or opps</li>
            <li>Click <i class="fas fa-plus"></i> to add them</li>
            <li>Download when ready</li>
          </ol>
        </div>`;
      return;
    }

    // Group by type
    const grouped = {};
    _reportItems.forEach(r => { (grouped[r.type] = grouped[r.type] || []).push(r); });

    let html = '';
    ['people', 'organizations', 'opportunities', 'projects'].forEach(type => {
      if (!grouped[type] || grouped[type].length === 0) return;
      const m = CATEGORY_META[type];
      html += `<div class="nr-group-label"><i class="fas ${m.icon}" style="color:${m.color};margin-right:0.4em;"></i>${m.label} <span style="opacity:0.5;">(${grouped[type].length})</span></div>`;
      grouped[type].forEach(item => {
        html += `
          <div class="nr-report-item">
            <div class="nr-report-item-info">
              <div class="nr-result-name">${_escHtml(item.name)}</div>
              ${item.email ? `<div class="nr-result-meta">${_escHtml(item.email)}</div>` : ''}
              ${item.website ? `<div class="nr-result-meta">${_escHtml(item.website)}</div>` : ''}
              ${item.oppType ? `<div class="nr-result-meta">${_escHtml(item.oppType)}</div>` : ''}
            </div>
            <button class="nr-remove-btn" data-uid="${item.uid}" title="Remove">
              <i class="fas fa-times"></i>
            </button>
          </div>`;
      });
    });

    list.innerHTML = html;
    $$('.nr-remove-btn', list).forEach(btn => {
      btn.addEventListener('click', () => _removeFromReport(Number(btn.dataset.uid)));
    });
  }

  function _updateCountBadge() {
    const badge = $('#nr-report-count');
    if (badge) badge.textContent = _reportItems.length;
  }

  // ── Download ─────────────────────────────────────────────────────
  function _download() {
    if (_reportItems.length === 0) {
      alert('Your report list is empty. Add some items first.');
      return;
    }

    const date = new Date().toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric'
    });

    let text = '';
    text += '╔════════════════════════════════════════════════════════════════════════════╗\n';
    text += '║                         NETWORK REPORT                                    ║\n';
    text += '╚════════════════════════════════════════════════════════════════════════════╝\n';
    text += `\nGenerated: ${date}\n`;
    text += `Total Items: ${_reportItems.length}\n`;
    text += '\n';

    const sections = [
      { type: 'people',        label: 'PEOPLE TO CONTACT',         icon: '👥' },
      { type: 'organizations', label: 'ORGANIZATIONS TO FOLLOW UP', icon: '🏢' },
      { type: 'opportunities', label: 'OPPORTUNITIES TO PURSUE',    icon: '⚡' },
      { type: 'projects',      label: 'PROJECTS TO EXPLORE',        icon: '💡' },
    ];

    sections.forEach(({ type, label, icon }) => {
      const items = _reportItems.filter(r => r.type === type);
      if (items.length === 0) return;

      text += `\n${icon}  ${label} (${items.length})\n`;
      text += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';

      items.forEach((item, i) => {
        text += `\n  ${i + 1}. ${item.name}\n`;
        if (item.email)   text += `     Email:   ${item.email}\n`;
        if (item.website) text += `     Website: ${item.website}\n`;
        if (item.oppType) text += `     Type:    ${item.oppType}\n`;
        if (item.status)  text += `     Status:  ${item.status}\n`;
        if (item.extra)   text += `     Skills:  ${item.extra}\n`;
        if (item.nearifyMeta) {
          const nm = item.nearifyMeta;
          const how = nm.signalType === 'qr_confirmed' ? 'QR scan' : 'BLE proximity';
          const where = nm.eventName ? ` at ${nm.eventName}` : ' at a Nearify event';
          text += `     Nearify: Met via ${how}${where}\n`;
        }
        if (item.meta && item.meta !== item.email && item.meta !== item.website) {
          const desc = item.meta.length > 120 ? item.meta.slice(0, 120) + '…' : item.meta;
          text += `     Notes:   ${desc}\n`;
        }
      });
    });

    text += '\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
    text += 'Innovation Engine — Network Report\n';

    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `network-report-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 250);
  }

  // ── Utility ───────────────────────────────────────────────────────
  function _escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Wire up the modal after DOM is ready ──────────────────────────
  function _setup() {
    const modal = $('#nr-modal');
    if (!modal) return;
    _loadList();
    _loadEventPeers(); // pre-fetch so badges are ready by first search

    // Close button
    const closeBtn = $('#nr-close-btn');
    if (closeBtn) closeBtn.addEventListener('click', close);

    // Click outside content to close
    modal.addEventListener('click', e => {
      if (e.target === modal) close();
    });

    // Escape key
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && _isOpen) close();
    });

    // Search input
    const input = $('#nr-search-input');
    if (input) input.addEventListener('input', _onSearchInput);

    // Clear search
    const clearBtn = $('#nr-search-clear');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        const inp = $('#nr-search-input');
        if (inp) { inp.value = ''; inp.focus(); }
        _searchQuery = '';
        _renderResults([]);
      });
    }

    // Clear button
    const clearBtn2 = $('#nr-clear-btn');
    if (clearBtn2) clearBtn2.addEventListener('click', _clearReport);

    // Download button
    const dlBtn = $('#nr-download-btn');
    if (dlBtn) dlBtn.addEventListener('click', _download);
  }

  // ── Init ──────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _setup);
  } else {
    _setup();
  }

  // ── Exports ───────────────────────────────────────────────────────
  window.openNetworkReport  = open;
  window.closeNetworkReport = close;
})();
