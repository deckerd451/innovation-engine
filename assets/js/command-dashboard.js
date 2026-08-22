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
      briefSections: ['people_worth_knowing', 'signals_moving', 'opportunities_for_you'],
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
      briefSections: ['people_worth_knowing', 'opportunities_for_you', 'signals_moving'],
    },
  };

  const STUB_ORGANIZATIONS = [
    { id: 'org-stub-1', name: 'CharlestonHacks',    isStub: true },
    { id: 'org-stub-2', name: 'Charleston Tech',    isStub: true },
    { id: 'org-stub-3', name: 'SC Launch',          isStub: true },
    { id: 'org-stub-4', name: 'Coastal Innovation', isStub: true },
  ];

  /* ── Brief engine loader (mirrors start-daily-digest.js approach) ── */
  const _CD_SCRIPT_BASE = (() => {
    try {
      // Walk backwards through <script> tags to find this file's URL
      const scripts = document.querySelectorAll('script[src*="command-dashboard"]');
      const src = scripts.length ? scripts[scripts.length - 1].src : '';
      return src.replace(/\/[^/?#]+(\?[^#]*)?(#.*)?$/, '/');
    } catch (_) { return ''; }
  })();
  let _briefEnginePromise = null;

  function _loadBriefEngine() {
    if (typeof window.generateDailyBrief === 'function') {
      // Already loaded by start-daily-digest.js — wrap in resolved promise
      return Promise.resolve({ generateDailyBrief: window.generateDailyBrief });
    }
    if (!_briefEnginePromise) {
      const url = _CD_SCRIPT_BASE + 'intelligence/daily-brief-engine.js?v=synapse-retention-20260818d';
      _briefEnginePromise = import(url).catch(err => {
        _briefEnginePromise = null;
        throw err;
      });
    }
    return _briefEnginePromise;
  }

  /* ── Internal state ─────────────────────────────────────────── */
  let _currentTier = 3;
  let _userId = null;           // community.id
  let _authUserId = null;       // auth.users.id (for generateDailyBrief)
  let _activeResourceTab = 'people';
  let _addFormOpen = false;     // inline add-resource form visibility
  let _organizationCreateInFlight = false;
  let _briefCache = null;       // cache brief to avoid refetching on tab switches
  let _briefGenerating = false;
  let _enrichedDataLoadVersion = 0; // latest refresh wins when requests overlap
  // New state for unified dashboard UX
  let _profile = null;          // community profile for identity layer
  let _unreadMessages = 0;      // unread messages from notification system
  // Supabase-enriched sets (loaded async after init; null = not yet loaded)
  let _enrichedData = {
    acceptedPeerIds: null,       // Set<string> — accepted-only connection peer IDs
    acceptedConnections: null,   // Array<{id, name}> — accepted connection peers with names
    pendingConnections: null,    // Array<{id, name}> — pending connection peers
    activeProjectIds: null,      // Set<string> — projects with status active/open/etc.
    // Direct Supabase data for dashboard (projects/orgs/opps no longer in graph)
    projects: null,              // Array — all projects from Supabase
    myProjectIds: null,          // Set<string> — projects the user is a member of
    organizations: null,         // Array — all organizations from Supabase
    myOrgIds: null,              // Set<string> — orgs the user belongs to
    opportunities: null,         // Array — all opportunities from Supabase
    themes: null,                // Array<{id, label, count}> — aggregated themes/skills
  };

  /* ── Element shortcuts ──────────────────────────────────────── */
  const $id = id => document.getElementById(id);
  const $all = sel => document.querySelectorAll(sel);

  function _removeLegacySynapseIntelligenceLaunchers() {
    ['cd-notif-btn', 'btn-notif-mobile', 'cd-report-btn'].forEach(id => {
      document.getElementById(id)?.remove();
    });
    document.querySelector('#command-dashboard > .cd-panel-footer')?.remove();
  }

  // Mixed-cache safety: an older application shell can outlive a deployment
  // while this versioned controller updates. Remove the obsolete Synapse-only
  // launch controls from that stale DOM before any handlers can be attached.
  _removeLegacySynapseIntelligenceLaunchers();

  /* ================================================================
     INITIALIZATION
     ================================================================ */

  /**
   * initialize({ userId, authUserId })
   * Call after profile-loaded on desktop.
   * userId   = community.id (used for graph queries)
   * authUserId = auth.users.id (used for generateDailyBrief)
   */
  async function initialize({ userId, authUserId, profile }) {
    _removeLegacySynapseIntelligenceLaunchers();
    _userId = userId;
    _authUserId = authUserId;

    // Render identity immediately if profile was passed
    if (profile) _renderIdentity(profile);

    // Wire all interactive controls
    _wireTierButtons();
    _wireResourceTabs();
    _wireAddButton();
    _wireExploreToggle();
    _wireStatusPillClicks();
    _wireAvatarClick();
    _wireAdminBtn();
    _wireBellBtn();
    _wireLogoutBtn();

    if (window.ExplorerCoordinator) {
      window.ExplorerCoordinator.setActiveMode(_activeResourceTab);
      window.ExplorerCoordinator.subscribe(() => {
        _applyExplorerSelectionState();
      });
    }

    // Re-render identity if profile reloads (auth refresh / profile edit)
    window.addEventListener('profile-loaded', (e) => {
      const p = e?.detail?.profile;
      if (p) _renderIdentity(p);
    });

    // Render initial Tier 3 (ecosystem) content — tier buttons removed
    await _renderAll(3);

    // Enrich status with accepted-connection + active-project data from Supabase.
    // Non-blocking: re-renders compact status once data arrives.
    _loadEnrichedData();

    // Re-render status when the graph finishes loading (themes count and
    // graph-based fallback depend on graph nodes/edges being available).
    window.addEventListener('unified-network-ready', () => {
      _renderCompactStatus(_currentTier);
    }, { once: true });

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
        window.ExplorerCoordinator?.setActiveMode?.(resource);
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
     IDENTITY LAYER
     ================================================================ */

  function _renderIdentity(profile) {
    if (!profile) return;
    _profile = profile;

    // Show admin button if user is an admin
    const adminBtn = $id('cd-admin-btn');
    if (adminBtn && typeof window.isAdminUser === 'function' && window.isAdminUser()) {
      adminBtn.style.display = '';
    }

    // Avatar: image or initials
    const img      = $id('cd-avatar-img');
    const initials = $id('cd-avatar-initials');
    if (img && profile.image_url) {
      img.src = profile.image_url;
      img.alt = profile.full_name || '';
      img.style.display = '';
      if (initials) initials.style.display = 'none';
    } else if (initials) {
      const name  = profile.full_name || profile.username || '';
      const parts = name.trim().split(/\s+/);
      const abbr  = parts.length >= 2
        ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
        : name.slice(0, 2).toUpperCase();
      initials.textContent = abbr || '?';
      if (img) img.style.display = 'none';
    }

    // Name
    const nameEl = $id('cd-user-name');
    if (nameEl) nameEl.textContent = 'You';

    // Level badge with title
    const levelEl = $id('cd-level-badge');
    if (levelEl) {
      const level = profile.level || window.DailyEngagement?.state?.level || 1;
      const LEVEL_TITLES = [
        'Newcomer', 'Explorer', 'Contributor', 'Collaborator', 'Connector',
        'Catalyst', 'Architect', 'Champion', 'Innovator', 'Founder',
      ];
      const title = LEVEL_TITLES[Math.max(0, level - 1)] || 'Newcomer';
      levelEl.textContent = `Lv ${level} · ${title}`;
    }

    // Streak (only show if > 0)
    const streakEl    = $id('cd-streak');
    const streakCount = $id('cd-streak-count');
    const streak = profile.login_streak || window.DailyEngagement?.state?.streak || 0;
    if (streakEl) {
      streakEl.style.display = streak > 0 ? '' : 'none';
      if (streakCount) streakCount.textContent = streak;
    }

    // XP bar width
    const xpBar = $id('cd-xp-bar');
    if (xpBar) {
      const xp      = profile.xp || window.DailyEngagement?.state?.xp || 0;
      const xpToNext = window.DailyEngagement?.state?.xpToNextLevel || 100;
      const pct = Math.min(100, Math.round((xp / xpToNext) * 100));
      xpBar.style.width = pct + '%';
    }

    // Profile completeness bar
    const completenessEl  = $id('cd-profile-completeness');
    const completenessPct = $id('cd-completeness-pct');
    const completenessBar = $id('cd-completeness-bar');
    if (completenessEl && completenessBar) {
      const fields = [
        profile.full_name || profile.username,
        profile.bio,
        profile.image_url,
        profile.skills && (Array.isArray(profile.skills) ? profile.skills.length : String(profile.skills).trim()),
        profile.interests && (Array.isArray(profile.interests) ? profile.interests.length : String(profile.interests).trim()),
        profile.headline,
      ];
      const filled = fields.filter(Boolean).length;
      const pct = Math.round((filled / fields.length) * 100);
      if (pct < 100) {
        completenessEl.style.display = '';
        completenessBar.style.width = pct + '%';
        if (completenessPct) completenessPct.textContent = pct + '%';
      } else {
        completenessEl.style.display = 'none';
      }
    }

    // Time-of-day greeting
    const greetingEl = $id('cd-greeting');
    if (greetingEl) {
      const hour = new Date().getHours();
      const firstName = (profile.full_name || profile.username || '').split(' ')[0];
      let greeting;
      if (hour < 12)      greeting = `Good morning${firstName ? ', ' + firstName : ''}`;
      else if (hour < 17) greeting = `Good afternoon${firstName ? ', ' + firstName : ''}`;
      else                greeting = `Good evening${firstName ? ', ' + firstName : ''}`;
      greetingEl.textContent = greeting;
    }
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
    // Compact status and resources are fast (in-memory); start immediately
    _renderCompactStatus(tier);
    _renderResources(tier);

    // Messages banner (fast, in-memory)
    _renderMessages();

    // Network intelligence is rendered by the persistent right-rail
    // Network Reflection surface.
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

  /**
   * De-duplicate a list of records by canonical id, keeping the first
   * occurrence and preserving the relative order of everything else.
   * Guards against the `connections` table containing more than one row
   * for the same pair of people (e.g. accepted rows in both directions),
   * which otherwise surfaces the same person twice in the Explore list.
   */
  function _dedupeById(items, keyFn = item => item.id) {
    const seen = new Set();
    const out = [];
    for (const item of items) {
      const key = keyFn(item);
      if (key == null || seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
    return out;
  }

  /**
   * Explore -> Opps visibility contract, verified against the two other
   * canonical opportunity-browse implementations in this codebase
   * (assets/js/intelligence/daily-brief-engine.js's Reflection fetch and
   * assets/js/organizations/opportunities.js's getOpportunities(), used by
   * opportunities.html's public browse/search page) — both independently
   * require status === 'open', is_public === true (excluding both false
   * and null when the field exists), and an application_deadline that is
   * either absent or still in the future. This is enforced at the DB query
   * in _loadEnrichedData() below; this function re-checks the same
   * contract client-side for rows that enter _enrichedData.opportunities
   * outside that filtered query (the post-create optimistic merge), so a
   * row can never become visible in Explore without satisfying it.
   */
  function _isEligibleExploreOpportunity(opp) {
    if (!opp) return false;
    if (opp.status !== 'open') return false;
    if (Object.prototype.hasOwnProperty.call(opp, 'is_public') && opp.is_public !== true) return false;
    if (opp.application_deadline) {
      const deadline = new Date(opp.application_deadline);
      if (!Number.isNaN(deadline.getTime()) && deadline.getTime() <= Date.now()) return false;
    }
    return true;
  }

  /**
   * Handle the result of the "+" Explore opportunity insert
   * (`.insert(oppData).select().single()`). Extracted so it can be
   * exercised directly by tests without going through the DOM add-form.
   *
   * On success, merges the real canonical row (from the DB, not a
   * fabricated optimistic object) into _enrichedData.opportunities so the
   * Explore list reflects it immediately, then triggers the canonical
   * refetch. _loadEnrichedData() replaces the array wholesale and logs +
   * swallows its own errors, so a failed refetch can never duplicate state
   * and always leaves the locally-merged record in place.
   */
  function _applyOpportunityInsertResult({ data, error } = {}) {
    if (error) {
      console.error('[CommandDashboard] Failed to post opportunity:', error);
      return;
    }
    if (data) {
      if (!_isEligibleExploreOpportunity(data)) {
        // Creation succeeded, but the row isn't eligible for the public
        // Explore list (e.g. status/is_public weren't the eligible values)
        // — surface that distinction rather than merging it in silently or
        // logging it as if the refresh itself had failed.
        console.warn('[CommandDashboard] Opportunity created but not eligible for Explore (status/is_public):', data.id);
      } else {
        _enrichedData.opportunities = _dedupeById([data, ...(_enrichedData.opportunities || [])]);
        _renderResources(_currentTier);
      }
    } else {
      console.warn('[CommandDashboard] Opportunity insert succeeded but returned no row; relying on refetch.');
    }
    _loadEnrichedData();
  }

  /** Merge a persisted organization into Explore before the full refetch. */
  function _applyOrganizationCreateResult(organization) {
    if (!organization?.id) return false;
    _enrichedData.organizations = _dedupeById([
      organization,
      ...(_enrichedData.organizations || []),
    ]);
    if (!_enrichedData.myOrgIds) _enrichedData.myOrgIds = new Set();
    _enrichedData.myOrgIds.add(organization.id);
    _renderResources(_currentTier);
    _loadEnrichedData();
    return true;
  }

  /* ================================================================
     SUPABASE ENRICHMENT
     Loads accepted-connection peers and active project IDs once, then
     re-renders stats so counts reflect DB truth rather than raw graph edges.
     ================================================================ */

  async function _loadEnrichedData() {
    if (!window.supabase || !_userId) return;
    const loadVersion = ++_enrichedDataLoadVersion;
    const isCurrentLoad = () => loadVersion === _enrichedDataLoadVersion;
    try {
      const [connResult, pendingResult, projResult, myProjResult, orgResult, myOrgResult, oppResult] = await Promise.all([
        // Accepted connections only (both directions)
        window.supabase
          .from('connections')
          .select('from_user_id, to_user_id')
          .or(`from_user_id.eq.${_userId},to_user_id.eq.${_userId}`)
          .eq('status', 'accepted'),
        // Pending connections (both directions)
        window.supabase
          .from('connections')
          .select('from_user_id, to_user_id')
          .or(`from_user_id.eq.${_userId},to_user_id.eq.${_userId}`)
          .eq('status', 'pending'),
        // All projects (with basic info for Explore tab)
        window.supabase
          .from('projects')
          .select('id, title, description, status, creator_id, theme_id'),
        // Projects the current user is a member of
        window.supabase
          .from('project_members')
          .select('project_id, role')
          .eq('user_id', _userId),
        // All organizations
        window.supabase
          .from('organizations')
          .select('id, name, description, created_at')
          .order('created_at', { ascending: false }),
        // Orgs the current user belongs to
        window.supabase
          .from('organization_members')
          .select('organization_id')
          .eq('community_id', _userId),
        // Opportunities (table may not exist — handle gracefully).
        // created_at is selected so the Explore preview can be ordered by
        // recency — otherwise a newly created opportunity can be truncated
        // out of the capped preview list by an arbitrary fetch order.
        // Visibility is enforced here at the DB query — same contract as
        // organizations/opportunities.js's getOpportunities() (used by
        // opportunities.html's public browse/search) and the Reflection
        // engine's isEligiblePublicOpportunity(): status must be 'open',
        // is_public must be strictly true (this comparison excludes both
        // false and NULL rows at the database level), and the opportunity
        // must not be past its application deadline.
        window.supabase
          .from('opportunities')
          .select('id, title, description, status, organization_id, created_at')
          .eq('status', 'open')
          .eq('is_public', true)
          .or(`application_deadline.is.null,application_deadline.gt.${new Date().toISOString()}`)
          .then(res => res)
          .catch(() => ({ data: null, error: { message: 'table may not exist' } })),
      ]);
      if (!isCurrentLoad()) return;

      if (connResult.data) {
        // Multiple connection rows can reference the same peer (e.g. an
        // accepted row exists in both directions), so dedupe peer ids by
        // canonical community id before they enter enriched state.
        const acceptedPeerIds = [...new Set(connResult.data.map(c =>
          c.from_user_id === _userId ? c.to_user_id : c.from_user_id
        ))];
        _enrichedData.acceptedPeerIds = new Set(acceptedPeerIds);

        // Resolve names for accepted peers so the people list doesn't
        // depend on graph nodes being loaded.
        if (acceptedPeerIds.length > 0) {
          const { data: acceptedPeers } = await window.supabase
            .from('community')
            .select('id, name')
            .in('id', acceptedPeerIds);
          if (!isCurrentLoad()) return;
          const nameMap = new Map((acceptedPeers || []).map(p => [p.id, p.name]));
          _enrichedData.acceptedConnections = acceptedPeerIds.map(id => ({
            id,
            name: nameMap.get(id) || 'Unknown'
          }));
        } else {
          _enrichedData.acceptedConnections = [];
        }
      }

      if (pendingResult.data && pendingResult.data.length > 0) {
        const peerIds = [...new Set(pendingResult.data.map(c =>
          c.from_user_id === _userId ? c.to_user_id : c.from_user_id
        ))];
        const { data: peers } = await window.supabase
          .from('community')
          .select('id, name')
          .in('id', peerIds);
        if (!isCurrentLoad()) return;
        const nameMap = new Map((peers || []).map(p => [p.id, p.name]));
        _enrichedData.pendingConnections = peerIds.map(peerId => (
          { id: peerId, name: nameMap.get(peerId) || 'Unknown' }
        ));
      } else {
        _enrichedData.pendingConnections = [];
      }

      if (projResult.data) {
        _enrichedData.projects = projResult.data;
        _enrichedData.activeProjectIds = new Set(
          projResult.data.filter(window.ProjectSemantics.isActive).map(p => p.id)
        );
        console.log(`[Projects] command list now has ${projResult.data.length} items`);
        console.log(`[Projects] titles: [${projResult.data.map(p => p.title).join(', ')}]`);

        // Efficient, single-query unfinished-task counts for the Projects
        // list badges. Never one query per project (avoids N+1).
        if (window.ProjectTasks && typeof window.ProjectTasks.fetchOpenCounts === 'function') {
          const acceptedMemberProjectIds = (myProjResult.data || [])
            .filter(m => m.role !== 'pending')
            .map(m => m.project_id);
          const creatorProjectIds = projResult.data
            .filter(p => p.creator_id === _userId)
            .map(p => p.id);
          const authorizedTaskProjectIds = [...new Set([...creatorProjectIds, ...acceptedMemberProjectIds])];
          window.ProjectTasks.fetchOpenCounts(authorizedTaskProjectIds)
            .then(counts => { _enrichedData.openTaskCounts = counts; _renderResources(_currentTier); })
            .catch(() => { _enrichedData.openTaskCounts = new Map(); });
        }
      }

      if (myProjResult.data) {
        _enrichedData.myProjectIds = window.ProjectSemantics.acceptedProjectIds(myProjResult.data);
      }

      if (orgResult.data) {
        _enrichedData.organizations = orgResult.data;
      }

      if (myOrgResult.data) {
        _enrichedData.myOrgIds = new Set(myOrgResult.data.map(o => o.organization_id));
      }

      if (oppResult.data) {
        _enrichedData.opportunities = oppResult.data;
      }

      // Build themes list from theme_circles + aggregated community skills
      await _loadThemes();
      if (!isCurrentLoad()) return;

      // Re-render compact status and resources now that we have accurate data
      _renderCompactStatus(_currentTier);
      _renderResources(_currentTier);
    } catch (err) {
      console.warn('[CommandDashboard] enriched data load failed:', err.message);
    }
  }

  /**
   * Load themes from theme_circles + aggregated community skills.
   * Produces a sorted list of { id, label, count } items.
   */
  async function _loadThemes() {
    const themes = new Map(); // key → { id, label, count }
    let circleRows = 0;
    let fallbackRows = 0;

    // 1. Theme circles — use only columns known to exist
    if (window.supabase) {
      try {
        const now = new Date().toISOString();
        const { data: circles, error } = await window.supabase
          .from('theme_circles')
          .select('id, title, description, expires_at, created_at')
          .or(`expires_at.is.null,expires_at.gt.${now}`)
          .order('created_at', { ascending: false })
          .limit(50);

        if (error) {
          console.warn('[Themes] theme_circles query failed:', error.message);
        } else if (circles && circles.length > 0) {
          circleRows = circles.length;
          circles.forEach(c => {
            const label = (c.title || '').trim();
            if (label) {
              themes.set(label.toLowerCase(), { id: c.id, label, count: 0 });
            }
          });
        }
      } catch (e) {
        console.warn('[Themes] theme_circles fetch error:', e.message);
      }
      console.log(`[Themes] theme_circles rows: ${circleRows}`);
    }

    // 2. Aggregate skills directly from community table (always works,
    //    does not depend on graphDataStore being loaded)
    if (window.supabase) {
      try {
        const { data: people, error } = await window.supabase
          .from('community')
          .select('skills');

        if (error) {
          console.warn('[Themes] community.skills query failed:', error.message);
        } else if (people) {
          const skillCounts = new Map();
          const skillLabels = new Map();

          people.forEach(p => {
            const src = p.skills;
            const items = Array.isArray(src)
              ? src
              : (typeof src === 'string' && src.trim()) ? src.split(',') : [];
            items.forEach(s => {
              const skill = String(s || '').trim();
              if (!skill) return;
              const key = skill.toLowerCase();
              skillCounts.set(key, (skillCounts.get(key) || 0) + 1);
              if (!skillLabels.has(key)) skillLabels.set(key, skill);
            });
          });

          // Promote skills with 2+ people; merge counts into theme circles
          skillCounts.forEach((count, key) => {
            if (count < 2) return;
            if (themes.has(key)) {
              // Update count on existing theme circle
              themes.get(key).count = count;
            } else {
              fallbackRows++;
              themes.set(key, { id: key, label: skillLabels.get(key) || key, count });
            }
          });
        }
      } catch (e) {
        console.warn('[Themes] community.skills fallback error:', e.message);
      }
      if (fallbackRows > 0) console.log(`[Themes] fallback used: community.skills (${fallbackRows} added)`);
    }

    _enrichedData.themes = [...themes.values()].sort((a, b) => b.count - a.count);
    console.log(`[Themes] final theme count: ${_enrichedData.themes.length}`);
  }

  /* ================================================================
     SECTION 1: ASSET SUMMARY (tier-aware stats)
     ================================================================ */

  /* ================================================================
     COMPACT STATUS PILLS — 4-slot fixed layout
     ================================================================ */

  function _renderCompactStatus(tier) {
    const { nodes, links } = _getGraphData();
    const userId = _userId;
    const edgeSrc = l => l.source?.id ?? l.source;
    const edgeTgt = l => l.target?.id ?? l.target;

    // Connections: prefer Supabase-confirmed accepted peer count.
    // acceptedPeerIds is authoritative — no need to cross-check against
    // graph nodes (graph may not be loaded yet).
    const _acceptedIds = _enrichedData.acceptedPeerIds;
    let connections;
    if (_acceptedIds) {
      connections = _acceptedIds.size;
    } else {
      // Fallback: count direct person-type neighbors from graph edges
      const directIds = new Set();
      links.forEach(l => {
        if (edgeSrc(l) === userId) directIds.add(edgeTgt(l));
        if (edgeTgt(l) === userId) directIds.add(edgeSrc(l));
      });
      connections = [...directIds].filter(id => {
        const n = nodes.find(n => n.id === id);
        return n && n.type === 'person';
      }).length;
    }

    // Projects: from Supabase (no longer in graph)
    let projects;
    if (tier === 1) {
      projects = _enrichedData.myProjectIds ? _enrichedData.myProjectIds.size : 0;
    } else {
      projects = _enrichedData.activeProjectIds ? _enrichedData.activeProjectIds.size : 0;
    }

    // Themes use the same authoritative collection as the Explore list.
    // null means loading/unavailable; an empty loaded collection is a real zero.
    const themes = Array.isArray(_enrichedData.themes) ? _enrichedData.themes.length : null;

    // Opportunities: from Supabase (no longer in graph)
    const opps = _enrichedData.opportunities ? _enrichedData.opportunities.length : 0;

    const setVal = (id, val, { showZero = false } = {}) => {
      const el = $id(id);
      if (!el) return;
      el.textContent = val == null ? '—' : (val > 0 || showZero ? val : '—');
    };

    setVal('cd-stat-connections',   connections);
    setVal('cd-stat-projects',      projects);
    setVal('cd-stat-themes',        themes, { showZero: true });
    setVal('cd-stat-opportunities', opps);
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
      // Projects from Supabase
      const myProjectCount = _enrichedData.myProjectIds ? _enrichedData.myProjectIds.size : 0;

      // "Weak ties" = pending connections or 2nd-hop persons not already direct
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
          value: myProjectCount || '–',
          action: 'focus-projects',
          tooltip: 'Projects you\'re a member of',
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
        const neighborCount = links.filter(l => {
          const s = edgeSrc(l), t = edgeTgt(l);
          return (s === id || t === id) && s !== userId && t !== userId;
        }).length;
        return neighborCount >= 2;
      }).length;

      // Active projects from Supabase
      const activeProjectCount = _enrichedData.activeProjectIds ? _enrichedData.activeProjectIds.size : 0;

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
          label: 'Active Projects',
          value: activeProjectCount,
          action: 'focus-adj-projects',
          tooltip: 'Active projects in the ecosystem',
        },
      ];
    }

    // Tier 3: ecosystem-wide stats
    const allPeople = nodes.filter(n => n.type === 'person').length;
    const allProjects = _enrichedData.activeProjectIds ? _enrichedData.activeProjectIds.size : 0;

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
        break;
      }

      case 'focus-adj-projects': {
        // Projects are sidebar/context entities, not graph nodes.
        _switchResourceTab('projects');
        break;
      }

      case 'show-all-people': {
        // Highlight all person nodes + switch to People tab
        const allPeopleIds = nodes
          .filter(n => n.type === 'person' && n.id !== userId)
          .map(n => n.id);
        window.GraphController.highlightNodes(allPeopleIds);
        _switchResourceTab('people');
        break;
      }

      case 'show-all-projects': {
        // Projects are represented in Explore; keep the people-only graph intact.
        _switchResourceTab('projects');
        break;
      }

      case 'focus-projects': {
        // Project status opens the authoritative project list.
        _switchResourceTab('projects');
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
    window.ExplorerCoordinator?.setActiveMode?.(resourceType);
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
     SECTION 2A: MESSAGES BANNER
     Shows an unread-message alert strip above the insights section.
     Hidden when no unread messages.
     ================================================================ */

  function _renderMessages() {
    const focusEl    = $id('cd-focus');
    const messagesEl = $id('cd-focus-messages');
    if (!focusEl || !messagesEl) return;

    if (_unreadMessages > 0) {
      const n = _unreadMessages;
      messagesEl.innerHTML = `
        <div class="cd-focus-messages-alert">
          <i class="fas fa-envelope"></i>
          <span>${n} unread message${n !== 1 ? 's' : ''}</span>
          <button class="cd-focus-cta" id="cd-focus-msg-btn">View</button>
        </div>
      `;
      const msgBtn = $id('cd-focus-msg-btn');
      if (msgBtn) {
        msgBtn.addEventListener('click', () => {
          if (window.UnifiedNotifications?.showPanel) window.UnifiedNotifications.showPanel('actions');
        });
      }
      focusEl.style.display = '';
    } else {
      focusEl.style.display = 'none';
      messagesEl.innerHTML = '';
    }
  }

  /* ================================================================
     SECTION 2B: NETWORK INSIGHTS
     Intelligence card rendered into the collapsible Insights section.
     Priority: opportunity > signal > explore (messages handled separately).
     ================================================================ */

  function _renderInsightsPlaceholder() {
    const primary = $id('cd-insights-primary');
    if (!primary) return;
    primary.innerHTML = `
      <div class="cd-focus-loading">
        <div class="cd-focus-pulse"></div>
        <span>Reading your network...</span>
      </div>
    `;
    const secondary = $id('cd-insights-secondary');
    if (secondary) secondary.style.display = 'none';
  }

  function _computeInsightPriority(brief) {
    const sections = brief?.sections || {};

    // Priority 1: high-scoring opportunity from brief
    const opps = sections['opportunities_for_you'] || [];
    if (opps.length > 0) {
      const top = opps[0];
      return _mapInsightItem(top, {
        type: 'opportunity',
        headline: top.headline || 'New opportunity in your network',
        subhead: top.subhead || '',
      });
    }

    // Priority 2: coordination signal
    const signals = sections['signals_moving'] || [];
    if (signals.length > 0) {
      const top = signals[0];
      return _mapInsightItem(top, {
        type: 'signal',
        headline: top.headline || 'Network movement detected',
        subhead: top.subhead || '',
      });
    }

    // Priority 3: network pattern / reconnect nudge
    const patterns = sections['your_pattern'] || [];
    if (patterns.length > 0) {
      const top = patterns[0];
      return _mapInsightItem(top, {
        type: 'explore',
        headline: top.headline || 'Your network has something for you',
        subhead: top.subhead || '',
      });
    }

    // Default fallback
    return {
      type: 'explore',
      headline: 'Explore your network',
      subhead: 'Discover connections and opportunities',
      ref: null,
      whyKey: null,
      whyText: '',
      isFallback: true,
    };
  }

  function _normalizeInsightRef(ref) {
    const typeMap = {
      person: 'person', project: 'project', theme: 'theme',
      org: 'organization', organization: 'organization', opportunity: 'opportunity',
    };
    const type = typeMap[String(ref?.nodeType || '').toLowerCase()];
    const id = ref?.nodeId;
    return type && id ? { type, id: String(id), label: ref.label || null } : null;
  }

  function _insightWhyText(whyKey, fallback = '') {
    const why = window.__explainability?.getWhy?.(whyKey);
    return why?.factors?.find(Boolean) || fallback || '';
  }

  function _mapInsightItem(item, overrides = {}) {
    const primaryRefs = Array.isArray(item?.primary_refs) ? item.primary_refs : [];
    const ref = primaryRefs.map(_normalizeInsightRef).find(Boolean) || null;
    const whyKey = item?.why_key || null;
    return {
      ...overrides,
      ref,
      primaryRefs,
      whyKey,
      whyText: _insightWhyText(whyKey, overrides.subhead || item?.subhead || ''),
      isFallback: false,
    };
  }

  function _isInsightActionable({ ref, action } = {}) {
    return !!(ref || action);
  }

  async function _renderInsights(tier) {
    const primary   = $id('cd-insights-primary');
    const secondary = $id('cd-insights-secondary');
    if (!primary) return;

    // Fetch brief if not yet cached
    if (!_briefCache && _authUserId && !_briefGenerating) {
      try {
        _briefGenerating = true;
        const { generateDailyBrief } = await _loadBriefEngine();
        _briefCache = await generateDailyBrief({ userAuthId: _authUserId, maxItems: 5 });
        _briefGenerating = false;
      } catch (err) {
        console.warn('[CommandDashboard] generateDailyBrief failed, using fallback:', err.message);
        _briefGenerating = false;
      }
    }

    const insight = _computeInsightPriority(_briefCache);

    // Render primary CTA based on priority
    const LABEL_MAP = {
      opportunity: { label: 'Opportunity',    cta: 'Explore',         action: null },
      signal:      { label: 'Network Signal', cta: 'View Signal',     action: null },
      explore:     { label: 'Today',          cta: 'Explore',         action: 'focus-direct' },
    };
    const meta = LABEL_MAP[insight.type] || LABEL_MAP.explore;
    const primaryAction = { ref: insight.ref, action: insight.isFallback ? meta.action : null };
    primary.dataset.whyKey = insight.whyKey || '';

    primary.innerHTML = `
      <div class="cd-focus-primary-label">${meta.label}</div>
      <div class="cd-focus-primary-text">${_escapeHtml(insight.headline)}</div>
      ${insight.whyText ? `<div class="cd-focus-primary-subtext">${_escapeHtml(insight.whyText)}</div>` : ''}
      ${_isInsightActionable(primaryAction) ? `<button class="cd-focus-cta"
        data-ref-id="${_escapeHtml(insight.ref?.id || '')}"
        data-ref-type="${_escapeHtml(insight.ref?.type || '')}"
        data-ref-label="${_escapeHtml(insight.ref?.label || '')}"
        data-why-key="${_escapeHtml(insight.whyKey || '')}"
        data-action="${primaryAction.action || ''}">${meta.cta}</button>` : ''}
    `;

    const ctaBtn = primary.querySelector('.cd-focus-cta');
    if (ctaBtn) {
      ctaBtn.addEventListener('click', () => _handleFocusCta(ctaBtn));
    }

    // Secondary items: 1–2 additional insights from the brief
    if (secondary && _briefCache) {
      const sectionKeys = TIER_META[tier]?.briefSections || [];
      const briefSections = _briefCache.sections || {};
      const secondaryItems = sectionKeys
        .flatMap(key => {
          const items = briefSections[key] || [];
          return items.slice(1).map(item => _mapInsightItem(item, {
            text: item.headline || item.subhead || 'Network insight',
            cta: _ctaForSection(key),
          }));
        })
        .slice(0, 2);

      if (secondaryItems.length > 0) {
        secondary.style.display = '';
        secondary.innerHTML = secondaryItems.map(item => `
          <div class="cd-focus-secondary-item"
            data-ref-id="${_escapeHtml(item.ref?.id || '')}"
            data-ref-type="${_escapeHtml(item.ref?.type || '')}"
            data-ref-label="${_escapeHtml(item.ref?.label || '')}"
            data-why-key="${_escapeHtml(item.whyKey || '')}">
            <span>${_escapeHtml(item.text)}${item.whyText ? `<small>${_escapeHtml(item.whyText)}</small>` : ''}</span>
            ${_isInsightActionable(item) ? `<button class="cd-focus-cta">${_escapeHtml(item.cta)}</button>` : ''}
          </div>
        `).join('');
        secondary.querySelectorAll('.cd-focus-secondary-item').forEach(row => {
          const btn = row.querySelector('.cd-focus-cta');
          if (btn) btn.addEventListener('click', () => _handleFocusCta(row));
        });
      } else {
        secondary.style.display = 'none';
      }
    } else if (secondary) {
      secondary.style.display = 'none';
    }

    // Auto-open the insights section now that content is ready
    _autoOpenFirstSection();
  }

  async function _handleFocusCta(el) {
    const refId    = el.dataset.refId;
    const refType  = el.dataset.refType;
    const refLabel = el.dataset.refLabel || null;
    const action   = el.dataset.action;
    const coordinator = window.ExplorerCoordinator;

    if (refId && refType === 'person') {
      _switchResourceTab('people');
      const node = _getGraphData().nodes.find(n => String(n.id) === String(refId));
      coordinator?.selectPerson?.({ id: refId, label: refLabel || node?.name, node });
    } else if (refId && ['project', 'theme', 'organization'].includes(refType)) {
      const modes = { project: 'projects', theme: 'themes', organization: 'organizations' };
      _switchResourceTab(modes[refType]);
      await coordinator?.selectContext?.(refType, { id: refId, label: refLabel || refId });
    } else if (refId && refType === 'opportunity') {
      _switchResourceTab('opportunities');
      await coordinator?.selectOpportunity?.({ id: refId, label: refLabel });
    } else if (action) {
      _onStatClick(action);
    }
  }

  function _ctaForSection(sectionKey) {
    const labels = {
      your_pattern:              'See Pattern',
      people_worth_knowing:     'View Person',
      opportunities_for_you:    'Explore',
      signals_moving:            'View Signal',
    };
    return labels[sectionKey] || 'Show in Graph';
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

    if (_activeResourceTab === 'projects') {
      console.log(`[Projects UI] rendered ${items.length} items`);
      console.log(`[Projects UI] rendered titles: [${items.map(i => i.name).join(', ')}]`);
    }

    list.innerHTML = `
      <div class="udc-resource-section-label">${_escapeHtml(tabLabel)}</div>
      ${items.length > 0
        ? items.map(item => `
          <div class="udc-resource-item${item.pending ? ' pending' : ''}" data-id="${item.id}" data-stub="${item.isStub ? 'true' : 'false'}">
            <div class="udc-resource-info">
              <span class="udc-resource-name" title="${_escapeHtml(item.name)}">${_escapeHtml(item.name)}</span>
              ${item.meta ? `<span class="udc-resource-meta">${_escapeHtml(item.meta)}</span>` : ''}
              ${item.pending ? `<span class="udc-resource-meta udc-pending-label">pending request</span>` : ''}
            </div>
            ${item.isStub
              ? `<span class="udc-resource-stub-badge">sample</span>`
              : `<button class="udc-resource-show-btn" data-id="${item.id}" title="${['people','themes'].includes(_activeResourceTab) ? 'Show in graph' : 'View details'}" aria-label="Show ${_escapeHtml(item.name)}">
                  <i class="fas ${['people','themes'].includes(_activeResourceTab) ? 'fa-crosshairs' : 'fa-info-circle'}"></i>
                </button>`
            }
          </div>
        `).join('')
        : `<div class="udc-resource-empty">${_emptyStateCTA(_activeResourceTab)}</div>`
      }
    `;

    _applyExplorerSelectionState();

    // Opens the node side-panel, preferring window.openNodePanel then the
    // fallback panel from unified-network-integration.js.
    function _openPanelForNode(id, type) {
      if (typeof window.openNodePanel === 'function') {
        window.openNodePanel({ id, type });
      } else if (window.unifiedNetworkIntegration?.openFallbackPanel) {
        window.unifiedNetworkIntegration.openFallbackPanel({ id });
      }
    }

    // Wire "Show in Graph" buttons — for people, focus in graph;
    // for projects/orgs/themes, set as context lens (highlights related people)
    const TAB_TYPE = {
      projects:      'project',
      organizations: 'organization',
      opportunities: 'opportunity',
    };
    list.querySelectorAll('.udc-resource-show-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const id = btn.dataset.id;
        if (!id) return;
        if (_activeResourceTab === 'people') {
          const name = btn.closest('.udc-resource-item')?.querySelector('.udc-resource-name')?.textContent || null;
          if (window.ExplorerCoordinator) {
            window.ExplorerCoordinator.selectPerson({ id, label: name });
          } else {
            if (window.GraphController) window.GraphController.focusNode(id);
            _openPanelForNode(id, 'person');
          }
        } else if (_activeResourceTab === 'themes') {
          // Theme: set as context lens to highlight people with matching skills
          const name = btn.closest('.udc-resource-item')?.querySelector('.udc-resource-name')?.textContent || id;
          if (window.ExplorerCoordinator) window.ExplorerCoordinator.selectContext('theme', { id, label: name });
          else if (window.SynapseContext) window.SynapseContext.setTheme(name);
        } else if (_activeResourceTab === 'projects') {
          const name = btn.closest('.udc-resource-item')?.querySelector('.udc-resource-name')?.textContent || 'Project';
          if (window.ExplorerCoordinator) window.ExplorerCoordinator.selectContext('project', { id, label: name });
          else {
            if (window.SynapseContext) window.SynapseContext.setProject(id, name);
            if (window.openNodePanel) window.openNodePanel({ id, type: 'project' });
          }
        } else if (_activeResourceTab === 'organizations') {
          const name = btn.closest('.udc-resource-item')?.querySelector('.udc-resource-name')?.textContent || 'Organization';
          if (window.ExplorerCoordinator) window.ExplorerCoordinator.selectContext('organization', { id, label: name });
          else {
            if (window.SynapseContext) window.SynapseContext.setOrg(id, name);
            if (window.openNodePanel) window.openNodePanel({ id, type: 'organization' });
          }
        } else if (_activeResourceTab === 'opportunities') {
          const name = btn.closest('.udc-resource-item')?.querySelector('.udc-resource-name')?.textContent || null;
          if (window.ExplorerCoordinator?.selectOpportunity) {
            window.ExplorerCoordinator.selectOpportunity({ id, label: name });
          } else {
            _openPanelForNode(id, 'opportunity');
          }
        } else if (window.openNodePanel) {
          window.openNodePanel({ id, type: TAB_TYPE[_activeResourceTab] || _activeResourceTab.replace(/s$/, '') });
        }
      });
    });

    // Clicking the row also triggers the same action
    list.querySelectorAll('.udc-resource-item').forEach(row => {
      row.addEventListener('click', e => {
        if (e.target.closest('.udc-resource-show-btn')) return;
        if (row.dataset.stub === 'true') return;
        const id = row.dataset.id;
        if (!id) return;
        if (_activeResourceTab === 'people') {
          const name = row.querySelector('.udc-resource-name')?.textContent || null;
          if (window.ExplorerCoordinator) {
            window.ExplorerCoordinator.selectPerson({ id, label: name });
          } else {
            if (window.GraphController) window.GraphController.focusNode(id);
            _openPanelForNode(id, 'person');
          }
        } else if (_activeResourceTab === 'themes') {
          const name = row.querySelector('.udc-resource-name')?.textContent || id;
          if (window.ExplorerCoordinator) window.ExplorerCoordinator.selectContext('theme', { id, label: name });
          else if (window.SynapseContext) window.SynapseContext.setTheme(name);
        } else if (_activeResourceTab === 'projects') {
          const name = row.querySelector('.udc-resource-name')?.textContent || 'Project';
          if (window.ExplorerCoordinator) window.ExplorerCoordinator.selectContext('project', { id, label: name });
          else {
            if (window.SynapseContext) window.SynapseContext.setProject(id, name);
            if (window.openNodePanel) window.openNodePanel({ id, type: 'project' });
          }
        } else if (_activeResourceTab === 'organizations') {
          const name = row.querySelector('.udc-resource-name')?.textContent || 'Organization';
          if (window.ExplorerCoordinator) window.ExplorerCoordinator.selectContext('organization', { id, label: name });
          else {
            if (window.SynapseContext) window.SynapseContext.setOrg(id, name);
            if (window.openNodePanel) window.openNodePanel({ id, type: 'organization' });
          }
        } else if (_activeResourceTab === 'opportunities') {
          const name = row.querySelector('.udc-resource-name')?.textContent || null;
          if (window.ExplorerCoordinator?.selectOpportunity) {
            window.ExplorerCoordinator.selectOpportunity({ id, label: name });
          } else {
            _openPanelForNode(id, 'opportunity');
          }
        } else if (window.openNodePanel) {
          window.openNodePanel({ id, type: TAB_TYPE[_activeResourceTab] || _activeResourceTab.replace(/s$/, '') });
        }
      });
    });
  }

  function _applyExplorerSelectionState() {
    const list = $id('udc-resource-list');
    const coordinator = window.ExplorerCoordinator;
    if (!list || !coordinator) return;

    const state = coordinator.getState();
    list.querySelectorAll('.udc-resource-item').forEach(row => {
      const rowId = String(row.dataset.id || '');
      let selected = false;

      if (_activeResourceTab === 'people') {
        selected = state.selectedEntity.type === 'person' &&
          String(state.focusedPersonId || state.selectedEntity.id || '') === rowId;
      } else {
        const typeByTab = {
          projects: 'project',
          themes: 'theme',
          organizations: 'organization',
          opportunities: 'opportunity',
        };
        const type = typeByTab[_activeResourceTab];
        selected = type === 'opportunity'
          ? (state.selectedEntity.type === type && String(state.selectedEntity.id || '') === rowId) ||
            (state.contextLens?.type === type && String(state.contextLens.id || '') === rowId)
          : !!type && state.contextLens?.type === type && String(state.contextLens.id || '') === rowId;
      }

      row.classList.toggle('is-selected', selected);
      row.setAttribute('aria-selected', selected ? 'true' : 'false');
      if (selected && _activeResourceTab === 'people') {
        row.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  function _getResourceItems(tier, resourceType) {
    const { nodes, links } = _getGraphData();
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
      // Always show: accepted connections first, then pending requests in yellow.
      // Use pre-resolved acceptedConnections (names from Supabase) so the list
      // doesn't depend on graph nodes being loaded.
      const connected = (_enrichedData.acceptedConnections || [])
        .map(p => ({ id: p.id, name: p.name }))
        .sort((a, b) => a.name.localeCompare(b.name));
      const pending = (_enrichedData.pendingConnections || [])
        .map(p => ({ id: p.id, name: p.name, pending: true }))
        .sort((a, b) => a.name.localeCompare(b.name));
      // Accepted status is authoritative: if a peer somehow appears in both
      // lists, keep the accepted (non-pending) card and drop the duplicate.
      return _dedupeById([...connected, ...pending]).slice(0, 20);

    } else if (resourceType === 'projects') {
      // Projects come from Supabase, not graph nodes
      const allProjects = _enrichedData.projects;
      if (!allProjects) return [];
      if (tier === 1) {
        const myIds = _enrichedData.myProjectIds;
        // Show projects where user is a member OR the creator, excluding archived/deleted
        filtered = allProjects.filter(p =>
          p.status !== 'archived' &&
          ((myIds && myIds.has(p.id)) || p.creator_id === _userId)
        );
      } else {
        const activeIds = _enrichedData.activeProjectIds;
        filtered = activeIds ? allProjects.filter(p => activeIds.has(p.id)) : allProjects;
      }
      // Sort first, then slice so the newest/alphabetically-first items survive truncation
      const openCounts = _enrichedData.openTaskCounts;
      return filtered
        .map(p => {
          const openCount = openCounts ? (openCounts.get(p.id) || 0) : 0;
          const metaParts = [p.status || ''];
          if (openCount > 0) metaParts.push(`${openCount} open`);
          return { id: p.id, name: p.title || 'Untitled Project', meta: metaParts.filter(Boolean).join(' · ') };
        })
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, 20);

    } else if (resourceType === 'themes') {
      // Themes come from Supabase + aggregated skills, not graph nodes
      const themes = _enrichedData.themes;
      if (!themes || themes.length === 0) return [];
      return themes
        .slice(0, 15)
        .map(t => ({ id: t.id, name: t.label, meta: `${t.count} people` }));

    } else if (resourceType === 'organizations') {
      // Organizations come from Supabase, not graph nodes
      const allOrgs = _enrichedData.organizations;
      if (!allOrgs || allOrgs.length === 0) return STUB_ORGANIZATIONS;
      if (tier === 1) {
        const myIds = _enrichedData.myOrgIds;
        filtered = myIds ? allOrgs.filter(o => myIds.has(o.id)) : [];
        if (filtered.length === 0) return STUB_ORGANIZATIONS;
      } else {
        filtered = allOrgs;
      }
      return filtered
        .slice(0, 10)
        .map(o => ({ id: o.id, name: o.name || 'Unknown Org' }))
        .sort((a, b) => a.name.localeCompare(b.name));

    } else if (resourceType === 'opportunities') {
      // Opportunities come from Supabase — real UUIDs only, no stubs.
      // Sort by recency BEFORE capping to 10: the fetch has no server-side
      // ORDER BY, so slicing first (as this used to) truncated on an
      // arbitrary row order and could drop a just-created opportunity
      // entirely. Newest-first also guarantees it survives the cap.
      const allOpps = _enrichedData.opportunities;
      if (!allOpps || allOpps.length === 0) return [];
      const byRecency = (o) => o.created_at ? new Date(o.created_at).getTime() : 0;
      // Re-check the visibility contract here too (fail closed): the DB
      // query already filters, but _enrichedData.opportunities can also be
      // updated by the post-create optimistic merge, so this is the single
      // point every opportunity must clear before being rendered.
      return allOpps
        .filter(_isEligibleExploreOpportunity)
        .sort((a, b) => byRecency(b) - byRecency(a))
        .slice(0, 10)
        .map(o => ({ id: o.id, name: o.title || 'Untitled Opportunity', meta: o.status || '' }));
    }

    return [];
  }

  function _emptyStateCTA(type) {
    const defs = {
      people: {
        icon: 'fa-user-plus',
        msg: 'No connections yet',
        hint: 'Search for people to connect with',
        cta: 'Find People',
        action: () => {
          const input = document.getElementById('global-search');
          if (input) { input.focus(); input.scrollIntoView({ behavior: 'smooth' }); }
        },
      },
      projects: {
        icon: 'fa-rocket',
        msg: 'No projects yet',
        hint: 'Start or join a project to collaborate',
        cta: 'Create Project',
        action: () => document.getElementById('udc-add-resource-btn')?.click(),
      },
      themes: {
        icon: 'fa-lightbulb',
        msg: 'No themes in view',
        hint: 'Themes group projects by focus area',
        cta: null,
        action: null,
      },
      organizations: {
        icon: 'fa-building',
        msg: 'No organizations',
        hint: 'Join or create an organization',
        cta: 'Create Org',
        action: () => document.getElementById('udc-add-resource-btn')?.click(),
      },
      opportunities: {
        icon: 'fa-star',
        msg: 'No opportunities',
        hint: 'Post or discover open opportunities',
        cta: 'Post Opportunity',
        action: () => document.getElementById('udc-add-resource-btn')?.click(),
      },
    };
    const d = defs[type] || { icon: 'fa-inbox', msg: 'Nothing here yet', hint: '', cta: null };
    const id = `udc-empty-cta-${type}`;
    // Wire click after render
    setTimeout(() => {
      if (d.action) document.getElementById(id)?.addEventListener('click', d.action);
    }, 0);
    return `
      <div style="text-align:center; padding:1.25rem 0.5rem; color:var(--cd-text-dim);">
        <i class="fas ${d.icon}" style="font-size:1.6rem; opacity:0.35; display:block; margin-bottom:0.5rem;"></i>
        <div style="font-size:0.8rem; font-weight:600; margin-bottom:0.25rem;">${d.msg}</div>
        ${d.hint ? `<div style="font-size:0.72rem; opacity:0.6; margin-bottom:0.6rem;">${d.hint}</div>` : ''}
        ${d.cta ? `<button id="${id}" style="
          font-size:0.72rem; font-weight:600; padding:0.35rem 0.85rem;
          border-radius:6px; border:1px solid rgba(0,224,255,0.3);
          background:rgba(0,224,255,0.08); color:var(--cd-accent);
          cursor:pointer;">${d.cta}</button>` : ''}
      </div>`;
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

  /** Wire the Network Insights collapsible accordion */
  function _wireInsightsToggle() {
    const toggle = $id('cd-insights-toggle');
    const body   = $id('cd-insights-body');
    if (!toggle || !body) return;
    toggle.addEventListener('click', () => {
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!expanded));
      body.hidden = expanded;
    });
  }

  /** Explore section is always visible — no toggle needed */
  function _wireExploreToggle() {
    const body = $id('cd-explore-body');
    if (body) body.hidden = false;
  }

  /** Auto-open the Insights section once content is ready (first action surface) */
  function _autoOpenFirstSection() {
    const toggle = $id('cd-insights-toggle');
    const body   = $id('cd-insights-body');
    if (!toggle || !body) return;
    toggle.setAttribute('aria-expanded', 'true');
    body.hidden = false;
  }

  /** Wire compact status pills to graph actions */
  function _wireStatusPillClicks() {
    $all('.cd-status-pill[data-action]').forEach(pill => {
      pill.addEventListener('click', () => _onStatClick(pill.dataset.action));
    });
  }

  /** Wire avatar click → open profile modal (same as top-nav user circle) */
  function _wireAvatarClick() {
    const avatar = $id('cd-avatar');
    if (!avatar) return;
    avatar.addEventListener('click', () => {
      if (typeof window.openProfileModal === 'function') {
        window.openProfileModal();
      }
    });
  }

  /** Wire admin button → open admin panel (hidden until admin role confirmed) */
  function _wireAdminBtn() {
    const btn = $id('cd-admin-btn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      if (typeof window.openAdminPanel === 'function') {
        window.openAdminPanel();
      }
    });
    // Show immediately if already confirmed admin
    if (typeof window.isAdminUser === 'function' && window.isAdminUser()) {
      btn.style.display = '';
    }
  }

  /** Wire messages button → open messaging */
  function _wireBellBtn() {
    // Messages button → open messaging
    const msgBtn = $id('cd-messages-btn');
    if (msgBtn) {
      msgBtn.addEventListener('click', () => {
        if (typeof window.openMessagingInterface === 'function') {
          window.openMessagingInterface();
        } else if (typeof window.openMessagesModal === 'function') {
          window.openMessagesModal();
        }
      });
    }

    // Actions button → open unified panel (shows connection requests, bids, etc.)
    const actionsBtn = $id('cd-actions-btn');
    if (actionsBtn) {
      actionsBtn.addEventListener('click', () => {
        if (window.UnifiedNotifications?.showPanel) {
          window.UnifiedNotifications.showPanel('actions');
        }
      });
    }
  }

  /** Wire logout button in command dashboard */
  function _wireLogoutBtn() {
    const btn = $id('cd-logout-btn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      if (window.doLogout) window.doLogout();
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
  async function _handleAddSubmit(resourceType) {
    if (resourceType === 'organizations' && _organizationCreateInFlight) return;

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

    let completed = true;
    if (resourceType === 'projects') {
      // Delegate to the existing project creation modal if available
      if (typeof window.showEnhancedProjectCreation === 'function') {
        window.showEnhancedProjectCreation();
      } else if (typeof window.showCreateProjectForm === 'function') {
        window.showCreateProjectForm();
      } else {
        _showAddConfirmation('project', name);
      }
    } else if (resourceType === 'organizations') {
      const submitBtn = $id('udc-add-submit');
      if (!window.OrganizationManager?.createOrganization) {
        completed = false;
        window.retryPostAuthModule?.('organization-manager.js');
        const message = 'Organization creation is still loading. Please try again.';
        if (window.showToastNotification) window.showToastNotification(message, 'error');
        else alert(message);
      } else {
        _organizationCreateInFlight = true;
        if (submitBtn) submitBtn.disabled = true;
        try {
          const organization = await window.OrganizationManager.createOrganization({
            name,
            description: desc || null,
          });
          _applyOrganizationCreateResult(organization);
        } catch (error) {
          completed = false;
          console.error('[CommandDashboard] Failed to create organization:', error);
          // OrganizationManager owns the user-facing error toast so the same
          // validation/authorization message is not shown twice.
        } finally {
          _organizationCreateInFlight = false;
          if (submitBtn) submitBtn.disabled = false;
        }
      }
    } else if (resourceType === 'opportunities') {
      // Map form type values to schema opportunity type + commitment
      const typeMap = { 'full-time': 'job', 'part-time': 'job', 'contract': 'contract', 'internship': 'internship', 'volunteer': 'volunteer' };
      const commitmentMap = { 'full-time': 'full-time', 'part-time': 'part-time' };
      const oppData = {
        title: name,
        opportunity_type: typeMap[opType] || 'volunteer',
        commitment: commitmentMap[opType] || null,
        description: desc || name,
        status: 'open',
        is_public: true,
        posted_by: _userId,
        organization_id: null,
      };
      if (window.supabase && _userId) {
        // .select().single() returns the canonical inserted row (real id,
        // created_at, etc.) so the Explore list can be updated immediately
        // without waiting on a full refetch round-trip.
        window.supabase.from('opportunities').insert(oppData).select().single().then(_applyOpportunityInsertResult);
      }
      const meta = opType ? `${opType}${desc ? ' · ' + desc.slice(0, 30) : ''}` : undefined;
      _showAddConfirmation(resourceType, name, meta);
    } else {
      // Themes remain a lightweight local suggestion until a canonical,
      // permission-aware theme creation workflow is available.
      const meta = desc.slice(0, 40) || undefined;
      _showAddConfirmation(resourceType, name, meta);
    }

    if (completed) _closeAddForm();
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
    selectResourceTab: _switchResourceTab,
    getCurrentTier: () => _currentTier,
    /** Called by the notification system to update unread message count */
    setUnreadMessages(n) {
      _unreadMessages = Math.max(0, parseInt(n, 10) || 0);
      _renderMessages();
      // Drive the messages badge in the identity header
      const badge = $id('cd-messages-badge');
      if (badge) {
        if (_unreadMessages > 0) {
          badge.textContent = _unreadMessages > 99 ? '99+' : _unreadMessages;
          badge.style.display = '';
        } else {
          badge.style.display = 'none';
        }
      }
    },
    /** Called externally to push a fresh profile (e.g. after profile edit) */
    renderIdentity(profile) {
      _renderIdentity(profile);
    },
    /** Refresh Supabase-enriched data (projects, orgs, connections) and re-render */
    async refreshEnrichedData() {
      await _loadEnrichedData();
    },
    /**
     * TEST-ONLY: exercises the real Explore "people" composition + dedupe
     * path (_getResourceItems / _dedupeById) without requiring a live
     * Supabase session or full DOM initialize(). Not used by the app.
     */
    __testGetPeopleResourceItems(userId, enrichedData) {
      _userId = userId;
      Object.assign(_enrichedData, enrichedData);
      return _getResourceItems(_currentTier, 'people');
    },
    /**
     * TEST-ONLY: exercises the real Explore "opportunities" composition
     * path (_getResourceItems / recency sort + cap) without a live
     * Supabase session. Not used by the app.
     */
    __testGetOpportunityResourceItems(userId, enrichedData) {
      _userId = userId;
      Object.assign(_enrichedData, enrichedData);
      return _getResourceItems(_currentTier, 'opportunities');
    },
    /**
     * TEST-ONLY: exercises the real post-create insert-result handler
     * (_applyOpportunityInsertResult) — local merge + dedupe + refetch
     * trigger — without a live Supabase session or the DOM add-form.
     * Not used by the app.
     */
    __testApplyOpportunityInsertResult(userId, enrichedData, insertResult) {
      _userId = userId;
      Object.assign(_enrichedData, enrichedData);
      _applyOpportunityInsertResult(insertResult);
      return _enrichedData.opportunities;
    },
    /** TEST-ONLY: verifies canonical organization create results enter Explore. */
    __testApplyOrganizationCreateResult(userId, enrichedData, organization) {
      _userId = userId;
      Object.assign(_enrichedData, enrichedData);
      _applyOrganizationCreateResult(organization);
      return {
        organizations: _enrichedData.organizations,
        myOrgIds: [...(_enrichedData.myOrgIds || [])],
      };
    },
    /** TEST-ONLY: drives overlapping enriched refreshes with a fake Supabase client. */
    async __testLoadEnrichedData(userId) {
      _userId = userId;
      await _loadEnrichedData();
    },
    /** TEST-ONLY: reads the organization portion of enriched state. */
    __testGetOrganizationState() {
      return {
        organizations: _enrichedData.organizations,
        myOrgIds: [...(_enrichedData.myOrgIds || [])],
      };
    },
    /** TEST-ONLY: exercises all submission-path guards in the real handler. */
    async __testHandleAddSubmit(resourceType) {
      await _handleAddSubmit(resourceType);
    },
    /**
     * TEST-ONLY: direct access to the Explore opportunity visibility
     * contract (status/is_public/application_deadline). Not used by the app.
     */
    __testIsEligibleExploreOpportunity(opp) {
      return _isEligibleExploreOpportunity(opp);
    },
  };

})();

console.log('[CommandDashboard] Loaded — window.CommandDashboard ready');
