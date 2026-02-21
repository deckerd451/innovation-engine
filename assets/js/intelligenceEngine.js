/**
 * ================================================================
 * DAILY INTELLIGENCE ENGINE
 * ================================================================
 *
 * ARCHITECTURE LAYERS
 * -------------------
 * 1. Sensing / Data Fetch
 *    fetchUserProfileByAuthId() + fetchCoreGraph()
 *    Pull all required tables in parallel via window.supabase.
 *    Results are held in a lightweight "snapshot" object for the
 *    duration of one brief generation call — no global state.
 *
 * 2. Intelligence / Scoring
 *    Four deterministic scoring functions operate on the snapshot:
 *      momentumScore  — how much is this entity moving right now?
 *      alignmentScore — how well does it match the user profile?
 *      proximityScore — how close is the user to this entity in
 *                       the membership/social graph?
 *      scarcityScore  — is this early/underexposed but rising?
 *    A fifth composite function:
 *      combinationScore — weighted blend + intersection criteria
 *    All scores are normalized 0-1 within their candidate set.
 *
 * 3. Explanation Payloads
 *    Every ReportItem gets a why_key via explainability.registerWhy().
 *    Payloads include: factors[], keywords[], paths[], signals{}, scores{}.
 *    Opaque by default; the UI can call getWhy(why_key) on demand.
 *
 * 4. Brief Assembly
 *    generateDailyBrief() returns a structured Brief object with
 *    five sections. Each section can be consumed independently by
 *    future Explorer/Report UI without re-fetching.
 *
 * HOW TO EXTEND
 * -------------
 * - Add new signal tables: extend fetchCoreGraph() and pass data
 *   through to the scoring functions.
 * - Add new sections: create a buildXxx(ctx) function that returns
 *   ReportItem[] and add it to sections{} in generateDailyBrief().
 * - Wire UI: import generateDailyBrief and consume brief.sections.
 *   The why_key on each item enables lazy explanation loading.
 *
 * ================================================================
 */

import {
  registerWhy,
  getWhy,          // re-exported so callers don't need two imports
} from './explainability.js';

import {
  getJourneySnapshot,
} from './journeyStore.js';

// ================================================================
// INTERNAL TESTS (lightweight — run once on module load in debug)
// ================================================================

function _runSelfTests(debug) {
  if (!debug) return;
  // 1. Deterministic hash stability
  const h1 = _stableHash('hello-world-123');
  const h2 = _stableHash('hello-world-123');
  console.assert(h1 === h2, '[IE] hash is not stable');

  // 2. Tokenizer consistency
  const t1 = _tokenize('React.js, Node, GraphQL!');
  const t2 = _tokenize('react.js, node, graphql!');
  console.assert(JSON.stringify(t1) === JSON.stringify(t2), '[IE] tokenizer not consistent');
  console.assert(t1.includes('react'), '[IE] tokenizer failed on "react"');

  // 3. Normalization handles empty arrays
  const normed = _normalize([], x => x);
  console.assert(Array.isArray(normed) && normed.length === 0, '[IE] normalize failed on empty');

  console.log('[IE] Self-tests passed');
}

// ================================================================
// UTILITIES
// ================================================================

/** djb2 hash → stable short alphanumeric string */
function _stableHash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
    h >>>= 0;
  }
  return h.toString(36);
}

/** Generate a deterministic ReportItem id */
function _itemId(category, ...parts) {
  return `${category}_${_stableHash(parts.join('|'))}`;
}

const _STOPWORDS = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of','with',
  'by','from','is','are','was','were','be','been','being','have','has',
  'had','do','does','did','will','would','could','should','may','might',
  'this','that','these','those','it','its','we','our','they','their',
  'you','your','i','my','me','us','him','her','his','she','he',
  'not','no','so','as','if','up','out','about','into','through','during',
  'before','after','above','below','between','each','more','other','than',
  'then','also','just','very','too','can','need','new','old','all','any',
]);

/**
 * Tokenize a string into lowercased, de-punctuated, stopword-filtered tokens.
 * Handles arrays by joining first.
 */
function _tokenize(input) {
  if (!input) return [];
  const str = Array.isArray(input) ? input.join(' ') : String(input);
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map(t => t.trim())
    .filter(t => t.length > 1 && !_STOPWORDS.has(t));
}

/**
 * Compute token overlap score (Jaccard-style) between two token sets.
 * Returns 0-1.
 */
function _tokenOverlap(tokensA, tokensB) {
  if (!tokensA.length || !tokensB.length) return 0;
  const a = new Set(tokensA);
  const b = new Set(tokensB);
  let inter = 0;
  for (const t of a) { if (b.has(t)) inter++; }
  const union = new Set([...a, ...b]).size;
  return union > 0 ? inter / union : 0;
}

/**
 * Min-max normalize an array of objects using a value getter.
 * Returns new array with .normalizedScore appended.
 * Handles empty array and all-same-value arrays safely.
 */
function _normalize(arr, getter) {
  if (!arr || arr.length === 0) return [];
  const vals = arr.map(getter);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min;
  return arr.map((item, i) => ({
    ...item,
    normalizedScore: range > 0 ? (vals[i] - min) / range : 0.5,
  }));
}

/** Clamp value to [0, 1] */
function _clamp01(v) {
  return Math.max(0, Math.min(1, isFinite(v) ? v : 0));
}

/** Days since an ISO date string */
function _daysSince(isoStr, now) {
  if (!isoStr) return 9999;
  const ms = now - new Date(isoStr).getTime();
  return Math.max(0, ms / 86400000);
}

/** Truncate string to maxLen characters */
function _trunc(str, maxLen = 80) {
  if (!str) return '';
  return str.length > maxLen ? str.slice(0, maxLen - 1) + '…' : str;
}

// ================================================================
// AVAILABILITY MAPPING
// ================================================================

/**
 * Map free-text availability into coarse buckets.
 * @returns {'open'|'limited'|'weekends'|'unknown'}
 */
function _mapAvailability(text) {
  if (!text) return 'unknown';
  const t = text.toLowerCase();
  if (/full.?time|open|available|actively|looking/.test(t)) return 'open';
  if (/part.?time|limited|few hours|flexible|some time/.test(t)) return 'limited';
  if (/weekend|evenings|nights|after hours/.test(t)) return 'weekends';
  return 'unknown';
}

