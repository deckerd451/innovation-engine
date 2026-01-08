# Theme Circles - Database Setup Guide

## 🎯 Which SQL File Should I Use?

### Option 1: Fresh Start (RECOMMENDED)
**File:** `THEME_CIRCLES_SCHEMA_SAFE.sql`

**Use this if:**
- This is your first time setting up Theme Circles
- You want a clean slate
- You're okay with deleting any existing theme data

**What it does:**
- Drops existing theme tables (if any)
- Creates all tables from scratch
- Sets up functions, triggers, and RLS policies
- Creates helpful views

**⚠️ WARNING:** This will delete existing theme circle data!

---

### Option 2: Quick Fix (If you got an error)
**File:** `THEME_CIRCLES_QUICKFIX.sql`

**Use this if:**
- You got the "column status does not exist" error
- You have an incomplete theme_circles table from a previous attempt
- You want to preserve any existing data

**What it does:**
- Adds missing columns to existing table
- Creates indexes safely
- Does NOT delete data
- Idempotent (safe to run multiple times)

---

### Option 3: Original (IF NOT EXISTS approach)
**File:** `THEME_CIRCLES_SCHEMA.sql`

**Use this if:**
- You want the original "IF NOT EXISTS" approach
- You're certain the table doesn't exist yet
- You understand Postgres table creation

**Note:** This may fail if tables exist partially from previous runs.

---

## 📋 Step-by-Step Instructions

### Step 1: Choose Your Approach

**If you're not sure, use Option 1 (SAFE version)**

### Step 2: Apply the Schema

1. Open Supabase Dashboard
2. Go to **SQL Editor**
3. Create a new query
4. Copy the contents of your chosen SQL file
5. Paste into the editor
6. Click **Run**

### Step 3: Verify Installation

Run this query to verify everything is set up:

```sql
-- Check tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name LIKE 'theme%';

-- Should show:
-- theme_circles
-- theme_participants
-- theme_actions

-- Check the summary view works
SELECT * FROM active_themes_summary;

-- Should return empty result (no themes yet)
```

### Step 4: Test Theme Creation

From the admin UI:
1. Login as admin
2. Click **Menu** (bottom right)
3. Click **Create Theme Circle**
4. Fill in:
   - Title: "Test Theme"
   - Tags: "test"
   - Duration: 7 days
5. Click **Create**

Then verify in SQL:

```sql
SELECT id, title, status, origin_type, created_at, expires_at
FROM theme_circles
ORDER BY created_at DESC
LIMIT 5;
```

---

## 🔧 Troubleshooting

### Error: "relation theme_circles already exists"

**Solution:** Use `THEME_CIRCLES_SCHEMA_SAFE.sql` (it drops first)

OR manually drop:
```sql
DROP TABLE IF EXISTS theme_actions CASCADE;
DROP TABLE IF EXISTS theme_participants CASCADE;
DROP TABLE IF EXISTS theme_circles CASCADE;
```

Then re-run your chosen schema.

---

### Error: "column status does not exist"

**Solution:** Use `THEME_CIRCLES_QUICKFIX.sql`

This will add the missing columns to your existing table.

---

### Error: "function gen_random_uuid() does not exist"

**Solution:** Enable the pgcrypto extension:
```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

Then re-run the schema.

---

### Error: "permission denied for table community"

**Solution:** Make sure the `community` table exists and you have proper permissions.

Check with:
```sql
SELECT * FROM community LIMIT 1;
```

If this fails, the community table needs to be set up first.

---

## 📊 Useful Queries

### View all active themes
```sql
SELECT * FROM active_themes_summary;
```

### View theme with participants
```sql
SELECT
  tc.title,
  tc.expires_at,
  tc.activity_score,
  COUNT(tp.community_id) as participant_count
FROM theme_circles tc
LEFT JOIN theme_participants tp ON tc.id = tp.theme_id
WHERE tc.status = 'active'
GROUP BY tc.id;
```

### Manually trigger decay
```sql
SELECT decay_theme_circles();
```

### Check RLS policies
```sql
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE tablename LIKE 'theme%';
```

---

## 🗓️ Scheduling Auto-Decay

### Option 1: Supabase Database Webhooks
1. Go to Database → Webhooks
2. Create new webhook
3. Type: Scheduled
4. Cron: `0 * * * *` (every hour)
5. SQL: `SELECT decay_theme_circles();`

### Option 2: pg_cron (if available)
```sql
SELECT cron.schedule(
  'decay-themes',
  '0 * * * *',
  'SELECT decay_theme_circles();'
);
```

### Option 3: Client-side (temporary)
Call from your app periodically:
```javascript
// On app load
await supabase.rpc('decay_theme_circles');
```

---

## 📚 Next Steps

After the schema is applied:

1. ✅ Schema applied successfully
2. 📝 Test admin theme creation
3. 🎨 Implement theme rendering (see THEME_CIRCLES_IMPLEMENTATION_PLAN.md)
4. 🧲 Add gravity physics
5. 👆 Build interaction layer
6. 🤖 Implement auto-detection
7. ⏱️ Add decay visuals

See `THEME_CIRCLES_IMPLEMENTATION_PLAN.md` for full roadmap.

---

## 🆘 Need Help?

Common issues and solutions:

1. **Tables won't create** → Use SAFE version
2. **Missing columns** → Use QUICKFIX version
3. **Permission errors** → Check RLS policies and auth setup
4. **Function errors** → Make sure pgcrypto extension is enabled

Still stuck? Check the error message carefully and search Supabase docs for the specific error code.

---

*Last updated: 2026-01-08*
