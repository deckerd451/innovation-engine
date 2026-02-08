#!/bin/bash
# Markdown Documentation Organization Script
# Moves all .md files to /docs/ with proper categorization

set -e

echo "📚 Organizing Markdown documentation..."

# Create directory structure
mkdir -p docs/{architecture,supabase,ux,features,deployment,reference,summaries}

# ============================================================================
# KEEP IN PLACE (Already in correct locations)
# ============================================================================
echo "✓ Keeping existing docs/ files in place"
echo "✓ Keeping supabase/sql/ markdown files in place"
echo "✓ Keeping .kiro/specs/ files in place (IDE-specific)"

# ============================================================================
# MAIN README (Keep in root)
# ============================================================================
echo "✓ Keeping README.md in root (required for GitHub Pages)"

# ============================================================================
# ARCHITECTURE & SYSTEM DESIGN
# ============================================================================
echo "📐 Moving architecture documentation..."

mv INTELLIGENCE_V2_ARCHITECTURE.md docs/architecture/
mv INTELLIGENCE_LAYER_SUMMARY.md docs/architecture/
mv UNIFIED_NETWORK_PROJECT_SUMMARY.md docs/architecture/
mv SYNAPSE_NAVIGATION_API.md docs/architecture/
mv SYNAPSE_PROGRESSIVE_DISCLOSURE.md docs/architecture/
mv REALTIME_HELPER_IMPLEMENTATION.md docs/architecture/
mv BEHAVIOR_COMPARISON.md docs/architecture/

# ============================================================================
# SUPABASE & DATABASE
# ============================================================================
echo "🗄️  Moving Supabase documentation..."

mv SUPABASE_OPTIMIZATION_IMPLEMENTATION.md docs/supabase/
mv SUPABASE_OPTIMIZATION_DEPLOYMENT_SUMMARY.md docs/supabase/
mv SUPABASE_OPTIMIZATION_QUICK_START.md docs/supabase/
mv SUPABASE_EGRESS_ANALYSIS.md docs/supabase/
mv EGRESS_OPTIMIZATION_COMPLETE.md docs/supabase/
mv EGRESS_QUICK_REFERENCE.md docs/supabase/
mv COMMUNITY_TABLE_SCHEMA.md docs/supabase/
mv HOW_TO_FIX_DATABASE.md docs/supabase/
mv SQL_EXECUTION_ORDER.md docs/supabase/
mv SQL_FILES_FIXED.md docs/supabase/
mv MIGRATED_ACCOUNTS_ANALYSIS.md docs/supabase/
mv COMPLETE_MIGRATION_SOLUTION.md docs/supabase/
mv PHASE2_BATCH_MIGRATION_PLAN.md docs/supabase/
mv PHASE2_MIGRATION_COMPLETE.md docs/supabase/
mv PHASE2_MIGRATION_PROGRESS.md docs/supabase/
mv PHASE2_SUMMARY.md docs/supabase/
mv SMS_PHONE_MESSAGING_ANALYSIS.md docs/supabase/

# ============================================================================
# UX & UI IMPROVEMENTS
# ============================================================================
echo "🎨 Moving UX documentation..."

mv SYNAPSE_CENTERING_IMPLEMENTATION.md docs/ux/
mv SYNAPSE_CENTERING_QUICK_REFERENCE.md docs/ux/
mv SYNAPSE_PROGRESSIVE_DISCLOSURE_INTEGRATION.md docs/ux/
mv SYNAPSE_PROGRESSIVE_DISCLOSURE_QUICK_REFERENCE.md docs/ux/
mv PROGRESSIVE_DISCLOSURE_INTEGRATION_COMPLETE.md docs/ux/
mv QUIET_MODE_INTEGRATION_COMPLETE.md docs/ux/
mv PRESENCE_UI_SYSTEM_GUIDE.md docs/ux/
mv PRESENCE_UI_VISUAL_GUIDE.md docs/ux/
mv PRESENCE_UI_SUMMARY.md docs/ux/
mv PRESENCE_UI_INDEX.md docs/ux/
mv UNIFIED_NOTIFICATIONS_GUIDE.md docs/ux/
mv UNIFIED_NOTIFICATIONS_VISUAL_GUIDE.md docs/ux/
mv UNIFIED_NOTIFICATIONS_IMPLEMENTATION.md docs/ux/
mv SUGGESTION_NAVIGATION_GUIDE.md docs/ux/
mv SUGGESTION_NAV_IMPROVEMENTS.md docs/ux/
mv DISCOVERY_MODE_SIMPLIFICATION.md docs/ux/
mv DUPLICATE_CONNECTIONS_BAR_REMOVAL.md docs/ux/
mv UI_CLEANUP_CHANGES.md docs/ux/
mv FIELD_EXPLANATIONS_IMPROVEMENT.md docs/ux/
mv MENTOR_PANEL_IMPROVEMENTS.md docs/ux/

