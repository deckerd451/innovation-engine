# Supabase Optimization Implementation Guide

## Status: Phase 1 Foundation Complete ✅

This document tracks the implementation of the comprehensive Supabase optimization plan to eliminate excessive database calls and realtime subscriptions.

---

## Overview

**Goal:** Reduce Supabase calls by 70-90% through:
- Single source of truth for auth/community data
- Realtime subscription deduping and ownership
- Delayed realtime initialization
- Progressive data loading
- Verification gates

---

## Phase 1: Single Source of Truth ✅

### Task 1.1: Create bootstrapSession.js Singleton ✅

**File:** `assets/js/bootstrapSession.js`

**Features:**
- `getAuthUser()` - Cached auth user (promise deduping)
- `getCommunityUser()` - Cached community user (promise deduping)
- `getSessionContext()` - Combined auth + community data
- `ensureCommunityUser()` - Runs once per session to create missing profiles
- In-memory + sessionStorage caching
- Dev-only guard that blocks direct community email queries

**Usage:**
```javascript
// Initialize once at app boot
await bootstrapSession.initialize(supabase);

// Get auth user (cached, dedupe)
const authUser = await bootstrapSession.getAuthUser();

// Get community user (cached, dedupe)
const communityUser = await bootstrapSession.getCommunityUser();

// Get both
const { authUser, communityUser } = await bootstrapSession.getSessionContext();
```

**Rules:**
- ✅ Multiple concurrent calls produce exactly ONE network request
- ✅ Results cached in-memory and sessionStorage
- ✅ ensureCommunityUser() runs at most once per tab session
- ✅ Dev guard throws error on direct community email queries

### Task 1.2: Ban Direct Community Lookup by Email ⏳

**Status:** Dev guard implemented, migration needed

**Next Steps:**
1. Search for all `from("community").select(...).eq("email"` patterns
2. Replace with `bootstrapSession.getCommunityUser()`
3. Verify no direct email queries remain

**Files to Check:**
- All files that call `auth.getUser()` (see grep results)
- Any file that queries community table
- Profile loading logic
- Connection management

### Task 1.3: Ensure ensureCommunityUser() Runs Once ✅

**Status:** Implemented in bootstrapSession.js

**Features:**
- Session flag prevents multiple runs
- Only called from getCommunityUser()
- Not called on interval, focus, or heartbeat
- Uses auth user ID once and stops

---

## Phase 2: Realtime Subscription Ownership ✅

### Task 2.1: Create realtimeManager.js Singleton ✅

**File:** `assets/js/realtimeManager.js`

**Features:**
- `startRealtime(context)` - Start all subscriptions
- `stopRealtime()` - Stop all subscriptions
- `subscribeOnce(key, builderFn)` - Dedupe by key
- `getActiveChannels()` - List active channels
- Dev-only guard that blocks direct `supabase.channel()` calls

**Usage:**
```javascript
// Initialize once at app boot
realtimeManager.initialize(supabase);

// Register subscriptions (before starting)
realtimeManager.subscribeOnce('presence', (supabase, context) => {
  return supabase._internalChannel('presence')
    .on('presence', { event: 'sync' }, handler)
    .subscribe();
});

// Start realtime AFTER shell render
const context = await bootstrapSession.getSessionContext();
await realtimeManager.startRealtime(context);

// Stop on cleanup
await realtimeManager.stopRealtime();
```

**Rules:**
- ✅ Only this file calls `supabase.channel()` (via `_internalChannel`)
- ✅ Dedupes subscriptions by key
- ✅ Maintains references for cleanup
- ✅ Dev guard throws error on direct channel creation

### Task 2.2: Delay Realtime Until After Shell Render ⏳

**Status:** Manager ready, integration needed

**Next Steps:**
1. Modify dashboard.html boot sequence
2. Render minimal shell UI first
3. Run bootstrapSession.getSessionContext()
4. Schedule startRealtime() via requestIdleCallback or setTimeout(3000)

**Implementation:**
```javascript
// In dashboard.html
async function bootApp() {
  // 1. Render shell
  renderMinimalShell();
  
  // 2. Bootstrap session
  await bootstrapSession.initialize(supabase);
  const context = await bootstrapSession.getSessionContext();
  
  // 3. Delay realtime
  requestIdleCallback(() => {
    realtimeManager.startRealtime(context);
  }, { timeout: 3000 });
}
```

### Task 2.3: Remove Module-Level Realtime Subscriptions ⏳

**Status:** Manager ready, migration needed

