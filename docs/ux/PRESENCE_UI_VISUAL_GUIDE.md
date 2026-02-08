# Presence UI System - Visual Guide

## 🎨 Where Presence Indicators Appear

This guide shows exactly where you'll see online/offline status indicators in the Innovation Engine.

---

## 📍 Location 1: Profile Panel (Node Side Panel)

When you click on any person's node in the network visualization, a side panel opens showing their profile. This is where presence indicators are most visible.

### Visual Layout

```
┌─────────────────────────────────────────┐
│  [X] Close                              │
│                                         │
│         ┌─────────────┐                 │
│         │             │                 │
│         │   AVATAR    │ 🟢 ← Presence  │
│         │             │    Dot         │
│         └─────────────┘                 │
│                                         │
│         John Smith                      │
│         🟢 available  ← Status Text     │
│         Active now    ← Last Seen       │
│                                         │
│         Software Engineer               │
│         john@example.com                │
│                                         │
│         👥 25 connections               │
│         💡 3 projects                   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ ABOUT                        ▼  │   │
│  └─────────────────────────────────┘   │
│  ┌─────────────────────────────────┐   │
│  │ SKILLS                       ▼  │   │
│  └─────────────────────────────────┘   │
│                                         │
└─────────────────────────────────────────┘
```

### Presence Dot Details

**Position:** Bottom-right corner of avatar  
**Size:** 24px diameter  
**Border:** 3px solid (matches background color)  
**Colors:**
- 🟢 **Green** (`#00ff88`) = Online (with glow effect)
- ⚪ **Gray** (`#666`) = Offline (no glow)

**Hover Text:**
- "Online" when green
- "Offline" when gray

### Status Text Details

**Position:** Below avatar, centered  
**Format:** `[dot icon] [status text]`  
**Colors:**
- 🟢 **Green** (`#00ff88`) = "available"
- ⚪ **Gray** (`#666`) = "offline"

### Last Seen Details

**Position:** Below status text, centered  
**Format:** Dynamic based on time
**Examples:**
- "Active now" (green) = User is currently online
- "Last seen 5 minutes ago" (gray) = User was online 5 minutes ago
- "Last seen 2 hours ago" (gray) = User was online 2 hours ago
- "Last seen 3 days ago" (gray) = User was online 3 days ago

---

## 📍 Location 2: Your Own Profile Button (Top-Left)

The combined profile button in the top-left corner shows your own presence status.

### Visual Layout

```
┌──────────────────────────────────────────────┐
│  ┌────────────────────┐                      │
│  │  ┌──┐              │                      │
│  │  │DI│ 🟢           │  [Other buttons...] │
│  │  └──┘              │                      │
│  │  Level 1 Newcomer  │                      │
│  │  0 / 100 XP        │                      │
│  └────────────────────┘                      │
│                                              │
└──────────────────────────────────────────────┘
```

**Note:** Your own profile button will always show a green dot because you're online!

---

## 🎨 Color Scheme

### Online (Green)
- **Dot Color:** `#00ff88` (bright cyan-green)
- **Glow Effect:** `0 0 8px rgba(0,255,136,0.6)`
- **Status Text:** "available" in `#00ff88`
- **Last Seen:** "Active now" in `#00ff88`

### Offline (Gray)
- **Dot Color:** `#666` (medium gray)
- **No Glow Effect**
- **Status Text:** "offline" in `#666`
- **Last Seen:** "Last seen X ago" in `#888`

---

## 🔄 Update Behavior

### Automatic Updates

The presence indicators update automatically:

1. **Every 30 seconds** - All visible indicators refresh
2. **When profile panel opens** - That specific user's presence updates immediately
3. **When user activity changes** - Heartbeat updates server every 5 minutes

### Manual Updates

You can force an update using the browser console:

```javascript
// Update all presence indicators
window.PresenceUI.updateAllPresence();

// Update specific user
window.PresenceUI.updatePresenceForUser('USER_ID_HERE');
```

---

## 📱 Mobile View

On mobile devices (screen width ≤ 768px), the profile panel takes up the full screen:

```
┌─────────────────────────┐
│  [X] Close              │
│                         │
│      ┌─────────┐        │
│      │ AVATAR  │ 🟢     │
│      └─────────┘        │
│                         │
│      John Smith         │
│      🟢 available       │
│      Active now         │
│                         │
│  (Full screen panel)    │
│                         │
└─────────────────────────┘
```

The presence indicators work the same way, just in a full-screen layout.

---

## 🎯 Presence States

### State 1: Active Now (Online)
```
🟢 Green dot with glow
🟢 available
Active now
```
**Condition:** User's `last_seen` timestamp is within the last 10 minutes

### State 2: Recently Active (Offline)
```
⚪ Gray dot
⚪ offline
Last seen 15 minutes ago
```
**Condition:** User's `last_seen` timestamp is 10-60 minutes ago

### State 3: Inactive (Offline)
```
⚪ Gray dot
⚪ offline
Last seen 2 hours ago
```
**Condition:** User's `last_seen` timestamp is more than 1 hour ago

