#!/bin/bash
# Move remaining markdown files from root to docs/

set -e

echo "📚 Moving remaining documentation from root..."

# Create directories
mkdir -p docs/reference/fixes
mkdir -p docs/summaries

# Move fixes
echo "🔧 Moving fix documentation..."
[ -f "CRITICAL_FIXES_SUMMARY.md" ] && mv CRITICAL_FIXES_SUMMARY.md docs/reference/fixes/
[ -f "CRITICAL_UX_FIXES.md" ] && mv CRITICAL_UX_FIXES.md docs/reference/fixes/
[ -f "FINAL_UX_FIXES_COMPLETE.md" ] && mv FINAL_UX_FIXES_COMPLETE.md docs/reference/fixes/
[ -f "PROFILE_FIXES_COMPLETE_SUMMARY.md" ] && mv PROFILE_FIXES_COMPLETE_SUMMARY.md docs/reference/fixes/
[ -f "CONNECTION_COUNT_FIX.md" ] && mv CONNECTION_COUNT_FIX.md docs/reference/fixes/
[ -f "CONSOLE_ERRORS_FIXED.md" ] && mv CONSOLE_ERRORS_FIXED.md docs/reference/fixes/
[ -f "CLICKABLE_PATHWAYS_FIX.md" ] && mv CLICKABLE_PATHWAYS_FIX.md docs/reference/fixes/
[ -f "PATHWAY_ILLUMINATION_FIX.md" ] && mv PATHWAY_ILLUMINATION_FIX.md docs/reference/fixes/
[ -f "INFINITE_LOOP_FIX.md" ] && mv INFINITE_LOOP_FIX.md docs/reference/fixes/
[ -f "ONBOARDING_NEXT_BUTTON_FIX.md" ] && mv ONBOARDING_NEXT_BUTTON_FIX.md docs/reference/fixes/
[ -f "PROJECT_REQUEST_APPROVAL_FIX.md" ] && mv PROJECT_REQUEST_APPROVAL_FIX.md docs/reference/fixes/
[ -f "PRESENCE_DUPLICATE_SESSIONS_FIX.md" ] && mv PRESENCE_DUPLICATE_SESSIONS_FIX.md docs/reference/fixes/
[ -f "DAVE_ISSUE_SUMMARY.md" ] && mv DAVE_ISSUE_SUMMARY.md docs/reference/fixes/
[ -f "DAVE_PROFILE_ISSUE_ANALYSIS.md" ] && mv DAVE_PROFILE_ISSUE_ANALYSIS.md docs/reference/fixes/
[ -f "FIX_DAVE_NOW.md" ] && mv FIX_DAVE_NOW.md docs/reference/fixes/
[ -f "QUICK_FIX_DAVE_ISSUE.md" ] && mv QUICK_FIX_DAVE_ISSUE.md docs/reference/fixes/
[ -f "ROLLBACK_AND_FIXES_FEB7.md" ] && mv ROLLBACK_AND_FIXES_FEB7.md docs/reference/fixes/
[ -f "FIXES_IMPLEMENTATION_PLAN.md" ] && mv FIXES_IMPLEMENTATION_PLAN.md docs/reference/fixes/

# Move summaries
echo "📊 Moving summary documentation..."
[ -f "IMPLEMENTATION_SUMMARY.md" ] && mv IMPLEMENTATION_SUMMARY.md docs/summaries/
[ -f "SESSION_SUMMARY.md" ] && mv SESSION_SUMMARY.md docs/summaries/
[ -f "SESSION_CONTINUATION_SUMMARY.md" ] && mv SESSION_CONTINUATION_SUMMARY.md docs/summaries/
[ -f "COMPREHENSIVE_AUDIT_REPORT.md" ] && mv COMPREHENSIVE_AUDIT_REPORT.md docs/summaries/
[ -f "LOGGING_IMPLEMENTATION_CHECKLIST.md" ] && mv LOGGING_IMPLEMENTATION_CHECKLIST.md docs/summaries/
[ -f "README_FIXES.md" ] && mv README_FIXES.md docs/summaries/
[ -f "DASHBOARD_HTML_UPDATES.md" ] && mv DASHBOARD_HTML_UPDATES.md docs/summaries/
[ -f "DASHBOARD_INTEGRATION_GUIDE.md" ] && mv DASHBOARD_INTEGRATION_GUIDE.md docs/summaries/

# Move SQL organization docs
echo "📋 Moving SQL organization docs..."
[ -f "SQL_ORGANIZATION_COMPLETE.md" ] && mv SQL_ORGANIZATION_COMPLETE.md docs/reference/
[ -f "SQL_CLEANUP_CHECKLIST.md" ] && mv SQL_CLEANUP_CHECKLIST.md docs/reference/

echo ""
echo "✅ Remaining documentation moved!"
echo ""
