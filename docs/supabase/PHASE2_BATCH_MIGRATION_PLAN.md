# Phase 2: Batch Migration Plan

## Decision: Phased Rollout Strategy

Given the scope (75+ files, 100+ changes), I'm implementing a **phased rollout** strategy:

### Phase 2.1: Foundation (COMPLETE ✅)
- ✅ Created bootstrapSession.js
- ✅ Created realtimeManager.js  
- ✅ Created startupMetrics.js
- ✅ Integrated into dashboard.html
- ✅ Auto-initialize in supabaseClient.js

### Phase 2.2: High-Impact Quick Wins (NEXT)

**Target:** Reduce 80% of calls with 20% of effort

#### Step 1: Add Migration Helper (DONE ✅)
- Created `assets/js/migrationHelper.js`
- Provides compatibility wrappers
- Allows gradual migration

#### Step 2: Migrate Core Data Loading (HIGH PRIORITY)
Files that load data on every page load:

1. **assets/data.js** - Community data loading
   - Replace `getCommunity()` to use bootstrap
   - Impact: Eliminates 1-3 queries per page load

2. **assets/js/synapse/data.js** - Synapse data loading
   - Replace community query with bootstrap
   - Impact: Eliminates 1 query per synapse load

3. **assets/js/searchEngine.js** - Search data
   - Replace community query with bootstrap
   - Impact: Eliminates 1 query per search

#### Step 3: Migrate Core Realtime (HIGH PRIORITY)
Files that create channels on every load:

1. **assets/js/synapse/realtime.js** - Synapse updates
   - Move to realtimeManager
   - Impact: Dedupes synapse channel

2. **assets/js/notification-integration.js** - Notifications
   - Move to realtimeManager
   - Impact: Dedupes notification channel

3. **assets/js/messaging.js** - Messages
   - Move to realtimeManager
   - Impact: Dedupes message channel

#### Step 4: Implement Delayed Realtime Startup
- Modify boot sequence in dashboard.html or main.js
- Add 3-5 second delay before `startRealtime()`
- Impact: Faster initial render, reduced startup load

### Phase 2.3: Gradual Migration (ONGOING)

**Strategy:** Migrate files as they're touched for other reasons

- Add migration helper to dashboard.html
- Update files opportunistically during bug fixes/features
- Track progress in PHASE2_MIGRATION_PROGRESS.md
- No rush - compatibility layer ensures nothing breaks

### Phase 2.4: Final Cleanup (FUTURE)

**When:** After 90%+ of files migrated

- Remove migration helper
- Remove legacy fallbacks
- Enable strict mode (throw on legacy patterns)
- Final validation

---

## Immediate Action Plan (Next 30 Minutes)

### 1. Add Migration Helper to Dashboard ✅
```html
<script src="assets/js/migrationHelper.js"></script>
```

### 2. Migrate Top 3 Data Files
- assets/data.js
- assets/js/synapse/data.js  
- assets/js/searchEngine.js

### 3. Migrate Top 3 Realtime Files
- assets/js/synapse/realtime.js
- assets/js/notification-integration.js
- assets/js/messaging.js

### 4. Implement Delayed Realtime
- Add delay logic to boot sequence
- Test timing

### 5. Measure Impact
- Run startup metrics
- Compare before/after
- Document results

---

## Expected Impact (Phase 2.2 Only)

### Before:
- Community queries on load: ~10
- Realtime channels: ~20
- Realtime starts: Immediately
- auth.getUser() calls: ~35

### After Phase 2.2:
- Community queries on load: ~3 (70% reduction)
- Realtime channels: ~17 (15% reduction, deduped)
- Realtime starts: After 3-5 seconds
- auth.getUser() calls: ~32 (small reduction, more in 2.3)

### Total Reduction:
- **60-70% of database calls** with just 6 file changes
- **Faster initial render** (delayed realtime)
- **Foundation for gradual migration** (compatibility layer)

---

## Why This Approach?

1. **Risk Management:** Small, tested changes vs big-bang migration
2. **Immediate Value:** 70% reduction with 6 files vs 100% with 75 files
3. **Flexibility:** Can pause/resume migration anytime
4. **Safety:** Compatibility layer prevents breakage
5. **Pragmatic:** Focus on high-impact changes first

---

## Commit Strategy

### Commit 1: Migration Helper
- Add migrationHelper.js
- Add to dashboard.html
- Document usage

### Commit 2: Data Loading Migration
- Migrate 3 data files
- Test thoroughly
- Measure impact

### Commit 3: Realtime Migration
- Migrate 3 realtime files
- Test deduping
- Verify channels

### Commit 4: Delayed Startup
- Implement delay logic
- Test timing
- Measure startup

### Commit 5: Phase 2.2 Summary
- Document results
- Update progress tracker
- Plan Phase 2.3

---

**Status:** Ready to execute Phase 2.2
**Time Estimate:** 30-45 minutes
**Risk Level:** Low (compatibility layer + small changes)
**Expected Impact:** 60-70% call reduction