### State 4: Unknown (No Session)
```
⚪ Gray dot
⚪ offline
Last seen: unknown
```
**Condition:** User has never logged in or session was deleted

---

## 🔍 How to Identify Presence Elements

### In Browser DevTools

Presence indicators use specific data attributes:

```html
<!-- Presence Dot -->
<div data-presence-user-id="USER_ID">
  <!-- Automatically styled by presence-ui.js -->
</div>

<!-- Status Text -->
<span data-presence-status-user-id="USER_ID">
  <!-- Text changes to "available" or "offline" -->
</span>

<!-- Last Seen Text -->
<span data-presence-lastseen-user-id="USER_ID">
  <!-- Text changes to "Active now" or "Last seen X ago" -->
</span>
```

### Finding Elements in Console

```javascript
// Find all presence dots
document.querySelectorAll('[data-presence-user-id]');

// Find all status texts
document.querySelectorAll('[data-presence-status-user-id]');

// Find all last seen texts
document.querySelectorAll('[data-presence-lastseen-user-id]');
```

---

## 🎨 CSS Styling

### Presence Dot Base Style

```css
.presence-dot {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background-color: #666; /* Default: offline */
  border: 3px solid #0a0e27; /* Matches background */
  position: absolute;
  bottom: 5px;
  right: 5px;
  z-index: 10;
  transition: all 0.3s ease;
}

/* Online state */
.presence-dot.online {
  background-color: #00ff88;
  box-shadow: 0 0 8px rgba(0,255,136,0.6);
}
```

### Status Text Style

```css
.presence-status {
  color: #666; /* Default: offline */
  font-size: 0.85rem;
  transition: color 0.3s ease;
}

/* Online state */
.presence-status.online {
  color: #00ff88;
}
```

### Last Seen Style

```css
.presence-lastseen {
  color: #888; /* Default: offline */
  font-size: 0.75rem;
  transition: color 0.3s ease;
}

/* Online state */
.presence-lastseen.online {
  color: #00ff88;
}
```

---

## 🔧 Customization

### Change Online Threshold

To change how long a user stays "online" after their last activity:

**File:** `assets/js/presence-ui.js`

```javascript
// Default: 10 minutes
const ONLINE_THRESHOLD = 10 * 60 * 1000;

// Change to 5 minutes
const ONLINE_THRESHOLD = 5 * 60 * 1000;

// Change to 30 minutes
const ONLINE_THRESHOLD = 30 * 60 * 1000;
```

### Change Update Frequency

To change how often the UI updates:

**File:** `assets/js/presence-ui.js`

```javascript
// Default: 30 seconds
const UPDATE_INTERVAL = 30 * 1000;

// Change to 15 seconds (more frequent)
const UPDATE_INTERVAL = 15 * 1000;

// Change to 60 seconds (less frequent)
const UPDATE_INTERVAL = 60 * 1000;
```

### Change Dot Size

To change the size of presence dots:

**File:** `assets/js/node-panel.js` (in renderPersonPanel function)

```html
<!-- Default: 24px -->
<div data-presence-user-id="..." 
     style="width: 24px; height: 24px; ...">
</div>

<!-- Smaller: 16px -->
<div data-presence-user-id="..." 
     style="width: 16px; height: 16px; ...">
</div>

<!-- Larger: 32px -->
<div data-presence-user-id="..." 
     style="width: 32px; height: 32px; ...">
</div>
```

---

## 📊 Testing Presence States

### Test Online State

1. Open dashboard in two browser windows
2. Log in as different users in each window
3. In window 1, click on user 2's profile
4. You should see: 🟢 green dot, "available", "Active now"

### Test Offline State

1. Open dashboard and log in
2. Click on a user who hasn't logged in recently
3. You should see: ⚪ gray dot, "offline", "Last seen X ago"

### Test Your Own Presence

1. Open dashboard and log in
2. Click on your profile button (top-left)
3. You should always see: 🟢 green dot (you're online!)

---

## ✅ Visual Checklist

Use this checklist to verify presence indicators are working:

- [ ] Presence dot appears on avatar in profile panel
- [ ] Dot is positioned in bottom-right corner
- [ ] Dot has border matching background color
- [ ] Green dot has glow effect
- [ ] Gray dot has no glow effect
- [ ] Status text appears below avatar
- [ ] Status text shows "available" or "offline"
- [ ] Status text color matches dot color
- [ ] Last seen text appears below status
- [ ] Last seen text shows correct time format
- [ ] Indicators update every 30 seconds
- [ ] Your own profile always shows green
- [ ] Other online users show green
- [ ] Offline users show gray

---

## 🎉 Summary

Presence indicators are:
- ✅ Visible in profile panels
- ✅ Color-coded (green = online, gray = offline)
- ✅ Automatically updating every 30 seconds
- ✅ Showing accurate last seen times
- ✅ Responsive to user activity
- ✅ Working on desktop and mobile

**Everything is working as designed!**
