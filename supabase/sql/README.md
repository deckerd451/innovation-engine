# Supabase SQL Scripts

This directory contains all SQL scripts for the CharlestonHacks application. These scripts are **manual reference files** that must be applied via the Supabase Dashboard or CLI.

## ⚠️ Important Notes

- **No automated migrations**: These scripts are NOT executed automatically by the application
- **Manual application required**: Run these scripts manually through:
  - Supabase Dashboard SQL Editor: `https://supabase.com/dashboard/project/YOUR_PROJECT/sql/new`
  - Supabase CLI: `supabase db execute -f path/to/script.sql`
- **Not part of build process**: These files are reference documentation and setup scripts only

## 📁 Directory Structure

### `/tables/` - Table Creation Scripts
Core database table schemas and structures.

- `STEP_2_create_messaging_tables.sql` - Conversations and messages tables
- `STEP_4_create_activity_log.sql` - Activity tracking table
- `STEP_5_create_achievements.sql` - Achievements and user achievements
- `STEP_6_create_leaderboards.sql` - XP, streak, and connection leaderboards
- `create_daily_suggestions_table.sql` - Daily suggestions (v1)
- `create_daily_suggestions_table_v2.sql` - Daily suggestions (v2)
- `CREATE_THEME_PARTICIPANTS.sql` - Theme participation tracking
- `unified_network_discovery_schema.sql` - Network discovery features
- `ORGANIZATIONS_SCHEMA.sql` - Organizations and related tables

### `/functions/` - Functions and Triggers
Database functions, stored procedures, and triggers.

- `HELPERS_functions_and_triggers.sql` - Core helper functions
- `get_start_sequence_data.sql` - Main dashboard data function
- `START_SEQUENCE_*.sql` - Various versions of start sequence functions
- `fix-connection-count-trigger.sql` - Connection count automation
- `fix-notify-*.sql` - Notification triggers

### `/policies/` - RLS Policies
Row Level Security policies for data access control.

- `STEP_8_create_rls_policies.sql` - Core RLS policies
- `CHECK_RLS_POLICIES.sql` - Verify RLS setup
- `SIMPLE_RLS_FIX.sql` - Quick RLS fixes
- `FIX_messages_rls_policies.sql` - Message access policies
- `ADD_AVATAR_STORAGE_POLICIES.sql` - Storage bucket policies
- `check-connections-rls.sql` - Connection policies verification

### `/fixes/` - Schema Fixes and Updates
Scripts to fix issues, add columns, or update existing schemas.

- `STEP_3_add_engagement_columns.sql` - Add engagement tracking
- `STEP_7_fix_conversations.sql` - Fix conversation schema
- `ADD_IS_HIDDEN_COLUMN.sql` - Add profile hiding feature
- `ADD_THEME_TO_PROJECTS.sql` - Link projects to themes
- `upgrade_daily_suggestions_to_v2.sql` - Upgrade suggestions system
- `rollback_daily_suggestions_v2.sql` - Rollback suggestions upgrade
- `FIX_DAVE_*.sql` - Various profile fixes
- `FIX_PRESENCE_SESSIONS_*.sql` - Presence system fixes
- `add-hidden-profiles-index*.sql` - Performance indexes
- `RUN_THIS_TO_FIX_ONBOARDING.sql` - Onboarding flow fixes

### `/diagnostics/` - Diagnostic and Check Scripts
Scripts to verify database state and troubleshoot issues.

- `STEP_1_test_user_id.sql` - Verify user_id column exists
- `CHECK_MIGRATION_READINESS.sql` - Pre-migration checks
- `ORGANIZATIONS_PREFLIGHT_CHECK.sql` - Organizations feature checks
- `CHECK_COMMUNITY_SCHEMA.sql` - Verify community table structure
- `check-connections-schema.sql` - Verify connections table
- `check-notify-*.sql` - Verify notification functions
- `find-broken-trigger.sql` - Troubleshoot triggers
- `profile-linking-diagnostics.sql` - OAuth profile linking checks
- `test-community-function.sql` - Test community functions
- `verify-sql-function.sql` - General function verification

### `/reference/` - Comprehensive Schemas and Reference
Large, comprehensive scripts and reference implementations.

