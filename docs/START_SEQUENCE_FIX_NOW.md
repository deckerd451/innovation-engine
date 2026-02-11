# 🚀 FIX START SEQUENCE NOW - 3 STEPS

## ✅ STEP 1: Drop Old Function in Supabase

1. Go to: https://supabase.com/dashboard/project/hvmotpzhliufzomewzfl/sql/new
2. Paste this and click "Run":

```sql
DROP FUNCTION IF EXISTS get_start_sequence_data(UUID);
```

3. Wait for "Success" message

---

## ✅ STEP 2: Create New Function in Supabase

1. Go to: https://raw.githubusercontent.com/Charlestonhacks/charlestonhacks.github.io/main/migrations/START_SEQUENCE_QUERY.sql
2. Press **Ctrl+A** (select all) then **Ctrl+C** (copy)
3. Go back to Supabase SQL Editor
4. Paste and click "Run"
5. Wait for "Success" message

---

## ✅ STEP 3: Test in Dashboard Console

1. Open: https://charlestonhacks.github.io/dashboard.html
2. Press **F12** to open console
3. Copy this entire script:

```javascript
console.log('%c🧪 Testing START Sequence', 'color:#0f8; font-weight:bold; font-size:16px');

async function testStartSequence() {
  console.log('\n📋 Test 1: Check if scripts are loaded');
  console.log('✓ getStartSequenceData:', typeof window.getStartSequenceData);
  console.log('✓ EnhancedStartUI:', typeof window.EnhancedStartUI);
  console.log('✓ StartSequenceReport:', typeof window.StartSequenceReport);
  
  console.log('\n📋 Test 2: Check Supabase');
  console.log('✓ Supabase client:', typeof window.supabase);
  
  try {
    const { data: { user } } = await window.supabase.auth.getUser();
    console.log('✓ User authenticated:', user?.email);
    console.log('✓ User ID:', user?.id);
  } catch (error) {
    console.error('✗ Auth error:', error);
    return;
  }
  
  console.log('\n📋 Test 3: Test SQL Function directly');
  try {
    const { data: { user } } = await window.supabase.auth.getUser();
    const { data, error } = await window.supabase.rpc('get_start_sequence_data', {
      auth_user_id: user.id
    });
    
    if (error) {
      console.error('✗ SQL Error:', error);
      return;
    }
    
    console.log('✓ SQL function returned data!');
    console.log('Data type:', typeof data);
    console.log('Data keys:', Object.keys(data || {}));
    console.log('Full data:', data);
  } catch (error) {
    console.error('✗ Exception:', error);
    return;
  }
  
  console.log('\n📋 Test 4: Test Report Generator');
  try {
    const data = await window.getStartSequenceData(true);
    console.log('✓ Report generator works!');
    console.log('Has profile:', data.has_profile);
    console.log('Profile name:', data.profile?.name);
    console.log('Immediate actions:', {
      pending_requests: data.immediate_actions?.pending_requests?.count,
      unread_messages: data.immediate_actions?.unread_messages?.count,
      pending_bids: data.immediate_actions?.pending_bids?.count
    });
    console.log('Opportunities:', {
      skill_matched_projects: data.opportunities?.skill_matched_projects?.count,
      active_themes: data.opportunities?.active_themes?.count
    });
  } catch (error) {
    console.error('✗ Report generator error:', error);
    return;
  }
  
  console.log('\n📋 Test 5: Generate Summary');
  try {
    const summary = await window.generateStartSummary(true);
    console.log('✓ Summary generated!');
    console.log('Summary:', summary);
  } catch (error) {
    console.error('✗ Summary error:', error);
    return;
  }
  
  console.log('\n📋 Test 6: Generate Insights');
  try {
    const insights = await window.generateStartInsights(true);
    console.log('✓ Insights generated!');
    console.log('Number of insights:', insights.length);
    insights.forEach((insight, i) => {
      console.log(`  ${i + 1}. [${insight.priority}] ${insight.message}`);
    });
  } catch (error) {
    console.error('✗ Insights error:', error);
    return;
  }
  
  console.log('\n📋 Test 7: Open Enhanced START UI');
  try {
    await window.EnhancedStartUI.open();
    console.log('✓ START UI opened! Check the modal.');
  } catch (error) {
    console.error('✗ UI error:', error);
    return;
  }
  
  console.log('\n✅ All tests passed!');
}

testStartSequence();
```

4. Paste into console and press **Enter**
5. Watch for "✅ All tests passed!"

---

## 🎉 SUCCESS LOOKS LIKE:

```
✓ SQL function returned data!
✓ Report generator works!
✓ Summary generated!
✓ Insights generated!
✓ START UI opened!
✅ All tests passed!
```

---

## ❌ IF YOU STILL GET ERRORS:

1. Make sure you ran BOTH SQL commands in Supabase (DROP then CREATE)
2. Verify function exists:
   ```sql
   SELECT routine_name FROM information_schema.routines 
   WHERE routine_name = 'get_start_sequence_data';
   ```
3. Hard refresh dashboard: **Ctrl+Shift+R** (or **Cmd+Shift+R** on Mac)
4. Try test again

---

## 🔧 WHAT WAS FIXED:

The SQL function was trying to use JSON values as keys in `json_object_agg`, which PostgreSQL doesn't allow. 

**The fix:** Cast to text with `::text`
- Before: `json_object_agg(type, count)`
- After: `json_object_agg(type::text, count)`

This was applied to:
- `activity_breakdown` (line ~290)
- `connections.by_type` (line ~360)
