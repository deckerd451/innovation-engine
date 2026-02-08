# SQL Scripts Index

Quick reference index of all SQL scripts organized by category.

## 📋 Tables (9 files)

Core database table schemas and structures.

| File | Purpose |
|------|---------|
| `STEP_2_create_messaging_tables.sql` | Conversations and messages tables |
| `STEP_4_create_activity_log.sql` | Activity tracking table |
| `STEP_5_create_achievements.sql` | Achievements and user achievements |
| `STEP_6_create_leaderboards.sql` | XP, streak, and connection leaderboards |
| `create_daily_suggestions_table.sql` | Daily suggestions (v1) |
| `create_daily_suggestions_table_v2.sql` | Daily suggestions (v2) ⭐ |
| `CREATE_THEME_PARTICIPANTS.sql` | Theme participation tracking |
| `unified_network_discovery_schema.sql` | Network discovery features |
| `ORGANIZATIONS_SCHEMA.sql` | Organizations and related tables |

## ⚙️ Functions (11 files)

Database functions, stored procedures, and triggers.

| File | Purpose |
|------|---------|
| `HELPERS_functions_and_triggers.sql` | Core helper functions ⭐ |
| `get_start_sequence_data.sql` | Main dashboard data function ⭐ |
| `START_SEQUENCE_QUERY.sql` | Start sequence query function |
| `START_SEQUENCE_SIMPLE.sql` | Simplified start sequence |
| `START_SEQUENCE_MINIMAL.sql` | Minimal start sequence |
| `PHASE3_MINIMAL_START_FUNCTION.sql` | Phase 3 minimal function |
| `UPDATE_START_SEQUENCE_FUNCTION.sql` | Update start sequence |
| `FIX_START_SEQUENCE_FUNCTION_V2.sql` | V2 fix for start sequence |
| `fix-connection-count-trigger.sql` | Connection count automation |
| `fix-notify-connection-accepted.sql` | Accepted connection notifications |
| `fix-notify-connection-request.sql` | Request connection notifications |

## 🔒 Policies (6 files)

Row Level Security policies for data access control.

| File | Purpose |
|------|---------|
| `STEP_8_create_rls_policies.sql` | Core RLS policies ⭐ |
| `CHECK_RLS_POLICIES.sql` | Verify RLS setup |
| `SIMPLE_RLS_FIX.sql` | Quick RLS fixes |
| `FIX_messages_rls_policies.sql` | Message access policies |
| `ADD_AVATAR_STORAGE_POLICIES.sql` | Storage bucket policies |
| `check-connections-rls.sql` | Connection policies verification |

## 🔧 Fixes (21 files)

Schema fixes, updates, and feature additions.

| File | Purpose |
|------|---------|
| `STEP_3_add_engagement_columns.sql` | Add engagement tracking |
| `STEP_7_fix_conversations.sql` | Fix conversation schema |
| `FIX_add_connection_count_and_clean_duplicates.sql` | Connection count fixes |
| `FIX_conversations_add_missing_columns.sql` | Add missing conversation columns |
| `fix_activity_log_project_id.sql` | Fix activity log project references |
| `ADD_IS_HIDDEN_COLUMN.sql` | Add profile hiding feature |
| `ADD_THEME_TO_PROJECTS.sql` | Link projects to themes |
| `add_last_seen_to_presence_sessions.sql` | Add last seen tracking |
| `AUTO_ASSIGN_PROJECT_THEMES.sql` | Auto-assign themes to projects |
| `upgrade_daily_suggestions_to_v2.sql` | Upgrade suggestions to V2 ⭐ |
| `rollback_daily_suggestions_v2.sql` | Rollback suggestions V2 |
| `FIX_DAVE_SIMPLE.sql` | Simple profile fix |
| `FIX_DAVE_PROFILE_ISSUE.sql` | Profile issue fix |
| `FINAL_FIX.sql` | Final comprehensive fix |
| `FIX_PRESENCE_SESSIONS_COLUMNS.sql` | Fix presence session columns |
| `FIX_PRESENCE_SESSIONS_SCHEMA.sql` | Fix presence session schema |
| `ADD_IS_ACTIVE_TO_PRESENCE_SESSIONS.sql` | Add active status to presence |
| `fix-connection-count.sql` | Fix connection counting |
| `add-hidden-profiles-index.sql` | Add hidden profiles index |
| `add-hidden-profiles-index-safe.sql` | Safe hidden profiles index ⭐ |
| `RUN_THIS_TO_FIX_ONBOARDING.sql` | Fix onboarding flow |

## 🔍 Diagnostics (12 files)

Verification, troubleshooting, and diagnostic scripts.

| File | Purpose |
|------|---------|
| `STEP_1_test_user_id.sql` | Verify user_id column exists |
| `CHECK_MIGRATION_READINESS.sql` | Pre-migration checks |
| `ORGANIZATIONS_PREFLIGHT_CHECK.sql` | Organizations feature checks |
| `CHECK_COMMUNITY_SCHEMA.sql` | Verify community table structure ⭐ |
| `check-community-schema.sql` | Alternative community check |
| `check-connections-schema.sql` | Verify connections table |
| `check-notify-accepted-function.sql` | Check accepted notification function |
| `check-notify-function.sql` | Check notification functions |
| `find-broken-trigger.sql` | Troubleshoot triggers |
| `profile-linking-diagnostics.sql` | OAuth profile linking checks |
| `test-community-function.sql` | Test community functions |
| `verify-sql-function.sql` | General function verification ⭐ |

## 📚 Reference (12 files)

Comprehensive schemas, examples, and reference implementations.

| File | Purpose |
|------|---------|
| `COMPREHENSIVE_FIXES_SCHEMA.sql` | All-in-one schema fixes |
| `COMPLETE_SCHEMA_FIX.sql` | Complete schema repair |
| `PHASE3_START_REDESIGN.sql` | Start sequence redesign |
| `LINK_OAUTH_TO_EXISTING_PROFILES.sql` | OAuth integration |
| `MINIMAL_OAUTH_LINKING_SETUP.sql` | Minimal OAuth setup |
| `FIX_COMMON_MIGRATION_ISSUES.sql` | Common issue fixes |
| `ORGANIZATIONS_QUICK_FIX.sql` | Quick organization fixes |
| `SEED_AI_HEALTHCARE_THEME.sql` | Demo data seeding |
| `PRE_MIGRATION_CLEANUP.sql` | Pre-migration cleanup |
| `cleanup-duplicate-presence-sessions.sql` | Clean duplicate sessions |
| `cleanup-test-connections.sql` | Clean test connections |
| `accept-all-doug-connections.sql` | Accept all Doug connections |

## 📖 Documentation (2 files)

Migration guides and documentation.

| File | Purpose |
|------|---------|
| `README.md` | Complete SQL documentation ⭐ |
| `QUICK_START.md` | Quick start guide ⭐ |

---

⭐ = Recommended for most users

**Total Scripts**: 71 SQL files

**Last Updated**: February 8, 2026
