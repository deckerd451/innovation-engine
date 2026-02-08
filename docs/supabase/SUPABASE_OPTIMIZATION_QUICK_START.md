# Supabase Optimization - Quick Start Guide

## For Developers: How to Use the New System

The Supabase optimization introduces three new modules that are now automatically initialized. Here's how to use them:

---

## 1. Getting Auth User

### ❌ OLD WAY (Don't use anymore):
```javascript
const { data: { user } } = await supabase.auth.getUser();
```

### ✅ NEW WAY (Use this):
```javascript
const authUser = await bootstrapSession.getAuthUser();
```

**Benefits:**
- Cached (no duplicate network calls)
- Deduped (concurrent calls return same promise)
- Fast reload (sessionStorage cache)

---

## 2. Getting Community User

### ❌ OLD WAY (Don't use anymore):
```javascript
const { data } = await supabase
  .from('community')
  .select('*')
  .eq('email', user.email)
  .single();
```

### ✅ NEW WAY (Use this):
```javascript
const communityUser = await bootstrapSession.getCommunityUser();
```

**Benefits:**
- Cached (no duplicate network calls)
- Deduped (concurrent calls return same promise)
- Auto-creates profile if missing
- Fast reload (sessionStorage cache)
- **Dev guard blocks direct email queries**

---

## 3. Getting Both (Session Context)

### ✅ NEW WAY:
```javascript
const { authUser, communityUser, isAuthenticated, hasProfile } = 
  await bootstrapSession.getSessionContext();

if (!isAuthenticated) {
  // Show login
  return;
}

if (!hasProfile) {
  // Profile is being created
  return;
}

// Use authUser and communityUser
```

---

## 4. Creating Realtime Subscriptions

### ❌ OLD WAY (Don't use anymore):
```javascript
const channel = supabase.channel('my-channel')
  .on('postgres_changes', config, handler)
  .subscribe();
```

### ✅ NEW WAY (Use this):
```javascript
// Register subscription (before realtime starts)
realtimeManager.subscribeOnce('my-channel', (supabase, context) => {
  return supabase._internalChannel('my-channel')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'my_table',
      filter: `user_id=eq.${context.communityUser.id}`
    }, handler)
    .subscribe();
});

// Realtime will start automatically after shell render
// Or manually start:
// const context = await bootstrapSession.getSessionContext();
// await realtimeManager.startRealtime(context);
```

**Benefits:**
- Deduped (no duplicate channels)
- Delayed (starts after shell render)
- Managed (proper cleanup on stop)
- **Dev guard blocks direct channel creation**

---

## 5. Checking Realtime Status

```javascript
// Check if realtime is started
if (realtimeManager.isStarted) {
  console.log('Realtime is active');
}

// Get active channels
const channels = realtimeManager.getActiveChannels();
console.log('Active channels:', channels);

// Get channel count
const count = realtimeManager.getChannelCount();
console.log('Channel count:', count);
```

---

## 6. Clearing Cache (On Logout)

```javascript
// Clear all caches when user logs out
bootstrapSession.clearCache();

// Stop all realtime subscriptions
await realtimeManager.stopRealtime();
```

---

## 7. Dev Mode Features

### Startup Metrics (Automatic)

After 10 seconds, check the console for a comprehensive report:

```
📊 STARTUP METRICS REPORT (t=10.0s)
================================================================================

📈 Database Calls: 45
📋 Calls by Table:
  community: 12
  connections: 8
  ...

🔌 Realtime Channels: 3
🔐 auth.getUser() Calls: 15
🚨 Community Email Queries: 0
  ✅ PASS: No forbidden queries detected
```

### Dev Guards (Automatic)

**Forbidden Community Email Query:**
```javascript
// This will THROW an error in dev mode:
await supabase.from('community').select('*').eq('email', 'test@test.com');
// Error: Direct community email query is forbidden. Use bootstrapSession.getCommunityUser()
```

**Forbidden Direct Channel Creation:**
```javascript
// This will THROW an error in dev mode:
const channel = supabase.channel('test');
// Error: Direct supabase.channel() is forbidden. Use realtimeManager.subscribeOnce()
```

### Manual Metrics Report

```javascript
// Generate report manually
window.startupMetrics.generateReport();

// Get raw metrics
const metrics = window.startupMetrics.getMetrics();
console.log(metrics);
```

---

## 8. Debugging

### Check Bootstrap Status

```javascript
console.log('Bootstrap initialized:', bootstrapSession.isInitialized);
console.log('Has cached auth:', bootstrapSession.hasCachedAuth);
console.log('Has cached community:', bootstrapSession.hasCachedCommunity);
console.log('Ensure ran:', bootstrapSession.ensureRan);
```

