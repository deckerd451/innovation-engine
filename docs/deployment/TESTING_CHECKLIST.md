# Testing Checklist - Intelligence Layer V2 & Synapse Navigation

## Current Status: ✅ All Code Pushed to GitHub

All features have been implemented and pushed to GitHub. The working tree is clean with no uncommitted changes.

---

## What to Test

### 1. Intelligence Layer V2 Suggestions

**Test Steps:**
1. Log in to the dashboard
2. Click the **START** button (top navigation)
3. Look for the "Your Focus Today" section

**Expected Results:**
- Should see 5-8 personalized suggestions
- Each suggestion should have:
  - An icon and color
  - A clear message (e.g., "Connect with Sarah Criswell")
  - A detail line explaining why (e.g., "Matches your skill: graphic design")
  - A "?" button to see full reasoning
  - An action button (e.g., "View Profile →")

**Console Logs to Check:**
```
🧠 Intelligence Layer Report
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📡 Coordination Detector Status: ✅ Yes
📊 Suggestions by Type: coordination=X, person=X, theme=X
🏆 Top 3 Suggestions: [list of suggestions with scores]
```

---

### 2. Person Suggestions → Auto-Enable Discovery Mode

**Test Steps:**
1. Open START panel
2. Click on a **person suggestion** (e.g., "Connect with Sarah Criswell")
3. Watch what happens

**Expected Results:**
- Discovery Mode should **automatically enable** (no manual button click needed)
- Synapse view should open
- The graph should show **more people** (e.g., 41 instead of 15)
- The suggested person should be **focused and centered**
- Their node should be **highlighted** with a glow effect
- Other nodes should be **dimmed** slightly

**Console Logs to Check:**
```
👤 Routing to person: <uuid>
🌐 Enabling Discovery Mode to show suggested person
🌐 Synapse view mode: Full Community (Discovery Mode)
✅ Discovery Mode enabled, attempting focus
🎯 synapseApi.focusNode() called: <uuid>
🎯 Handling synapse:focus-node event: <uuid>
🌟 Applied distance-based dimming from: <person name>
```

**If Person Not Found:**
- Should see a toast notification: "Person not found in current view..."
- Should fallback to centering on your own node
- Should NOT see errors in console

---

### 3. Theme Suggestions → Focus on Theme

**Test Steps:**
1. Open START panel
2. Click on a **theme suggestion** (if available)
3. Watch what happens

**Expected Results:**
- Synapse view should open
- The theme circle should be **focused and centered**
- The theme card should open showing:
  - Theme title and description
  - Projects in that theme
  - "Join Theme" button
- Other nodes should be dimmed

**Console Logs to Check:**
```
🎯 Routing to theme: <uuid>
🎯 synapseApi.focusTheme() called: <uuid>
🎯 Handling synapse:focus-theme event: <uuid>
🎯 Opening theme card for: <theme name>
```

**If Theme Not Found:**
- Should see a toast notification: "This theme isn't in your current view..."
- Should fallback to centering on your own node
- Should NOT see errors in console

---

### 4. Coordination Suggestions → Activity View

**Test Steps:**
1. Open START panel
2. Click on the **"Intelligence Layer Active"** suggestion (if present)
3. Watch what happens

**Expected Results:**
- Synapse view should open
- Should center on **your own node**
- Should show your connections and activity
- No errors in console

**Console Logs to Check:**
```
🌐 Routing coordination suggestion: no_signals
ℹ️ Intelligence Layer Active (no signals) - showing activity view
📊 synapseApi.showActivity() called
📊 Handling synapse:show-activity event: <your user id>
🎯 Centered on node: <your name>
```

---

### 5. Synapse Readiness & Pending Focus Queue

**Test Steps:**
1. Open START panel
2. **Immediately** click a suggestion (before Synapse fully loads)
3. Watch what happens

**Expected Results:**
- Focus request should be **queued** (not lost)
- Once Synapse finishes loading, the queued focus should **replay automatically**
- The suggested node should be focused correctly
- No "Node not found" errors

**Console Logs to Check:**
```
⏳ Synapse not ready yet - queueing focus request
✅ Synapse ready - nodes and graph loaded
🔄 Replaying queued focus: {type: 'node', id: '<uuid>'}
🎯 synapseApi.focusNode() called: <uuid>
```

---

### 6. Discovery Mode Button (Manual Toggle)

**Test Steps:**
1. Open Synapse view
2. Look for the **Discovery Mode button** (should be in the filter panel)
3. Click it to toggle between "My Network" and "Full Community"

**Expected Results:**
- Button should toggle between two states
- Graph should reload with different node counts:
  - **My Network**: Shows only connected people (e.g., 15 nodes)
  - **Discovery Mode**: Shows all people including suggestions (e.g., 41 nodes)
- Console should log the mode change

**Console Logs to Check:**
```
🌐 Synapse view mode: Full Community (Discovery Mode)
📊 Discovery Mode: Showing X suggested connections out of Y total members
```

---

## Known Issues & Expected Behavior

### ✅ Graceful Fallbacks
If a suggested person/theme is not found in the current view:
- System shows a helpful toast notification
- Falls back to centering on your own node
- Does NOT throw errors

### ✅ Auto-Enable Discovery Mode
When clicking person suggestions:
- Discovery Mode is automatically enabled
- No manual button click needed
- Graph reloads to show suggested connections

### ✅ Readiness Tracking
If you click a suggestion before Synapse loads:
- Focus request is queued
- Replays automatically once ready
- No lost focus requests

---

## Debug Tools

### Console Commands

Check Synapse state:
```javascript
window.synapseApi.debug.isReady()  // Should return true
window.synapseApi.debug.getNodes() // Returns all loaded nodes
window.synapseApi.debug.getLinks() // Returns all loaded links
```

Check Discovery Mode state:
```javascript
window.synapseShowFullCommunity  // true = Discovery Mode, false = My Network
```

Test theme selection:
```javascript
window.testThemeSelection('<theme-id>')  // Highlight a theme
window.testThemeSelection()              // Clear all selections
```

---

## What to Report

If you encounter issues, please provide:

1. **What you clicked** (which suggestion type)
2. **What happened** (describe the behavior)
3. **Console logs** (copy the relevant logs)
4. **Expected vs Actual** (what you expected to see vs what you saw)

---

## Summary

✅ All features implemented and pushed to GitHub  
✅ Auto-enable Discovery Mode for person suggestions  
✅ Graceful fallbacks with toast notifications  
✅ Readiness tracking prevents timing issues  
✅ Debug tools available for troubleshooting  

**Ready for testing!** Log in with a stable internet connection and follow the test steps above.
