# Unified Network Discovery - Troubleshooting Guide

## Quick Diagnostics

### Run System Health Check

1. Press `Ctrl+Shift+U` (or `Cmd+Shift+U` on Mac)
2. Click "Check System Health"
3. Review results in console (F12)

### Check Feature Status

```javascript
// In browser console (F12):
console.log('Enabled:', localStorage.getItem('enable-unified-network'));
console.log('Active:', window.unifiedNetworkIntegration?.isActive());
console.log('System:', window.synapseBridge?.getActiveSystem());
```

## Common Issues

### Issue: Unified Network Not Loading

**Symptoms:**
- Page loads but shows legacy synapse
- No unified network visualization
- Admin panel shows "Disabled"

**Diagnosis:**
```javascript
// Check if feature is enabled
localStorage.getItem('enable-unified-network') === 'true'

// Check if system initialized
window.unifiedNetworkIntegration?.isActive()

// Check for errors
window.unifiedNetworkErrorIntegration?.getStats()
```

**Solutions:**

1. **Enable the feature:**
   - Press `Ctrl+Shift+U`
   - Check "Enable Unified Network"
   - Click "Reload Page"

2. **Check for initialization errors:**
   - Open console (F12)
   - Look for red error messages
   - Check if Supabase is connected
   - Verify user is logged in

3. **Clear cache and reload:**
   ```javascript
   localStorage.clear();
   location.reload(true);
   ```

4. **Verify script loading:**
   - Open DevTools Network tab
   - Check if all unified-network scripts loaded
   - Look for 404 or 500 errors

---

### Issue: Discovery Not Appearing

**Symptoms:**
- Network loads but no discovery suggestions
- Nodes don't appear after waiting
- Manual trigger (Ctrl+D) doesn't work

**Diagnosis:**
```javascript
// Check discovery settings
const state = window.unifiedNetworkIntegration?.api?.getState();
console.log('State:', state);

// Check if discovery is enabled
console.log('Discovery frequency:', /* check preferences */);

// Check for potential matches
console.log('Nodes:', window.unifiedNetworkIntegration?.api?.getAllNodes());
```

**Solutions:**

1. **Check discovery frequency:**
   - Press `Ctrl+P` to open preferences
   - Ensure frequency is not set to "Never"
   - Try setting to "Often" for testing

2. **Verify network conditions:**
   - You need connections and themes
   - Community must have potential matches
   - System needs time to calculate relevance (30+ seconds)

3. **Manually trigger discovery:**
   - Press `Ctrl+D` (or `Cmd+D` on Mac)
   - Should show up to 3 relevant nodes
   - If nothing appears, check console for errors

4. **Check relevance scores:**
   ```javascript
   // Get all nodes with scores
   const nodes = window.unifiedNetworkIntegration?.api?.getAllNodes();
   nodes.forEach(n => console.log(n.name, n.effectivePull));
   ```

---

### Issue: Slow Performance / Low Frame Rate

**Symptoms:**
- Choppy animations
- Laggy interactions
- High CPU usage
- Browser feels sluggish

**Diagnosis:**
```javascript
// Check performance metrics
const metrics = window.unifiedNetworkIntegration?.api?.getPerformanceMetrics();
console.log('FPS:', metrics.fps);
console.log('Memory:', metrics.memoryUsage);
console.log('Nodes:', metrics.nodeCount);
```

**Solutions:**

1. **Close other tabs:**
   - Free up browser resources
   - Especially video/streaming tabs

2. **Disable debug mode:**
   - Press `Ctrl+Shift+U`
   - Uncheck "Debug Mode"
   - Reduces console logging overhead

3. **Reduce discovery frequency:**
   - Press `Ctrl+P`
   - Set to "Rarely" or "Sometimes"
   - Reduces computation load

4. **Check node count:**
   ```javascript
   // If > 100 nodes, performance may degrade
   const nodeCount = window.unifiedNetworkIntegration?.api?.getAllNodes().length;
   console.log('Node count:', nodeCount);
   ```

5. **Update browser:**
   - Use latest Chrome, Firefox, Safari, or Edge
   - Older browsers lack GPU acceleration

6. **Check hardware acceleration:**
   - Chrome: `chrome://settings/system`
   - Ensure "Use hardware acceleration" is enabled

---

### Issue: Nodes Not Responding to Clicks

**Symptoms:**
- Clicking nodes does nothing
- No actions appear
- Nodes don't focus

**Diagnosis:**
```javascript
// Check if interaction handler is working
const handler = window.unifiedNetworkIntegration?.api?._interactionHandler;
console.log('Handler:', handler);

// Check for JavaScript errors
// Look in console (F12) for errors
```

**Solutions:**

1. **Refresh the page:**
   - Press F5 or Ctrl+R
   - System will reinitialize

2. **Check for errors:**
   - Open console (F12)
   - Look for red error messages
   - Run error handler tests

3. **Verify event listeners:**
   ```javascript
   // Check if events are bound
   const svg = document.getElementById('synapse-svg');
   console.log('SVG:', svg);
   console.log('Has listeners:', svg.onclick !== null);
   ```