/**
 * Does a user availability bucket match an opportunity commitment type?
 * Returns 0-1 compatibility.
 */
function _availabilityMatch(userBucket, commitmentText) {
  if (!commitmentText || userBucket === 'unknown') return 0.5; // neutral
  const c = commitmentText.toLowerCase();
  if (userBucket === 'open') return 1;  // open users fit any role
  if (userBucket === 'limited') {
    if (/advisor|project|part.?time|contract|freelance/.test(c)) return 0.9;
    if (/full.?time|40\s*h/.test(c)) return 0.3;
    return 0.6;
  }
  if (userBucket === 'weekends') {
    if (/advisor|volunteer|project|side/.test(c)) return 0.8;
    if (/full.?time/.test(c)) return 0.2;
    return 0.5;
  }
  return 0.5;
}

// ================================================================
// SCORING FUNCTIONS
// ================================================================

/**
 * A) momentumScore — how much activity/engagement is this entity seeing?
 *
 * Signals used:
 *   - Recency of updated_at / created_at / last_activity_at
 *   - activity_log hit counts for the entity in the window
 *   - Engagement proxies:
 *       projects:      view_count, upvote_count, bid_count
 *       orgs:          follower_count, opportunity_count
 *       opportunities: view_count, application_count
 *       themes:        activity_score, active_count
 *
 * @param {Object} entity   — any entity object
 * @param {Object} ctx      — { now, windowDays, activityHitMap }
 * @returns {number}        — raw score (will be normalized later)
 */
function _rawMomentum(entity, ctx) {
  const { now, windowDays = 14, activityHitMap = {} } = ctx;
  let score = 0;

  // Recency (exponential decay, half-life = windowDays/2 days)
  const refDate = entity.updated_at || entity.last_activity_at || entity.created_at || entity.last_seen_at;
  if (refDate) {
    const days = _daysSince(refDate, now);
    const halfLife = windowDays / 2;
    score += Math.exp(-days / halfLife);    // 1.0 at age=0, ~0.5 at halfLife
  }

  // Activity log hits (in-window)
  const hits = activityHitMap[entity.id] || 0;
  score += Math.log1p(hits) * 0.5;         // log-scale: 0 hits=0, 10 hits≈1.2, 100 hits≈2.3

  // Engagement proxies (normalized by cap values to keep in reasonable range)
  score += Math.log1p(entity.view_count        || 0) * 0.15;
  score += Math.log1p(entity.upvote_count      || 0) * 0.20;
  score += Math.log1p(entity.bid_count         || 0) * 0.20;
  score += Math.log1p(entity.follower_count    || 0) * 0.15;
  score += Math.log1p(entity.opportunity_count || 0) * 0.10;
  score += Math.log1p(entity.application_count || 0) * 0.20;
  score += _clamp01((entity.activity_score     || 0) / 100) * 0.30;
  score += Math.log1p(entity.active_count      || 0) * 0.15;

  return score;
}

/**
 * B) alignmentScore — how well does an entity match the user's profile?
 *
 * Signals used:
 *   - user interests[], parsed tokens from skills text + role + bio
 *   - entity title/description/tags/required_skills/industry/theme tags
 *   - availability compatibility (for opportunities)
 *
 * @param {Object} userProfile   — community row
 * @param {Object} entity        — any entity
 * @returns {number}             — 0 to 1
 */
function _alignmentScore(userProfile, entity) {
  if (!userProfile) return 0;

  // Build user token set
  const userTokens = _tokenize([
    ...(userProfile.interests || []),
    userProfile.skills || '',
    userProfile.role   || '',
    userProfile.bio    || '',
  ].join(' '));

  // Build entity token set
  const entityTokens = _tokenize([
    entity.title        || entity.name || '',
    entity.description  || '',
    ...(entity.tags            || []),
    ...(entity.required_skills || []),
    entity.industry     || '',
    entity.theme        || '',
    entity.category     || '',
  ].join(' '));

  if (userTokens.length === 0 || entityTokens.length === 0) return 0;

  // Base overlap score
  let alignment = _tokenOverlap(userTokens, entityTokens);

  // Bonus: exact required_skills matches (higher weight)
  if (Array.isArray(entity.required_skills) && entity.required_skills.length > 0) {
    const userSkillTokens = _tokenize(userProfile.skills || '');
    const reqTokens = _tokenize(entity.required_skills.join(' '));
    const skillOverlap = _tokenOverlap(userSkillTokens, reqTokens);
    alignment = alignment * 0.6 + skillOverlap * 0.4;
  }

  // Availability compatibility for opportunities
  if (entity.commitment || entity.type === 'opportunity') {
    const bucket = _mapAvailability(userProfile.availability || '');
    const avMatch = _availabilityMatch(bucket, entity.commitment || '');
    alignment = alignment * 0.75 + avMatch * 0.25;
  }

  return _clamp01(alignment);
}

/**
 * C) proximityScore — how close is the user to this entity in the graph?
 *
 * Signals used:
 *   - Direct membership: project_members, organization_members, theme_participants
 *   - 1-hop social: connections -> member of project/org/theme
 *
 * @param {string} communityId     — user's community.id
 * @param {Object} entity          — entity with .id
 * @param {string} entityType      — 'project'|'org'|'theme'|'opportunity'
 * @param {Object} memberships     — prebuilt maps from buildMembershipMaps()
 * @returns {number}               — 0 to 1
 */
