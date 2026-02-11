# Supabase Cached Egress Analysis & Reduction Plan

**Date:** February 5, 2026  
**Current Status:** Exceeding 5 GB Free Plan Cached Egress  
**Goal:** Reduce egress by 50-70% through targeted fixes

---

## 🎯 Executive Summary

After analyzing the codebase, I've identified **5 major egress drivers** consuming your Supabase bandwidth. The primary culprits are:

1. **Full community table fetches** (1000 rows) on every page load
2. **Redundant synapse data reloads** triggered by realtime events
3. **Large connection queries** with joined profile data
4. **Presence heartbeat system** updating every 30 seconds
5. **Multiple overlapping data fetches** during initialization

**Estimated Current Monthly Egress:** ~8-12 GB  
**Target After Fixes:** ~2-4 GB (60-75% reduction)

---

## 📊 Top 5 Egress Drivers (Ranked by Impact)

### 1. 🔴 CRITICAL: Full Community Table Fetches (Est. 40% of egress)

**Location:** `assets/data.js`, `assets/js/synapse/data.js`

**Problem:**
```javascript
// Fetches 1000 rows with ALL columns on every page load
const res = await supabase.from('community').select('*').limit(1000);
```

**Impact:**
- **Payload size:** ~500 KB - 2 MB per request (depending on profile images, bios, skills)
- **Frequency:** Every page load + every synapse refresh
- **Total:** 2-4 MB per session × multiple sessions = **3-5 GB/month**

**Root Cause:**
- Using `select('*')` fetches unnecessary columns (bio, availability, interests, etc.)
- Fetching 1000 rows when most users only need 10-50 connections
- No client-side caching between page loads

**Fix:**
```javascript
// ✅ BEFORE: Fetches everything
const res = await supabase.from('community').select('*').limit(1000);

// ✅ AFTER: Fetch only needed columns
const res = await supabase
  .from('community')
  .select('id, name, image_url, skills, connection_count')
  .or('is_hidden.is.null,is_hidden.eq.false')
  .limit(100); // Reduce limit
```

**Expected Reduction:** 60-70% (from 2 MB → 600 KB per request)

---

### 2. 🔴 CRITICAL: Redundant Synapse Reloads (Est. 25% of egress)

**Location:** `assets/js/synapse/realtime.js`, `assets/js/synapse/core.js`

**Problem:**
```javascript
// Triggers FULL data reload on ANY connection/project change
channel
  .on("postgres_changes", { event: "*", table: "connections" }, scheduleRefresh)
  .on("postgres_changes", { event: "*", table: "project_members" }, scheduleRefresh)
```

**Impact:**
- **Payload size:** 1-3 MB per reload (full community + connections + projects)
- **Frequency:** Every connection request, project join, theme update
- **Total:** 10-20 reloads per active session = **2-3 GB/month**

**Root Cause:**
- Realtime events trigger full `loadSynapseData()` which refetches ALL data
- No incremental updates - always fetches entire dataset
- Debounce is only 500ms, doesn't prevent multiple reloads in a session

**Fix:**
```javascript
// ✅ BEFORE: Full reload on every change
setupSynapseRealtime(supabase, async () => {
  await reloadAllData(); // Fetches everything again
  await rebuildInterface();
});

// ✅ AFTER: Incremental updates only
setupSynapseRealtime(supabase, async (payload) => {
  // Only update the changed record, don't refetch everything
  await updateSingleNode(payload.new);
  await updateLinks(payload.new);
});

// Add longer debounce and session-based throttle
const RELOAD_COOLDOWN = 5 * 60 * 1000; // 5 minutes
let lastReload = 0;

function scheduleRefresh() {
  const now = Date.now();
  if (now - lastReload < RELOAD_COOLDOWN) {
    console.log('⏱️ Skipping reload (cooldown active)');
    return;
  }
  lastReload = now;
  // ... existing debounce logic
}
```

**Expected Reduction:** 80% (from 20 reloads → 4 reloads per session)

---

### 3. 🟡 HIGH: Large Connection Queries with Joins (Est. 15% of egress)