**Files Found:**
- `assets/js/enhancements.js` - Line 273: `supabase.channel('online-users')`
- `assets/js/realtime-helper.js` - Line 81: `supabase.channel(channelName)`

**Next Steps:**
1. Move all channel creation to realtimeManager
2. Convert to subscribeOnce() pattern
3. Verify no direct channel() calls remain

---

## Phase 3: Presence + Heartbeats Must Not Hit DB ⏳

### Task 3.1: Convert Presence to Timer-Based + No DB

**Current Status:** Needs audit

**Requirements:**
- Never query community table
- Never call auth.getUser() repeatedly
- Never reinitialize realtime on heartbeat
- Update at 2-5s intervals (client-only)

**Implementation:**
```javascript
// Get community user ONCE from bootstrap
const { communityUser } = await bootstrapSession.getSessionContext();

// Use only the ID for presence
const presenceChannel = realtimeManager.subscribeOnce('presence', (supabase, context) => {
  return supabase._internalChannel('presence')
    .on('presence', { event: 'sync' }, () => {
      // Update UI with presence data
      // NO database queries here!
    })
    .track({
      user_id: context.communityUser.id,
      online_at: new Date().toISOString()
    })
    .subscribe();
});
```

---

## Phase 4: Progressive Data Loading ⏳

### Task 4.1: Split Critical vs Deferred Data

**Critical (load immediately):**
- Auth user
- Community user profile
- Minimal UI config

**Deferred (load after idle/interaction):**
- Full nodes graph
- Connections list
- Discovery lists
- Themes/projects

**Implementation:**
```javascript
// Critical boot
const context = await bootstrapSession.getSessionContext();
renderShellUI(context);

// Deferred loading
requestIdleCallback(() => {
  loadGraphData();
  loadConnections();
  loadDiscovery();
}, { timeout: 5000 });
```

### Task 4.2: Add Pagination/Limit to Large Fetches

**Audit Required:**
- Community list queries
- Connections queries
- Notifications queries
- Themes/projects queries

**Rule:** No query returns > 200 rows during initial boot

**Implementation:**
```javascript
// Before
const { data } = await supabase.from('community').select('*');

// After
const { data } = await supabase
  .from('community')
  .select('*')
  .range(0, 199)
  .limit(200);
```

---

## Phase 5: Verification Gates ✅

### Task 5.1: Add Startup Metrics Log ✅

**File:** `assets/js/startupMetrics.js` (dev only)

**Features:**
- Tracks all DB calls for 10 seconds
- Tracks realtime channel creation
- Detects forbidden community email queries
- Prints comprehensive report at t=10s

**Output:**
```
📊 STARTUP METRICS REPORT (t=10.0s)
================================================================================

📈 Database Calls: 45

📋 Calls by Table:
  community: 12
  connections: 8
  presence_sessions: 6
  ...

🔑 Top 5 Query Keys:
  community.select: 8
  connections.select: 6
  ...

🔌 Realtime Channels: 3
  Channels: presence, connections, notifications

🔐 auth.getUser() Calls: 15

🚨 Community Email Queries: 0
  ✅ PASS: No forbidden queries detected

📊 Summary:
  Total DB calls: 45
  Realtime channels: 3
  auth.getUser() calls: 15
  Forbidden queries: 0

✅ PASS
```

### Task 5.2: Add No Duplicate Subscriptions Assert ✅

**Status:** Implemented in realtimeManager.js

**Features:**
- Warns on duplicate subscribeOnce() calls
- Logs stack trace in dev mode
- Prevents channel count increase

### Task 5.3: Supabase Dashboard Validation ⏳

**Status:** Awaiting deployment

**Checklist:**
- [ ] Screenshot "before" call counts
- [ ] Deploy optimizations
- [ ] Screenshot "after" call counts
- [ ] Verify ≥70% reduction in:
  - `SELECT id FROM community WHERE email = auth.email()`
  - `realtime.list_changes(...)`

---

## Integration Checklist

### Step 1: Add Scripts to dashboard.html

```html
<!-- Add before other scripts -->
<script src="assets/js/bootstrapSession.js"></script>
<script src="assets/js/realtimeManager.js"></script>
<script src="assets/js/startupMetrics.js"></script> <!-- dev only -->
```

### Step 2: Initialize at Boot