function _proximityScore(communityId, entity, entityType, memberships) {
  if (!communityId || !entity?.id || !memberships) return 0;

  const {
    connectedCommunityIds,   // Set<communityId>
    projectMemberIds,        // Map<projectId, Set<userId>>
    orgMemberIds,            // Map<orgId, Set<communityId>>
    themeMemberIds,          // Map<themeId, Set<communityId>>
    userProjectIds,          // Set<projectId> — direct membership
    userOrgIds,              // Set<orgId>
    userThemeIds,            // Set<themeId>
  } = memberships;

  let score = 0;

  if (entityType === 'project') {
    // Direct member
    if (userProjectIds.has(String(entity.id))) return 1;
    // 1-hop: connected person is member
    const members = projectMemberIds.get(String(entity.id)) || new Set();
    for (const cid of connectedCommunityIds) {
      if (members.has(cid)) { score = Math.max(score, 0.6); break; }
    }
    // Shared theme
    if (entity.theme_id && userThemeIds.has(String(entity.theme_id))) score = Math.max(score, 0.4);
  } else if (entityType === 'org') {
    if (userOrgIds.has(String(entity.id))) return 1;
    const members = orgMemberIds.get(String(entity.id)) || new Set();
    for (const cid of connectedCommunityIds) {
      if (members.has(cid)) { score = Math.max(score, 0.6); break; }
    }
  } else if (entityType === 'theme') {
    if (userThemeIds.has(String(entity.id))) return 1;
    const members = themeMemberIds.get(String(entity.id)) || new Set();
    for (const cid of connectedCommunityIds) {
      if (members.has(cid)) { score = Math.max(score, 0.5); break; }
    }
  } else if (entityType === 'opportunity') {
    // Proximity via org or theme
    if (entity.organization_id && userOrgIds.has(String(entity.organization_id))) {
      score = Math.max(score, 0.7);
    }
    if (entity.theme_id && userThemeIds.has(String(entity.theme_id))) {
      score = Math.max(score, 0.5);
    }
    // 1-hop org members
    if (entity.organization_id) {
      const orgMembers = orgMemberIds.get(String(entity.organization_id)) || new Set();
      for (const cid of connectedCommunityIds) {
        if (orgMembers.has(cid)) { score = Math.max(score, 0.4); break; }
      }
    }
  }

  return _clamp01(score);
}

/**
 * D) scarcityScore — is this entity early/underexposed but moving?
 *
 * High scarcity = low engagement proxies + high momentum signal.
 * This identifies items worth acting on before they're crowded.
 *
 * @param {Object} entity
 * @param {number} momentum  — already computed raw momentum
 * @returns {number}         — 0 to 1
 */
function _scarcityScore(entity, momentum) {
  const engagement = Math.log1p(
    (entity.view_count        || 0) +
    (entity.application_count || 0) +
    (entity.follower_count    || 0) +
    (entity.bid_count         || 0) +
    (entity.upvote_count      || 0)
  );

  // Low engagement cap: treat engagement > 6 (~400 total) as not scarce
  const engagementFraction = _clamp01(engagement / 6);
  const scarcityBase = 1 - engagementFraction;       // inverse of exposure

  // Only meaningful if entity has some momentum (it's moving)
  const momentumBonus = _clamp01(momentum * 0.3);

  return _clamp01(scarcityBase * 0.7 + momentumBonus * 0.3);
}

/**
 * E) combinationScore — composite score for candidate items.
 *
 * Weights:
 *   alignment  0.35
 *   momentum   0.25
 *   proximity  0.20
 *   scarcity   0.20
 *
 * Additionally checks intersection criteria: candidate must intersect
 * with at least 2 user-intent signals to be included in top combos.
 * If not, confidence is reduced.
 *
 * @param {Object} opts
 * @returns {{ score, confidence, intersectionCount }}
 */
function _combinationScore({ alignment, momentum, proximity, scarcity, intersectionCount = 0 }) {
  const score = _clamp01(
    alignment  * 0.35 +
    momentum   * 0.25 +
    proximity  * 0.20 +
    scarcity   * 0.20
  );

  // Intersection gate: need ≥2 intent signals for high confidence
  let confidence;
  if (intersectionCount >= 2) {
    confidence = _clamp01(0.5 + score * 0.5);
  } else if (intersectionCount === 1) {
    confidence = _clamp01(0.3 + score * 0.4);
  } else {
    confidence = _clamp01(0.15 + score * 0.25);
  }

  return { score, confidence, intersectionCount };
}

// ================================================================
// MEMBERSHIP MAP BUILDER
// ================================================================

/**
 * Build efficient lookup maps from raw membership tables.
 * Call once per brief generation and pass ctx to scoring functions.
 * This avoids O(n²) scans per entity.
 */
function _buildMembershipMaps({ communityId, connections, projectMembers, orgMembers, themeParticipants }) {
  // Connected community ids (accepted connections, both directions)
  const connectedCommunityIds = new Set();
  for (const c of (connections || [])) {
    if (c.from_user_id === communityId) connectedCommunityIds.add(String(c.to_user_id));
    if (c.to_user_id   === communityId) connectedCommunityIds.add(String(c.from_user_id));
  }

  // projectId -> Set<community_id> of members
  const projectMemberIds = new Map();
  for (const pm of (projectMembers || [])) {
    const key = String(pm.project_id);
    if (!projectMemberIds.has(key)) projectMemberIds.set(key, new Set());
    projectMemberIds.get(key).add(String(pm.user_id));
  }

  // orgId -> Set<community_id> of members
  const orgMemberIds = new Map();
  for (const om of (orgMembers || [])) {
    const key = String(om.organization_id);
    if (!orgMemberIds.has(key)) orgMemberIds.set(key, new Set());
    orgMemberIds.get(key).add(String(om.community_id));
  }

  // themeId -> Set<community_id> of participants
  const themeMemberIds = new Map();
  for (const tp of (themeParticipants || [])) {
    const key = String(tp.theme_id);
    if (!themeMemberIds.has(key)) themeMemberIds.set(key, new Set());
    themeMemberIds.get(key).add(String(tp.community_id));
  }

  // User's direct memberships
  const userProjectIds = new Set(
    (projectMembers || [])
      .filter(pm => String(pm.user_id) === String(communityId))
      .map(pm => String(pm.project_id))
  );
  const userOrgIds = new Set(
    (orgMembers || [])
      .filter(om => String(om.community_id) === String(communityId))
      .map(om => String(om.organization_id))
  );
  const userThemeIds = new Set(
    (themeParticipants || [])
      .filter(tp => String(tp.community_id) === String(communityId))
      .map(tp => String(tp.theme_id))
  );

  return {
    connectedCommunityIds,
    projectMemberIds,
    orgMemberIds,
    themeMemberIds,
    userProjectIds,
    userOrgIds,
    userThemeIds,
  };
}

// ================================================================
// ACTIVITY LOG HIT MAP
// ================================================================

/**
 * Build a map of entity_id -> hit count from activity_log rows.
 * Only counts rows where project_id or a target field is present.
 */
