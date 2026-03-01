# Mobile V3 Navigation System

## Overview
The mobile interface now features a bottom navigation bar with scrollable buttons and a conditional search bar that only appears when needed.

## Features

### Bottom Navigation Bar
- **Scrollable horizontal layout** - 6 main categories that can be scrolled left/right
- **Categories:**
  1. **People** - Search for people in the network
  2. **Organizations** - Find organizations
  3. **Projects** - Browse projects
  4. **Opportunities** - Discover opportunities
  5. **Report** - Generate network reports
  6. **Intelligence** - Access AI-powered insights

### Search Bar Behavior
- **Hidden by default** - Search bar only appears when you tap a navigation button
- **Context-aware** - Placeholder text changes based on selected category
- **Smooth animations** - Fades in/out with smooth transitions
- **Special categories:**
  - **Report** - Opens network report directly
  - **Intelligence** - Opens START/Intelligence panel

### Top Action Bar
- **Draggable** - Can be moved anywhere on screen by dragging
- **Position memory** - Remembers last position across sessions
- **Buttons:**
  - **Refresh** - Reload network view
  - **Logout** - Sign out
  - **Admin** - Admin panel (only visible for admins)

## Technical Details

### Files Modified
- `assets/js/mobile-v3-clean.js` - Navigation logic and draggable functionality
- `assets/css/mobile-v3-clean.css` - Styling for scrollable nav and draggable top bar

### Key Functions
- `createMobileBottomNav()` - Creates scrollable bottom navigation
- `showSearchBar(category)` - Shows search bar with category-specific placeholder
- `makeDraggable(element)` - Adds drag functionality to top bar
- `handleReportCategory()` - Opens network report
- `handleIntelligenceCategory()` - Opens intelligence panel

### CSS Classes
- `.mobile-nav-scroll` - Horizontal scrollable container
- `.mobile-nav-btn` - Individual navigation buttons
- `.mobile-nav-btn.active` - Active button state
- `#mobile-top-bar` - Draggable top action bar

## User Experience

1. **Initial state** - User sees network graph with bottom navigation bar
2. **Tap category** - Search bar slides up with relevant placeholder
3. **Search** - Type to search within selected category
4. **Switch category** - Tap different button to change search context
5. **Move controls** - Drag top bar to preferred position

## Browser Support
- iOS Safari 12+
- Chrome Mobile 80+
- Firefox Mobile 68+
- Touch and mouse events supported

## Performance
- Hardware-accelerated animations
- Smooth scrolling with momentum
- Minimal reflows and repaints
- Position saved to localStorage
