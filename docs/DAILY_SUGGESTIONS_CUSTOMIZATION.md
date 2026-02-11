# Daily Suggestions Engine - Customization Guide

## Overview

This guide shows you how to customize the Daily Suggestions Engine to fit your specific needs.

## Common Customizations

### 1. Change Number of Suggestions

**File**: `assets/js/suggestions/engine.js`

```javascript
constructor(store) {
  this.minSuggestions = 3;   // Change from 5 to 3
  this.maxSuggestions = 15;  // Change from 10 to 15
  this.cooldownDays = 14;    // Change from 7 to 14
}
```

### 2. Adjust Scoring Weights

**File**: `assets/js/suggestions/engine.js`

#### Make Shared Skills More Important

```javascript
// In generatePeopleSuggestions()
const sharedSkills = this.findSharedKeywords(
  this.parseSkills(profile.skills),
  this.parseSkills(person.skills)
);
if (sharedSkills.length > 0) {
  score += sharedSkills.length * 25; // Changed from 15 to 25
  reasons.push(`Matches your skill: ${sharedSkills[0]}`);
}
```

#### Prioritize Recently Active Users

```javascript
// In generatePeopleSuggestions()
if (person.last_activity_date) {
  const daysSinceActive = this.daysSince(person.last_activity_date);
  if (daysSinceActive <= 7) {
    score += 20; // Changed from 10 to 20
    reasons.push('Active this week');
  }
}
```

#### Boost Projects in User's Themes

```javascript
// In generateProjectSuggestions()
if (project.theme_id) {
  const userThemes = await queries.getUserThemeParticipations(profile.id);
  if (userThemes.includes(project.theme_id)) {
    score += 40; // Changed from 25 to 40
    reasons.push('In your theme');
  }
}
```

### 3. Add New Scoring Factors

#### Add "New User" Boost for People

```javascript
// In generatePeopleSuggestions(), add after existing scoring:

// Boost new users (joined in last 30 days)
if (person.created_at) {
  const daysSinceJoined = this.daysSince(person.created_at);
  if (daysSinceJoined <= 30) {
    score += 15;
    reasons.push('New to the community');
  }
}
```

#### Add "Trending" Boost for Projects

```javascript
// In generateProjectSuggestions(), add after existing scoring:

// Boost projects with recent activity (multiple updates)
const { data: recentUpdates } = await window.supabase
  .from('project_activity')
  .select('id')
  .eq('project_id', project.id)
  .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

if (recentUpdates && recentUpdates.length > 5) {
  score += 20;
  reasons.push('Trending project');
}
```

#### Add "Verified" Boost for Organizations

```javascript
// In generateOrganizationSuggestions(), add after existing scoring:

// Boost verified organizations
if (org.verified) {
  score += 15;
  reasons.push('Verified organization');
}
```

### 4. Change Candidate Pool Sizes

**File**: `assets/js/suggestions/queries.js`

```javascript
// Get more candidates for better selection
export async function getCandidatePeople(communityId, excludeIds) {
  const { data, error } = await window.supabase
    .from('community')
    .select('id, name, bio, interests, skills, last_activity_date, updated_at, connection_count')
    .neq('id', communityId)
    .not('id', 'in', `(${excludeIds.join(',')})`)
    .order('last_activity_date', { ascending: false, nullsFirst: false })
    .limit(100); // Changed from 50 to 100
  
  if (error) throw error;
  return data || [];
}
```

### 5. Add Custom Suggestion Types

#### Add "Events" Suggestions

**Step 1**: Add queries in `queries.js`:

```javascript
export async function getCandidateEvents(excludeIds) {
  const { data, error } = await window.supabase
    .from('events')
    .select('id, title, description, start_date, tags')
    .gte('start_date', new Date().toISOString())
    .not('id', 'in', excludeIds.length > 0 ? `(${excludeIds.join(',')})` : '()')
    .order('start_date', { ascending: true })
    .limit(20);
  
  if (error) throw error;
  return data || [];
}

export async function getUserEventRegistrations(communityId) {
  const { data, error } = await window.supabase
    .from('event_registrations')
    .select('event_id')
    .eq('user_id', communityId);
  
  if (error) throw error;
  return data?.map(r => r.event_id) || [];
}
```

**Step 2**: Add scoring in `engine.js`:

