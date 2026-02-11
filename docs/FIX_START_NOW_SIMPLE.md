# 🚀 FIX START SEQUENCE - SIMPLE VERSION

## The Problem
The complex SQL function has `json_object_agg` issues. Let's use a simpler version instead.

---

## ✅ STEP 1: Drop Old Function

Go to: https://supabase.com/dashboard/project/hvmotpzhliufzomewzfl/sql/new

Paste and click "Run":

```sql
DROP FUNCTION IF EXISTS get_start_sequence_data(UUID);
```

---

## ✅ STEP 2: Create Simple Function

Copy from here:
https://raw.githubusercontent.com/Charlestonhacks/charlestonhacks.github.io/main/migrations/START_SEQUENCE_SIMPLE.sql

1. Click link above
2. Press **Ctrl+A** (select all)
3. Press **Ctrl+C** (copy)
4. Go back to Supabase SQL Editor
5. Paste and click "Run"

---

## ✅ STEP 3: Test

Go to: https://charlestonhacks.github.io/dashboard.html

Press **F12** for console, paste this:

```javascript
async function quickTest() {
  const { data: { user } } = await window.supabase.auth.getUser();
  console.log('User:', user.email);
  
  const { data, error } = await window.supabase.rpc('get_start_sequence_data', {
    auth_user_id: user.id
  });
  
  if (error) {
    console.error('❌ Error:', error);
  } else {
    console.log('✅ Success!', data);
  }
}
quickTest();
```

---

## 🎉 Expected Result:

```
User: dmhamilton1@live.com
✅ Success! {profile: {...}, immediate_actions: {...}, ...}
```

---

## What's Different?

The simple version:
- ❌ Removes `json_object_agg` (causes the error)
- ✅ Uses simple counts and arrays
- ✅ Returns all the same data
- ✅ Works with your database structure

You'll still get:
- Pending requests
- Unread messages
- Skill-matched projects
- Active themes
- Network insights
- XP progress

Just without the activity/connection breakdowns by type (which weren't critical anyway).