function _buildActivityHitMap(activityLog = []) {
  const map = {};
  for (const row of activityLog) {
    const ids = [
      row.project_id,
      row.community_user_id,
    ].filter(Boolean);
    for (const id of ids) {
      const key = String(id);
      map[key] = (map[key] || 0) + 1;
    }
  }
  return map;
}

// ================================================================
// PRESENCE PROCESSING
// ================================================================

/**
 * Compute network awake score and per-user active map.
 * @param {Object[]} presenceSessions
 * @param {Date}     now
 * @returns {{ networkAwakeScore, activeUserIds: Set<string> }}
 */
function _processPresence(presenceSessions, now) {
  if (!presenceSessions || presenceSessions.length === 0) {
    return { networkAwakeScore: 0, activeUserIds: new Set() };
  }

  const tenMinAgo = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
  let active = 0;
  const activeUserIds = new Set();

  for (const s of presenceSessions) {
    const isActive = s.is_active === true || (s.last_seen && s.last_seen >= tenMinAgo);
    if (isActive) {
      active++;
      if (s.user_id) activeUserIds.add(String(s.user_id));
    }
  }

  const networkAwakeScore = presenceSessions.length > 0 ? active / presenceSessions.length : 0;
  return { networkAwakeScore, activeUserIds };
}

// ================================================================
// DATA FETCHING LAYER
// ================================================================

/**
 * Fetch the community profile for the authenticated user.
 */
async function _fetchUserProfileByAuthId(supabase, userAuthId) {
  const { data, error } = await supabase
    .from('community')
    .select('id, user_id, name, role, availability, interests, skills, bio, last_seen_at, updated_at, connection_count')
    .eq('user_id', userAuthId)
    .maybeSingle();

  if (error) throw new Error(`fetchUserProfile: ${error.message}`);
  return data;
}

/**
 * Fetch the full graph snapshot in parallel batches.
 * Returns a raw data object.  All queries are read-only.
 */
async function _fetchCoreGraph(supabase, { communityId, windowDays, now, debug }) {
  const cutoffDate = new Date(now.getTime() - windowDays * 86400000).toISOString();
  const usedSources = [];

  // Helper: safe fetch with error logging
  async function _safe(label, queryFn) {
    try {
      const { data, error } = await queryFn();
      if (error) {
        if (debug) console.warn(`[IE] ${label} query error:`, error.message);
        return [];
      }
      usedSources.push(label);
      return data || [];
    } catch (err) {
      if (debug) console.warn(`[IE] ${label} threw:`, err.message);
      return [];
    }
  }

  // Run in parallel batches (independent queries)
  const [
    connections,
    projects,
    organizations,
    themeCircles,
    projectMembers,
    orgMembers,
    themeParticipants,
    activityLog,
    dailySuggestions,
    presenceSessions,
    community,
  ] = await Promise.all([
    _safe('connections', () => supabase
      .from('connections')
      .select('from_user_id, to_user_id, status, created_at')
      .or(`from_user_id.eq.${communityId},to_user_id.eq.${communityId}`)
      .eq('status', 'accepted')
      .limit(500)
    ),
    _safe('projects', () => supabase
      .from('projects')
      .select('id, title, description, tags, required_skills, status, view_count, upvote_count, bid_count, created_at, updated_at, theme_id, creator_id')
      .limit(300)
    ),
    _safe('organizations', () => supabase
      .from('organizations')
      .select('id, name, description, industry, follower_count, opportunity_count, created_at, updated_at')
      .limit(200)
    ),
    _safe('active_themes_summary', async () => {
      const r = await supabase
        .from('active_themes_summary')
        .select('id, title, description, tags, activity_score, active_count, last_activity_at')
        .limit(50);
      if (r.error) {
        // Fallback to theme_circles
        return await supabase
          .from('theme_circles')
          .select('id, title, description, tags, activity_score, last_activity_at, expires_at, origin_type, status')
          .eq('status', 'active')
          .order('activity_score', { ascending: false })
          .limit(50);
      }
      return r;
    }),
    _safe('project_members', () => supabase
      .from('project_members')
      .select('project_id, user_id, role, joined_at')
      .is('left_at', null)
      .limit(1000)
    ),
    _safe('organization_members', () => supabase
      .from('organization_members')
      .select('organization_id, community_id, role, joined_at')
      .limit(1000)
    ),
    _safe('theme_participants', () => supabase
      .from('theme_participants')
      .select('theme_id, community_id, last_seen_at')
      .limit(1000)
    ),
    _safe('activity_log', () => supabase
      .from('activity_log')
      .select('action_type, created_at, project_id, community_user_id, auth_user_id')
      .gte('created_at', cutoffDate)
      .order('created_at', { ascending: false })
      .limit(1000)
    ),
    _safe('daily_suggestions', () => supabase
      .from('daily_suggestions')
      .select('id, score, why, target_id, suggestion_type, source, created_at')
      .eq('source', communityId)
      .gte('created_at', new Date(now.getTime() - 7 * 86400000).toISOString())
      .order('score', { ascending: false })
      .limit(50)
    ),
    _safe('presence_sessions', () => supabase
      .from('presence_sessions')
      .select('user_id, is_active, last_seen')
      .limit(500)
    ),
    _safe('community', () => supabase
      .from('community')
      .select('id, user_id, name, interests, skills, role, availability, bio, last_seen_at, updated_at, connection_count')
      .limit(500)
    ),
  ]);

  // Opportunities: prefer opportunities_with_org view
  let opportunities = [];
  try {
    const { data: owoData, error: owoErr } = await supabase
      .from('opportunities_with_org')
      .select('id, title, description, required_skills, commitment, status, expires_at, view_count, application_count, created_at, updated_at, organization_id, theme_id, organization_name, industry')
      .eq('status', 'open')
      .or(`expires_at.is.null,expires_at.gt.${now.toISOString()}`)
      .limit(200);

    if (owoErr) throw new Error(owoErr.message);
    opportunities = owoData || [];
    usedSources.push('opportunities_with_org');
  } catch {
    // Fallback to base opportunities table
    try {
      const { data: oppData, error: oppErr } = await supabase
        .from('opportunities')
        .select('id, title, description, required_skills, commitment, status, expires_at, view_count, application_count, created_at, updated_at, organization_id, theme_id')
        .eq('status', 'open')
        .or(`expires_at.is.null,expires_at.gt.${now.toISOString()}`)
        .limit(200);
      if (!oppErr) {
        opportunities = oppData || [];
        usedSources.push('opportunities');
      }
    } catch { /* proceed without opportunities */ }
  }

  return {
    connections,
    projects,
    organizations,
    themeCircles,  // already a mix of active_themes_summary + fallback
    projectMembers,
    orgMembers,
    themeParticipants,
    activityLog,
    dailySuggestions,
    presenceSessions,
    opportunities,
    community,
    usedSources,
  };
}

