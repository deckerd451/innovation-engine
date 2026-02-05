# Skills Filter - System Architecture

## Component Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      Dashboard UI                            │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Bottom Filter Bar                                      │ │
│  │  [All] [People] [Organizations] [Projects] [Themes]    │ │
│  │  [Skills] ← NEW                                         │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            ↓ click
┌─────────────────────────────────────────────────────────────┐
│              Skills Filter Module                            │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Suggestions Panel                                      │ │
│  │  ┌──────────────────────────────────────────────────┐  │ │
│  │  │  Search: [_________________] 🔍                   │  │ │
│  │  ├──────────────────────────────────────────────────┤  │ │
│  │  │  Selected: [React ×] [Python ×] [UX ×]           │  │ │
│  │  ├──────────────────────────────────────────────────┤  │ │
│  │  │  Suggestions:                                     │  │ │
│  │  │  ☑ React                                          │  │ │
│  │  │  ☐ JavaScript                                     │  │ │
│  │  │  ☑ Python                                         │  │ │
│  │  │  ☐ Java                                           │  │ │
│  │  │  ☑ UX Design                                      │  │ │
│  │  └──────────────────────────────────────────────────┘  │ │
│  │  [Clear]  [Apply Filter]                               │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            ↓ apply
┌─────────────────────────────────────────────────────────────┐
│              Event System                                    │
│  skills-filter-applied {                                    │
│    skills: ['react', 'python', 'ux design'],                │
│    active: true                                             │
│  }                                                           │
└─────────────────────────────────────────────────────────────┘
         ↓                           ↓                    ↓
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│ Quiet Mode       │    │ Network          │    │ Notification     │
│ Auto-Disable     │    │ Visualization    │    │ System           │
│                  │    │                  │    │                  │
│ • Detects event  │    │ • Filters nodes  │    │ • Shows message  │
│ • Disables quiet │    │ • Dims non-match │    │ • "Filtering by  │
│ • Shows full net │    │ • Updates opacity│    │   3 skills"      │
└──────────────────┘    └──────────────────┘    └──────────────────┘
```

## Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│  1. INITIALIZATION                                           │
└─────────────────────────────────────────────────────────────┘
                            ↓
        Profile Loaded Event (window.addEventListener)
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  2. LOAD SKILLS                                              │
│     Supabase Query:                                          │
│     SELECT skills FROM community                             │
│     WHERE is_hidden IS NULL OR is_hidden = false            │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  3. NORMALIZE & STORE                                        │
│     • Extract skills from each row                           │
│     • Handle array and string formats                        │
│     • Normalize to lowercase                                 │
│     • Store in Set (allSkills)                               │
│     • Remove duplicates                                      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  4. USER INTERACTION                                         │
│     • User clicks Skills button                              │
│     • Panel opens with all skills                            │
│     • User searches/filters                                  │
│     • User selects skills                                    │
│     • User clicks Apply                                      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  5. APPLY FILTER                                             │
│     • Emit skills-filter-applied event                       │
│     • Call filterNodesBySkills()                             │
│     • Update node opacity/pointer-events                     │
│     • Show notification                                      │
│     • Close panel                                            │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  6. INTEGRATION                                              │
│     • Quiet mode auto-disables                               │
│     • Network updates visually                               │
│     • Button stays highlighted                               │
│     • User sees filtered results                             │
└─────────────────────────────────────────────────────────────┘
```

## Module Dependencies

```
dashboard.html
    │
    ├─→ assets/js/skills-filter.js (NEW)
    │       │
    │       ├─→ window.supabase (Supabase client)
    │       ├─→ window.d3 (D3.js for node manipulation)
    │       ├─→ window.synapseSimulation (Synapse simulation)
    │       ├─→ window.showNotification (Notification system)
    │       └─→ window.QuietModeAutoDisable (Quiet mode integration)
    │
    └─→ assets/js/quiet-mode-auto-disable.js (MODIFIED)
            │
            └─→ Listens for 'skills-filter-applied' event
```

## State Management

```javascript
// Module-level state
let allSkills = new Set();           // All available skills
let selectedSkills = new Set();      // Currently selected skills
let isActive = false;                // Panel open/closed
let currentUserProfile = null;       // User profile data
let supabase = null;                 // Supabase client
let suggestionsPanel = null;         // DOM element
let skillsButton = null;             // DOM element

// State transitions
CLOSED → (click button) → OPEN
OPEN → (click outside) → CLOSED
OPEN → (click Apply) → CLOSED + FILTERED
FILTERED → (click Clear) → CLOSED + UNFILTERED
```

## Event Flow