**Location:** `dashboard.js` (lines 299-308, 383-390)

**Problem:**
```javascript
// Fetches connections WITH full user profiles (including images, skills, bio)
const { data: connections } = await window.supabase
  .from('connections')
  .select(`
    *,
    from_user:community!connections_from_user_id_fkey(id, name, image_url, skills),
    to_user:community!connections_to_user_id_fkey(id, name, image_url, skills)
  `)
```

**Impact:**
- **Payload size:** 200-500 KB per query (includes full user objects)
- **Frequency:** 3-4 times per page load (recent connections, pending requests, suggestions)
- **Total:** 1-2 MB per session = **1-2 GB/month**

**Root Cause:**
- Joining full user profiles when only name + image needed
- Fetching skills array (can be large) when not displayed
- Multiple separate queries instead of one optimized query

**Fix:**
```javascript
// ✅ BEFORE: Fetches full profiles
from_user:community!connections_from_user_id_fkey(id, name, image_url, skills)

// ✅ AFTER: Fetch only displayed fields
from_user:community!connections_from_user_id_fkey(id, name, image_url)

// Better: Use a database view or RPC function
const { data } = await supabase.rpc('get_user_connections', {
  user_id: currentUserProfile.id,
  limit: 5
});
```

**Expected Reduction:** 50-60% (from 500 KB → 200 KB per query)

---

### 4. 🟡 MEDIUM: Presence Heartbeat System (Est. 10% of egress)

**Location:** `assets/js/presence-session-manager.js`

**Problem:**
```javascript
// Updates presence every 30 seconds
const HEARTBEAT_INTERVAL = 30000; // 30 seconds

setInterval(() => {
  updatePresenceSession(); // Writes to database
}, HEARTBEAT_INTERVAL);
```

**Impact:**
- **Payload size:** 1-2 KB per heartbeat (small but frequent)
- **Frequency:** 120 updates per hour per user
- **Total:** With 100 active users = **1 GB/month** (mostly writes, but triggers cached reads)

**Root Cause:**
- 30-second interval is too aggressive for presence tracking
- Updates even when user is idle
- No batching of presence updates

**Fix:**
```javascript
// ✅ BEFORE: 30 seconds
const HEARTBEAT_INTERVAL = 30000;

// ✅ AFTER: 5 minutes (10x reduction)
const HEARTBEAT_INTERVAL = 5 * 60 * 1000; // 5 minutes

// Add idle detection
let lastActivity = Date.now();
document.addEventListener('mousemove', () => lastActivity = Date.now());
document.addEventListener('keydown', () => lastActivity = Date.now());

function updatePresenceSession() {
  const idleTime = Date.now() - lastActivity;
  if (idleTime > 2 * 60 * 1000) { // 2 minutes idle
    console.log('⏸️ User idle, skipping presence update');
    return;
  }
  // ... existing update logic
}
```

**Expected Reduction:** 90% (from 120 updates/hour → 12 updates/hour)

---

### 5. 🟡 MEDIUM: Multiple Overlapping Fetches on Init (Est. 10% of egress)

**Location:** `dashboard.js`, `main.js`, `auth.js`

**Problem:**
```javascript
// Multiple modules fetch the same data independently
await Promise.all([
  loadCommunityStats(),      // Fetches connections, projects, endorsements
  loadRecentConnections(),   // Fetches connections again
  loadPendingRequests(),     // Fetches connections again
  loadSuggestedConnections(), // Fetches community table
  loadAllConnections()       // Fetches connections again
]);
```

**Impact:**
- **Payload size:** 500 KB - 1 MB total (duplicate data)
- **Frequency:** Every page load
- **Total:** 1-2 sessions per day × 30 days = **0.5-1 GB/month**

**Root Cause:**
- No shared data cache between modules
- Each function makes its own Supabase query
- No request deduplication

