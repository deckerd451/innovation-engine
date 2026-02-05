# Skills Filter - Quick Reference

## What It Does
Adds a Skills filter button with predictive suggestions to filter the network by specific skills.

## User Experience

### Opening the Filter
1. Click the **Skills** button (purple, code icon) in the bottom filter bar
2. Panel opens above the search bar showing all available skills
3. Search input is auto-focused

### Filtering by Skills
1. **Search:** Type to filter skills in real-time
2. **Select:** Click skills to select/deselect (multiple allowed)
3. **Quick Add:** Press Enter to add first suggestion
4. **Apply:** Click "Apply Filter" to filter the network
5. **Clear:** Click "Clear" to remove all selections

### Visual Feedback
- Selected skills show checkmarks and purple highlighting
- Selected skills appear as removable chips at top of panel
- Skills button stays highlighted when filter is active
- Notification shows when filter is applied/cleared
- Non-matching nodes dim to 10% opacity

## Technical Details

### Files
- `dashboard.html` - Skills button HTML
- `assets/js/skills-filter.js` - Main implementation
- `assets/js/quiet-mode-auto-disable.js` - Integration

### Key Functions
```javascript
// Initialize
window.SkillsFilter.init()

// Manual control (if needed)
window.SkillsFilter = {
  init: initSkillsFilter
}
```

### Events
```javascript
// Emitted when filter is applied
window.addEventListener('skills-filter-applied', (e) => {
  console.log(e.detail.skills); // Array of selected skills
  console.log(e.detail.active); // true if skills selected
});
```

### Data Source
- Skills loaded from `community` table
- Fetches on profile load
- Normalizes to lowercase for matching
- Handles both array and string formats

## Integration Points

### Quiet Mode
- Automatically disables quiet mode when skills are selected
- Only triggers if skills are actually applied (not on clear)

### Network Visualization
- Filters synapse nodes by selected skills
- Uses opacity and pointer-events for visibility
- Smooth 300ms transitions

### Search System
- Works alongside other category filters
- Independent panel (doesn't interfere with search)
- Can be combined with text search

## Styling

### Colors
- Primary: `#8b5cf6` (purple)
- Gradient: `linear-gradient(135deg, #8b5cf6, #6d28d9)`
- Background: `rgba(139,92,246,0.15)`
- Border: `rgba(139,92,246,0.3)`

### Responsive
- Desktop: 500px max width
- Mobile: 90vw width
- Compact buttons on mobile (0.35rem padding)
- Touch-friendly tap targets

## Common Issues

### Skills Not Loading
- Check if profile is loaded
- Verify Supabase connection
- Check console for errors

### Filter Not Working
- Ensure synapse is initialized
- Check if nodes have skills data
- Verify D3 is available

### Panel Not Opening
- Check if button exists in DOM
- Verify script is loaded
- Check for JavaScript errors

## Testing

### Manual Test
1. Click Skills button → Panel opens
2. Type "react" → Filters to React-related skills
3. Click a skill → Appears as chip at top
4. Click Apply → Network filters, notification shows
5. Click Clear → Filter resets

### Console Test
```javascript
// Check if loaded
console.log(window.SkillsFilter);

// Check skills data
// (after profile loads)
```

## Performance

- Debounced search: 200ms
- Efficient Set operations
- Minimal DOM updates
- CSS transitions (GPU accelerated)
- Lazy loading of skills data

## Browser Support

- ✅ Chrome/Edge (latest)
- ✅ Firefox (latest)
- ✅ Safari (latest)
- ✅ Mobile browsers
- ⚠️ IE11 not supported (uses ES6 modules)

## Future Ideas

- Skill categories
- Popular skills section
- AND/OR logic
- Skill level filtering
- Save favorite combinations
- Skill recommendations

---

**Status:** ✅ Ready for Production
**Version:** 1.0.0
**Last Updated:** February 5, 2026
