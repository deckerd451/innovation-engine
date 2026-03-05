# Mobile Navigation Bar - Visual Guide

## Before vs After

### BEFORE (Old Layout)
```
┌─────────────────────────────────────────────────────────┐
│  Network  │  People  │  ⭐ Focus  │  Messages  │   You   │
│  (broken) │ (broken) │  (works)  │  (works)   │ (works) │
└─────────────────────────────────────────────────────────┘
```

### AFTER (New Layout)
```
┌─────────────────────────────────────────────────────────┐
│   Event   │  Nearby  │  ⭐ Focus  │  Messages  │   You   │
│   Mode    │   (3)    │  (works)  │    (2)     │ (works) │
│  (BLE)    │  (BLE)   │           │            │ +Logout │
└─────────────────────────────────────────────────────────┘
```

## Tab Details

### 1. Event Mode (NEW)
```
┌──────────┐
│    📡    │  Icon: Broadcast tower (antenna)
│  Event   │  Label: "Event"
└──────────┘  Action: Toggle BLE scanning
              State: Pulses when active
              Privacy: Shows notice first time
```

**Behavior**:
- Tap to start BLE scanning
- First time: Shows privacy notice
- Subsequent: Toggles on/off
- Visual: Icon pulses when scanning
- Active state: Cyan glow

### 2. Suggested Connections (NEW)
```
┌──────────┐
│    👥    │  Icon: User friends
│  Nearby  │  Label: "Nearby"
│    (3)   │  Badge: Suggestion count
└──────────┘  Action: Open suggestions modal
              Updates: Every 30 seconds
```

**Behavior**:
- Tap to view suggestions
- Badge shows unread count
- Modal shows people you were near
- Actions: Accept, Ignore
- Auto-refreshes badge

**Modal Layout**:
```
┌─────────────────────────────────────┐
│  Suggested Connections          [×] │
├─────────────────────────────────────┤
│  ┌─────────────────────────────┐   │
│  │ [JD] John Doe               │   │
│  │      15 min • 85% match     │   │
│  │  [Accept]      [Ignore]     │   │
│  └─────────────────────────────┘   │
│  ┌─────────────────────────────┐   │
│  │ [JS] Jane Smith             │   │
│  │      8 min • 72% match      │   │
│  │  [Accept]      [Ignore]     │   │
│  └─────────────────────────────┘   │
├─────────────────────────────────────┤
│  [Generate New Suggestions]         │
└─────────────────────────────────────┘
```

### 3. Your Focus Today (UNCHANGED)
```
┌──────────┐
│    ⭐    │  Icon: Star (FAB style)
│          │  Label: None (center button)
└──────────┘  Action: Open daily brief
              Style: Gradient FAB
              Size: Larger than others
```

**Behavior**:
- Tap to open START modal
- Shows daily suggestions
- Center position (prominent)
- Gradient background

### 4. Messages (UNCHANGED)
```
┌──────────┐
│    💬    │  Icon: Comment dots
│ Messages │  Label: "Messages"
│    (2)   │  Badge: Unread count
└──────────┘  Action: Open messages
              Syncs: From desktop bell
```

**Behavior**:
- Tap to open messages panel
- Badge synced from desktop
- Shows unread count
- Opens unified notifications

### 5. You / Profile (ENHANCED)
```
┌──────────┐
│    👤    │  Icon: User circle
│   You    │  Label: "You"
└──────────┘  Action: Open profile + logout
              New: Logout button inside
```

**Behavior**:
- Tap to open profile modal
- Profile shows your info
- NEW: Logout button at bottom
- Logout shows confirmation

**Profile Modal with Logout**:
```
┌─────────────────────────────────────┐
│  Your Profile                   [×] │
├─────────────────────────────────────┤
│  [Avatar]                           │
│  John Doe                           │
│  john@example.com                   │
│                                     │
│  [Edit Profile]                     │
│                                     │
│  ┌─────────────────────────────┐   │
│  │  🚪 Logout                  │   │ ← NEW
│  └─────────────────────────────┘   │
└─────────────────────────────────────┘
```

**Logout Confirmation**:
```
┌─────────────────────────────────────┐
│  🚪 Logout?                         │
├─────────────────────────────────────┤
│  Are you sure you want to logout?  │
│                                     │
│  [Cancel]         [Logout]          │
└─────────────────────────────────────┘
```

## Visual States

### Normal State
```
┌──────────┬──────────┬──────────┬──────────┬──────────┐
│    📡    │    👥    │    ⭐    │    💬    │    👤    │
│  Event   │  Nearby  │          │ Messages │   You    │
│  (gray)  │  (gray)  │ (active) │  (gray)  │  (gray)  │
└──────────┴──────────┴──────────┴──────────┴──────────┘
```

