# Dashboard Integration Guide - Unified Network Discovery

## ✅ Integration Complete!

The Unified Network Discovery system has been integrated into the dashboard with a feature flag approach for safe, gradual rollout.

## How It Works

### Feature Flag System

The integration uses localStorage-based feature flags:
- **`enable-unified-network`**: Controls whether the new system is active
- **`unified-network-debug`**: Enables verbose logging

### Automatic Fallback

If the unified network fails to initialize, the system automatically falls back to the legacy synapse visualization. Users won't experience any disruption.

## Enabling the Unified Network

### Method 1: Admin Panel (Recommended)

1. Open the dashboard
2. Press **Ctrl+Shift+U** (or Cmd+Shift+U on Mac)
3. Check "Enable Unified Network"
4. Click "Reload Page"

The admin panel provides:
- Enable/disable toggle
- Debug mode toggle
- Integration test runner
- Current status display

### Method 2: Browser Console

```javascript
// Enable unified network
localStorage.setItem('enable-unified-network', 'true');
location.reload();

// Disable unified network
localStorage.removeItem('enable-unified-network');
location.reload();

// Enable debug mode
localStorage.setItem('unified-network-debug', 'true');
```

### Method 3: Global API

```javascript
// Enable
window.unifiedNetworkIntegration.enable();

// Disable
window.unifiedNetworkIntegration.disable();

// Toggle debug
window.unifiedNetworkIntegration.toggleDebug();
```

## Testing the Integration

### 1. Run Integration Tests

```javascript
// In browser console
await window.runUnifiedNetworkIntegrationTest();
```

Or use the admin panel "Run Integration Test" button.

### 2. Check Integration State

```javascript
// Check if unified network is active
window.unifiedNetworkIntegration.isActive();

// Get detailed state
window.unifiedNetworkIntegration.getState();
```

### 3. Access the API

```javascript
// Access unified network API
const api = window.unifiedNetworkIntegration.api;

// Get performance metrics
api.getPerformanceMetrics();

// Show preferences panel
api.showPreferencesPanel();

// Trigger discovery manually
api.triggerDiscovery();
```

## Features Available

### Discovery Preferences

Users can control discovery behavior:
- **Frequency**: Off, Low (4min), Normal (2min), High (1min)
- **Enable/Disable**: Turn automatic discovery on/off

Access via:
- Preferences button in dashboard header
- Keyboard shortcut: **Ctrl+P** (or Cmd+P)
- API: `api.showPreferencesPanel()`

### Keyboard Shortcuts

- **Ctrl+D** (Cmd+D): Trigger discovery
- **Ctrl+H** (Cmd+H): Return to My Network
- **Ctrl+P** (Cmd+P): Show preferences
- **Ctrl+Shift+U** (Cmd+Shift+U): Toggle admin panel
- **Arrow Keys**: Navigate nodes (when focused)
- **Enter/Space**: Activate focused node
- **Escape**: Return to My Network

### Accessibility

Full accessibility support is built-in:
- Screen reader announcements
- Keyboard navigation
- Reduced motion support (respects `prefers-reduced-motion`)
- ARIA attributes
- Color contrast compliance (WCAG 2.1 AA)

### Performance Monitoring

```javascript
// Get current metrics
const metrics = api.getPerformanceMetrics();
console.log('FPS:', metrics.fps);
console.log('Memory:', metrics.memoryUsage);

// Log detailed report
api.logPerformanceReport();
```

## Integration Points

### Event Bridges

The integration automatically bridges events between systems:

```javascript
// Discovery triggered
window.addEventListener('unified-network-ready', (e) => {
  console.log('Unified network initialized', e.detail);
});

// Action completed (refreshes dashboard stats)
// Handled automatically

// Search integration
window.dispatchEvent(new CustomEvent('search-result-selected', {
  detail: { nodeId: 'user-123' }
}));
```

### Notifications

The integration uses existing notification systems:
- Success notifications for completed actions
- Error notifications for failures
- Fallback to simple notifications if needed

## Rollout Strategy

### Phase 1: Internal Testing (Current)
- Enable for admin/dev accounts only
- Monitor performance and errors
- Gather feedback

