# Daily Suggestions Engine

## Overview

The Daily Suggestions Engine is a client-side recommendation system that generates 5-10 personalized, actionable suggestions for each user every day. It integrates seamlessly with the existing START/Your Focus Today experience and respects all data safety constraints.

## Features

✅ **Personalized Recommendations**: Uses user profile, interests, skills, and activity to generate relevant suggestions  
✅ **Multiple Types**: Suggests people, projects, themes, and organizations  
✅ **Explainable**: Every suggestion includes 1-3 short reasons explaining why it was recommended  
✅ **Stable**: Suggestions are cached per day and don't change on refresh  
✅ **Cooldown System**: Prevents re-suggesting the same items within 7 days  
✅ **Fallback Logic**: Always returns at least 5 suggestions, even with limited data  
✅ **Non-Destructive**: Read-only operations on existing tables, optional new table for caching  
✅ **Dual Storage**: Uses Supabase table if available, falls back to localStorage automatically  

## Architecture

### File Structure

```
assets/js/suggestions/
├── index.js              # Main entry point, initialization
├── engine.js             # Core scoring and ranking logic
├── queries.js            # Supabase read operations
├── store.js              # Caching (Supabase + localStorage)
├── ui.js                 # UI rendering and interactions
└── start-integration.js  # Integration with START UI

migrations/
└── create_daily_suggestions_table.sql  # Optional Supabase table
```

### Data Flow

```
1. User logs in
   ↓
2. Profile loaded event fires
   ↓
3. Daily Suggestions Engine initializes
   ↓
4. Check if today's suggestions exist
   ↓
5. If not, generate new suggestions:
   - Fetch user's current state (connections, projects, themes, orgs)
   - Get candidate pools (exclude existing relationships)
   - Score each candidate using multiple factors
   - Generate explanations for top scores
   - Store in cache (Supabase or localStorage)
   ↓
6. START UI opens
   ↓
7. Suggestions are rendered as actionable cards
   ↓
8. User clicks suggestion → navigates to relevant view
```

## Scoring Heuristics

### People Suggestions

| Factor | Score | Example Reason |
|--------|-------|----------------|
| Shared interests | 10 per match | "Shared interest: Web3" |
| Shared skills | 15 per match | "Matches your skill: React" |
| Mutual connections | 20 per mutual | "2 mutual connections" |
| Recently active (7 days) | 10 | "Active this week" |
| High connection count | 5 | (implicit quality signal) |

### Project Suggestions

| Factor | Score | Example Reason |
|--------|-------|----------------|
| Required skills match | 20 per match | "Needs your skill: Python" |
| Tags/interests overlap | 10 per match | "Matches interest: AI" |
| Recently updated (7 days) | 15 | "Updated this week" |
| In user's theme | 25 | "In your theme" |

### Theme Suggestions

| Factor | Score | Example Reason |
|--------|-------|----------------|
| Tags/interests overlap | 15 per match | "Matches interest: Blockchain" |
| Bio keyword match | 10 per match | "Related to your profile" |
| High activity score (>50) | 20 | "Highly active theme" |
| Recently active (7 days) | 10 | "Active this week" |
| Connected users participating | 15 per connection | "3 connections participating" |

### Organization Suggestions

| Factor | Score | Example Reason |
|--------|-------|----------------|
| Industry match | 15 per match | "Industry: Healthcare" |
| High follower count (>10) | 10 | "Popular organization" |
| Has opportunities | 20 | "5 open opportunities" |
| Recently updated (14 days) | 10 | "Recently active" |

## Exclusion Rules

The engine **never** suggests:

- **People**: Current user, accepted connections, pending connection requests
- **Projects**: User's own projects, projects with membership, pending project requests
- **Themes**: Themes user is already participating in
- **Organizations**: Organizations user is already a member of
- **Cooldown**: Any item suggested in the last 7 days (unless it scores very high)