4. **Try legacy synapse:**
   - Press `Ctrl+Shift+U`
   - Uncheck "Enable Unified Network"
   - Reload page
   - If legacy works, report unified network bug

---

### Issue: Visual Glitches / Rendering Issues

**Symptoms:**
- Nodes overlapping
- Missing nodes
- Incorrect positions
- Visual artifacts

**Diagnosis:**
```javascript
// Check renderer state
const renderer = window.unifiedNetworkIntegration?.api?._nodeRenderer;
console.log('Renderer:', renderer);

// Check simulation state
const simulation = window.unifiedNetworkIntegration?.api?._simulation;
console.log('Simulation:', simulation);
```

**Solutions:**

1. **Wait for physics to settle:**
   - Give system 15 seconds after load
   - Physics simulation needs time to position nodes

2. **Zoom out:**
   - Use mouse wheel or pinch gesture
   - See full network layout
   - Some nodes may be off-screen

3. **Check for stuck nodes:**
   ```javascript
   // Restart simulation
   window.unifiedNetworkIntegration?.api?._simulation?.restart();
   ```

4. **Clear and reload:**
   ```javascript
   localStorage.clear();
   location.reload(true);
   ```

5. **Check GPU acceleration:**
   - Ensure hardware acceleration is enabled
   - Try different browser if issues persist

---

### Issue: Search Not Working

**Symptoms:**
- Search doesn't find results
- Clicking results does nothing
- Search modal doesn't open

**Diagnosis:**
```javascript
// Check search integration
console.log('Search function:', typeof window.openSearchResult);
console.log('Bridge active:', window.synapseBridge?.isUnifiedActive());
```

**Solutions:**

1. **Verify bridge is initialized:**
   ```javascript
   window.synapseBridge?.getState();
   ```

2. **Try direct focus:**
   ```javascript
   // Replace 'user-id' with actual ID
   window.unifiedNetworkIntegration?.api?.focusNode('user-id');
   ```

3. **Check search integration:**
   - Open console (F12)
   - Type search query
   - Look for errors when clicking results

4. **Fallback to legacy:**
   - Disable unified network
   - Test if search works in legacy
   - Report bug if unified network breaks search

---

### Issue: Memory Leak / Increasing Memory Usage

**Symptoms:**
- Memory usage grows over time
- Browser becomes slower
- Eventually crashes or freezes

**Diagnosis:**
```javascript
// Monitor memory over time
setInterval(() => {
  const metrics = window.unifiedNetworkIntegration?.api?.getPerformanceMetrics();
  console.log('Memory:', (metrics.memoryUsage / (1024 * 1024)).toFixed(2), 'MB');
}, 10000); // Every 10 seconds
```

**Solutions:**

1. **Reload page periodically:**
   - If using for extended periods
   - Clears accumulated state

2. **Check for event listener leaks:**
   ```javascript
   // Run in console
   window.unifiedNetworkErrorIntegration?.getStats();
   ```

3. **Disable presence tracking:**
   - Presence subscriptions can accumulate
   - Reload page to reset

4. **Report the issue:**
   - Note when memory started growing
   - What actions were performed
   - Browser and OS version

---

### Issue: Fallback to Legacy Not Working

**Symptoms:**
- Unified network fails
- Legacy synapse doesn't load
- Blank screen or errors

**Diagnosis:**
```javascript
// Check fallback state
const bridgeState = window.synapseBridge?.getState();
console.log('Bridge state:', bridgeState);

// Check if legacy is available
console.log('Legacy API:', typeof window.synapseApi);
```

**Solutions:**

1. **Force legacy mode:**
   ```javascript
   localStorage.removeItem('enable-unified-network');
   location.reload();
   ```

2. **Check for initialization errors:**
   - Open console (F12)
   - Look for synapse initialization errors
   - Verify Supabase connection

3. **Clear all storage:**
   ```javascript
   localStorage.clear();
   sessionStorage.clear();
   location.reload(true);
   ```

4. **Hard refresh:**
   - Ctrl+Shift+R (or Cmd+Shift+R on Mac)
   - Clears cache and reloads

---

## Error Messages

### "Failed to initialize unified network"

**Cause:** Initialization error during setup

**Solutions:**
1. Check console for specific error
2. Verify Supabase connection
3. Ensure user is logged in
4. Check network connectivity
5. Try legacy mode

### "Network connection issue"

**Cause:** Lost connection to Supabase

**Solutions:**
1. Check internet connection
2. Verify Supabase is online
3. Wait and retry
4. System will auto-retry with exponential backoff

### "Unable to load network data"

**Cause:** Data loading failed

**Solutions:**
1. Check network connectivity
2. Verify database is accessible
3. Check browser console for details
4. System will retry automatically

### "Switched to fallback mode"

**Cause:** Critical error triggered fallback

**Solutions:**
1. This is expected behavior
2. Legacy synapse should work
3. Check console for root cause
4. Report the error for investigation

---

## Browser-Specific Issues