- `COMPREHENSIVE_FIXES_SCHEMA.sql` - All-in-one schema fixes
- `COMPLETE_SCHEMA_FIX.sql` - Complete schema repair
- `PHASE3_START_REDESIGN.sql` - Start sequence redesign
- `LINK_OAUTH_TO_EXISTING_PROFILES.sql` - OAuth integration
- `MINIMAL_OAUTH_LINKING_SETUP.sql` - Minimal OAuth setup
- `FIX_COMMON_MIGRATION_ISSUES.sql` - Common issue fixes
- `ORGANIZATIONS_QUICK_FIX.sql` - Quick organization fixes
- `SEED_AI_HEALTHCARE_THEME.sql` - Demo data seeding
- `PRE_MIGRATION_CLEANUP.sql` - Pre-migration cleanup
- `cleanup-*.sql` - Various cleanup scripts

### `/migrations/` - Documentation
Migration guides and documentation.

- `README.md` - Migration documentation
- `README_ORGANIZATIONS.md` - Organizations feature guide

## 🚀 Usage Guide

### First-Time Setup

1. **Run table creation scripts** (in order):
   ```bash
   # Core tables
   tables/STEP_2_create_messaging_tables.sql
   tables/STEP_4_create_activity_log.sql
   tables/STEP_5_create_achievements.sql
   tables/STEP_6_create_leaderboards.sql
   tables/create_daily_suggestions_table_v2.sql
   tables/CREATE_THEME_PARTICIPANTS.sql
   tables/unified_network_discovery_schema.sql
   ```

2. **Create functions and triggers**:
   ```bash
   functions/HELPERS_functions_and_triggers.sql
   functions/get_start_sequence_data.sql
   ```

3. **Apply RLS policies**:
   ```bash
   policies/STEP_8_create_rls_policies.sql
   policies/ADD_AVATAR_STORAGE_POLICIES.sql
   ```

### Applying a Script

**Via Supabase Dashboard:**
1. Go to your project's SQL Editor
2. Copy the contents of the SQL file
3. Paste into the editor
4. Click "Run"
5. Verify no errors in the output

**Via Supabase CLI:**
```bash
supabase db execute -f supabase/sql/tables/STEP_2_create_messaging_tables.sql
```

### Troubleshooting

1. **Check schema first**:
   ```bash
   diagnostics/CHECK_COMMUNITY_SCHEMA.sql
   diagnostics/check-connections-schema.sql
   ```

2. **Verify functions exist**:
   ```bash
   diagnostics/verify-sql-function.sql
   ```

3. **Check RLS policies**:
   ```bash
   policies/CHECK_RLS_POLICIES.sql
   ```

## 🔄 Common Workflows

### Adding a New Feature
1. Create table schema in `/tables/`
2. Add functions in `/functions/`
3. Set up RLS in `/policies/`
4. Add diagnostic checks in `/diagnostics/`

### Fixing an Issue
1. Create fix script in `/fixes/`
2. Test with diagnostic script
3. Document in this README

### Upgrading a Feature
1. Create upgrade script in `/fixes/`
2. Create rollback script in `/fixes/`
3. Test both directions

## 📝 Script Naming Conventions

- `STEP_N_*.sql` - Sequential setup scripts (run in order)
- `CREATE_*.sql` - Table or schema creation
- `FIX_*.sql` - Bug fixes or corrections
- `ADD_*.sql` - Adding new columns or features
- `CHECK_*.sql` - Diagnostic and verification
- `UPDATE_*.sql` - Updating existing functionality
- `ROLLBACK_*.sql` - Reverting changes

## ⚠️ Safety Guidelines

1. **Always backup before running fixes**
2. **Test in development first**
3. **Read the entire script before running**
4. **Check for dependencies** (some scripts must run in order)
5. **Verify results** with diagnostic scripts after changes

## 🔗 Related Documentation

- [Database Setup Guide](../../docs/DATABASE_SETUP.md)
- [OAuth Migration Guide](../../docs/OAUTH_MIGRATION_CHECKLIST.md)
- [Organizations Feature](migrations/README_ORGANIZATIONS.md)
- [Main README](../../README.md)

## 📞 Support

If you encounter issues:
1. Check diagnostic scripts first
2. Review error messages carefully
3. Consult related documentation
4. Check Supabase logs in dashboard

---

**Last Updated**: February 2026  
**Maintained By**: CharlestonHacks Team