## Storage Options

### Option 1: Supabase Table (Recommended)

Run the migration in `migrations/create_daily_suggestions_table.sql`:

```sql
-- Creates daily_suggestions table with RLS
-- Users can only read/write their own suggestions
-- Automatic cleanup function included
```

**Benefits**:
- Persistent across devices
- Better for analytics
- Automatic cleanup
- Respects RLS policies

### Option 2: localStorage (Automatic Fallback)

If the Supabase table doesn't exist, the system automatically uses localStorage:

**Benefits**:
- No database setup required
- Works immediately
- Zero server load

**Limitations**:
- Per-device only
- Limited storage (5-10MB)
- Manual cleanup

## Integration with START UI

The engine integrates seamlessly with the existing START UI:

1. **Automatic Enhancement**: When the START modal opens, suggestions are automatically added
2. **Visual Consistency**: Uses the same design language as existing START cards
3. **Action Handlers**: Clicking a suggestion navigates to the relevant view (people, projects, themes, orgs)
4. **Why Button**: Each suggestion has a "?" button that explains the reasoning

### Example Suggestion Card

```
┌─────────────────────────────────────────┐
│  [Icon]  Connect with Sarah Johnson   ? │
│          Shared interest: AI            │
│          Matches your skill: Python     │
│          2 mutual connections           │
│                                         │
│          [Connect →]                    │
└─────────────────────────────────────────┘
```

## API Reference

### Initialization

```javascript
// Automatic initialization on profile load
window.addEventListener('profile-loaded', async (e) => {
  await window.initDailySuggestions();
});

// Manual initialization
await window.initDailySuggestions();
```

### Getting Suggestions

```javascript
// Get suggestions for START UI
const suggestions = await window.DailySuggestionsUI.getSuggestionsForStartUI();

// Get raw suggestions for today
const profile = window.currentUserProfile;
const today = engine.getTodayKey(); // YYYY-MM-DD
const suggestions = await window.DailySuggestionsStore.getSuggestionsForDate(profile.id, today);
```

### Generating Fresh Suggestions

```javascript
// Force regeneration (ignores cache)
const profile = window.currentUserProfile;
const suggestions = await window.DailySuggestionsEngine.generateSuggestions(profile);
```

### Cleaning Old Data

```javascript
// Clean suggestions older than 30 days
const profile = window.currentUserProfile;
await window.DailySuggestionsStore.cleanOldSuggestions(profile.id, 30);
```

## Configuration

### Feature Flag

```javascript
// Enable/disable the engine
window.appFlags = window.appFlags || {};
window.appFlags.dailySuggestions = true; // or false
```

### Tuning Parameters

Edit `assets/js/suggestions/engine.js`:

```javascript
constructor(store) {
  this.minSuggestions = 5;      // Minimum suggestions per day
  this.maxSuggestions = 10;     // Maximum suggestions per day
  this.cooldownDays = 7;        // Days before re-suggesting
}
```

### Scoring Weights

Adjust scoring factors in `engine.js`:

```javascript
// Example: Increase weight for shared skills
if (sharedSkills.length > 0) {
  score += sharedSkills.length * 20; // was 15
  reasons.push(`Matches your skill: ${sharedSkills[0]}`);
}
```

## Testing

### Manual Testing

1. Open browser console
2. Check initialization:
   ```javascript
   console.log(window.DailySuggestionsEngine);
   console.log(window.DailySuggestionsStore);
   console.log(window.DailySuggestionsUI);
   ```

3. Generate test suggestions:
   ```javascript
   const profile = window.currentUserProfile;
   const suggestions = await window.DailySuggestionsEngine.generateSuggestions(profile);
   console.table(suggestions);
   ```

4. Open START modal and verify suggestions appear

### Debugging

Enable verbose logging:

```javascript
// In browser console
localStorage.setItem('debug_suggestions', 'true');
```

Check storage:

