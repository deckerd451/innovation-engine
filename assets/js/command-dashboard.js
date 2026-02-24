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
      resourcesLabel: {
        people:        'Your People',
        projects:      'Your Projects',
        themes:        'Your Themes',
        organizations: 'Your Organizations',
        opportunities: 'Your Opportunities',
      },
      briefSections: ['your_pattern', 'opportunities_for_you'],
    },
    2: {
      label: 'Extended',
      desc:  '2-hop network. Bridges and momentum zones.',
      statsLabel: 'Extended Network',
      resourcesLabel: {
        people:        'Extended Network',
        projects:      'Adjacent Projects',
        themes:        'Strategic Themes',
        organizations: 'Nearby Organizations',
        opportunities: 'Nearby Opportunities',
      },
      briefSections: ['combination_opportunities', 'signals_moving'],
    },
    3: {
      label: 'Ecosystem',
      desc:  'Full ecosystem view. Discover patterns and signals.',
      statsLabel: 'Ecosystem',
      resourcesLabel: {
        people:        'All People',
        projects:      'All Projects',
        themes:        'All Themes',
        organizations: 'All Organizations',
        opportunities: 'All Opportunities',
      },
      briefSections: ['blind_spots', 'signals_moving', 'combination_opportunities'],
    },
  };

  /* ── Stub data (shown when graph has no nodes of that type) ─ */
  const STUB_OPPORTUNITIES = [
    { id: 'opp-stub-1', name: 'Frontend Developer',   meta: 'volunteer · Open Source',      isStub: true },
    { id: 'opp-stub-2', name: 'UX Designer',           meta: 'internship · Innovation Hub',  isStub: true },
    { id: 'opp-stub-3', name: 'Project Lead',          meta: 'contract · CharlestonHacks',   isStub: true },
    { id: 'opp-stub-4', name: 'Data Analyst',          meta: 'part-time · SC Tech',          isStub: true },
    { id: 'opp-stub-5', name: 'Community Manager',     meta: 'full-time · Coastal Ventures', isStub: true },
  ];

  const STUB_ORGANIZATIONS = [
    { id: 'org-stub-1', name: 'CharlestonHacks',    isStub: true },
    { id: 'org-stub-2', name: 'Charleston Tech',    isStub: true },
    { id: 'org-stub-3', name: 'SC Launch',          isStub: true },
    { id: 'org-stub-4', name: 'Coastal Innovation', isStub: true },
  ];

  /* ── Internal state ─────────────────────────────────────────── */
  let _currentTier = 1;
  let _userId = null;           // community.id
  let _authUserId = null;       // auth.users.id (for generateDailyBrief)
  let _activeResourceTab = 'people';
  let _addFormOpen = false;     // inline add-resource form visibility
  let _briefCache = null;       // cache brief to avoid refetching on tab switches
  let _briefGenerating = false;
  // Supabase-enriched sets (loaded async after init; null = not yet loaded)
  let _enrichedData = {
    acceptedPeerIds: null,   // Set<string> — accepted-only connection peer IDs
    activeProjectIds: null,  // Set<string> — projects with status active/open/etc.
  };

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
    _wireAddButton();

    // Render initial Tier 1 content
    await _renderAll(1);

    // Enrich stats with accepted-connection + active-project data from Supabase.
    // Non-blocking: re-renders stats once data arrives.
    _loadEnrichedData();

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

        // Close add form when switching tabs
        _closeAddForm();
        _updateAddButtonVisibility(resource);

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
     SUPABASE ENRICHMENT
     Loads accepted-connection peers and active project IDs once, then
     re-renders stats so counts reflect DB truth rather than raw graph edges.
     ================================================================ */

  async function _loadEnrichedData() {
    if (!window.supabase || !_userId) return;
    try {
      const [connResult, projResult] = await Promise.all([
        // Accepted connections only (both directions)
        window.supabase
          .from('connections')
          .select('from_user_id, to_user_id')
          .or(`from_user_id.eq.${_userId},to_user_id.eq.${_userId}`)
          .eq('status', 'accepted'),
        // Active / open projects
        window.supabase
          .from('projects')
          .select('id')
          .in('status', ['active', 'in-progress', 'open', 'recruiting']),
      ]);

      if (connResult.data) {
        _enrichedData.acceptedPeerIds = new Set(
          connResult.data.map(c =>
            c.from_user_id === _userId ? c.to_user_id : c.from_user_id
          )
        );
      }
      if (projResult.data) {
        _enrichedData.activeProjectIds = new Set(projResult.data.map(p => p.id));
      }

      // Re-render stats now that we have accurate counts
      _renderStats(_currentTier);
    } catch (err) {
      console.warn('[CommandDashboard] enriched data load failed:', err.message);
    }
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

    // Prefer Supabase-confirmed accepted peers; fall back to raw graph edges
    const _acceptedIds = _enrichedData.acceptedPeerIds;
    const directConnections = (_acceptedIds
      ? [..._acceptedIds]
      : [...directIds]
    ).filter(id => {
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
    // Filter to active/open projects if Supabase data is available
    const _activeIds = _enrichedData.activeProjectIds;
    const allProjects = nodes.filter(n => {
      if (n.type !== 'project') return false;
      return !_activeIds || _activeIds.has(n.id);
    }).length;

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
        tooltip: 'Active & open projects in ecosystem',
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

    // Direct neighbor IDs (reused across cases)
    const directIds = new Set();
    links.forEach(l => {
      if (edgeSrc(l) === userId) directIds.add(edgeTgt(l));
      if (edgeTgt(l) === userId) directIds.add(edgeSrc(l));
    });

    switch (action) {
      case 'focus-direct': {
        // Use Supabase-confirmed accepted peers when available
        const acceptedPeers = _enrichedData.acceptedPeerIds;
        const ids = acceptedPeers
          ? new Set([userId, ...acceptedPeers])
          : new Set([userId, ...directIds]);
        window.GraphController.highlightNodes([...ids]);
        setTimeout(() => window.GraphController.resetToTierDefault(), 3000);
        break;
      }

      case 'focus-weak': {
        // Highlight 2-hop people only (friends of friends, not already direct)
        const twohopIds = new Set();
        [...directIds].forEach(did => {
          links.forEach(l => {
            const s = edgeSrc(l), t = edgeTgt(l);
            if (s === did && !directIds.has(t) && t !== userId) twohopIds.add(t);
            if (t === did && !directIds.has(s) && s !== userId) twohopIds.add(s);
          });
        });
        const weakPeopleIds = [...twohopIds].filter(id => {
          const n = nodes.find(n => n.id === id);
          return n && n.type === 'person';
        });
        window.GraphController.highlightNodes(weakPeopleIds);
        setTimeout(() => window.GraphController.resetToTierDefault(), 3000);
        break;
      }

      case 'focus-extended': {
        // Highlight full 2-hop people set (direct + 2nd-hop person nodes)
        const allTwohopIds = new Set(directIds);
        [...directIds].forEach(did => {
          links.forEach(l => {
            const s = edgeSrc(l), t = edgeTgt(l);
            if (s === did && t !== userId) allTwohopIds.add(t);
            if (t === did && s !== userId) allTwohopIds.add(s);
          });
        });
        const extendedPeopleIds = [...allTwohopIds].filter(id => {
          const n = nodes.find(n => n.id === id);
          return n && n.type === 'person';
        });
        window.GraphController.highlightNodes(extendedPeopleIds);
        setTimeout(() => window.GraphController.resetToTierDefault(), 3000);
        break;
      }

      case 'focus-bridges': {
        // Highlight bridge candidates: direct person connections with ≥2 external neighbors
        const bridgeIds = [...directIds].filter(id => {
          const n = nodes.find(n => n.id === id);
          if (!n || n.type !== 'person') return false;
          const externalNeighborCount = links.filter(l => {
            const s = edgeSrc(l), t = edgeTgt(l);
            return (s === id || t === id) && s !== userId && t !== userId;
          }).length;
          return externalNeighborCount >= 2;
        });
        window.GraphController.highlightNodes(bridgeIds);
        _switchResourceTab('people');
        setTimeout(() => window.GraphController.resetToTierDefault(), 3000);
        break;
      }

      case 'focus-adj-projects': {
        // Highlight projects adjacent to any of the user's direct connections
        const adjProjectIds = nodes
          .filter(n => {
            if (n.type !== 'project') return false;
            return links.some(l => {
              const s = edgeSrc(l), t = edgeTgt(l);
              return (s === n.id && directIds.has(t)) || (t === n.id && directIds.has(s));
            });
          })
          .map(n => n.id);
        window.GraphController.highlightNodes(adjProjectIds);
        _switchResourceTab('projects');
        setTimeout(() => window.GraphController.resetToTierDefault(), 3000);
        break;
      }

      case 'show-all-people': {
        // Highlight all person nodes + switch to People tab
        const allPeopleIds = nodes
          .filter(n => n.type === 'person' && n.id !== userId)
          .map(n => n.id);
        window.GraphController.highlightNodes(allPeopleIds);
        _switchResourceTab('people');
        setTimeout(() => window.GraphController.resetToTierDefault(), 3000);
        break;
      }

      case 'show-all-projects': {
        // Highlight active/open project nodes only (falls back to all projects)
        const activeIds = _enrichedData.activeProjectIds;
        const allProjectIds = nodes
          .filter(n => {
            if (n.type !== 'project') return false;
            return !activeIds || activeIds.has(n.id);
          })
          .map(n => n.id);
        window.GraphController.highlightNodes(allProjectIds);
        _switchResourceTab('projects');
        setTimeout(() => window.GraphController.resetToTierDefault(), 3000);
        break;
      }

      default:
        window.GraphController.resetToTierDefault();
    }
  }

  /**
   * _switchResourceTab(resourceType)
   * Programmatically activate a resource tab (people / projects / themes).
   * Mirrors the click handler in _wireResourceTabs().
   */
  function _switchResourceTab(resourceType) {
    if (resourceType === _activeResourceTab) return;
    _activeResourceTab = resourceType;
    $all('.udc-resource-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.resource === resourceType);
    });
    _closeAddForm();
    _updateAddButtonVisibility(resourceType);
    _renderResources(_currentTier);
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
            <div class="udc-resource-info">
              <span class="udc-resource-name" title="${_escapeHtml(item.name)}">${_escapeHtml(item.name)}</span>
              ${item.meta ? `<span class="udc-resource-meta">${_escapeHtml(item.meta)}</span>` : ''}
            </div>
            ${item.isStub
              ? `<span class="udc-resource-stub-badge">sample</span>`
              : `<button class="udc-resource-show-btn" data-id="${item.id}" title="Show in graph" aria-label="Show ${_escapeHtml(item.name)} in graph">
                  <i class="fas fa-crosshairs"></i>
                </button>`
            }
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
    } else if (resourceType === 'organizations') {
      filtered = nodes.filter(n => n.type === 'organization' || n.type === 'org');
      // Return stubs if no org nodes exist in the graph yet
      if (filtered.length === 0) return STUB_ORGANIZATIONS;
    } else if (resourceType === 'opportunities') {
      filtered = nodes.filter(n => n.type === 'opportunity');
      // Return stubs if no opportunity nodes exist in the graph yet
      if (filtered.length === 0) return STUB_OPPORTUNITIES;
    }

    // Sort by name, limit to 10 items
    return filtered
      .slice(0, 10)
      .map(n => ({ id: n.id, name: n.name || n.title || 'Unknown' }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /* ================================================================
     ADD RESOURCE — inline form inside the Network Command panel
     ================================================================ */

  /** Types that support in-panel creation */
  const _ADDABLE_TYPES = new Set(['projects', 'organizations', 'opportunities', 'themes']);

  /** Show/hide the add button depending on active tab */
  function _updateAddButtonVisibility(resourceType) {
    const btn = $id('udc-add-resource-btn');
    if (!btn) return;
    btn.style.display = _ADDABLE_TYPES.has(resourceType) ? 'flex' : 'none';
  }

  /** Wire the add button's click handler */
  function _wireAddButton() {
    const btn = $id('udc-add-resource-btn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      if (_addFormOpen) {
        _closeAddForm();
      } else {
        _openAddForm(_activeResourceTab);
      }
    });
  }

  /** Close the form and reset button state */
  function _closeAddForm() {
    _addFormOpen = false;
    const formEl = $id('udc-add-form');
    if (formEl) formEl.classList.add('hidden');
    const btn = $id('udc-add-resource-btn');
    if (btn) btn.classList.remove('active');
  }

  /** Open and render the form for the given resource type */
  function _openAddForm(resourceType) {
    const formEl = $id('udc-add-form');
    if (!formEl || !_ADDABLE_TYPES.has(resourceType)) return;

    _addFormOpen = true;
    const btn = $id('udc-add-resource-btn');
    if (btn) btn.classList.add('active');

    let formHTML = '';

    if (resourceType === 'projects') {
      formHTML = `
        <div class="udc-add-form-label"><i class="fas fa-lightbulb" style="margin-right:0.3em;"></i>New Project</div>
        <input type="text" id="udc-add-name" placeholder="Project name…" maxlength="60" autocomplete="off" />
        <input type="text" id="udc-add-desc" placeholder="Brief description…" maxlength="120" autocomplete="off" />
        <div class="udc-add-form-actions">
          <button type="button" class="udc-add-form-cancel" id="udc-add-cancel">Cancel</button>
          <button type="button" class="udc-add-form-submit" id="udc-add-submit">
            <i class="fas fa-plus"></i> Create
          </button>
        </div>`;
    } else if (resourceType === 'organizations') {
      formHTML = `
        <div class="udc-add-form-label"><i class="fas fa-building" style="margin-right:0.3em;"></i>New Organization</div>
        <input type="text" id="udc-add-name" placeholder="Organization name…" maxlength="60" autocomplete="off" />
        <input type="text" id="udc-add-desc" placeholder="Mission or focus…" maxlength="120" autocomplete="off" />
        <div class="udc-add-form-actions">
          <button type="button" class="udc-add-form-cancel" id="udc-add-cancel">Cancel</button>
          <button type="button" class="udc-add-form-submit" id="udc-add-submit">
            <i class="fas fa-plus"></i> Add Org
          </button>
        </div>`;
    } else if (resourceType === 'opportunities') {
      formHTML = `
        <div class="udc-add-form-label"><i class="fas fa-bolt" style="margin-right:0.3em;"></i>New Opportunity</div>
        <input type="text" id="udc-add-name" placeholder="Role or opportunity title…" maxlength="60" autocomplete="off" />
        <select id="udc-add-type">
          <option value="full-time">Full-time</option>
          <option value="part-time">Part-time</option>
          <option value="contract">Contract</option>
          <option value="internship">Internship</option>
          <option value="volunteer" selected>Volunteer</option>
        </select>
        <input type="text" id="udc-add-desc" placeholder="Brief description…" maxlength="120" autocomplete="off" />
        <div class="udc-add-form-actions">
          <button type="button" class="udc-add-form-cancel" id="udc-add-cancel">Cancel</button>
          <button type="button" class="udc-add-form-submit" id="udc-add-submit">
            <i class="fas fa-plus"></i> Post
          </button>
        </div>`;
    } else if (resourceType === 'themes') {
      formHTML = `
        <div class="udc-add-form-label"><i class="fas fa-palette" style="margin-right:0.3em;"></i>New Theme</div>
        <input type="text" id="udc-add-name" placeholder="Theme name…" maxlength="60" autocomplete="off" />
        <div class="udc-add-form-actions">
          <button type="button" class="udc-add-form-cancel" id="udc-add-cancel">Cancel</button>
          <button type="button" class="udc-add-form-submit" id="udc-add-submit">
            <i class="fas fa-plus"></i> Add Theme
          </button>
        </div>`;
    }

    formEl.innerHTML = formHTML;
    formEl.classList.remove('hidden');

    // Wire cancel
    const cancelBtn = $id('udc-add-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', _closeAddForm);

    // Wire submit
    const submitBtn = $id('udc-add-submit');
    if (submitBtn) {
      submitBtn.addEventListener('click', () => _handleAddSubmit(resourceType));
    }

    // Wire Enter key on inputs
    formEl.querySelectorAll('input').forEach(input => {
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') _handleAddSubmit(resourceType);
        if (e.key === 'Escape') _closeAddForm();
      });
    });

    // Auto-focus first text input
    const first = formEl.querySelector('input[type="text"]');
    if (first) setTimeout(() => first.focus(), 50);
  }

  /** Handle the submit action for the add form */
  function _handleAddSubmit(resourceType) {
    const nameEl = $id('udc-add-name');
    const descEl = $id('udc-add-desc');
    const typeEl = $id('udc-add-type');

    const name = nameEl ? nameEl.value.trim() : '';
    if (!name) {
      if (nameEl) {
        nameEl.style.borderColor = 'rgba(255, 80, 80, 0.65)';
        setTimeout(() => { nameEl.style.borderColor = ''; }, 1600);
        nameEl.focus();
      }
      return;
    }

    const desc   = descEl ? descEl.value.trim() : '';
    const opType = typeEl ? typeEl.value : '';

    if (resourceType === 'projects') {
      // Delegate to the existing project creation modal if available
      if (typeof window.showEnhancedProjectCreation === 'function') {
        window.showEnhancedProjectCreation();
      } else if (typeof window.showCreateProjectForm === 'function') {
        window.showCreateProjectForm();
      } else {
        _showAddConfirmation('project', name);
      }
    } else {
      // Stub confirmation for orgs, opportunities, themes
      // (Full DB integration plugs in here via the respective managers)
      const meta = resourceType === 'opportunities' && opType
        ? `${opType}${desc ? ' · ' + desc.slice(0, 30) : ''}`
        : desc.slice(0, 40) || undefined;
      _showAddConfirmation(resourceType, name, meta);
    }

    _closeAddForm();
  }

  /** Flash a newly-added item at the top of the resource list */
  function _showAddConfirmation(type, name, meta) {
    const list = $id('udc-resource-list');
    if (!list) return;

    // Remove the "none found" placeholder if present
    const empty = list.querySelector('.udc-resource-empty');
    if (empty) empty.remove();

    const item = document.createElement('div');
    item.className = 'udc-resource-item';
    item.style.cssText = 'border-color:rgba(0,200,140,0.4);background:rgba(0,200,140,0.06);';
    item.innerHTML = `
      <div class="udc-resource-info">
        <span class="udc-resource-name">${_escapeHtml(name)}</span>
        ${meta ? `<span class="udc-resource-meta">${_escapeHtml(meta)}</span>` : ''}
      </div>
      <span style="font-size:0.6rem;color:#00c88c;flex-shrink:0;">+ Added</span>
    `;

    // Insert after the section label
    const label = list.querySelector('.udc-resource-section-label');
    if (label && label.nextSibling) {
      list.insertBefore(item, label.nextSibling);
    } else {
      list.prepend(item);
    }

    // Fade out after 4 s
    setTimeout(() => {
      item.style.transition = 'opacity 0.4s';
      item.style.opacity = '0';
      setTimeout(() => item.remove(), 450);
    }, 4000);
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
