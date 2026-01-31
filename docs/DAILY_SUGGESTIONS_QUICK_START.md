# Daily Suggestions Engine - Quick Start Guide

## 🚀 Get Started in 5 Minutes

### Step 1: Deploy the Code

The Daily Suggestions Engine is already integrated into your dashboard. Just deploy the updated code:

```bash
git add .
git commit -m "Add Daily Suggestions Engine"
git push origin main
```

GitHub Pages will automatically deploy the changes.

### Step 2: (Optional) Create Supabase Table

If you want persistent suggestions across devices, run this SQL in your Supabase SQL Editor:

```sql
-- Copy and paste from migrations/create_daily_suggestions_table.sql
-- Or just run this command:
```

**Don't want to use Supabase?** Skip this step! The system will automatically use localStorage instead.

### Step 3: Test It Out

1. Open your dashboard: `https://yourdomain.com/dashboard.html`
2. Log in with your account
3. Click the **START** button (green play icon in top right)
4. You should see a new section: **"Personalized for You"**
5. Click any suggestion to navigate to that view
6. Click the **"?"** button on any suggestion to see why it was recommended

### Step 4: Verify It's Working

Open browser console (F12) and check:

```javascript
// Should see the engine
console.log(window.DailySuggestionsEngine);

// Should see today's suggestions
const profile = window.currentUserProfile;
const today = window.DailySuggestionsEngine.getTodayKey();
const suggestions = await window.DailySuggestionsStore.getSuggestionsForDate(profile.id, today);
console.table(suggestions);
```

## ✅ What You Get

### Automatic Features

- ✅ 5-10 personalized suggestions per day
- ✅ Suggestions based on your skills, interests, and activity
- ✅ Clear explanations for each suggestion
- ✅ Stable suggestions (don't change on refresh)
- ✅ 7-day cooldown (no repeated suggestions)
- ✅ Automatic fallback to localStorage if Supabase table doesn't exist
- ✅ Seamless integration with existing START UI

### Suggestion Types

1. **People**: Connect with users who share your interests/skills
2. **Projects**: Join projects that need your skills
3. **Themes**: Explore themes related to your interests
4. **Organizations**: Follow organizations in your industry

### Example Suggestions

```
👤 Connect with Sarah Johnson
   • Shared interest: AI
   • Matches your skill: Python
   • 2 mutual connections

💡 Join "AI Healthcare Platform"
   • Needs your skill: React
   • In your theme
   • Updated this week

🎯 Explore "Web3 & Decentralization"
   • Matches interest: Blockchain
   • 3 connections participating
   • Highly active theme
```

## 🎨 Customization

### Change Number of Suggestions

Edit `assets/js/suggestions/engine.js`:

```javascript
constructor(store) {
  this.minSuggestions = 5;   // Change to 3, 7, etc.
  this.maxSuggestions = 10;  // Change to 8, 12, etc.
  this.cooldownDays = 7;     // Change to 3, 14, etc.
}
```

### Adjust Scoring Weights

Want to prioritize certain factors? Edit the scoring in `engine.js`:

```javascript
// Example: Make shared skills more important
if (sharedSkills.length > 0) {
  score += sharedSkills.length * 25; // was 15
  reasons.push(`Matches your skill: ${sharedSkills[0]}`);
}
```

### Disable the Engine

Set the feature flag to false:

```javascript
// In your code or browser console
window.appFlags.dailySuggestions = false;
```

## 🔧 Troubleshooting

### Problem: No suggestions appearing

**Solution 1**: Check if engine initialized
```javascript
console.log(window.DailySuggestionsEngine); // Should not be undefined
```

**Solution 2**: Check if profile loaded
```javascript
console.log(window.currentUserProfile); // Should show your profile
```

**Solution 3**: Force regeneration
```javascript
await window.DailySuggestionsEngine.ensureTodaysSuggestions();
```

### Problem: Suggestions not relevant

**Solution 1**: Fill out your profile
- Add skills
- Add interests
- Write a bio
- Connect with people

**Solution 2**: Wait for more data
- The engine needs some activity to generate good suggestions
- Connect with a few people
- Join a project or theme
- Come back tomorrow for better suggestions

### Problem: Storage errors

**Solution 1**: Check Supabase table
```javascript
const { data, error } = await window.supabase
  .from('daily_suggestions')
  .select('id')
  .limit(1);
console.log(error); // Should be null
```

**Solution 2**: Clear localStorage
```javascript
// Clear old suggestions
await window.DailySuggestionsStore.cleanOldSuggestions(
  window.currentUserProfile.id,
  7 // keep only last 7 days
);
```

## 📊 Monitoring

### Check Today's Suggestions

```javascript
const profile = window.currentUserProfile;
const today = window.DailySuggestionsEngine.getTodayKey();
const suggestions = await window.DailySuggestionsStore.getSuggestionsForDate(profile.id, today);

console.log(`Found ${suggestions.length} suggestions for today`);
console.table(suggestions);
```

### Check Storage Method

```javascript
console.log('Using Supabase:', window.DailySuggestionsStore.useSupabase);
// true = Supabase table
// false = localStorage fallback
```

### View Suggestion Details

```javascript
const suggestions = await window.DailySuggestionsUI.getSuggestionsForStartUI();
suggestions.forEach(s => {
  console.log(`${s.message}`);
  console.log(`  Reasons: ${s.detail}`);
  console.log(`  Score: ${s.data.score || 'N/A'}`);
  console.log('---');
});
```

## 🎯 Best Practices

### For Users

1. **Complete your profile**: More data = better suggestions
2. **Check daily**: New suggestions generated each day
3. **Act on suggestions**: Click to explore recommended items
4. **Use the "?" button**: Understand why items were suggested

### For Admins

1. **Monitor performance**: Check console for errors
2. **Clean old data**: Run cleanup monthly
3. **Adjust scoring**: Tune based on user feedback
4. **Track engagement**: See which suggestions get clicked

### For Developers

1. **Test with real data**: Use production-like profiles
2. **Check edge cases**: New users, empty profiles, etc.
3. **Monitor queries**: Ensure RLS policies work
4. **Version control**: Use cache-busting query params

## 📚 Next Steps

1. **Read full documentation**: `docs/DAILY_SUGGESTIONS_ENGINE.md`
2. **Review the code**: Start with `assets/js/suggestions/index.js`
3. **Customize scoring**: Edit `assets/js/suggestions/engine.js`
4. **Add analytics**: Track which suggestions get clicked
5. **Enhance UI**: Customize the suggestion cards

## 🆘 Need Help?

1. Check the full documentation
2. Review console logs
3. Test with manual API calls
4. Check GitHub issues
5. Contact the development team

## 🎉 You're Done!

The Daily Suggestions Engine is now running and generating personalized recommendations for your users. Check the START modal to see it in action!
