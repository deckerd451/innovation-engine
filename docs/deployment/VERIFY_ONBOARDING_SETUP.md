# Verify Onboarding Setup

## Quick Check

Run this in Supabase SQL Editor to verify if the onboarding functions exist:

```sql
-- Check if functions exist
SELECT 
  routine_name,
  routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name IN ('update_onboarding_step', 'complete_onboarding')
ORDER BY routine_name;
```

**Expected Result:** 2 rows showing both functions

---

## If Functions Are Missing

If you see 0 or 1 rows, run `RUN_THIS_TO_FIX_ONBOARDING.sql` in Supabase SQL Editor.

---

## If Functions Exist

The issue is likely just browser cache. Do a hard refresh:
- **Mac:** Cmd + Shift + R
- **Windows/Linux:** Ctrl + Shift + R

Then test the Next button again.

---

## Debug Steps

1. Open browser console (F12)
2. Click the bell icon (notification button)
3. Click "Next: Choose Interests"
4. Look for these console messages:

### Success Pattern:
```
🔄 Moving to next onboarding step from 0 to 1
📝 Calling update_onboarding_step with: {auth_user_id: "...", step_number: 1}
✅ Onboarding step updated in database: {success: true, step: 1}
🎨 Re-rendering START UI with step: 1
```

### Error Pattern:
```
❌ RPC error: {...}
Error details: {message: "...", code: "...", ...}
```

If you see an error, copy the full error message and we'll fix it.

---

## Current Status

✅ JavaScript enhanced with error handling (pushed to GitHub)
✅ SQL migration file created (`RUN_THIS_TO_FIX_ONBOARDING.sql`)
⏳ Need to verify functions exist in Supabase
⏳ Need to test Next button after hard refresh
