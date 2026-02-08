# Quick Start Guide - Supabase SQL

## 🚀 First-Time Database Setup

Run these scripts **in order** via Supabase Dashboard SQL Editor:

### Step 1: Core Tables
```
1. tables/STEP_2_create_messaging_tables.sql
2. tables/STEP_4_create_activity_log.sql
3. tables/STEP_5_create_achievements.sql
4. tables/STEP_6_create_leaderboards.sql
5. tables/create_daily_suggestions_table_v2.sql
6. tables/CREATE_THEME_PARTICIPANTS.sql
7. tables/unified_network_discovery_schema.sql
```

### Step 2: Functions & Triggers
```
8. functions/HELPERS_functions_and_triggers.sql
9. functions/get_start_sequence_data.sql
```

### Step 3: Security Policies
```
10. policies/STEP_8_create_rls_policies.sql
11. policies/ADD_AVATAR_STORAGE_POLICIES.sql
```

### Step 4: Verify Setup
```
diagnostics/CHECK_COMMUNITY_SCHEMA.sql
diagnostics/verify-sql-function.sql
policies/CHECK_RLS_POLICIES.sql
```

## 📍 How to Run a Script

### Via Supabase Dashboard (Recommended)
1. Go to: `https://supabase.com/dashboard/project/YOUR_PROJECT/sql/new`
2. Open the SQL file in your editor
3. Copy all contents (Ctrl+A, Ctrl+C)
4. Paste into Supabase SQL Editor
5. Click **"Run"**
6. Check for errors in output

### Via Supabase CLI
```bash
supabase db execute -f supabase/sql/tables/STEP_2_create_messaging_tables.sql
```

## 🔧 Common Tasks

### Check Database Schema
```bash
diagnostics/CHECK_COMMUNITY_SCHEMA.sql
diagnostics/check-connections-schema.sql
```

### Fix Connection Counts
```bash
functions/fix-connection-count-trigger.sql
```

### Add Hidden Profiles Feature
```bash
fixes/ADD_IS_HIDDEN_COLUMN.sql
fixes/add-hidden-profiles-index-safe.sql
```

### Upgrade Daily Suggestions to V2
```bash
fixes/upgrade_daily_suggestions_to_v2.sql
```

### Rollback Daily Suggestions
```bash
fixes/rollback_daily_suggestions_v2.sql
```

## 🆘 Troubleshooting

### "Function doesn't exist"
```bash
diagnostics/verify-sql-function.sql
```

### "RLS policy blocking access"
```bash
policies/CHECK_RLS_POLICIES.sql
```

### "Column doesn't exist"
```bash
diagnostics/CHECK_COMMUNITY_SCHEMA.sql
```

### "Trigger not firing"
```bash
diagnostics/find-broken-trigger.sql
```

## ⚠️ Important Notes

- **Always backup** before running fixes
- **Test in development** first
- **Read the script** before running
- **Check dependencies** (some must run in order)
- **Verify results** after changes

## 📚 Full Documentation

See [README.md](README.md) for complete documentation.

---

**Need help?** Check the diagnostics scripts first!