```javascript
// Check Supabase
const { data } = await window.supabase
  .from('daily_suggestions')
  .select('*')
  .eq('user_id', window.currentUserProfile.id);
console.table(data);

// Check localStorage
const keys = Object.keys(localStorage).filter(k => k.includes('daily_suggestions'));
console.log(keys);
```

## Performance

### Optimization Strategies

1. **Caching**: Suggestions are generated once per day and cached
2. **Lazy Loading**: Engine only initializes after profile load
3. **Batch Queries**: All candidate pools fetched in parallel
4. **Limit Results**: Queries limited to 30-50 candidates per type
5. **Incremental Scoring**: Stops scoring when enough high-quality suggestions found

### Expected Performance

- **Initial Generation**: 1-3 seconds (first time each day)
- **Cached Load**: <100ms (subsequent loads same day)
- **Database Queries**: 8-12 queries (parallelized)
- **Memory Usage**: <5MB (including cache)

## Troubleshooting

### No Suggestions Appearing

1. Check if engine initialized:
   ```javascript
   console.log(window.DailySuggestionsEngine);
   ```

2. Check if profile loaded:
   ```javascript
   console.log(window.currentUserProfile);
   ```

3. Check for errors:
   ```javascript
   // Open console and look for red errors
   ```

4. Force regeneration:
   ```javascript
   await window.DailySuggestionsEngine.ensureTodaysSuggestions();
   ```

### Suggestions Not Relevant

1. Check user profile completeness:
   - Skills filled in?
   - Interests added?
   - Bio written?

2. Check scoring logic in `engine.js`
3. Adjust scoring weights
4. Add more scoring factors

### Storage Issues

1. Check if Supabase table exists:
   ```javascript
   const { data, error } = await window.supabase
     .from('daily_suggestions')
     .select('id')
     .limit(1);
   console.log(error);
   ```

2. Check localStorage quota:
   ```javascript
   const used = JSON.stringify(localStorage).length;
   console.log(`localStorage: ${(used / 1024).toFixed(2)} KB used`);
   ```

3. Clear old data:
   ```javascript
   await window.DailySuggestionsStore.cleanOldSuggestions(
     window.currentUserProfile.id,
     7 // keep only last 7 days
   );
   ```

## Future Enhancements

### Potential Improvements

1. **Machine Learning**: Train a model on user interactions to improve scoring
2. **Collaborative Filtering**: "Users like you also connected with..."
3. **Time-Based Scoring**: Boost suggestions based on time of day/week
4. **Feedback Loop**: Track which suggestions users act on
5. **A/B Testing**: Test different scoring algorithms
6. **Diversity**: Ensure suggestions span multiple types
7. **Trending**: Boost items that are trending in the network
8. **Seasonal**: Adjust for events, hackathons, etc.

### Analytics Ideas

1. **Suggestion Click Rate**: Track which suggestions get clicked
2. **Type Preferences**: Which types (people/projects/themes/orgs) are most popular
3. **Reason Effectiveness**: Which reasons lead to clicks
4. **Time to Action**: How long until users act on suggestions
5. **Conversion Rate**: Suggestions → actual connections/joins

## Security & Privacy

### Data Safety

✅ **Read-Only**: Never modifies existing tables  
✅ **RLS Compliant**: Respects all Row Level Security policies  
✅ **User Isolation**: Users can only see their own suggestions  
✅ **No PII Logging**: Never logs full query results or personal data  
✅ **Opt-Out Ready**: Easy to disable via feature flag  

### Privacy Considerations

- Suggestions are based on **public profile data** only
- No tracking of browsing behavior
- No cross-user data sharing
- Suggestions stored per-user, never aggregated
- Automatic cleanup of old suggestions

## Support

For issues or questions:

1. Check this documentation
2. Review console logs for errors
3. Test with manual API calls
4. Check GitHub issues
5. Contact the development team

## License

Same as parent project.
