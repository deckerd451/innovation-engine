# START Sequence Redesign - Implementation Plan

## Goal Reframe
**Primary Job**: Help the user answer one question quickly:
> "What should I do right now that will most likely lead to a meaningful outcome?"

Not explore. Not browse. **Act with confidence.**

---

## Priority 1: Rank & Recommend (Reduce Cognitive Load)

### Current Issue
Presenting all options equally forces users to think and choose.

### Solution
1. Add framing insight at top:
   > "Based on your activity and interests, here's the best place to start today."

2. Visually rank options:
   - **Option 1** (recommended): Larger, glowing edge, subtle pulse animation
   - **Others**: Clearly secondary, smaller, muted

3. Dynamic ordering based on:
   - Recent activity
   - Theme momentum
   - Project activity
   - Connection patterns

---

## Priority 2: Preview the Outcome (Build Trust)

### Current Issue
"Start with this focus" is abstract - users don't know what they'll get.

### Solution
Show concrete preview inside the recommended card:

```
🎯 AI + Human-Centered Design

3 active projects • 5 relevant people • 1 open collaboration

"This is where your signal is strongest right now."
```

This turns curiosity into trust.

---

## Priority 3: Animate the Network (Explain the Choice)

### Current Issue
Network visualization doesn't respond to user's choice.

### Solution
When user selects an option:
1. Dim unrelated nodes (opacity: 0.3)
2. Gravitational pull toward relevant cluster
3. One highlighted path animates briefly
4. Overlay text (1 sentence):
   > "We're bringing the most relevant people and projects closer."

This reinforces the **why** of the visualization.

---

## Additional Improvements

### 4. Commitment Model (Not Navigation)
- Treat as "Choose your focus for this session"
- Lock it in temporarily
- Button changes to: "Continue with today's focus"
- Bottom nav highlights relevant actions

### 5. Trust Lever (Why This?)
Add ⓘ icon next to recommendation showing:
- "You interacted with X"
- "You endorsed Y"  
- "This theme is gaining momentum"

Builds transparency, teaches the system.

### 6. Contextual Actions
After focus chosen, Quick Actions re-label:
- ~~Connect~~ → "Connect with 2 relevant people"
- ~~Projects~~ → "Join an active project"
- ~~Chat~~ → "Message collaborators"

### 7. Escape Hatch
Small text link: "I just want to explore freely"
Preserves agency without weakening guidance.

### 8. Session Memory
At end of session:
> "Want to start here next time?"
Default: Yes, toggle off anytime.

### 9. Success Signal
After first meaningful action:
> "Nice move. This is how networks work."

Reinforces behavior, not dopamine.

---

## Implementation Files

### Files to Modify:
1. `assets/js/start-flow.js` - Main START logic
2. `dashboard.html` - START modal structure
3. `assets/js/mentor-guide.js` - Recommendation engine
4. `assets/js/synapse/focus-system.js` - Network animation
5. `assets/css/start-flow.css` (new) - Visual hierarchy

### New Functions Needed:
- `calculateRecommendedFocus()` - Score and rank options
- `previewFocusOutcome()` - Show concrete preview
- `animateNetworkFocus()` - Dim/highlight nodes
- `setSessionFocus()` - Lock in choice
- `contextualizeActions()` - Re-label quick actions

---

## Success Metrics

### Before:
- Users spend 10-15s choosing
- 40% bounce without action
- Equal distribution across options

### After:
- Users act within 5s
- 70% follow recommendation
- 80% complete first action
- Clear preference for recommended path

---

## Implementation Priority

### Phase 1 (Critical - Do First):
1. ✅ Rank and recommend one clear option
2. ✅ Preview the outcome with concrete data
3. ✅ Animate network to explain choice

### Phase 2 (High Value):
4. Commitment model (session focus)
5. Trust lever (why this?)
6. Contextual actions

### Phase 3 (Polish):
7. Escape hatch
8. Session memory
9. Success signal

---

## Key Insight
> "You don't have to think. We already did."

This transforms the START screen from a **menu** into a **mentor**.