// ================================================================
// SECTION BUILDERS
// ================================================================

/**
 * 1) signals_moving — what is moving in the network right now?
 */
function _buildSignalsMoving({ themeCircles, projects, opportunities, activityHitMap, now, windowDays, maxItems, userProfile }) {
  const candidates = [];
  const momentumCtx = { now, windowDays, activityHitMap };

  // Hot themes
  for (const t of themeCircles) {
    const raw = _rawMomentum(t, momentumCtx);
    candidates.push({ entity: t, entityType: 'theme', raw, source: 'theme' });
  }

  // Recently active projects
  for (const p of projects) {
    if (!p.title) continue;
    const raw = _rawMomentum(p, momentumCtx);
    candidates.push({ entity: p, entityType: 'project', raw, source: 'project' });
  }

  // Newly updated opportunities
  for (const o of opportunities) {
    const raw = _rawMomentum(o, momentumCtx);
    candidates.push({ entity: o, entityType: 'opportunity', raw, source: 'opportunity' });
  }

  if (candidates.length === 0) return [];

  // Normalize momentum
  const normed = _normalize(candidates, c => c.raw);

  // Sort by normalized momentum, take top N
  const sorted = normed
    .sort((a, b) => b.normalizedScore - a.normalizedScore)
    .slice(0, maxItems);

  return sorted.map(c => {
    const { entity, entityType, normalizedScore } = c;
    const label = entity.title || entity.name || 'Untitled';

    const alignment = userProfile ? _alignmentScore(userProfile, entity) : 0;

    const factors = [
      `High network activity for "${_trunc(label, 40)}"`,
      `Type: ${entityType}`,
    ];
    if (activityHitMap[entity.id]) {
      factors.push(`${activityHitMap[entity.id]} activity events in last ${windowDays} days`);
    }
    if (entity.activity_score) {
      factors.push(`Activity score: ${entity.activity_score}`);
    }

    const why_key = registerWhy({
      label: 'signal',
      factors,
      keywords: _tokenize(label).slice(0, 5),
      signals: {
        momentum: normalizedScore,
        activityHits: activityHitMap[entity.id] || 0,
        activity_score: entity.activity_score || null,
      },
      scores: { momentum: normalizedScore, alignment },
    });

    const typeLabel = { theme: 'Theme', project: 'Project', opportunity: 'Opportunity' }[entityType] || entityType;
    return {
      id: _itemId('signal', entityType, String(entity.id)),
      category: 'signal',
      headline: `${typeLabel} gaining momentum: "${_trunc(label, 55)}"`,
      subhead: _trunc(entity.description, 80) || undefined,
      confidence: _clamp01(0.5 + normalizedScore * 0.45),
      score: normalizedScore,
      primary_refs: [{ nodeType: entityType, nodeId: String(entity.id), label }],
      why_key,
      created_at: new Date().toISOString(),
    };
  });
}

/**
 * 2) your_pattern — what patterns is the user exhibiting locally?
 */
function _buildYourPattern({ journey, maxItems, now }) {
  if (!journey.hasHistory) {
    // No journey data — still produce a system-level observation
    return [{
      id: _itemId('pattern', 'no_history'),
      category: 'pattern',
      headline: 'Your activity pattern will appear here as you explore the network.',
      subhead: 'Visit projects, themes, and opportunities to build your profile.',
      confidence: 0.3,
      score: 0.3,
      primary_refs: [],
      why_key: registerWhy({
        label: 'pattern',
        factors: ['No local journey history yet'],
        keywords: [],
        signals: { hasHistory: false },
        scores: {},
      }),
      created_at: new Date().toISOString(),
    }];
  }

  const items = [];

  // 1. Most visited node types
  if (journey.topNodeTypes.length > 0) {
    const top = journey.topNodeTypes[0];
    const why_key = registerWhy({
      label: 'pattern',
      factors: [`You've visited ${top.count} ${top.nodeType} nodes recently`],
      keywords: [top.nodeType],
      signals: { topNodeType: top.nodeType, count: top.count },
      scores: {},
    });
    items.push({
      id: _itemId('pattern', 'top_type', top.nodeType),
      category: 'pattern',
      headline: `You're consistently drawn to ${top.nodeType}s — ${top.count} visits in your recent window.`,
      confidence: 0.65,
      score: _clamp01(top.count / 20),
      primary_refs: [],
      why_key,
      created_at: new Date().toISOString(),
    });
  }

  // 2. Repeated nodes (strong intent signal)
  if (journey.repeatedNodes.length > 0) {
    const top = journey.repeatedNodes[0];
    const why_key = registerWhy({
      label: 'pattern',
      factors: [`You've revisited node "${top.nodeId}" ${top.count} times — strong intent signal`],
      keywords: [top.nodeType],
      signals: { nodeId: top.nodeId, count: top.count },
      scores: {},
    });
    items.push({
      id: _itemId('pattern', 'repeated', top.nodeId),
      category: 'pattern',
      headline: `You've returned to the same ${top.nodeType} ${top.count} times — a strong signal of interest.`,
      confidence: 0.7,
      score: _clamp01(top.count / 10),
      primary_refs: [{ nodeType: top.nodeType, nodeId: top.nodeId }],
      why_key,
      created_at: new Date().toISOString(),
    });
  }

  // 3. Activity shift
  for (const shift of journey.shifts.slice(0, 1)) {
    const direction = shift.direction === 'up' ? 'increasing' : 'decreasing';
    const why_key = registerWhy({
      label: 'pattern',
      factors: [`${shift.nodeType} engagement is ${direction}`, `Recent: ${shift.recentCount} vs Prior: ${shift.priorCount}`],
      keywords: [shift.nodeType],
      signals: shift,
      scores: {},
    });
    items.push({
      id: _itemId('pattern', 'shift', shift.nodeType, shift.direction),
      category: 'pattern',
      headline: `Your interest in ${shift.nodeType}s is ${direction} — ${shift.recentCount} recent vs ${shift.priorCount} prior visits.`,
      confidence: 0.6,
      score: 0.55,
      primary_refs: [],
      why_key,
      created_at: new Date().toISOString(),
    });
  }

  // 4. Saved nodes summary
  if (journey.savedRecent.length > 0) {
    const why_key = registerWhy({
      label: 'pattern',
      factors: [`You've saved ${journey.savedRecent.length} items recently`],
      keywords: [],
      signals: { savedCount: journey.savedRecent.length },
      scores: {},
    });
    items.push({
      id: _itemId('pattern', 'saved_count', String(journey.savedRecent.length)),
      category: 'pattern',
      headline: `You've bookmarked ${journey.savedRecent.length} item${journey.savedRecent.length > 1 ? 's' : ''} in this window — the engine is watching those clusters.`,
      confidence: 0.6,
      score: _clamp01(journey.savedRecent.length / 10),
      primary_refs: [],
      why_key,
      created_at: new Date().toISOString(),
    });
  }

  return items.slice(0, maxItems);
}

