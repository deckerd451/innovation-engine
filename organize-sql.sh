#!/bin/bash
# SQL Organization Script
# Moves all SQL files to /supabase/sql/ with proper categorization

set -e

echo "🗂️  Organizing SQL files..."

# Create directory structure
mkdir -p supabase/sql/{tables,functions,policies,fixes,diagnostics,reference,migrations}

# ============================================================================
# CORE SCHEMA & TABLES
# ============================================================================
echo "📋 Moving table schemas..."

mv migrations/STEP_2_create_messaging_tables.sql supabase/sql/tables/
mv migrations/STEP_4_create_activity_log.sql supabase/sql/tables/
mv migrations/STEP_5_create_achievements.sql supabase/sql/tables/
mv migrations/STEP_6_create_leaderboards.sql supabase/sql/tables/
mv migrations/create_daily_suggestions_table.sql supabase/sql/tables/
mv migrations/create_daily_suggestions_table_v2.sql supabase/sql/tables/
mv migrations/CREATE_THEME_PARTICIPANTS.sql supabase/sql/tables/
mv migrations/unified_network_discovery_schema.sql supabase/sql/tables/
mv migrations/ORGANIZATIONS_SCHEMA.sql supabase/sql/tables/

# ============================================================================
# FUNCTIONS & TRIGGERS
# ============================================================================
echo "⚙️  Moving functions and triggers..."

mv migrations/HELPERS_functions_and_triggers.sql supabase/sql/functions/
mv migrations/START_SEQUENCE_QUERY.sql supabase/sql/functions/
mv migrations/START_SEQUENCE_SIMPLE.sql supabase/sql/functions/
mv migrations/START_SEQUENCE_MINIMAL.sql supabase/sql/functions/
mv migrations/PHASE3_MINIMAL_START_FUNCTION.sql supabase/sql/functions/
mv migrations/UPDATE_START_SEQUENCE_FUNCTION.sql supabase/sql/functions/
mv RUN_THIS_IN_SUPABASE.sql supabase/sql/functions/get_start_sequence_data.sql
mv FIX_START_SEQUENCE_FUNCTION_V2.sql supabase/sql/functions/
mv fix-connection-count-trigger.sql supabase/sql/functions/
mv fix-notify-connection-accepted.sql supabase/sql/functions/
mv fix-notify-connection-request.sql supabase/sql/functions/

# ============================================================================
# RLS POLICIES
# ============================================================================
echo "🔒 Moving RLS policies..."

mv migrations/STEP_8_create_rls_policies.sql supabase/sql/policies/
mv migrations/CHECK_RLS_POLICIES.sql supabase/sql/policies/
mv migrations/SIMPLE_RLS_FIX.sql supabase/sql/policies/
mv migrations/FIX_messages_rls_policies.sql supabase/sql/policies/
mv migrations/ADD_AVATAR_STORAGE_POLICIES.sql supabase/sql/policies/
mv check-connections-rls.sql supabase/sql/policies/

# ============================================================================
# FIXES & UPDATES
# ============================================================================
echo "🔧 Moving fixes..."

mv migrations/STEP_3_add_engagement_columns.sql supabase/sql/fixes/
mv migrations/STEP_7_fix_conversations.sql supabase/sql/fixes/
mv migrations/FIX_add_connection_count_and_clean_duplicates.sql supabase/sql/fixes/
mv migrations/FIX_conversations_add_missing_columns.sql supabase/sql/fixes/
mv migrations/fix_activity_log_project_id.sql supabase/sql/fixes/
mv migrations/ADD_IS_HIDDEN_COLUMN.sql supabase/sql/fixes/
mv migrations/ADD_THEME_TO_PROJECTS.sql supabase/sql/fixes/
mv migrations/add_last_seen_to_presence_sessions.sql supabase/sql/fixes/
mv migrations/AUTO_ASSIGN_PROJECT_THEMES.sql supabase/sql/fixes/
mv migrations/upgrade_daily_suggestions_to_v2.sql supabase/sql/fixes/
mv migrations/rollback_daily_suggestions_v2.sql supabase/sql/fixes/
mv FIX_DAVE_SIMPLE.sql supabase/sql/fixes/
mv FIX_DAVE_PROFILE_ISSUE.sql supabase/sql/fixes/
mv FINAL_FIX.sql supabase/sql/fixes/
mv FIX_PRESENCE_SESSIONS_COLUMNS.sql supabase/sql/fixes/
mv FIX_PRESENCE_SESSIONS_SCHEMA.sql supabase/sql/fixes/
mv ADD_IS_ACTIVE_TO_PRESENCE_SESSIONS.sql supabase/sql/fixes/
mv fix-connection-count.sql supabase/sql/fixes/
mv add-hidden-profiles-index.sql supabase/sql/fixes/
mv add-hidden-profiles-index-safe.sql supabase/sql/fixes/
mv RUN_THIS_TO_FIX_ONBOARDING.sql supabase/sql/fixes/