### Check Realtime Status

```javascript
console.log('Realtime initialized:', realtimeManager.isInitialized);
console.log('Realtime started:', realtimeManager.isStarted);
console.log('Channel count:', realtimeManager.channelCount);
console.log('Active channels:', realtimeManager.getActiveChannels());
```

### Force Cache Invalidation

```javascript
// Invalidate cache (next call will refetch)
bootstrapSession.invalidateCache();

// Or clear completely (like logout)
bootstrapSession.clearCache();
```

---

## 9. Migration Checklist

When migrating existing code:

- [ ] Replace `supabase.auth.getUser()` with `bootstrapSession.getAuthUser()`
- [ ] Replace community queries with `bootstrapSession.getCommunityUser()`
- [ ] Move `supabase.channel()` calls to `realtimeManager.subscribeOnce()`
- [ ] Remove duplicate auth/community fetches
- [ ] Test in dev mode to catch forbidden patterns
- [ ] Verify startup metrics show reduced calls

---

## 10. Common Patterns

### Pattern: Load User Data on Boot

```javascript
async function initializeApp() {
  // Get session context
  const context = await bootstrapSession.getSessionContext();
  
  if (!context.isAuthenticated) {
    showLoginScreen();
    return;
  }
  
  // Render UI with user data
  renderUI(context.communityUser);
  
  // Start realtime (delayed)
  requestIdleCallback(() => {
    realtimeManager.startRealtime(context);
  }, { timeout: 3000 });
}
```

### Pattern: Subscribe to User-Specific Data

```javascript
// Register subscription
realtimeManager.subscribeOnce('user-connections', (supabase, context) => {
  return supabase._internalChannel('user-connections')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'connections',
      filter: `from_id=eq.${context.communityUser.id}`
    }, (payload) => {
      console.log('Connection changed:', payload);
      updateConnectionsUI();
    })
    .subscribe();
});
```

### Pattern: Conditional Realtime

```javascript
// Only subscribe if user has certain permissions
if (communityUser.is_admin) {
  realtimeManager.subscribeOnce('admin-notifications', (supabase, context) => {
    return supabase._internalChannel('admin-notifications')
      .on('postgres_changes', config, handler)
      .subscribe();
  });
}
```

---

## 11. Performance Tips

1. **Use getSessionContext() once at boot** - Don't call getAuthUser() and getCommunityUser() separately
2. **Register subscriptions early** - Call subscribeOnce() before startRealtime()
3. **Delay realtime** - Use requestIdleCallback or setTimeout(3000)
4. **Check cache first** - Use hasCachedAuth/hasCachedCommunity to avoid unnecessary calls
5. **Batch operations** - Group related operations together

---

## 12. Troubleshooting

### "Bootstrap not initialized" error

Make sure supabaseClient.js loaded before your code runs. Bootstrap initializes automatically when supabase client is created.

### "Realtime manager not initialized" error

Same as above - realtime manager initializes automatically with supabase client.

### Cache not working

Check sessionStorage quota. Clear old data if needed:
```javascript
bootstrapSession.clearCache();
```

### Subscriptions not starting

Make sure you called `startRealtime()` after registering subscriptions:
```javascript
const context = await bootstrapSession.getSessionContext();
await realtimeManager.startRealtime(context);
```

### Dev guards not working

Dev guards only work on localhost/127.0.0.1. They're disabled in production.

---

## 13. API Reference

### bootstrapSession

- `initialize(supabaseClient)` - Initialize (auto-called)
- `getAuthUser()` - Get cached auth user
- `getCommunityUser()` - Get cached community user
- `getSessionContext()` - Get both + status
- `ensureCommunityUser()` - Create profile if missing (auto-called)
- `clearCache()` - Clear all caches
- `invalidateCache()` - Invalidate without clearing
- `isInitialized` - Boolean
- `hasCachedAuth` - Boolean
- `hasCachedCommunity` - Boolean
- `ensureRan` - Boolean

### realtimeManager

- `initialize(supabaseClient)` - Initialize (auto-called)
- `startRealtime(context)` - Start all subscriptions
- `stopRealtime()` - Stop all subscriptions
- `subscribeOnce(key, builderFn)` - Register subscription
- `unsubscribe(key)` - Remove specific subscription
- `getActiveChannels()` - Get channel keys
- `getChannelCount()` - Get count
- `isChannelActive(key)` - Check if active
- `isInitialized` - Boolean
- `isStarted` - Boolean
- `channelCount` - Number

### startupMetrics (dev only)

- `generateReport()` - Print metrics report
- `getMetrics()` - Get raw metrics object
- `isTracking()` - Check if tracking

---

**Last Updated:** February 5, 2026
**Status:** Integrated and ready to use