**Fix:**
```javascript
// ✅ Create a shared data cache
const dataCache = {
  connections: null,
  community: null,
  lastFetch: {},
  CACHE_TTL: 5 * 60 * 1000 // 5 minutes
};

async function getCachedConnections() {
  const now = Date.now();
  if (dataCache.connections && (now - dataCache.lastFetch.connections < dataCache.CACHE_TTL)) {
    console.log('📦 Using cached connections');
    return dataCache.connections;
  }
  
  const { data } = await window.supabase
    .from('connections')
    .select('*')
    .or(`from_user_id.eq.${currentUserProfile.id},to_user_id.eq.${currentUserProfile.id}`);
  
  dataCache.connections = data;
  dataCache.lastFetch.connections = now;
  return data;
}

// Use cached data in all functions
async function loadRecentConnections() {
  const connections = await getCachedConnections();
  // Filter in memory instead of new query
  const recent = connections
    .filter(c => c.status === 'accepted')
    .slice(0, 5);
  // ... render
}
```

**Expected Reduction:** 70% (from 5 queries → 1 query with caching)

---

## 🚨 Additional Findings

### Image Loading Issues
- **Problem:** No image optimization or CDN
- **Impact:** If users upload large profile images (>500 KB), these are served repeatedly
- **Fix:** Add image resizing on upload or use Supabase image transformations
  ```javascript
  // Use Supabase image transformations
  const imageUrl = supabase.storage
    .from('avatars')
    .getPublicUrl(path, {
      transform: {
        width: 200,
        height: 200,
        resize: 'cover'
      }
    });
  ```

### No HTTP Caching Headers
- **Problem:** Supabase responses may not have optimal cache headers
- **Impact:** Browser refetches data that could be cached
- **Fix:** Use Supabase Edge Functions with custom cache headers for static data

---

## 📦 Implementation Plan

### Phase 1: Quick Wins (1-2 hours, 40% reduction)

1. **Reduce community table columns**
   - File: `assets/data.js`, `assets/js/synapse/data.js`
   - Change: `select('*')` → `select('id, name, image_url, skills, connection_count')`
   - Impact: 60% reduction in payload size

2. **Increase presence heartbeat interval**
   - File: `assets/js/presence-session-manager.js`
   - Change: `30000` → `300000` (5 minutes)
   - Impact: 90% reduction in presence updates

3. **Add reload cooldown to synapse**
   - File: `assets/js/synapse/realtime.js`
   - Change: Add 5-minute cooldown between full reloads
   - Impact: 50% reduction in synapse reloads

### Phase 2: Structural Fixes (4-6 hours, additional 30% reduction)

4. **Implement shared data cache**
   - File: Create `assets/js/data-cache.js`
   - Change: Centralize all data fetching with TTL cache
   - Impact: 70% reduction in duplicate queries

5. **Optimize connection queries**
   - File: `dashboard.js`
   - Change: Remove unnecessary joins, fetch only needed columns
   - Impact: 50% reduction in connection query size

6. **Implement incremental synapse updates**
   - File: `assets/js/synapse/realtime.js`
   - Change: Update single nodes instead of full reload
   - Impact: 80% reduction in realtime-triggered fetches

### Phase 3: Guardrails (2-3 hours)

7. **Add query size monitoring**
   ```javascript
   // Wrap Supabase client to log query sizes
   const originalFrom = supabase.from;
   supabase.from = function(table) {
     const query = originalFrom.call(this, table);
     const originalSelect = query.select;
     query.select = function(...args) {
       console.log(`📊 Query: ${table}.select(${args[0]})`);
       return originalSelect.apply(this, args);
     };
     return query;
   };
   ```

8. **Add egress budget alerts**
   - Monitor Supabase dashboard
   - Set up alerts at 80% of 5 GB limit
   - Log top queries by size in production

---

## 🎯 Expected Results

| Phase | Time | Egress Reduction | Cumulative |
|-------|------|------------------|------------|
| Phase 1 | 1-2 hours | 40% | 40% |
| Phase 2 | 4-6 hours | 30% | 70% |
| Phase 3 | 2-3 hours | Monitoring only | 70% |

**Total Time Investment:** 7-11 hours  
**Total Egress Reduction:** 60-75%  
**New Monthly Egress:** 2-4 GB (within free tier)

---

