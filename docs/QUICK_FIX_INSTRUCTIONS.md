# Quick Fix for START Sequence SQL Error

## The Problem
The SQL function has an error: "could not identify an equality operator for type json"

This happens because `json_object_agg` needs text keys, not json values.

## The Solution (3 Steps)

### Step 1: Drop the Old Function

Go to your Supabase SQL Editor at:
https://supabase.com/dashboard/project/hvmotpzhliufzomewzfl/sql/new

Then run:

```sql
DROP FUNCTION IF EXISTS get_start_sequence_data(UUID);
```

Click "Run" and wait for success message.

### Step 2: Create the New Function

Copy the **entire contents** of `migrations/START_SEQUENCE_QUERY.sql` from GitHub:

**Direct link to raw file:**
https://raw.githubusercontent.com/Charlestonhacks/charlestonhacks.github.io/main/migrations/START_SEQUENCE_QUERY.sql

1. Click the link above
2. Press Ctrl+A (or Cmd+A on Mac) to select all
3. Press Ctrl+C (or Cmd+C) to copy
4. Go back to Supabase SQL Editor
5. Paste the entire SQL code
6. Click "Run"
7. Wait for success message

### Step 3: Verify Function Exists

In Supabase SQL Editor, run:

```sql
SELECT routine_name FROM information_schema.routines 
WHERE routine_name = 'get_start_sequence_data';
```

You should see:

```
| routine_name            |
| ----------------------- |
| get_start_sequence_data |
```

### Step 4: Test in Dashboard

1. Open your dashboard: https://charlestonhacks.github.io/dashboard.html
2. Open browser console (F12 or right-click → Inspect → Console)
3. Copy the entire contents of `test-start-in-dashboard.js`
4. Paste into console and press Enter
5. Watch the test results

## What Was Fixed

- Cast `type` and `action_type` to `::text` in `json_object_agg` calls
- Added `COALESCE` to handle empty results
- Cast `COUNT(*)` to `int` explicitly
- Return empty JSON `{}` as fallback for empty results

The key fix: `json_object_agg(type::text, count)` instead of `json_object_agg(type, count)`

## Expected Result

After running the updated SQL, the test should show:

```
✓ SQL function returned data!
✓ Report generator works!
✓ Summary generated!
✓ Insights generated!
✓ START UI opened!
```

## Still Having Issues?

If you still get the same error after running the updated SQL:

1. Check that the function was actually replaced:
   ```sql
   SELECT routine_name, routine_definition 
   FROM information_schema.routines 
   WHERE routine_name = 'get_start_sequence_data';
   ```

2. Make sure you clicked "Run" after pasting the SQL

3. Check for any error messages in Supabase SQL Editor
