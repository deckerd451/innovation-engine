# Theme Visibility Fix - Test Checklist

## Quick Test Steps

### 1. Verify Theme Participation Data
Open browser console and check for these logs when the dashboard loads:

```
📊 Raw data loaded: {
  themeParticipants: X  // Should be > 0 if you're in any themes
}
```

### 2. Check Theme Node Creation
Look for theme creation logs:

```
🎯 Created theme nodes: X
```

And verify user participation is detected:

```
✅ Showing theme "Theme Name": {
  theme_id: "uuid-here",
  user_is_participant: true,
  isUserConnected: true,
  ...
}
```

### 3. Visual Verification
- Themes you've joined should appear in the synapse view around your profile
- They should be positioned in an inner orbit (not far away)
- Clicking on them should show the theme panel

### 4. Test Join/Leave Flow
1. **Join a new theme**:
   - Switch to Discovery Mode (toggle in top-right)
   - Click on a theme you haven't joined
   - Click "Join Theme"
   - Verify the theme appears in your network after reload

2. **Leave a theme**:
   - Click on a theme you're in
   - Click "Leave Theme"
   - Confirm the action
   - Verify the theme disappears from your network (unless you have projects in it)

### 5. Check Console Logs
After joining a theme, you should see:

```
✓ You've joined "Theme Name"!
🔄 Refreshing synapse after joining theme...
🔄 Calling reloadAllData...
🔄 Calling rebuildGraph...
```

Then on reload:

```
✅ Showing theme "Theme Name": {
  user_is_participant: true,
  isUserConnected: true
}
```

## Expected Behavior

### My Network Mode (Default)
- **Shows**: Themes you've joined OR themes containing your projects
- **Hides**: Themes you have no connection to

### Discovery Mode
- **Shows**: ALL active themes (both connected and unconnected)
- **Connected themes**: Inner orbit around your profile
- **Unconnected themes**: Outer orbit (discoverable)

## Common Issues to Check

### Theme Not Appearing?
1. Check if `user_is_participant` is `true` in console logs
2. Verify entry exists in `theme_participants` table (check Supabase)
3. Check if theme is expired (`expires_at` < now)
4. Check if theme status is 'active'

### Theme Appearing When It Shouldn't?
1. Check if you have projects in that theme
2. Verify you're not in Discovery Mode

### Database Verification
Run this query in Supabase SQL editor:

```sql
-- Check your theme participations
SELECT 
  tp.theme_id,
  tc.title as theme_name,
  tp.engagement_level,
  tp.joined_at,
  c.name as your_name
FROM theme_participants tp
JOIN theme_circles tc ON tc.id = tp.theme_id
JOIN community c ON c.id = tp.community_id
WHERE c.user_id = auth.uid()
ORDER BY tp.joined_at DESC;
```

## Debug Commands

Open browser console and run:

```javascript
// Check current user's themes
const currentUser = window.synapseData?.nodes?.find(n => n.isCurrentUser);
console.log('My themes:', currentUser?.themes);
console.log('My projects:', currentUser?.projects);

// Check all theme nodes
const themes = window.synapseData?.nodes?.filter(n => n.type === 'theme');
console.log('All themes:', themes?.map(t => ({
  title: t.title,
  user_is_participant: t.user_is_participant,
  participant_count: t.participant_count
})));
```

## Success Criteria
✅ Themes you've joined appear in synapse view  
✅ Console shows `user_is_participant: true` for your themes  
✅ Join/leave actions update the view correctly  
✅ Discovery mode shows all themes  
✅ My Network mode shows only connected themes  
