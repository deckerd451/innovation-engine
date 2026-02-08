# Phase 2 Migration Progress

## Status: In Progress

---

## Objective 1: Eliminate Direct auth.getUser() Calls

### Files to Migrate (26 files):

#### High Priority (Core/Frequently Called):
- [ ] `assets/js/node-panel.js` (10 calls) - User interactions
- [ ] `assets/js/daily-engagement.js` (2 calls) - Boot sequence
- [ ] `assets/js/synapse/themes.js` (2 calls) - Theme operations
- [ ] `assets/js/organizations-manager.js` (2 calls) - Org operations
- [ ] `assets/js/start-ui-enhanced.js` (1 call) - START UI
- [ ] `assets/js/start-flow-unified.js` (1 call) - START flow
- [ ] `assets/js/start-onboarding.js` (2 calls) - Onboarding
- [ ] `assets/js/start-daily-digest.js` (1 call) - Daily digest
- [ ] `assets/js/start-sequence-report.js` (1 call) - START report

#### Medium Priority (Less Frequent):
- [ ] `assets/js/profile-completion-helper.js` (1 call)
- [ ] `assets/js/matchEngine.js` (1 call)
- [ ] `assets/js/avatar-upload.js` (1 call)
- [ ] `assets/js/database-config.js` (1 call)
- [ ] `profile.js` (1 call)

#### Low Priority (Test/Debug):
- [ ] `auth.js` (1 call) - Test function only
- [ ] `test-profile-linking.js` (2 calls) - Test file
- [ ] `tests/test-start-in-dashboard.js` (2 calls) - Test file
- [ ] `assets/js/dashboardPane.js` (1 call) - Test function

**Total:** 26 files, ~35 calls

---

## Objective 2: Remove Direct Community Queries

### Files to Migrate (40+ files):

#### High Priority (Frequent Queries):
- [ ] `assets/data.js` (3 calls) - Data loading
- [ ] `assets/js/synapse/data.js` (1 call) - Synapse data
- [ ] `assets/js/synapse/themes.js` (2 calls) - Theme operations
- [ ] `assets/js/node-panel.js` (10+ calls) - Profile operations
- [ ] `assets/js/daily-engagement.js` (3 calls) - User stats
- [ ] `assets/js/searchEngine.js` (1 call) - Search
- [ ] `assets/js/presence-session-manager.js` (1 call) - Presence check

#### Medium Priority (Less Frequent):
- [ ] `assets/js/enhanced-search-discovery.js` (1 call)
- [ ] `assets/js/smart-connection-suggestions.js` (1 call)
- [ ] `assets/js/smart-onboarding.js` (1 call)
- [ ] `assets/js/notification-integration.js` (1 call)
- [ ] `assets/js/node-panel-fixes.js` (1 call)
- [ ] `assets/js/enhancements.js` (2 calls)
- [ ] `assets/js/matchEngine.js` (2 calls)
- [ ] `assets/js/admin-analytics.js` (1 call)
- [ ] `assets/js/suggestions/*.js` (3 calls)
- [ ] `assets/js/api/profiles.js` (2 calls)
- [ ] `assets/js/start-ui-enhanced.js` (2 calls)
- [ ] `assets/js/start-flow-sequential.js` (1 call)
- [ ] `assets/js/profile-completion-helper.js` (1 call)

#### Low Priority (Test/Legacy):
- [ ] `test-profile-linking.js` (3 calls) - Test file
- [ ] `assets/js/supabaseClient.js` (Already migrated with fallback)

**Total:** 40+ files, 50+ queries

**Note:** Many of these need to be replaced with `bootstrapSession.getCommunityUser()` for reads, or kept for writes with proper guards.

---

## Objective 3: Move Realtime Subscriptions

### Files to Migrate (15+ files):

#### High Priority (Core Subscriptions):
- [ ] `assets/js/synapse/realtime.js` (1 channel) - Synapse updates
- [ ] `assets/js/notification-integration.js` (1 channel) - Notifications
- [ ] `assets/js/notification-bell.js` (1 channel) - Bell updates
- [ ] `assets/js/messaging.js` (1 channel) - Messages
- [ ] `assets/js/dashboardPane.js` (1 channel) - Dashboard messages

#### Medium Priority (Feature Subscriptions):
- [ ] `assets/js/live-activity-feed.js` (1 channel) - Activity feed
- [ ] `assets/js/enhancements.js` (2 channels) - Presence + messages
- [ ] `assets/js/unified-network/graph-data-store.js` (2 channels) - Graph updates
- [ ] `assets/js/unified-network/presence-tracker.js` (1 channel) - Presence
- [ ] `assets/js/database-config.js` (2 channels) - Messages + connections
- [ ] `assets/js/realtime-collaboration.js` (2 channels) - Collaboration
- [ ] `assets/js/video-chat-engine.js` (1 channel) - Video calls
- [ ] `assets/js/advanced-analytics.js` (1 channel) - Analytics

#### Low Priority (Legacy/Optional):
- [ ] `assets/js/bbs.js` (1 channel) - BBS messages
- [ ] `assets/js/cynq.js` (1 channel) - CYNQ ideas

**Total:** 15+ files, 20+ channels

---

## Objective 4: Delayed Realtime Startup

### Implementation Plan:

1. **Modify main.js or dashboard boot sequence:**
   - Render shell UI first
   - Call `bootstrapSession.getSessionContext()`
   - Delay realtime with `requestIdleCallback` or `setTimeout(3000)`

2. **Update all subscription registrations:**
   - Call `realtimeManager.subscribeOnce()` early (before start)
   - Actual subscription happens when `startRealtime()` is called

3. **Test delayed startup:**
   - Verify no websocket traffic during initial render
   - Confirm realtime starts after 3-5 seconds
   - Check startup metrics for timing

---

## Migration Strategy

### Phase 2A: Auth Migration (Quick Wins)
1. Start with high-priority auth files
2. Replace `auth.getUser()` with `bootstrapSession.getAuthUser()`
3. Test each file after migration
4. Commit in batches

### Phase 2B: Community Query Migration (Careful)
1. Identify read vs write operations
2. Replace reads with `bootstrapSession.getCommunityUser()`
3. Keep writes but add guards
4. Test thoroughly (data integrity critical)
5. Commit in small batches

### Phase 2C: Realtime Migration (Systematic)
1. Start with core subscriptions (synapse, notifications, messages)
2. Convert to `realtimeManager.subscribeOnce()` pattern
3. Test channel deduping
4. Commit per subsystem

### Phase 2D: Delayed Startup (Final)
1. Implement delayed realtime in boot sequence
2. Test timing and user experience
3. Verify startup metrics show improvement
4. Final commit

---

## Testing Checklist

After each migration batch:

- [ ] Dev console shows no errors
- [ ] Startup metrics report shows reduced calls
- [ ] Dev guards don't throw (no forbidden patterns)
- [ ] Features still work correctly
- [ ] No duplicate subscriptions
- [ ] Cache hits working

---

## Expected Results

### Before Phase 2:
- auth.getUser() calls: ~35
- Community queries: ~50+
- Realtime channels: ~20+
- Realtime starts: Immediately

### After Phase 2:
- auth.getUser() calls: 1 (in bootstrap only)
- Community queries: ~5 (writes only)
- Realtime channels: ~15 (deduped)
- Realtime starts: After 3-5 seconds

### Reduction:
- Auth calls: 97% reduction
- Community queries: 90% reduction
- Realtime channels: 25% reduction
- Startup time: Improved

---

**Last Updated:** February 5, 2026
**Status:** Planning complete, ready to begin migration