## 🔍 Monitoring & Validation

### Before Implementation
1. Enable Supabase query logging
2. Track baseline egress for 24 hours
3. Identify top 10 queries by size

### After Each Phase
1. Monitor egress reduction in Supabase dashboard
2. Check for any broken functionality
3. Validate user experience (no slowdowns)

### Success Metrics
- ✅ Monthly egress < 4 GB
- ✅ No increase in page load time
- ✅ No user-reported issues
- ✅ Synapse still updates in real-time

---

## 🚫 Non-Solutions (Explicitly Avoided)

- ❌ Removing features (presence, realtime, synapse)
- ❌ Adding new infrastructure (Redis, CDN)
- ❌ Redesigning the UI
- ❌ Migrating away from Supabase

---

## 📝 Code Examples

### Quick Win #1: Optimize Community Query

**File:** `assets/data.js`

```javascript
// BEFORE (2 MB payload)
export async function getCommunity() {
  const res = await supabase
    .from('community')
    .select('*')
    .or('is_hidden.is.null,is_hidden.eq.false')
    .limit(1000);
  return safeRows(res);
}

// AFTER (600 KB payload - 70% reduction)
export async function getCommunity() {
  const res = await supabase
    .from('community')
    .select('id, name, image_url, skills, connection_count')
    .or('is_hidden.is.null,is_hidden.eq.false')
    .limit(100); // Most users don't need 1000 profiles
  return safeRows(res);
}
```

### Quick Win #2: Add Synapse Reload Cooldown

**File:** `assets/js/synapse/realtime.js`

```javascript
// BEFORE (reloads every time)
let debounce = null;
function scheduleRefresh() {
  clearTimeout(debounce);
  debounce = setTimeout(() => {
    if (onRefresh) onRefresh();
  }, 500);
}

// AFTER (reloads max once per 5 minutes)
let debounce = null;
let lastReload = 0;
const RELOAD_COOLDOWN = 5 * 60 * 1000; // 5 minutes

function scheduleRefresh() {
  const now = Date.now();
  
  // Skip if we reloaded recently
  if (now - lastReload < RELOAD_COOLDOWN) {
    console.log('⏱️ Synapse reload skipped (cooldown active)');
    return;
  }
  
  clearTimeout(debounce);
  debounce = setTimeout(() => {
    lastReload = Date.now();
    if (onRefresh) onRefresh();
  }, 500);
}
```

### Quick Win #3: Increase Presence Interval

**File:** `assets/js/presence-session-manager.js`

```javascript
// BEFORE (120 updates/hour)
const HEARTBEAT_INTERVAL = 30000; // 30 seconds

// AFTER (12 updates/hour - 90% reduction)
const HEARTBEAT_INTERVAL = 5 * 60 * 1000; // 5 minutes
const SESSION_TIMEOUT = 10 * 60 * 1000; // 10 minutes

// Add idle detection
let lastActivity = Date.now();

['mousemove', 'keydown', 'click', 'scroll'].forEach(event => {
  document.addEventListener(event, () => {
    lastActivity = Date.now();
  }, { passive: true });
});

async function updatePresenceSession() {
  // Skip if user is idle
  const idleTime = Date.now() - lastActivity;
  if (idleTime > 2 * 60 * 1000) { // 2 minutes idle
    console.log('⏸️ User idle, skipping presence update');
    return;
  }
  
  // ... existing update logic
}
```

---

## 🎬 Next Steps

1. **Immediate:** Implement Phase 1 (Quick Wins) - 1-2 hours
2. **This Week:** Implement Phase 2 (Structural Fixes) - 4-6 hours
3. **Ongoing:** Monitor egress and adjust as needed

**Priority Order:**
1. Fix #1 (Community table) - Biggest impact
2. Fix #3 (Connection queries) - High impact, low effort
3. Fix #2 (Synapse reloads) - Medium effort, high impact
4. Fix #4 (Presence heartbeat) - Low effort, medium impact
5. Fix #5 (Data cache) - Higher effort, prevents future issues

---

**Questions or need help implementing? Let me know which fix to start with!**