/**
 * 3) combination_opportunities — intersection insights (the key section)
 *
 * Finds combinations of (theme + opportunity/project + proximity)
 * that create unique decision-support value.
 */
function _buildCombinationOpportunities({
  userProfile,
  journey,
  themeCircles,
  projects,
  opportunities,
  dailySuggestions,
  memberships,
  activityHitMap,
  now,
  windowDays,
  maxItems,
}) {
  if (!userProfile) return [];

  const momentumCtx = { now, windowDays, activityHitMap };

  // Build intent signal set for intersection check
  const { savedIds, dismissedIds, repeatedNodes, visitedThemeIds } = journey;
  const dailySuggestionTargetIds = new Set((dailySuggestions || []).map(s => String(s.target_id)));

  // Candidate items: primarily opportunities, secondarily projects
  const candidates = [
    ...opportunities.map(o => ({ entity: o, entityType: 'opportunity' })),
    ...projects.filter(p => p.status !== 'archived').map(p => ({ entity: p, entityType: 'project' })),
  ];

  if (candidates.length === 0) {
    // No candidates — generate a theme-based combination
    if (themeCircles.length >= 2) {
      const [t1, t2] = themeCircles;
      const why_key = registerWhy({
        label: 'combo',
        factors: ['Two active themes share conceptual overlap', 'No opportunities loaded yet'],
        keywords: [..._tokenize(t1.title || ''), ..._tokenize(t2.title || '')].slice(0, 6),
        paths: [`theme:${t1.id} ↔ theme:${t2.id}`],
        signals: { t1_activity: t1.activity_score, t2_activity: t2.activity_score },
        scores: {},
      });
      return [{
        id: _itemId('combo', 'themes', t1.id, t2.id),
        category: 'combo',
        headline: `Two active themes — "${_trunc(t1.title, 35)}" and "${_trunc(t2.title, 35)}" — are converging.`,
        subhead: 'Explore the overlap for emerging opportunity.',
        confidence: 0.45,
        score: 0.45,
        primary_refs: [
          { nodeType: 'theme', nodeId: String(t1.id), label: t1.title },
          { nodeType: 'theme', nodeId: String(t2.id), label: t2.title },
        ],
        why_key,
        created_at: new Date().toISOString(),
      }];
    }
    return [];
  }

  // Score each candidate
  const scored = candidates.map(({ entity, entityType }) => {
    const rawMomentum   = _rawMomentum(entity, momentumCtx);
    const alignment     = _alignmentScore(userProfile, entity);
    const proximity     = _proximityScore(userProfile.id, entity, entityType, memberships);
    const scarcity      = _scarcityScore(entity, rawMomentum);

    // Intersection count: how many user-intent signals does this candidate match?
    let intersectionCount = 0;
    const entityIdStr = String(entity.id);

    if (savedIds.has(entityIdStr)) intersectionCount++;
    if (repeatedNodes.some(n => n.nodeId === entityIdStr)) intersectionCount++;
    if (dailySuggestionTargetIds.has(entityIdStr)) intersectionCount++;
    if (entity.theme_id && visitedThemeIds.includes(String(entity.theme_id))) intersectionCount++;
    if (entity.theme_id && memberships.userThemeIds.has(String(entity.theme_id))) intersectionCount++;
    if (!dismissedIds.has(entityIdStr) && alignment > 0.5) intersectionCount++;

    const { score, confidence } = _combinationScore({
      alignment,
      momentum: _clamp01(rawMomentum / 5),  // normalize raw momentum loosely for input
      proximity,
      scarcity,
      intersectionCount,
    });

    // Find associated theme name
    const relatedTheme = entity.theme_id
      ? themeCircles.find(t => String(t.id) === String(entity.theme_id))
      : null;

    // Build proximity path
    const pathParts = [`user:${userProfile.id}`];
    if (proximity >= 0.9) pathParts.push('direct_member');
    else if (proximity >= 0.5) pathParts.push('connected_person', '→', 'member');
    else if (relatedTheme && memberships.userThemeIds.has(String(entity.theme_id))) {
      pathParts.push(`shared_theme:${relatedTheme.title}`);
    }
    pathParts.push(`${entityType}:${entity.id}`);

    return {
      entity,
      entityType,
      alignment,
      momentum: _clamp01(rawMomentum / 5),
      proximity,
      scarcity,
      score,
      confidence,
      intersectionCount,
      relatedTheme,
      pathStr: pathParts.join(' → '),
      matchedKeywords: _tokenize([
        ...(userProfile.interests || []),
        userProfile.skills || '',
      ].join(' ')).filter(t => _tokenize([
        entity.title || entity.name || '',
        entity.description || '',
        ...(entity.tags || []),
        ...(entity.required_skills || []),
      ].join(' ')).includes(t)).slice(0, 6),
    };
  });

  // Sort: prefer high confidence, then score, then intersectionCount
  const sorted = scored
    .filter(s => !dismissedIds.has(String(s.entity.id)))
    .sort((a, b) => {
      const credA = a.confidence * 0.6 + a.score * 0.4;
      const credB = b.confidence * 0.6 + b.score * 0.4;
      return credB - credA;
    })
    .slice(0, maxItems);

  return sorted.map(s => {
    const { entity, entityType, alignment, momentum, proximity, scarcity, score, confidence, relatedTheme, pathStr, matchedKeywords, intersectionCount } = s;
    const label = entity.title || entity.name || 'Untitled';
    const themeLabel = relatedTheme?.title || null;

    // Generate combination headline
    let headline;
    if (themeLabel && proximity >= 0.5) {
      headline = `A ${entityType} at the intersection of "${_trunc(themeLabel, 30)}" aligns with your tracked interests.`;
    } else if (s.intersectionCount >= 2) {
      headline = `Two signals you've been tracking converge on "${_trunc(label, 45)}".`;
    } else if (alignment > 0.6 && momentum > 0.5) {
      headline = `"${_trunc(label, 45)}" is gaining momentum and matches your profile.`;
    } else {
      headline = `A ${entityType} with strong alignment just entered your proximity network.`;
    }

    const factors = [
      `Alignment: ${Math.round(alignment * 100)}%`,
      `Momentum: ${Math.round(momentum * 100)}%`,
      `Proximity: ${Math.round(proximity * 100)}%`,
      `Scarcity: ${Math.round(scarcity * 100)}%`,
      `Intersection signals: ${intersectionCount}`,
    ];
    if (relatedTheme) factors.push(`Related theme: "${relatedTheme.title}"`);
    if (matchedKeywords.length) factors.push(`Matched keywords: ${matchedKeywords.join(', ')}`);

    const why_key = registerWhy({
      label: 'combo',
      factors,
      keywords: matchedKeywords,
      paths: [pathStr],
      signals: {
        activityHits: activityHitMap[entity.id] || 0,
        theme_activity_score: relatedTheme?.activity_score || null,
        intersectionCount,
      },
      scores: { alignment, momentum, proximity, scarcity, score, confidence },
    });

    const refs = [{ nodeType: entityType, nodeId: String(entity.id), label }];
    if (relatedTheme) refs.push({ nodeType: 'theme', nodeId: String(relatedTheme.id), label: relatedTheme.title });

    return {
      id: _itemId('combo', entityType, String(entity.id)),
      category: 'combo',
      headline,
      subhead: _trunc(entity.description, 80) || undefined,
      confidence,
      score,
      primary_refs: refs,
      why_key,
      created_at: new Date().toISOString(),
    };
  });
}