# ============================================================================
# DIAGNOSTICS & CHECKS
# ============================================================================
echo "🔍 Moving diagnostics..."

mv migrations/STEP_1_test_user_id.sql supabase/sql/diagnostics/
mv migrations/CHECK_MIGRATION_READINESS.sql supabase/sql/diagnostics/
mv migrations/ORGANIZATIONS_PREFLIGHT_CHECK.sql supabase/sql/diagnostics/
mv CHECK_COMMUNITY_SCHEMA.sql supabase/sql/diagnostics/
mv check-community-schema.sql supabase/sql/diagnostics/
mv check-connections-schema.sql supabase/sql/diagnostics/
mv check-notify-accepted-function.sql supabase/sql/diagnostics/
mv check-notify-function.sql supabase/sql/diagnostics/
mv find-broken-trigger.sql supabase/sql/diagnostics/
mv profile-linking-diagnostics.sql supabase/sql/diagnostics/
mv test-community-function.sql supabase/sql/diagnostics/
mv verify-sql-function.sql supabase/sql/diagnostics/

# ============================================================================
# REFERENCE & COMPREHENSIVE SCHEMAS
# ============================================================================
echo "📚 Moving reference files..."

mv migrations/COMPREHENSIVE_FIXES_SCHEMA.sql supabase/sql/reference/
mv migrations/COMPLETE_SCHEMA_FIX.sql supabase/sql/reference/
mv migrations/PHASE3_START_REDESIGN.sql supabase/sql/reference/
mv migrations/LINK_OAUTH_TO_EXISTING_PROFILES.sql supabase/sql/reference/
mv migrations/MINIMAL_OAUTH_LINKING_SETUP.sql supabase/sql/reference/
mv migrations/FIX_COMMON_MIGRATION_ISSUES.sql supabase/sql/reference/
mv migrations/ORGANIZATIONS_QUICK_FIX.sql supabase/sql/reference/
mv migrations/SEED_AI_HEALTHCARE_THEME.sql supabase/sql/reference/
mv PRE_MIGRATION_CLEANUP.sql supabase/sql/reference/
mv cleanup-duplicate-presence-sessions.sql supabase/sql/reference/
mv cleanup-test-connections.sql supabase/sql/reference/
mv accept-all-doug-connections.sql supabase/sql/reference/

# ============================================================================
# MOVE README FILES
# ============================================================================
echo "📖 Moving documentation..."

mv migrations/README.md supabase/sql/migrations/
mv migrations/README_ORGANIZATIONS.md supabase/sql/migrations/

echo ""
echo "✅ SQL organization complete!"
echo ""
echo "📁 New structure:"
echo "   supabase/sql/tables/       - Table creation scripts"
echo "   supabase/sql/functions/    - Functions and triggers"
echo "   supabase/sql/policies/     - RLS policies"
echo "   supabase/sql/fixes/        - Schema fixes and updates"
echo "   supabase/sql/diagnostics/  - Diagnostic and check scripts"
echo "   supabase/sql/reference/    - Comprehensive schemas and reference"
echo "   supabase/sql/migrations/   - Documentation"
echo ""