# ============================================================================
# FEATURES & IMPLEMENTATIONS
# ============================================================================
echo "⚙️  Moving feature documentation..."

mv INTELLIGENCE_V2_README.md docs/features/
mv INTELLIGENCE_V2_INTEGRATION.md docs/features/
mv INTELLIGENCE_V2_QUICK_REFERENCE.md docs/features/
mv INTELLIGENCE_V2_TROUBLESHOOTING.md docs/features/
mv INTELLIGENCE_V2_DELIVERY_SUMMARY.md docs/features/
mv INTELLIGENCE_LAYER_CHECKLIST.md docs/features/
mv INTELLIGENCE_LAYER_PATHWAY_FIX.md docs/features/
mv DAILY_SUGGESTIONS_IMPLEMENTATION.md docs/features/
mv UNIFIED_NETWORK_IMPLEMENTATION_COMPLETE.md docs/features/
mv UNIFIED_NETWORK_BRIDGE_INTEGRATION.md docs/features/
mv UNIFIED_NETWORK_USER_GUIDE.md docs/features/
mv UNIFIED_NETWORK_TROUBLESHOOTING.md docs/features/
mv UNIFIED_NETWORK_FINAL_SUMMARY.md docs/features/
mv SYNAPSE_READINESS_IMPLEMENTATION.md docs/features/
mv TASK6_SYNAPSE_NAVIGATION_COMPLETE.md docs/features/
mv TASK7_AUTO_DISCOVERY_MODE_STATUS.md docs/features/
mv CONNECTION_DISCONNECT_FEATURE.md docs/features/
mv PROFILE_LINKING_FIX.md docs/features/
mv PROFILE_LINKING_QUICK_REFERENCE.md docs/features/
mv HIDDEN_PROFILES_FILTER_FIX.md docs/features/
mv HIDDEN_PROFILES_QUICK_REFERENCE.md docs/features/
mv ADMIN_THEME_MANAGEMENT_COMPLETE.md docs/features/
mv ADMIN_PEOPLE_MANAGEMENT_REDESIGN.md docs/features/
mv ADMIN_PEOPLE_QUICK_REFERENCE.md docs/features/
mv THEME_VISIBILITY_FIX.md docs/features/
mv LOGGING_IMPLEMENTATION_SUMMARY.md docs/features/
mv LOGGING_QUICK_REFERENCE.md docs/features/
mv LOGGING_EXAMPLES.md docs/features/
mv PRESENCE_WEBSOCKET_IMPROVEMENTS.md docs/features/

# ============================================================================
# DEPLOYMENT & OPERATIONS
# ============================================================================
echo "🚀 Moving deployment documentation..."

mv DEPLOYMENT_CHECKLIST.md docs/deployment/
mv DEPLOYMENT_SUCCESS.md docs/deployment/
mv UNIFIED_NETWORK_DEPLOYMENT_CHECKLIST.md docs/deployment/
mv UNIFIED_NETWORK_TESTING_SUMMARY.md docs/deployment/
mv PROFILE_LINKING_DEPLOYMENT.md docs/deployment/
mv PERFORMANCE_OPTIMIZATION_DEPLOYMENT.md docs/deployment/
mv PERFORMANCE_OPTIMIZATION_PLAN.md docs/deployment/
mv PERFORMANCE_OPTIMIZATION_STATUS.md docs/deployment/
mv IMPLEMENTATION_CHECKLIST.md docs/deployment/
mv TESTING_CHECKLIST.md docs/deployment/
mv ADMIN_PEOPLE_TEST_CHECKLIST.md docs/deployment/
mv SYNAPSE_CENTERING_TEST_CHECKLIST.md docs/deployment/
mv THEME_VISIBILITY_TEST_CHECKLIST.md docs/deployment/
mv PRESENCE_UI_TEST_CHECKLIST.md docs/deployment/
mv TEST_UNIFIED_NOTIFICATIONS.md docs/deployment/
mv VERIFY_ONBOARDING_SETUP.md docs/deployment/
mv QUICK_START_GUIDE.md docs/deployment/
mv WHAT_TO_EXPECT.md docs/deployment/