### Event Mode Active
```
┌──────────┬──────────┬──────────┬──────────┬──────────┐
│    📡    │    👥    │    ⭐    │    💬    │    👤    │
│  Event   │  Nearby  │          │ Messages │   You    │
│  (cyan)  │  (gray)  │ (active) │  (gray)  │  (gray)  │
│ (pulse)  │          │          │          │          │
└──────────┴──────────┴──────────┴──────────┴──────────┘
```

### With Badges
```
┌──────────┬──────────┬──────────┬──────────┬──────────┐
│    📡    │    👥    │    ⭐    │    💬    │    👤    │
│  Event   │  Nearby  │          │ Messages │   You    │
│  (gray)  │  (gray)  │ (active) │  (gray)  │  (gray)  │
│          │    (3)   │          │    (2)   │          │
└──────────┴──────────┴──────────┴──────────┴──────────┘
```

## Interaction Flows

### Event Mode Flow
```
1. User taps Event Mode
   ↓
2. First time? → Show privacy notice
   ├─ Accept → Start scanning
   └─ Cancel → Do nothing
   ↓
3. Subsequent taps → Toggle on/off
   ↓
4. When scanning:
   - Icon pulses
   - Cyan glow
   - Active state
   ↓
5. Tap again → Stop scanning
```

### Suggestions Flow
```
1. User taps Nearby
   ↓
2. Open suggestions modal
   ↓
3. Load suggestions from database
   ↓
4. Show list with:
   - Name
   - Overlap time
   - Confidence score
   ↓
5. User actions:
   ├─ Accept → Create connection
   ├─ Ignore → Remove suggestion
   └─ Generate → Refresh list
   ↓
6. Update badge count
```

### Logout Flow
```
1. User taps You
   ↓
2. Open profile modal
   ↓
3. User taps Logout button
   ↓
4. Show confirmation dialog
   ↓
5. User confirms:
   ├─ Cancel → Close dialog
   └─ Logout → Execute logout
   ↓
6. Clear session & reload
```

## Responsive Behavior

### Mobile (< 1024px)
- Bottom bar visible
- 5 tabs evenly spaced
- Safe area support
- Touch targets 44px min
- Badges visible

### Desktop (≥ 1024px)
- Bottom bar hidden
- Desktop header buttons shown
- Event Mode in header
- Suggestions in header
- Logout in dropdown

## Accessibility

### ARIA Labels
```html
<button aria-label="Event Mode">...</button>
<button aria-label="Suggested Connections">...</button>
<button aria-label="Daily Brief">...</button>
<button aria-label="Messages">...</button>
<button aria-label="Profile">...</button>
```

### Keyboard Navigation
- Tab through buttons
- Enter/Space to activate
- Escape to close modals
- Focus visible

### Screen Readers
- Semantic HTML (`<nav>`, `<button>`)
- Descriptive labels
- State announcements
- Badge counts announced

## Color Scheme

### Icons
- Normal: `rgba(255, 255, 255, 0.45)` (gray)
- Active: `#00e0ff` (cyan)
- Hover: Slightly brighter

### Badges
- Background: `#ff3b30` (red)
- Text: `#fff` (white)
- Border radius: `10px`

### Buttons
- Background: `rgba(5, 7, 15, 0.96)` (dark)
- Border: `rgba(0, 224, 255, 0.15)` (cyan)
- Active glow: `drop-shadow(0 0 6px rgba(0, 224, 255, 0.5))`

### Modals
- Background: `linear-gradient(135deg, rgba(10,14,39,0.98), rgba(16,20,39,0.98))`
- Border: `2px solid rgba(0,224,255,0.4)`
- Overlay: `rgba(0,0,0,0.85)` with blur

## Animation

### Pulse (Event Mode Active)
```css
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
```

### Tap Feedback
```css
.mob-tab:active {
  transform: scale(0.92);
  transition: transform 0.1s;
}
```

### Modal Transitions
- Fade in: 200ms
- Slide up: 300ms
- Backdrop blur: 200ms

## Safe Area Support

### Bottom Padding
```css
padding-bottom: env(safe-area-inset-bottom, 0px);
height: calc(60px + env(safe-area-inset-bottom, 0px));
```

### Body Padding
```css
body {
  padding-bottom: calc(60px + env(safe-area-inset-bottom, 0px));
}
```

### Toast Position
```css
#toast-container {
  bottom: calc(env(safe-area-inset-bottom, 0px) + 72px) !important;
}
```

## Z-Index Hierarchy

```
10002 - Logout confirmation
10001 - Modals (privacy, suggestions, profile)
10000 - Mobile tab bar
 9999 - Toasts
  ...  - Other UI elements
```

## Performance

### Optimizations
- Lazy load suggestions
- Debounced badge updates (30s)
- Efficient DOM manipulation
- No memory leaks
- Passive event listeners

### Bundle Size
- No new dependencies
- Reuses existing code
- Minimal CSS additions
- ~700 lines total

---

**Visual Guide Version**: 1.0  
**Last Updated**: March 5, 2026  
**Status**: Production Ready