/**
 * 4) opportunities_for_you — top opportunities matching user profile.
 */
function _buildOpportunitiesForYou({ userProfile, opportunities, memberships, activityHitMap, now, windowDays, maxItems }) {
  if (!userProfile || opportunities.length === 0) return [];

  const momentumCtx = { now, windowDays, activityHitMap };

  const scored = opportunities.map(opp => {
    const rawMomentum = _rawMomentum(opp, momentumCtx);
    const alignment   = _alignmentScore(userProfile, opp);
    const proximity   = _proximityScore(userProfile.id, opp, 'opportunity', memberships);

    const score = _clamp01(alignment * 0.45 + _clamp01(rawMomentum / 5) * 0.30 + proximity * 0.25);

    const matchedKeywords = _tokenize([
      ...(userProfile.interests || []),
      userProfile.skills || '',
    ].join(' ')).filter(t => _tokenize([
      opp.title || '',
      opp.description || '',
      ...(opp.required_skills || []),
    ].join(' ')).includes(t)).slice(0, 5);

    const bucket = _mapAvailability(userProfile.availability || '');
    const avMatch = _availabilityMatch(bucket, opp.commitment || '');

    return { opp, alignment, proximity, rawMomentum, score, matchedKeywords, avMatch };
  });

  const sorted = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, maxItems);

  return sorted.map(({ opp, alignment, proximity, rawMomentum, score, matchedKeywords, avMatch }) => {
    const label = opp.title || 'Untitled Opportunity';
    const orgLabel = opp.organization_name || null;

    const factors = [
      `Alignment: ${Math.round(alignment * 100)}%`,
      `Proximity: ${Math.round(proximity * 100)}%`,
    ];
    if (matchedKeywords.length) factors.push(`Skills match: ${matchedKeywords.join(', ')}`);
    if (avMatch > 0.7) factors.push('Strong availability match');
    if (orgLabel) factors.push(`Organization: ${orgLabel}`);

    const why_key = registerWhy({
      label: 'opportunity',
      factors,
      keywords: matchedKeywords,
      paths: [],
      signals: { activityHits: activityHitMap[opp.id] || 0 },
      scores: { alignment, proximity, momentum: _clamp01(rawMomentum / 5), score },
    });

    const refs = [{ nodeType: 'opportunity', nodeId: String(opp.id), label }];
    if (orgLabel) refs.push({ nodeType: 'org', nodeId: String(opp.organization_id), label: orgLabel });

    return {
      id: _itemId('opportunity', String(opp.id)),
      category: 'opportunity',
      headline: `"${_trunc(label, 55)}" matches your skills and availability.`,
      subhead: orgLabel ? `via ${orgLabel}` : _trunc(opp.description, 70),
      confidence: _clamp01(0.4 + score * 0.55),
      score,
      primary_refs: refs,
      why_key,
      created_at: new Date().toISOString(),
    };
  });
}

/**
 * 5) blind_spots — high-momentum areas with low user engagement.
 */
