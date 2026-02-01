# Synapse Centering - Testing Checklist

## Pre-Deployment Testing

### ✅ Initial Load Behavior

- [ ] Open dashboard.html
- [ ] Wait for Synapse to initialize
- [ ] Verify current user node is centered in viewport
- [ ] Verify smooth animation (1000ms)
- [ ] Check console for "🎯 Initial auto-centering on current user" message
- [ ] Verify no errors in console

### ✅ Search → Person Focus

- [ ] Open search (Ctrl/Cmd + K or click search)
- [ ] Type a person's name
- [ ] Click on a person result
- [ ] Verify search modal closes
- [ ] Verify Synapse view is visible
- [ ] Verify person node is centered
- [ ] Verify smooth animation
- [ ] Verify distance-based dimming applied
- [ ] Check console for "🎯 Focusing on person via synapseApi" message

### ✅ Search → Project Focus

- [ ] Open search
- [ ] Type a project name
- [ ] Click on a project result
- [ ] Verify search modal closes
- [ ] Verify project node is centered
- [ ] Verify smooth animation
- [ ] Verify dimming applied
- [ ] Check console for "🎯 Focusing on project via synapseApi" message

### ✅ Search → Theme Focus

- [ ] Open search
- [ ] Type a theme name
- [ ] Click on a theme result
- [ ] Verify search modal closes
- [ ] Verify theme node is centered
- [ ] Verify theme card opens
- [ ] Verify smooth animation
- [ ] Check console for "🎯 Focusing on theme via synapseApi" message

### ✅ Zoom Preservation

- [ ] Zoom in (scroll up or pinch)
- [ ] Search for a node and select it
- [ ] Verify zoom level is preserved (doesn't reset)
- [ ] Zoom out (scroll down or pinch)
- [ ] Search for another node
- [ ] Verify zoom level is still preserved

### ✅ Return Home

- [ ] Focus on any node (via search)
- [ ] Open browser console
- [ ] Type: `window.centerOnCurrentUser()`
- [ ] Press Enter
- [ ] Verify view returns to current user
- [ ] Verify smooth animation
- [ ] Verify dimming is cleared

### ✅ Programmatic API

#### Test centerOnNode

- [ ] Open console
- [ ] Get a node ID: `window.synapseApi.debug.getNodes()[0].id`
- [ ] Type: `window.centerOnNode('NODE_ID')`
- [ ] Verify node is centered
- [ ] Verify smooth animation

#### Test focusOnNode

- [ ] Open console
- [ ] Type: `window.focusOnNode('NODE_ID')`
- [ ] Verify node is centered
- [ ] Verify dimming is applied
- [ ] Verify smooth animation

#### Test with Options

- [ ] Type: `window.centerOnNode('NODE_ID', { scale: 2.0 })`
- [ ] Verify node is centered AND zoomed to 2.0
- [ ] Type: `window.centerOnNode('NODE_ID', { skipAnimation: true })`
- [ ] Verify instant centering (no animation)
- [ ] Type: `window.centerOnNode('NODE_ID', { duration: 2000 })`
- [ ] Verify slow 2-second animation

### ✅ Event System

- [ ] Open console
- [ ] Type: `window.dispatchEvent(new CustomEvent('synapse:focus-node', { detail: { nodeId: 'NODE_ID' } }))`
- [ ] Verify node is centered
- [ ] Type: `window.dispatchEvent(new CustomEvent('synapse:show-activity', {}))`
- [ ] Verify returns to current user

### ✅ Readiness & Queueing

- [ ] Open dashboard.html with `?debug` parameter
- [ ] Immediately (before Synapse loads) type in console:
  ```javascript
  window.synapseApi.focusNode('some-node-id')
  ```
- [ ] Verify console shows "⏳ Synapse not ready yet - queueing focus request"
- [ ] Wait for Synapse to load
- [ ] Verify console shows "🔄 Replaying queued focus"
- [ ] Verify node is centered after load

### ✅ Fallback Behavior

- [ ] Open console
- [ ] Type: `window.synapseApi.focusNode('non-existent-node-id')`
- [ ] Verify console shows "⚠️ Node not found"
- [ ] Verify fallback to current user
- [ ] Verify toast notification appears

### ✅ Mobile Testing

#### iOS Safari

- [ ] Open dashboard on iPhone/iPad
- [ ] Verify initial centering works
- [ ] Search for a node
- [ ] Verify centering works on mobile
- [ ] Verify touch gestures work (pan, pinch)
- [ ] Verify no horizontal scroll issues

#### Android Chrome

- [ ] Open dashboard on Android device
- [ ] Verify initial centering works
- [ ] Search for a node
- [ ] Verify centering works
- [ ] Verify touch gestures work

### ✅ Performance

- [ ] Open dashboard
- [ ] Open browser DevTools → Performance tab
- [ ] Start recording
- [ ] Search for and select 5 different nodes
- [ ] Stop recording
- [ ] Verify no frame drops during animations
- [ ] Verify smooth 60fps transitions
- [ ] Verify no memory leaks

### ✅ Edge Cases

#### Empty Search Results

- [ ] Search for "xyzabc123" (gibberish)
- [ ] Verify "No results" message
- [ ] Verify no errors in console

#### Rapid Searches

- [ ] Search for a node
- [ ] Immediately search for another node
- [ ] Immediately search for a third node
- [ ] Verify last search wins
- [ ] Verify no animation conflicts
- [ ] Verify no errors

#### During Simulation

- [ ] Refresh page
- [ ] Immediately (within 1 second) try to focus on a node
- [ ] Verify queueing system handles it
- [ ] Verify focus happens after simulation settles

#### Background Tab

- [ ] Open dashboard
- [ ] Switch to another tab
- [ ] Wait 10 seconds
- [ ] Switch back to dashboard tab
- [ ] Search for a node
- [ ] Verify centering still works

### ✅ Browser Compatibility

- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)
- [ ] Mobile Safari (iOS)
- [ ] Mobile Chrome (Android)