```javascript
// In generateSuggestions(), add to the Promise.all:
const [people, projects, themes, orgs, events] = await Promise.all([
  this.generatePeopleSuggestions(profile, connectedIds, pendingIds, cooldownList),
  this.generateProjectSuggestions(profile, [...projectIds, ...projectRequestIds], cooldownList),
  this.generateThemeSuggestions(profile, themeIds, cooldownList),
  this.generateOrganizationSuggestions(profile, orgIds, cooldownList),
  this.generateEventSuggestions(profile, cooldownList) // NEW
]);

// Then add to allSuggestions:
const allSuggestions = [...people, ...projects, ...themes, ...orgs, ...events]
  .sort((a, b) => b.score - a.score);
```

**Step 3**: Add generation method:

```javascript
async generateEventSuggestions(profile, cooldownList) {
  const eventIds = await queries.getUserEventRegistrations(profile.id);
  const cooldownEvents = cooldownList
    .filter(s => s.suggestion_type === 'event')
    .map(s => s.target_id);
  
  const candidates = await queries.getCandidateEvents([...eventIds, ...cooldownEvents]);
  
  const suggestions = [];
  const userInterests = profile.interests || [];
  
  for (const event of candidates) {
    const reasons = [];
    let score = 0;
    
    // Tags/interests overlap
    const eventTags = event.tags || [];
    const matchingTags = this.findSharedKeywords(userInterests, eventTags);
    if (matchingTags.length > 0) {
      score += matchingTags.length * 15;
      reasons.push(`Matches interest: ${matchingTags[0]}`);
    }
    
    // Upcoming soon
    const daysUntil = Math.floor((new Date(event.start_date) - new Date()) / (1000 * 60 * 60 * 24));
    if (daysUntil <= 7) {
      score += 25;
      reasons.push('Starting soon');
    }
    
    if (score > 0 && reasons.length > 0) {
      suggestions.push({
        suggestion_type: 'event',
        target_id: event.id,
        score,
        why: reasons.slice(0, 3),
        data: {
          title: event.title,
          description: event.description,
          start_date: event.start_date
        }
      });
    }
  }
  
  return suggestions;
}
```

**Step 4**: Add UI config in `ui.js`:

```javascript
// In suggestionToInsight(), add to typeConfig:
event: {
  icon: 'calendar',
  color: '#ff6b6b',
  actionText: 'View Event',
  handler: 'viewEvent'
}
```

### 6. Customize UI Appearance

**File**: `assets/js/suggestions/start-integration.js`

#### Change Section Title

```javascript
function renderSuggestionsSection(suggestions) {
  return `
    <div style="margin-bottom: 2rem;">
      <h3 style="...">
        <i class="fas fa-sparkles"></i> Recommended for You <!-- Changed icon and text -->
      </h3>
      ...
    </div>
  `;
}
```

#### Change Card Colors

```javascript
function renderSuggestionCard(suggestion) {
  // Override color based on type
  let color = suggestion.color || '#00e0ff';
  
  if (suggestion.data.suggestionType === 'person') {
    color = '#00ff88'; // Green for people
  } else if (suggestion.data.suggestionType === 'project') {
    color = '#a855f7'; // Purple for projects
  }
  
  // ... rest of function
}
```

#### Add Priority Badges

```javascript
function renderSuggestionCard(suggestion) {
  const priority = suggestion.priority || 'low';
  const priorityBadge = priority === 'high' 
    ? '<span style="background:#ff6b6b; color:#000; padding:0.25rem 0.5rem; border-radius:4px; font-size:0.7rem; font-weight:700;">HOT</span>'
    : '';
  
  return `
    <div class="suggestion-card" ...>
      ${priorityBadge}
      ...
    </div>
  `;
}
```

### 7. Add Time-Based Scoring

#### Boost Suggestions Based on Time of Day

```javascript
// In engine.js, add helper method:
getTimeOfDayBoost() {
  const hour = new Date().getHours();
  
  // Morning (6-12): Boost people and themes
  if (hour >= 6 && hour < 12) {
    return { person: 10, theme: 10, project: 0, org: 0 };
  }
  
  // Afternoon (12-18): Boost projects and orgs
  if (hour >= 12 && hour < 18) {
    return { person: 0, theme: 0, project: 15, org: 10 };
  }
  
  // Evening (18-24): Boost themes and people
  if (hour >= 18 || hour < 6) {
    return { person: 5, theme: 15, project: 0, org: 0 };
  }
  
  return { person: 0, theme: 0, project: 0, org: 0 };
}

// Then in each generation method, add:
const timeBoost = this.getTimeOfDayBoost();
score += timeBoost.person; // or .project, .theme, .org
```