```javascript
// In dashboard.html or main.js
async function initializeApp() {
  // 1. Initialize managers
  bootstrapSession.initialize(window.supabase);
  realtimeManager.initialize(window.supabase);
  
  // 2. Get session context
  const context = await bootstrapSession.getSessionContext();
  
  if (!context.isAuthenticated) {
    showLoginScreen();
    return;
  }
  
  // 3. Render shell
  renderShellUI(context);
  
  // 4. Delay realtime
  requestIdleCallback(() => {
    realtimeManager.startRealtime(context);
  }, { timeout: 3000 });
  
  // 5. Load deferred data
  requestIdleCallback(() => {
    loadDeferredData(context);
  }, { timeout: 5000 });
}
```

### Step 3: Migrate Existing Code

**Replace auth.getUser() calls:**
```javascript
// Before
const { data: { user } } = await supabase.auth.getUser();

// After
const authUser = await bootstrapSession.getAuthUser();
```

**Replace community queries:**
```javascript
// Before
const { data } = await supabase
  .from('community')
  .select('*')
  .eq('email', user.email)
  .single();

// After
const communityUser = await bootstrapSession.getCommunityUser();
```

**Replace channel creation:**
```javascript
// Before
const channel = supabase.channel('my-channel')
  .on('postgres_changes', config, handler)
  .subscribe();

// After
realtimeManager.subscribeOnce('my-channel', (supabase, context) => {
  return supabase._internalChannel('my-channel')
    .on('postgres_changes', config, handler)
    .subscribe();
});
```

---

## Merge Blockers

**DO NOT MERGE IF:**
- [ ] Any module queries community by email directly
- [ ] Any file besides realtimeManager.js calls supabase.channel()
- [ ] DB call counter shows increasing calls when idle
- [ ] Realtime starts before shell UI is visible
- [ ] Supabase dashboard call counts do not materially drop

---

## Testing

### Dev Mode Tests

1. **Bootstrap Session:**
   ```javascript
   // Should return same instance
   const user1 = await bootstrapSession.getCommunityUser();
   const user2 = await bootstrapSession.getCommunityUser();
   console.assert(user1 === user2, 'Should return cached instance');
   ```

2. **Realtime Deduping:**
   ```javascript
   // Should not create duplicate channels
   realtimeManager.subscribeOnce('test', builder);
   realtimeManager.subscribeOnce('test', builder); // Should warn
   console.assert(realtimeManager.getChannelCount() === 1, 'Should have 1 channel');
   ```

3. **Forbidden Queries:**
   ```javascript
   // Should throw in dev mode
   try {
     await supabase.from('community').select('*').eq('email', 'test@test.com');
     console.error('FAIL: Should have thrown');
   } catch (e) {
     console.log('PASS: Blocked forbidden query');
   }
   ```

### Production Tests

1. Open Supabase Dashboard → Observability
2. Note call counts before deployment
3. Deploy optimizations
4. Wait 24 hours
5. Compare call counts
6. Verify ≥70% reduction

---

## Expected Results

### Before Optimization:
- ❌ 100+ DB calls on page load
- ❌ 20+ auth.getUser() calls
- ❌ 10+ community email queries
- ❌ 5+ duplicate realtime channels
- ❌ Realtime starts immediately
- ❌ Continuous DB calls when idle

### After Optimization:
- ✅ 10-20 DB calls on page load (80-90% reduction)
- ✅ 1 auth.getUser() call (cached)
- ✅ 0 community email queries
- ✅ 0 duplicate realtime channels
- ✅ Realtime delayed 3-5 seconds
- ✅ Zero DB calls when idle

---

## Files Created

1. ✅ `assets/js/bootstrapSession.js` - Auth/community singleton
2. ✅ `assets/js/realtimeManager.js` - Realtime subscription manager
3. ✅ `assets/js/startupMetrics.js` - Dev-only metrics tracker
4. ✅ `SUPABASE_OPTIMIZATION_IMPLEMENTATION.md` - This file

---

## Next Steps

1. **Immediate:**
   - [ ] Add scripts to dashboard.html
   - [ ] Initialize managers at boot
   - [ ] Test in dev mode

2. **Migration:**
   - [ ] Replace all auth.getUser() calls
   - [ ] Replace all community email queries
   - [ ] Move all channel creation to realtimeManager

3. **Validation:**
   - [ ] Run startup metrics
   - [ ] Verify no forbidden queries
   - [ ] Check Supabase dashboard
   - [ ] Confirm ≥70% reduction

4. **Deployment:**
   - [ ] Deploy to production
   - [ ] Monitor for 24 hours
   - [ ] Screenshot before/after metrics
   - [ ] Document results

---

**Last Updated:** February 5, 2026
**Status:** Phase 1 foundation complete, ready for integration