# ============================================================================
# FIXES & TROUBLESHOOTING
# ============================================================================
echo "🔧 Moving fix documentation..."

mv CRITICAL_FIXES_SUMMARY.md docs/reference/fixes/
mv CRITICAL_UX_FIXES.md docs/reference/fixes/
mv FINAL_UX_FIXES_COMPLETE.md docs/reference/fixes/
mv PROFILE_FIXES_COMPLETE_SUMMARY.md docs/reference/fixes/
mv CONNECTION_COUNT_FIX.md docs/reference/fixes/
mv CONSOLE_ERRORS_FIXED.md docs/reference/fixes/
mv CLICKABLE_PATHWAYS_FIX.md docs/reference/fixes/
mv PATHWAY_ILLUMINATION_FIX.md docs/reference/fixes/
mv INFINITE_LOOP_FIX.md docs/reference/fixes/
mv ONBOARDING_NEXT_BUTTON_FIX.md docs/reference/fixes/
mv PROJECT_REQUEST_APPROVAL_FIX.md docs/reference/fixes/
mv PRESENCE_DUPLICATE_SESSIONS_FIX.md docs/reference/fixes/
mv DAVE_ISSUE_SUMMARY.md docs/reference/fixes/
mv DAVE_PROFILE_ISSUE_ANALYSIS.md docs/reference/fixes/
mv FIX_DAVE_NOW.md docs/reference/fixes/
mv QUICK_FIX_DAVE_ISSUE.md docs/reference/fixes/
mv ROLLBACK_AND_FIXES_FEB7.md docs/reference/fixes/
mv FIXES_IMPLEMENTATION_PLAN.md docs/reference/fixes/

# ============================================================================
# SUMMARIES & REPORTS
# ============================================================================
echo "📊 Moving summary documentation..."

mv IMPLEMENTATION_SUMMARY.md docs/summaries/
mv SESSION_SUMMARY.md docs/summaries/
mv SESSION_CONTINUATION_SUMMARY.md docs/summaries/
mv COMPREHENSIVE_AUDIT_REPORT.md docs/summaries/
mv LOGGING_IMPLEMENTATION_CHECKLIST.md docs/summaries/
mv README_FIXES.md docs/summaries/
mv DASHBOARD_HTML_UPDATES.md docs/summaries/
mv DASHBOARD_INTEGRATION_GUIDE.md docs/summaries/

# ============================================================================
# SQL ORGANIZATION DOCS (Move to reference)
# ============================================================================
echo "📋 Moving SQL organization docs..."

mv SQL_ORGANIZATION_COMPLETE.md docs/reference/
mv SQL_CLEANUP_CHECKLIST.md docs/reference/

# ============================================================================
# MOVE SCATTERED MARKDOWN FROM ASSETS
# ============================================================================
echo "📦 Moving scattered markdown from assets/..."

mv assets/js/README_LOGGER.md docs/features/logger-readme.md
mv assets/js/unified-network/README.md docs/features/unified-network-readme.md
mv assets/js/unified-network/QUICK_START.md docs/features/unified-network-quick-start.md
mv assets/js/unified-network/CHECKPOINT_19_VALIDATION.md docs/reference/unified-network-checkpoint-19.md
mv assets/js/unified-network/DEPLOYMENT_READINESS.md docs/deployment/unified-network-deployment-readiness.md

echo ""
echo "✅ Markdown organization complete!"
echo ""
echo "📁 New structure:"
echo "   docs/architecture/     - System design and architecture"
echo "   docs/supabase/         - Database and Supabase docs"
echo "   docs/ux/               - UX and UI documentation"
echo "   docs/features/         - Feature implementations"
echo "   docs/deployment/       - Deployment and testing"
echo "   docs/reference/        - Reference docs and fixes"
echo "   docs/summaries/        - Session summaries and reports"
echo ""