### 8. Add Diversity Enforcement

#### Ensure Mix of Suggestion Types

```javascript
// In generateSuggestions(), after sorting:
const allSuggestions = [...people, ...projects, ...themes, ...orgs]
  .sort((a, b) => b.score - a.score);

// Enforce diversity: ensure at least 1 of each type if available
const finalSuggestions = [];
const typesSeen = new Set();

// First pass: add top suggestion of each type
['person', 'project', 'theme', 'org'].forEach(type => {
  const suggestion = allSuggestions.find(s => s.suggestion_type === type);
  if (suggestion) {
    finalSuggestions.push(suggestion);
    typesSeen.add(suggestion.target_id);
  }
});

// Second pass: fill remaining slots with highest scores
allSuggestions.forEach(s => {
  if (!typesSeen.has(s.target_id) && finalSuggestions.length < this.maxSuggestions) {
    finalSuggestions.push(s);
    typesSeen.add(s.target_id);
  }
});

return finalSuggestions;
```

### 9. Add User Preferences

#### Let Users Customize Suggestion Types

**Step 1**: Add preferences to user profile:

```javascript
// In Supabase, add column to community table:
ALTER TABLE community ADD COLUMN suggestion_preferences JSONB DEFAULT '{"types": ["person", "project", "theme", "org"], "minScore": 10}'::jsonb;
```

**Step 2**: Use preferences in engine:

```javascript
// In generateSuggestions():
const preferences = profile.suggestion_preferences || {
  types: ['person', 'project', 'theme', 'org'],
  minScore: 10
};

// Filter by preferred types
const allSuggestions = [...people, ...projects, ...themes, ...orgs]
  .filter(s => preferences.types.includes(s.suggestion_type))
  .filter(s => s.score >= preferences.minScore)
  .sort((a, b) => b.score - a.score);
```

### 10. Add Analytics Tracking

#### Track Which Suggestions Get Clicked

**Step 1**: Add tracking function:

```javascript
// In ui.js, add method:
async trackSuggestionClick(suggestion) {
  try {
    await window.supabase
      .from('suggestion_clicks')
      .insert({
        user_id: window.currentUserProfile.id,
        suggestion_type: suggestion.suggestion_type,
        target_id: suggestion.target_id,
        score: suggestion.score,
        clicked_at: new Date().toISOString()
      });
  } catch (err) {
    console.error('Failed to track click:', err);
  }
}
```

**Step 2**: Call on click:

```javascript
// In start-integration.js, modify handleSuggestionClick:
window.handleSuggestionClick = function(handler, element) {
  const dataAttr = element.getAttribute('data-suggestion-data');
  const data = dataAttr ? JSON.parse(dataAttr) : {};
  
  // Track the click
  if (window.DailySuggestionsUI) {
    window.DailySuggestionsUI.trackSuggestionClick(data);
  }
  
  // ... rest of function
};
```

## Testing Your Customizations

After making changes:

1. **Clear cache**: Force refresh (Ctrl+Shift+R or Cmd+Shift+R)
2. **Regenerate suggestions**: 
   ```javascript
   await window.DailySuggestionsEngine.generateSuggestions(window.currentUserProfile);
   ```
3. **Check scores**: 
   ```javascript
   const suggestions = await window.DailySuggestionsStore.getSuggestionsForDate(
     window.currentUserProfile.id,
     window.DailySuggestionsEngine.getTodayKey()
   );
   console.table(suggestions);
   ```
4. **Test UI**: Open START modal and verify changes

## Best Practices

1. **Test incrementally**: Make one change at a time
2. **Keep backups**: Save original values in comments
3. **Document changes**: Add comments explaining your customizations
4. **Monitor performance**: Check generation time after changes
5. **Validate data**: Ensure queries return expected results
6. **Test edge cases**: Empty profiles, new users, etc.

## Common Pitfalls

1. **Breaking RLS**: Always use community.id for joins, not auth.uid()
2. **Infinite loops**: Be careful with recursive queries
3. **Performance**: Limit query results to avoid slow generation
4. **Type safety**: Validate data before using (check for null/undefined)
5. **Cache invalidation**: Remember to clear cache when testing

## Need Help?

- Check console for errors
- Review full documentation: `docs/DAILY_SUGGESTIONS_ENGINE.md`
- Use test console: `test-daily-suggestions.html`
- Check GitHub issues

## Share Your Customizations!

If you create useful customizations, consider:
- Documenting them
- Sharing with the community
- Contributing back to the project

Happy customizing! 🎨