### ✅ Console Logging

- [ ] Open dashboard with `?debug` parameter
- [ ] Verify detailed logging appears
- [ ] Verify no errors or warnings
- [ ] Verify all operations are logged

### ✅ Integration Points

#### START Sequence

- [ ] Open START modal
- [ ] Click on a daily suggestion
- [ ] Verify Synapse opens
- [ ] Verify node is centered

#### Pathway Animations

- [ ] Click on a pathway animation
- [ ] Verify node is centered
- [ ] Verify no toast appears (skipToast: true)

#### Theme Cards

- [ ] Click on a theme circle
- [ ] Verify theme card opens
- [ ] Verify theme is centered

## Post-Deployment Monitoring

### Metrics to Track

- [ ] Initial load centering success rate
- [ ] Search → focus success rate
- [ ] Average animation duration
- [ ] Error rate (console errors)
- [ ] User engagement with search
- [ ] "Return home" usage

### User Feedback

- [ ] Monitor for reports of "lost" users
- [ ] Monitor for reports of disorientation
- [ ] Monitor for animation performance complaints
- [ ] Monitor for zoom level complaints

## Rollback Plan

If issues are discovered:

1. Revert `assets/js/synapse/focus-system.js`
2. Revert `assets/js/synapse/core.js`
3. Revert `assets/js/search-integration.js`
4. Clear browser caches
5. Notify users of temporary degradation

## Success Criteria

✅ All checklist items pass
✅ No console errors
✅ Smooth 60fps animations
✅ Works on all browsers
✅ Works on mobile devices
✅ User feedback is positive

## Sign-Off

- [ ] Developer tested all items
- [ ] QA tested all items
- [ ] Product owner approved
- [ ] Ready for production deployment

---

**Tested By:** _________________

**Date:** _________________

**Notes:** _________________