```
User Action                 Event                    Handler
───────────────────────────────────────────────────────────────
Click Skills button    →    click                →  toggleSkillsFilter()
                                                      ↓
                                                  openSkillsFilter()
                                                      ↓
                                                  renderSuggestions()

Type in search        →    input (debounced)    →  handleSearchInput()
                                                      ↓
                                                  renderSuggestions()

Click skill item      →    click                →  toggleSkillSelection()
                                                      ↓
                                                  updateSelectedSkillsDisplay()

Press Enter           →    keydown              →  handleSearchKeydown()
                                                      ↓
                                                  toggleSkillSelection()

Click Apply           →    click                →  applySkillsFilter()
                                                      ↓
                                                  filterNodesBySkills()
                                                      ↓
                                                  emit 'skills-filter-applied'
                                                      ↓
                                                  closeSkillsFilter()

Click Clear           →    click                →  clearSelectedSkills()
                                                      ↓
                                                  applySkillsFilter()

Click outside         →    click (document)     →  closeSkillsFilter()
```

## Network Filtering Algorithm

```javascript
// Pseudo-code for node filtering
function filterNodesBySkills(selectedSkills) {
  if (selectedSkills.length === 0) {
    // Show all nodes
    allNodes.forEach(node => {
      node.opacity = 1;
      node.pointerEvents = 'all';
    });
    return;
  }
  
  allNodes.forEach(node => {
    // Extract node skills
    const nodeSkills = normalizeSkills(node.skills);
    
    // Check if any selected skill matches any node skill
    const hasMatch = selectedSkills.some(selectedSkill =>
      nodeSkills.some(nodeSkill =>
        nodeSkill.includes(selectedSkill.toLowerCase())
      )
    );
    
    // Update visibility
    node.opacity = hasMatch ? 1 : 0.1;
    node.pointerEvents = hasMatch ? 'all' : 'none';
  });
}
```

## Performance Characteristics

```
Operation                   Time Complexity    Space Complexity
─────────────────────────────────────────────────────────────────
Load all skills            O(n)               O(k)
  n = number of users
  k = number of unique skills

Search/filter skills       O(k)               O(1)
  k = number of unique skills

Select/deselect skill      O(1)               O(1)

Apply filter               O(n)               O(1)
  n = number of nodes

Render suggestions         O(k)               O(k)
  k = number of filtered skills

Update display             O(m)               O(m)
  m = number of selected skills
```

## Memory Usage

```
Component                  Estimated Size
─────────────────────────────────────────
allSkills Set             ~10-50 KB
  (500-2000 unique skills)

selectedSkills Set        ~1-5 KB
  (typically 1-10 skills)

DOM elements              ~5-10 KB
  (panel, buttons, chips)

Event listeners           ~1 KB
  (6-8 listeners)

Total                     ~17-66 KB
```

## Integration Points

```
┌─────────────────────────────────────────────────────────────┐
│  Skills Filter Module                                        │
└─────────────────────────────────────────────────────────────┘
         ↓                ↓                ↓              ↓
    ┌────────┐      ┌─────────┐     ┌──────────┐   ┌──────────┐
    │Supabase│      │ Synapse │     │  Quiet   │   │Notifica- │
    │  API   │      │  Core   │     │   Mode   │   │  tions   │
    └────────┘      └─────────┘     └──────────┘   └──────────┘
         ↓                ↓                ↓              ↓
    Load skills    Filter nodes    Auto-disable   Show messages
    from DB        by skills       when active    to user
```

## Error Handling

```
Error Type                  Handler                    Recovery
─────────────────────────────────────────────────────────────────
Supabase connection fail   Try-catch + console.error  Graceful degradation
Skills load fail           Try-catch + console.error  Empty skills list
Panel creation fail        Check DOM + console.error  Disable feature
Filter apply fail          Try-catch + console.warn   Show error notification
D3 not available           Check window.d3            Disable filtering
Synapse not available      Check simulation           Disable filtering
```

## Security Considerations

```
Concern                    Mitigation
─────────────────────────────────────────────────────────────
XSS in skill names        Escape HTML in rendering
SQL injection             Use Supabase parameterized queries
Data leakage              Filter by is_hidden flag
Unauthorized access       Check user authentication
Performance DoS           Debounce search, limit results
```

## Accessibility Features

```
Feature                    Implementation
─────────────────────────────────────────────────────────────
Keyboard navigation       Tab through elements
Screen reader support     ARIA labels on buttons
Focus management          Auto-focus search input
Visual feedback           Clear hover/active states
Color contrast            WCAG AA compliant
Touch targets             Minimum 44x44px
```

## Browser Compatibility Matrix

```
Feature                Chrome  Firefox  Safari  Edge  Mobile
─────────────────────────────────────────────────────────────
ES6 Modules           ✅      ✅       ✅      ✅    ✅
CSS Grid              ✅      ✅       ✅      ✅    ✅
Backdrop Filter       ✅      ✅       ✅      ✅    ⚠️
Custom Events         ✅      ✅       ✅      ✅    ✅
Set/Map               ✅      ✅       ✅      ✅    ✅
Arrow Functions       ✅      ✅       ✅      ✅    ✅
Template Literals     ✅      ✅       ✅      ✅    ✅
Async/Await           ✅      ✅       ✅      ✅    ✅

Legend: ✅ Full support  ⚠️ Partial support  ❌ No support
```

---

**Document Version:** 1.0.0
**Last Updated:** February 5, 2026
**Maintained By:** Development Team