### Phase 2: Beta Testing
- Enable for select beta users
- A/B testing with metrics
- Iterate based on feedback

### Phase 3: Gradual Rollout
- 10% of users
- 25% of users
- 50% of users
- 100% of users

### Phase 4: Default On
- Remove feature flag
- Make unified network the default
- Keep legacy as fallback

## Monitoring

### Key Metrics to Track

```javascript
// Track discovery engagement
api.on('discovery-triggered', ({ reasons }) => {
  analytics.track('Discovery Triggered', { reasons });
});

// Track action completion
api.on('action-completed', ({ actionType }) => {
  analytics.track('Action Completed', { actionType });
});

// Track performance
setInterval(() => {
  const metrics = api.getPerformanceMetrics();
  analytics.track('Performance', {
    fps: metrics.fps,
    memory: metrics.memoryUsage
  });
}, 300000); // Every 5 minutes
```

### Error Tracking

```javascript
// Track initialization failures
api.on('initialization-failed', ({ error }) => {
  analytics.track('Unified Network Error', { error });
});

// Track action failures
api.on('action-failed', ({ actionType, error }) => {
  analytics.track('Action Failed', { actionType, error });
});
```

## Troubleshooting

### Issue: Unified Network Not Loading

**Check**:
1. Feature flag enabled: `localStorage.getItem('enable-unified-network')`
2. Console for errors
3. Integration state: `window.unifiedNetworkIntegration.getState()`

**Solution**:
- Clear localStorage and try again
- Check browser console for specific errors
- Verify Supabase connection
- Ensure D3.js is loaded

### Issue: Poor Performance

**Check**:
1. Performance metrics: `api.getPerformanceMetrics()`
2. Node count (> 100 nodes reduces FPS to 30)
3. Browser (older browsers may struggle)
4. Memory usage (> 100 MB triggers warnings)

**Solution**:
- Enable debug mode to see detailed metrics
- Check for memory leaks
- Verify spatial culling is working
- Test on different devices

### Issue: Discovery Not Triggering

**Check**:
1. User preferences: `api.getDiscoveryPreferences()`
2. Rate limiting (2 minute minimum)
3. Graph size (< 5 nodes triggers more frequently)
4. Trigger conditions being met

**Solution**:
- Manually trigger: `api.triggerDiscovery()`
- Check preferences aren't set to "off"
- Verify presence tracking is working
- Enable debug mode for trigger logs

## Files Modified

### New Files
- `assets/js/unified-network-integration.js` - Main integration module
- `assets/js/unified-network-admin.js` - Admin controls
- `DASHBOARD_INTEGRATION_GUIDE.md` - This file

### Modified Files
- `dashboard.html` - Added script imports
- `main.js` - Added initialization on profile-loaded

### No Changes Required
- Existing synapse system remains intact
- Backward compatible
- Graceful fallback on errors

## Next Steps

1. **Test the Integration**
   - Enable the feature flag
   - Run integration tests
   - Verify all features work

2. **Monitor Performance**
   - Check FPS and memory usage
   - Verify no console errors
   - Test on mobile devices

3. **Gather Feedback**
   - Enable for beta users
   - Collect usage metrics
   - Iterate based on feedback

4. **Gradual Rollout**
   - Start with 10% of users
   - Monitor metrics closely
   - Increase percentage gradually

5. **Make Default**
   - Once stable, make it the default
   - Remove feature flag
   - Deprecate legacy system

## Support

For issues or questions:
1. Check browser console for errors
2. Run integration test: `window.runUnifiedNetworkIntegrationTest()`
3. Check integration state: `window.unifiedNetworkIntegration.getState()`
4. Enable debug mode for verbose logging

## Success Criteria

- ✅ Feature flag system working
- ✅ Automatic fallback on errors
- ✅ Admin panel accessible
- ✅ Integration tests passing
- ⏳ Performance metrics acceptable
- ⏳ User feedback positive
- ⏳ No critical bugs

---

**Status**: Integration Complete - Ready for Testing  
**Date**: February 1, 2026  
**Version**: 1.0.0-rc1