### Chrome

**Issue:** High CPU usage
- **Solution:** Disable extensions, especially ad blockers
- **Solution:** Check `chrome://gpu` for GPU acceleration status

**Issue:** Memory warnings
- **Solution:** Close other tabs
- **Solution:** Increase Chrome's memory limit (advanced)

### Firefox

**Issue:** Slower performance than Chrome
- **Solution:** Enable hardware acceleration in settings
- **Solution:** Update to latest version

**Issue:** WebGL warnings
- **Solution:** Check `about:support` for GPU info
- **Solution:** Update graphics drivers

### Safari

**Issue:** Touch events not working
- **Solution:** Update to latest iOS/macOS
- **Solution:** Check Safari settings for JavaScript

**Issue:** Animations choppy
- **Solution:** Safari has different GPU acceleration
- **Solution:** Reduce discovery frequency

### Edge

**Issue:** Similar to Chrome issues
- **Solution:** Same solutions as Chrome
- **Solution:** Ensure using Chromium-based Edge

---

## Mobile-Specific Issues

### iOS Safari

**Issue:** Nodes not in thumb-reachable zone
- **Solution:** Rotate device to portrait
- **Solution:** Zoom to comfortable level

**Issue:** Haptic feedback not working
- **Solution:** Check iOS haptic settings
- **Solution:** Ensure device supports haptics

### Android Chrome

**Issue:** Performance issues
- **Solution:** Close background apps
- **Solution:** Reduce discovery frequency
- **Solution:** Use lighter browser (Firefox Focus)

**Issue:** Touch targets too small
- **Solution:** Zoom in
- **Solution:** Use accessibility settings to increase touch target size

---

## Advanced Debugging

### Enable Verbose Logging

```javascript
// In console (F12)
localStorage.setItem('unified-network-debug', 'true');
location.reload();
```

### Run All Tests

```javascript
// Integration tests
await window.runUnifiedNetworkIntegrationTest();

// Bridge tests
const bridgeTests = new window.BridgeIntegrationTests();
await bridgeTests.runAll();

// Error handler tests
const errorTests = new window.ErrorHandlerTests();
await errorTests.runAll();
```

### Inspect Internal State

```javascript
// Get full system state
const api = window.unifiedNetworkIntegration?.api;

console.log('Nodes:', api?.getAllNodes());
console.log('State:', api?.getState());
console.log('Performance:', api?.getPerformanceMetrics());

// Get error statistics
const errorStats = window.unifiedNetworkErrorIntegration?.getStats();
console.log('Errors:', errorStats);

// Get bridge state
const bridgeState = window.synapseBridge?.getState();
console.log('Bridge:', bridgeState);
```

### Force Specific States

```javascript
// Force discovery mode
window.unifiedNetworkIntegration?.api?.triggerDiscovery();

// Force My Network mode
window.unifiedNetworkIntegration?.api?.resetToMyNetwork();

// Focus on specific node
window.unifiedNetworkIntegration?.api?.focusNode('node-id');

// Center on current user
window.unifiedNetworkIntegration?.api?.centerOnCurrentUser();
```

---

## Getting Help

### Self-Service

1. **Check this guide** - Most issues covered here
2. **Run diagnostics** - Use admin panel tools
3. **Check console** - Look for error messages
4. **Try legacy mode** - Verify it's not a general issue

### Support Channels

1. **GitHub Issues** - Report bugs with details
2. **Community Forum** - Ask questions
3. **Email Support** - For urgent issues
4. **Documentation** - Check other guides

### Reporting Bugs

Include this information:

1. **Steps to reproduce**
2. **Expected behavior**
3. **Actual behavior**
4. **Browser and version**
5. **OS and version**
6. **Console errors** (F12)
7. **System health check results**
8. **Screenshots or video**

### Example Bug Report

```
Title: Discovery nodes not appearing after 5 minutes

Steps to reproduce:
1. Enable unified network
2. Load dashboard
3. Wait 5+ minutes
4. Press Ctrl+D

Expected: 1-3 discovery nodes appear
Actual: No nodes appear, no errors in console

Browser: Chrome 120.0.6099.109
OS: macOS 14.2
System Health: All tests pass
Console: No errors

Additional info:
- Have 10 connections
- Member of 3 themes
- Discovery frequency set to "Often"
- Manual trigger (Ctrl+D) also doesn't work
```

---

## Prevention

### Best Practices

1. **Keep browser updated** - Latest version has best performance
2. **Close unused tabs** - Frees resources
3. **Disable debug mode** - Unless actively debugging
4. **Monitor performance** - Check health periodically
5. **Report issues early** - Help us fix bugs faster

### Regular Maintenance

1. **Clear cache monthly** - Prevents stale data issues
2. **Update browser** - Get latest features and fixes
3. **Check for updates** - New versions may fix your issue
4. **Review settings** - Ensure optimal configuration

---

**Version:** 1.0  
**Last Updated:** February 2026  
**For Developers:** See `UNIFIED_NETWORK_BRIDGE_INTEGRATION.md`
