/**
 * ================================================================
 * COMMAND DASHBOARD — Unified Tier Control Surface (Desktop)
 * ================================================================
 *
 * Exposed as: window.CommandDashboard
 *
 * SECTIONS:
 *   1. Unified Tier Controller   — switches tier, updates graph + dashboard
 *   2. Asset Summary             — tier-aware stats from in-memory graph data
 *   3. Intelligence Cards        — delegates to window.generateDailyBrief()
 *   4. Your Resources            — people/projects/themes with "Show in Graph"
 *
 * DATA SOURCES (no new DB schema, reuse window.supabase patterns):
 *   - window.synapseCore.nodes / links  (already loaded by synapse)
 *   - window.generateDailyBrief()       (existing intelligence engine)
 *
 * TIER MAPPING:
 *   Tier 1 → personal (direct connections, 1-hop)
 *   Tier 2 → extended (2-hop network, bridges)
 *   Tier 3 → ecosystem (full network)
 * ================================================================
 */

window.CommandDashboard = (() => {
  'use strict';

  /* ── Tier metadata ─────────────────────────────────────────── */
  const TIER_META = {
    1: {
      label: 'You',
      desc:  'Direct connections only. This is your network.',
      statsLabel: 'Your Network',
      resourcesLabel: { people: 'Your People', projects: 'Your Projects', themes: 'Your Themes' },
      // Intelligence brief section priority (highest-value for personal tier)
      briefSections: ['your_pattern', 'opportunities_for_you'],
    },
    2: {
      label: 'Extended',
      desc:  '2-hop network. Bridges and momentum zones.',
      statsLabel: 'Extended Network',
      resourcesLabel: { people: 'Extended Network', projects: 'Adjacent Projects', themes: 'Strategic Themes' },
      briefSections: ['combination_opportunities', 'signals_moving'],
    },
    3: {
      label: 'Ecosystem',
      desc:  'Full ecosystem view. Discover patterns and signals.',
      statsLabel: 'Ecosystem',
      resourcesLabel: { people: 'All People', projects: 'All Projects', themes: 'All Themes' },
      briefSections: ['blind_spots', 'signals_moving', 'combination_opportunities'],
    },
  };

  /* ── Internal state ─────────────────────────────────────────── */
  let _currentTier = 1;
  let _userId = null;           // community.id
  let _authUserId = null;       // auth.users.id (for generateDailyBrief)
  let _activeResourceTab = 'people';
  let _briefCache = null;       // cache brief to avoid refetching on tab switches
  let _briefGenerating = false;

  /* ── Element shortcuts ──────────────────────────────────────── */
  const $id = id => document.getElementById(id);
  const $all = sel => document.querySelectorAll(sel);

  /* ================================================================
     INITIALIZATION
     ================================================================ */

  /**
   * initialize({ userId, authUserId })
   * Call after profile-loaded on desktop.
   * userId   = community.id (used for graph queries)
   * authUserId = auth.users.id (used for generateDailyBrief)
   */
  async function initialize({ userId, authUserId }) {
    _userId = userId;
    _authUserId = authUserId;

    // Show dashboard (CSS already makes it visible at ≥1024px via flex)
    // Dashboard visibility is CSS-controlled (command-dashboard.css media query)
    _wireTierButtons();
    _wireResourceTabs();

    // Render initial Tier 1 content
    await _renderAll(1);

    console.log('[CommandDashboard] Initialized for userId:', userId);
  }

  /* ================================================================
     WIRING
     ================================================================ */

  function _wireTierButtons() {
    $all('.udc-tier-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const tier = parseInt(btn.dataset.tier, 10);
        if (tier !== _currentTier) {
          await switchTier(tier);
        }
      });
    });
  }

  function _wireResourceTabs() {
    $all('.udc-resource-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const resource = tab.dataset.resource;
        if (resource === _activeResourceTab) return;

        _activeResourceTab = resource;
        $all('.udc-resource-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        _renderResources(_currentTier);
      });
    });
  }

  /* ================================================================
     TIER SWITCHING
     ================================================================ */

  /**
   * switchTier(tier: 1 | 2 | 3)
   * Updates tier buttons, description, GraphController, and dashboard content.
   */
  async function switchTier(tier) {
    if (!TIER_META[tier]) return;
    _currentTier = tier;

    // Update active tier button
    $all('.udc-tier-btn').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.tier, 10) === tier);
    });

    // Update tier description text
    const descEl = $id('udc-tier-description');
    if (descEl) descEl.textContent = TIER_META[tier].desc;

    // Notify GraphController (updates graph opacity / centering)
    if (window.GraphController) {
      window.GraphController.setTier(tier);
    }

    // Invalidate brief cache when tier changes (sections differ)
    _briefCache = null;

    // Re-render all dashboard sections for new tier
    await _renderAll(tier);
  }

  /* ================================================================
     RENDER ORCHESTRATION
     ================================================================ */

  async function _renderAll(tier) {
    // Stats and resources are fast (in-memory); start them immediately
    _renderStats(tier);
    _renderResources(tier);

    // Intelligence uses generateDailyBrief (async, may be slow)
    _renderIntelligencePlaceholder();
    _renderIntelligence(tier); // non-blocking
  }

  /* ================================================================
     DATA ADAPTER
     Reads from unified network graphDataStore when active,
     falls back to legacy window.synapseCore.
     ================================================================ */

  function _getGraphData() {
    const store = window.graphDataStore;
    if (store && typeof store.getAllNodes === 'function') {
      const nodes = store.getAllNodes();
      if (nodes.length > 0) {
        const edges = store.getAllEdges();
        const links = edges.map(e => ({
          source: e.source?.id ?? e.source,
          target: e.target?.id ?? e.target,
          type: e.type,
          status: e.status,
          strength: e.strength,
        }));
        return { nodes, links };
      }
    }
    const core = window.synapseCore;
    return {
      nodes: core?.nodes || [],
      links: core?.links || [],
    };
  }

  /* ================================================================
     SECTION 1: ASSET SUMMARY (tier-aware stats)
     ================================================================ */

  function _renderStats(tier) {
    const grid = $id('udc-stats-grid');
    if (!grid) return;

    const stats = _computeStats(tier);
    grid.innerHTML = stats
      .map(s => `
        <div class="udc-stat-card" data-action="${s.action}" style="cursor:pointer;" title="${s.tooltip || s.label}">
          <i class="fas ${s.icon} udc-stat-icon"></i>
          <div class="udc-stat-value">${s.value}</div>
          <div class="udc-stat-label">${s.label}</div>
        </div>
      `).join('');

    // Clickable stats → graph action
    grid.querySelectorAll('.udc-stat-card').forEach(card => {
      card.addEventListener('click', () => {
        const action = card.dataset.action;
        _onStatClick(action);
      });
    });
  }

  function _computeStats(tier) {
    const { nodes, links } = _getGraphData();
    const userId = _userId;

    // Helper: edge endpoints
    const edgeSrc = l => l.source?.id ?? l.source;
    const edgeTgt = l => l.target?.id ?? l.target;

    // Direct neighbor IDs
    const directIds = new Set();
    links.forEach(l => {
      if (edgeSrc(l) === userId) directIds.add(edgeTgt(l));
      if (edgeTgt(l) === userId) directIds.add(edgeSrc(l));
    });

    const directConnections = [...directIds].filter(id => {
      const node = nodes.find(n => n.id === id);
      return node && node.type === 'person';
    }).length;

    if (tier === 1) {
      // Projects directly connected to user
      const myProjectIds = new Set(
        [...directIds].filter(id => {
          const n = nodes.find(n => n.id === id);
          return n && n.type === 'project';
        })
      );

      // "Weak ties" = pending connections or 2nd-hop persons not already direct
      // Approximation: neighbors of neighbors not in direct set
      const twohopIds = new Set();
      [...directIds].forEach(did => {
        links.forEach(l => {
          const s = edgeSrc(l), t = edgeTgt(l);
          if (s === did && !directIds.has(t) && t !== userId) twohopIds.add(t);
          if (t === did && !directIds.has(s) && s !== userId) twohopIds.add(s);
        });
      });
      const weakTies = [...twohopIds].filter(id => {
        const n = nodes.find(n => n.id === id);
        return n && n.type === 'person';
      }).length;

      return [
        {
          icon: 'fa-users',
          label: 'Direct Connections',
          value: directConnections,
          action: 'focus-direct',
          tooltip: 'Your accepted connections',
        },
        {
          icon: 'fa-link',
          label: 'Nearby People',
          value: weakTies,
          action: 'focus-weak',
          tooltip: 'People 2 hops from you',
        },
        {
          icon: 'fa-bolt',
          label: 'Your Projects',
          value: myProjectIds.size || '–',
          action: 'focus-projects',
          tooltip: 'Projects you\'re connected to',
        },
      ];
    }

    if (tier === 2) {
      // 2-hop people count
      const twohopPeople = new Set();
      [...directIds].forEach(did => {
        links.forEach(l => {
          const s = edgeSrc(l), t = edgeTgt(l);
          if (s === did && !directIds.has(t) && t !== userId) twohopPeople.add(t);
          if (t === did && !directIds.has(s) && s !== userId) twohopPeople.add(s);
        });
      });
      const extended = [...twohopPeople].filter(id => {
        const n = nodes.find(n => n.id === id);
        return n && n.type === 'person';
      }).length;

      // Bridge-like nodes: connected to multiple clusters (approximation)
      const bridgeCandidates = [...directIds].filter(id => {
        const n = nodes.find(n => n.id === id);
        if (!n || n.type !== 'person') return false;
        // Has its own connections beyond just to user
        const neighborCount = links.filter(l => {
          const s = edgeSrc(l), t = edgeTgt(l);
          return (s === id || t === id) && s !== userId && t !== userId;
        }).length;
        return neighborCount >= 2;
      }).length;

      return [
        {
          icon: 'fa-project-diagram',
          label: 'Extended Network',
          value: extended + directConnections,
          action: 'focus-extended',
          tooltip: 'People within 2 hops',
        },
        {
          icon: 'fa-random',
          label: 'Bridge Positions',
          value: bridgeCandidates,
          action: 'focus-bridges',
          tooltip: 'Connections with broad reach',
        },
        {
          icon: 'fa-search',
          label: 'Projects Nearby',
          value: nodes.filter(n => {
            if (n.type !== 'project') return false;
            return links.some(l => {
              const s = edgeSrc(l), t = edgeTgt(l);
              return ((s === n.id && directIds.has(t)) || (t === n.id && directIds.has(s)));
            });
          }).length,
          action: 'focus-adj-projects',
          tooltip: 'Projects adjacent to your connections',
        },
      ];
    }

    // Tier 3: ecosystem-wide stats
    const allPeople = nodes.filter(n => n.type === 'person').length;
    const allProjects = nodes.filter(n => n.type === 'project').length;

    return [
      {
        icon: 'fa-sitemap',
        label: 'Total People',
        value: allPeople,
        action: 'show-all-people',
        tooltip: 'All community members',
      },
      {
        icon: 'fa-fire',
        label: 'Active Projects',
        value: allProjects,
        action: 'show-all-projects',
        tooltip: 'All projects in ecosystem',
      },
      {
        icon: 'fa-star',
        label: 'Your Connections',
        value: directConnections,
        action: 'focus-direct',
        tooltip: 'Your direct network size',
      },
    ];
  }

  function _onStatClick(action) {
    if (!window.GraphController) return;

    const { nodes, links } = _getGraphData();
    const userId = _userId;
    const edgeSrc = l => l.source?.id ?? l.source;
    const edgeTgt = l => l.target?.id ?? l.target;

    // Build direct neighbor set (reused across multiple cases)
    const directIds = new Set();
    links.forEach(l => {
      if (edgeSrc(l) === userId) directIds.add(edgeTgt(l));
      if (edgeTgt(l) === userId) directIds.add(edgeSrc(l));
    });

    switch (action) {
      case 'focus-direct': {
        // Highlight user + direct connections
        window.GraphController.highlightNodes([userId, ...directIds]);
        setTimeout(() => window.GraphController.resetToTierDefault(), 3000);
        break;
      }

      case 'focus-weak': {
        // 2-hop person nodes NOT already in direct set
        const twoHopIds = new Set();
        [...directIds].forEach(did => {
          links.forEach(l => {
            const s = edgeSrc(l), t = edgeTgt(l);
            if (s === did && !directIds.has(t) && t !== userId) twoHopIds.add(t);
            if (t === did && !directIds.has(s) && s !== userId) twoHopIds.add(s);
          });
        });
        const weakPeople = [...twoHopIds].filter(id => {
          const n = nodes.find(n => n.id === id);
          return n && n.type === 'person';
        });
        window.GraphController.highlightNodes(weakPeople);
        setTimeout(() => window.GraphController.resetToTierDefault(), 3000);
        break;
      }

      case 'focus-projects': {
        // Project nodes directly connected to user + switch resource tab
        const myProjects = [...directIds].filter(id => {
          const n = nodes.find(n => n.id === id);
          return n && n.type === 'project';
        });
        window.GraphController.highlightNodes(myProjects);
        const projectsTab = document.querySelector('.udc-resource-tab[data-resource="projects"]');
        if (projectsTab) projectsTab.click();
        setTimeout(() => window.GraphController.resetToTierDefault(), 3000);
        break;
      }

      case 'focus-extended': {
        // All 2-hop people (direct connections + their connections)
        const twoHopAll = new Set(directIds);
        [...directIds].forEach(did => {
          links.forEach(l => {
            const s = edgeSrc(l), t = edgeTgt(l);
            if (s === did && t !== userId) twoHopAll.add(t);
            if (t === did && s !== userId) twoHopAll.add(s);
          });
        });
        const extendedPeople = [...twoHopAll].filter(id => {
          const n = nodes.find(n => n.id === id);
          return n && n.type === 'person';
        });
        window.GraphController.highlightNodes(extendedPeople);
        setTimeout(() => window.GraphController.resetToTierDefault(), 3000);
        break;
      }

      case 'focus-bridges': {
        // Direct connections with ≥2 external neighbors (bridge candidates)
        const bridges = [...directIds].filter(id => {
          const n = nodes.find(n => n.id === id);
          if (!n || n.type !== 'person') return false;
          const externalCount = links.filter(l => {
            const s = edgeSrc(l), t = edgeTgt(l);
            return (s === id || t === id) && s !== userId && t !== userId;
          }).length;
          return externalCount >= 2;
        });
        window.GraphController.highlightNodes(bridges);
        setTimeout(() => window.GraphController.resetToTierDefault(), 3000);
        break;
      }

      case 'focus-adj-projects': {
        // Project nodes adjacent to any of the user's direct connections
        const adjProjects = nodes.filter(n => {
          if (n.type !== 'project') return false;
          return links.some(l => {
            const s = edgeSrc(l), t = edgeTgt(l);
            return (s === n.id && directIds.has(t)) || (t === n.id && directIds.has(s));
          });
        }).map(n => n.id);
        window.GraphController.highlightNodes(adjProjects);
        const projTab = document.querySelector('.udc-resource-tab[data-resource="projects"]');
        if (projTab) projTab.click();
        setTimeout(() => window.GraphController.resetToTierDefault(), 3000);
        break;
      }

      case 'show-all-people': {
        // Highlight only person-type nodes; switch resource tab to People
        const personIds = nodes.filter(n => n.type === 'person').map(n => n.id);
        window.GraphController.highlightNodes(personIds);
        const peopleTab = document.querySelector('.udc-resource-tab[data-resource="people"]');
        if (peopleTab) peopleTab.click();
        setTimeout(() => window.GraphController.resetToTierDefault(), 3000);
        break;
      }

      case 'show-all-projects': {
        // Highlight only project-type nodes; switch resource tab to Projects
        const projectIds = nodes.filter(n => n.type === 'project').map(n => n.id);
        window.GraphController.highlightNodes(projectIds);
        const allProjTab = document.querySelector('.udc-resource-tab[data-resource="projects"]');
        if (allProjTab) allProjTab.click();
        setTimeout(() => window.GraphController.resetToTierDefault(), 3000);
        break;
      }

      default:
        window.GraphController.resetToTierDefault();
    }
  }

  /* ================================================================
     SECTION 2: INTELLIGENCE CARDS
     Uses existing window.generateDailyBrief() — no new logic written.
     ================================================================ */

  function _renderIntelligencePlaceholder() {
    const container = $id('udc-intelligence-cards');
    if (!container) return;
    container.innerHTML = `
      <div class="udc-insight-card loading">
        <p class="udc-insight-text">Analyzing your network...</p>
      </div>
    `;
  }

  async function _renderIntelligence(tier) {
    const container = $id('udc-intelligence-cards');
    if (!container) return;

    const meta = TIER_META[tier];
    const sectionKeys = meta.briefSections;

    // Try real intelligence engine
    let cards = null;

    if (typeof window.generateDailyBrief === 'function' && _authUserId) {
      try {
        if (!_briefCache && !_briefGenerating) {
          _briefGenerating = true;
          _briefCache = await window.generateDailyBrief({
            userAuthId: _authUserId,
            maxItems: 5,
          });
          _briefGenerating = false;
        } else if (_briefGenerating) {
          // Brief already generating — show placeholder for now
          return;
        }

        if (_briefCache) {
          const sections = _briefCache.sections || {};
          cards = sectionKeys
            .flatMap(key => {
              const items = sections[key] || [];
              return items.map(item => ({
                text: item.headline || item.subhead || 'Network insight',
                cta: _ctaForSection(key),
                nodeId: item.nodeId || null,
                nodeType: item.nodeType || null,
              }));
            })
            .slice(0, 4); // max 4 cards
        }
      } catch (err) {
        console.warn('[CommandDashboard] generateDailyBrief failed, using fallback:', err.message);
        _briefGenerating = false;
      }
    }

    // Fallback cards if brief unavailable
    if (!cards || cards.length === 0) {
      cards = _fallbackCards(tier);
    }

    container.innerHTML = cards
      .map(c => `
        <div class="udc-insight-card" data-node-id="${c.nodeId || ''}" data-node-type="${c.nodeType || ''}">
          <p class="udc-insight-text">${_escapeHtml(c.text)}</p>
          <button class="udc-insight-cta">${_escapeHtml(c.cta)}</button>
        </div>
      `).join('');

    // Wire CTA buttons
    container.querySelectorAll('.udc-insight-card').forEach(card => {
      const cta = card.querySelector('.udc-insight-cta');
      if (!cta) return;
      cta.addEventListener('click', () => {
        const nodeId = card.dataset.nodeId;
        if (nodeId && window.GraphController) {
          window.GraphController.focusNode(nodeId);
        } else if (window.GraphController) {
          window.GraphController.resetToTierDefault();
        }
      });
    });
  }

  function _ctaForSection(sectionKey) {
    const labels = {
      your_pattern:             'See Pattern',
      opportunities_for_you:   'Explore',
      combination_opportunities:'Find Intersection',
      signals_moving:           'View Signal',
      blind_spots:              'Discover',
    };
    return labels[sectionKey] || 'Show in Graph';
  }

  function _fallbackCards(tier) {
    if (tier === 1) {
      return [
        { text: 'You have direct leverage here. Your connections are your strongest asset.', cta: 'See My Network' },
        { text: 'Weak ties often unlock the most unexpected opportunities.', cta: 'Explore Extended' },
        { text: 'Your network is your operating system. Tier 1 shows what you own.', cta: 'Refresh Graph' },
      ];
    }
    if (tier === 2) {
      return [
        { text: 'Bridge positions in your extended network signal high strategic value.', cta: 'Find Bridges' },
        { text: 'Two clusters are converging near you — an opportunity to lead coordination.', cta: 'Explore Tier 2' },
        { text: 'Expansion opportunities are visible just beyond your direct connections.', cta: 'See Clusters' },
      ];
    }
    return [
      { text: 'Ecosystem-wide trends are emerging. Early movers have structural advantage.', cta: 'View Trends' },
      { text: 'High-momentum themes are accelerating — look for coordination signals.', cta: 'See Themes' },
      { text: 'Unclaimed coordination roles exist across the network.', cta: 'Find Opportunities' },
    ];
  }

  /* ================================================================
     SECTION 3: YOUR RESOURCES (people / projects / themes)
     ================================================================ */

  function _renderResources(tier) {
    const list = $id('udc-resource-list');
    if (!list) return;

    const meta = TIER_META[tier];
    const tabLabel = meta.resourcesLabel[_activeResourceTab] || _activeResourceTab;
    const items = _getResourceItems(tier, _activeResourceTab);

    list.innerHTML = `
      <div class="udc-resource-section-label">${_escapeHtml(tabLabel)}</div>
      ${items.length > 0
        ? items.map(item => `
          <div class="udc-resource-item" data-id="${item.id}">
            <span class="udc-resource-name" title="${_escapeHtml(item.name)}">${_escapeHtml(item.name)}</span>
            <button class="udc-resource-show-btn" data-id="${item.id}" title="Show in graph" aria-label="Show ${_escapeHtml(item.name)} in graph">
              <i class="fas fa-crosshairs"></i>
            </button>
          </div>
        `).join('')
        : '<div class="udc-resource-empty">None found in this tier</div>'
      }
    `;

    // Wire "Show in Graph" buttons (preserves node-click → card behavior via GraphController.focusNode)
    list.querySelectorAll('.udc-resource-show-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const id = btn.dataset.id;
        if (id && window.GraphController) {
          window.GraphController.focusNode(id);
        }
      });
    });

    // Clicking the row also shows the node
    list.querySelectorAll('.udc-resource-item').forEach(row => {
      row.addEventListener('click', e => {
        if (e.target.closest('.udc-resource-show-btn')) return; // handled above
        const id = row.dataset.id;
        if (id && window.GraphController) {
          window.GraphController.focusNode(id);
        }
      });
    });
  }

  function _getResourceItems(tier, resourceType) {
    const { nodes, links } = _getGraphData();
    if (!nodes.length) return [];

    const userId = _userId;

    const edgeSrc = l => l.source?.id ?? l.source;
    const edgeTgt = l => l.target?.id ?? l.target;

    // Direct connections of current user
    const directIds = new Set();
    links.forEach(l => {
      if (edgeSrc(l) === userId) directIds.add(edgeTgt(l));
      if (edgeTgt(l) === userId) directIds.add(edgeSrc(l));
    });

    let filtered = [];

    if (resourceType === 'people') {
      if (tier === 1) {
        // Only direct person connections
        filtered = nodes.filter(n => n.type === 'person' && directIds.has(n.id));
      } else if (tier === 2) {
        // 2-hop people (direct + their connections)
        const twoHopIds = new Set(directIds);
        [...directIds].forEach(did => {
          links.forEach(l => {
            const s = edgeSrc(l), t = edgeTgt(l);
            if (s === did) twoHopIds.add(t);
            if (t === did) twoHopIds.add(s);
          });
        });
        filtered = nodes.filter(n => n.type === 'person' && n.id !== userId && twoHopIds.has(n.id));
      } else {
        // Tier 3: all people
        filtered = nodes.filter(n => n.type === 'person' && n.id !== userId);
      }
    } else if (resourceType === 'projects') {
      if (tier === 1) {
        // Only projects directly connected to user
        filtered = nodes.filter(n => n.type === 'project' && directIds.has(n.id));
      } else {
        // Tier 2 + 3: all projects
        filtered = nodes.filter(n => n.type === 'project');
      }
    } else if (resourceType === 'themes') {
      // Themes are theme-circle nodes
      filtered = nodes.filter(n => n.type === 'theme' || n.type === 'themeCircle');
    }

    // Sort by name, limit to 10 items
    return filtered
      .slice(0, 10)
      .map(n => ({ id: n.id, name: n.name || n.title || 'Unknown' }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /* ================================================================
     UTILITIES
     ================================================================ */

  function _escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* ================================================================
     PUBLIC API
     ================================================================ */
  return {
    initialize,
    switchTier,
    getCurrentTier: () => _currentTier,
  };

})();

console.log('[CommandDashboard] Loaded — window.CommandDashboard ready');