function _buildBlindSpots({ userProfile, themeCircles, opportunities, journey, memberships, activityHitMap, now, windowDays, maxItems }) {
  const momentumCtx = { now, windowDays, activityHitMap };
  const { visitedThemeIds } = journey;
  const maxBlindSpots = Math.min(maxItems, 3);

  const candidates = [];

  // High-momentum themes the user hasn't visited
  for (const t of themeCircles) {
    if (visitedThemeIds.includes(String(t.id))) continue;
    if (memberships.userThemeIds.has(String(t.id))) continue;

    const rawMomentum = _rawMomentum(t, momentumCtx);
    const alignment   = userProfile ? _alignmentScore(userProfile, t) : 0;
    const momentum    = _clamp01(rawMomentum / 5);

    if (momentum < 0.3) continue;   // not moving enough to be a blind spot

    candidates.push({ entity: t, entityType: 'theme', momentum, alignment, score: momentum * 0.6 + alignment * 0.4 });
  }

  // Aligned opportunities with low proximity (expand network signal)
  for (const opp of opportunities) {
    const alignment = userProfile ? _alignmentScore(userProfile, opp) : 0;
    if (alignment < 0.35) continue;

    const proximity = _proximityScore(userProfile?.id, opp, 'opportunity', memberships);
    if (proximity > 0.4) continue;  // already in proximity — not a blind spot

    const rawMomentum = _rawMomentum(opp, momentumCtx);
    const momentum = _clamp01(rawMomentum / 5);

    candidates.push({
      entity: opp,
      entityType: 'opportunity',
      momentum,
      alignment,
      proximity,
      score: alignment * 0.5 + momentum * 0.3 + (1 - proximity) * 0.2,
    });
  }

  if (candidates.length === 0) return [];

  const normed = _normalize(candidates, c => c.score);
  const sorted = normed.sort((a, b) => b.normalizedScore - a.normalizedScore).slice(0, maxBlindSpots);

  return sorted.map(c => {
    const { entity, entityType, momentum, alignment, normalizedScore } = c;
    const label = entity.title || entity.name || 'Untitled';

    const factors = [
      `High momentum (${Math.round(momentum * 100)}%) but not in your current view`,
      entityType === 'theme' ? 'Theme not in your visit history' : 'Opportunity outside your current proximity',
    ];
    if (alignment > 0) factors.push(`Profile alignment: ${Math.round(alignment * 100)}%`);

    const why_key = registerWhy({
      label: 'blindspot',
      factors,
      keywords: _tokenize(label).slice(0, 5),
      paths: [],
      signals: { momentum, alignment, activityHits: activityHitMap[entity.id] || 0 },
      scores: { momentum, alignment, normalizedScore },
    });

    return {
      id: _itemId('blindspot', entityType, String(entity.id)),
      category: 'blindspot',
      headline: `A ${entityType} is gaining traction outside your current view: "${_trunc(label, 50)}".`,
      subhead: entityType === 'opportunity' ? 'Expanding your network could open this path.' : 'You haven\'t engaged with this theme yet.',
      confidence: _clamp01(0.4 + normalizedScore * 0.4),
      score: normalizedScore,
      primary_refs: [{ nodeType: entityType, nodeId: String(entity.id), label }],
      why_key,
      created_at: new Date().toISOString(),
    };
  });
}

// ================================================================
// MAIN ENTRY POINT
// ================================================================

/**
 * Generate the Daily Intelligence Brief for the current user.
 *
 * @param {Object} opts
 * @param {string}  opts.userAuthId   — supabase auth.uid()
 * @param {Date}    [opts.now]        — override current time (testing)
 * @param {number}  [opts.windowDays] — look-back window (default 14)
 * @param {number}  [opts.maxItems]   — max items per section (default 5)
 * @param {boolean} [opts.debug]      — enable verbose console logging
 * @returns {Promise<Brief>}
 */
export async function generateDailyBrief({
  userAuthId,
  now = new Date(),
  windowDays = 14,
  maxItems = 5,
  debug = false,
} = {}) {
  const t0 = Date.now();
  _runSelfTests(debug);

  const supabase = window.supabase;
  if (!supabase) throw new Error('[IE] window.supabase is not available');
  if (!userAuthId) throw new Error('[IE] userAuthId is required');

  if (debug) console.log('[IE] Fetching user profile…');
  const userProfile = await _fetchUserProfileByAuthId(supabase, userAuthId);
  if (!userProfile) throw new Error('[IE] No community profile found for this auth user');

  const communityId = userProfile.id;
  if (debug) console.log('[IE] Community id:', communityId);

  if (debug) console.log('[IE] Fetching core graph…');
  const graph = await _fetchCoreGraph(supabase, { communityId, windowDays, now, debug });

  // Build supporting data structures
  const memberships = _buildMembershipMaps({
    communityId,
    connections:       graph.connections,
    projectMembers:    graph.projectMembers,
    orgMembers:        graph.orgMembers,
    themeParticipants: graph.themeParticipants,
  });

  const activityHitMap = _buildActivityHitMap(graph.activityLog);
  const { networkAwakeScore, activeUserIds } = _processPresence(graph.presenceSessions, now);

  // Get local journey snapshot
  const journey = getJourneySnapshot({ days: windowDays });

  if (debug) {
    console.log('[IE] Graph stats:', {
      connections: graph.connections.length,
      projects: graph.projects.length,
      opportunities: graph.opportunities.length,
      themes: graph.themeCircles.length,
      activityLog: graph.activityLog.length,
      dailySuggestions: graph.dailySuggestions.length,
      presence: graph.presenceSessions.length,
      networkAwakeScore: networkAwakeScore.toFixed(2),
      journeyHasHistory: journey.hasHistory,
    });
  }

  const sectionCtx = {
    userProfile,
    journey,
    themeCircles:    graph.themeCircles,
    projects:        graph.projects,
    opportunities:   graph.opportunities,
    organizations:   graph.organizations,
    dailySuggestions: graph.dailySuggestions,
    memberships,
    activityHitMap,
    now,
    windowDays,
    maxItems,
  };

  // Build all sections
  const sections = {
    signals_moving:             _buildSignalsMoving(sectionCtx),
    your_pattern:               _buildYourPattern(sectionCtx),
    combination_opportunities:  _buildCombinationOpportunities(sectionCtx),
    opportunities_for_you:      _buildOpportunitiesForYou(sectionCtx),
    blind_spots:                _buildBlindSpots(sectionCtx),
  };

  const elapsed = Date.now() - t0;
  if (debug) {
    console.log(`[IE] Brief generated in ${elapsed}ms`);
    for (const [k, v] of Object.entries(sections)) {
      console.log(`  ${k}: ${v.length} items`);
    }
  }

  return {
    generated_at: now.toISOString(),
    user: {
      community_id:  userProfile.id,
      user_id:       userProfile.user_id,
      name:          userProfile.name,
      role:          userProfile.role,
      availability:  userProfile.availability,
      interests:     userProfile.interests,
      skills:        userProfile.skills,
    },
    meta: {
      windowDays,
      elapsed_ms: elapsed,
      networkAwakeScore,
      used_sources: graph.usedSources,
    },
    sections,
  };
}

// Re-export helpers that callers may need without extra imports
export { getWhy, registerWhy };
