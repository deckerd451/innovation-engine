# Mobile V3 Navigation System

## Overview
The mobile interface now features a bottom navigation bar with scrollable buttons and a conditional search bar that only appears when needed.

## Features

### Bottom Navigation Bar
- **Scrollable horizontal layout** - 6 main categories that can be scrolled left/right
- **Categories:**
  1. **People** - Search and browse people in the network
  2. **Organizations** - Find and explore organizations
  3. **Projects** - Browse active projects
  4. **Opportunities** - Discover collaboration opportunities
  5. **Report** - Generate network reports
  6. **Intelligence** - Access AI-powered insights

### Search Bar Behavior
- **Hidden by default** - Search bar only appears when you tap a navigation button
- **Context-aware** - Placeholder text changes based on selected category
- **Category-specific results** - Each category shows relevant suggestions immediately
- **Smooth animations** - Fades in/out with smooth transitions
- **Special categories:**
  - **Report** - Opens network report directly
  - **Intelligence** - Opens START/Intelligence panel

### Top Action Bar
- **Draggable** - Can be moved anywhere on screen by dragging
- **Position memory** - Remembers last position across sessions
- **Buttons:**
  - **Notifications** (Bell) - Opens messages modal, shows unread count badge
  - **Refresh** - Reload network view
  - **Admin** (Shield) - Admin panel (only visible for admins)
  - **Logout** - Sign out

## Technical Details

### Files Modified
- `assets/js/mobile-v3-clean.js` - Navigation logic, draggable functionality, and category search
- `assets/css/mobile-v3-clean.css` - Styling for scrollable nav, draggable top bar, and suggestions

### Key Functions
- `createMobileBottomNav()` - Creates scrollable bottom navigation
- `createMobileTopBar()` - Creates draggable top action bar with notification bell
- `showSearchBar(category)` - Shows search bar with category-specific placeholder
- `triggerCategorySearch(category)` - Loads category-specific suggestions
- `showCategorySuggestions(category)` - Fetches and displays suggestions
- `makeDraggable(element)` - Adds drag functionality to top bar
- `updateBellBadge()` - Updates notification count on bell icon
- `handleReportCategory()` - Opens network report
- `handleIntelligenceCategory()` - Opens intelligence panel

### Category Search Functions
- `fetchPeople()` - Loads people from database
- `fetchOrganizations()` - Loads organizations
- `fetchProjects()` - Loads projects
- `fetchOpportunities()` - Loads opportunities
- `displayPeopleSuggestions()` - Renders people results
- `displayOrganizationsSuggestions()` - Renders organization results
- `displayProjectsSuggestions()` - Renders project results
- `displayOpportunitiesSuggestions()` - Renders opportunity results

### Global Selection Functions
- `window.selectPerson(id)` - Opens person profile
- `window.selectOrganization(id)` - Opens organization details
- `window.selectProject(id)` - Opens project details
- `window.selectOpportunity(id)` - Opens opportunity details

### CSS Classes
- `.mobile-nav-scroll` - Horizontal scrollable container
- `.mobile-nav-btn` - Individual navigation buttons
- `.mobile-nav-btn.active` - Active button state
- `#mobile-top-bar` - Draggable top action bar
- `.mobile-top-btn` - Top action buttons
- `.mobile-bell-badge` - Notification count badge
- `.suggestion-loading` - Loading state for suggestions
- `.suggestion-group` - Group of suggestions
- `.suggestion-item` - Individual suggestion item

## User Experience

1. **Initial state** - User sees network graph with bottom navigation bar
2. **Tap category** - Search bar slides up with relevant suggestions
3. **Browse suggestions** - Scroll through category-specific results
4. **Select item** - Tap to open details
5. **Switch category** - Tap different button to change context
6. **Move controls** - Drag top bar to preferred position
7. **Check messages** - Tap bell icon to view messages

## Category Behaviors

### People
- Shows list of people in network
- Displays name and top skills
- Tap to open profile

### Organizations
- Shows list of organizations
- Displays name and description
- Tap to view organization details

### Projects
- Shows active projects
- Displays title and description
- Tap to view project details

### Opportunities
- Shows available opportunities
- Displays title and description
- Tap to view opportunity details

### Report
- Immediately opens network report modal
- No search bar shown

### Intelligence
- Opens START/Intelligence panel
- No search bar shown

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
- Efficient database queries with limits
- Cached search results
