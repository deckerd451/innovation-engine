#!/bin/bash
# ================================================================
# Profile Fixes Deployment Script
# ================================================================
# Deploys both profile linking and hidden profiles filter fixes
# Run this script to commit and push all changes to production
# ================================================================

set -e  # Exit on error

echo "🚀 ================================================================"
echo "🚀 Profile Fixes Deployment"
echo "🚀 ================================================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if we're in a git repository
if [ ! -d .git ]; then
    echo -e "${RED}❌ Error: Not in a git repository${NC}"
    exit 1
fi

echo -e "${YELLOW}📋 Changes to be deployed:${NC}"
echo ""
echo "Profile Linking Fix (OAuth Migration):"
echo "  - auth.js (profile linking algorithm)"
echo "  - dashboard.js (onboarding enforcement)"
echo ""
echo "Hidden Profiles Filter:"
echo "  - assets/js/searchEngine.js"
echo "  - assets/data.js"
echo "  - dashboard.js"
echo "  - assets/js/matchEngine.js"
echo "  - assets/js/suggestions/queries.js"
echo "  - assets/js/suggestions/engine.js"
echo "  - assets/js/suggestions/engine-v2.js"
echo "  - assets/js/smart-connection-suggestions.js"
echo "  - assets/js/enhanced-search-discovery.js"
echo "  - assets/js/mentor-guide.js"
echo "  - assets/js/start-flow-sequential.js"
echo "  - assets/js/start-ui-enhanced.js"
echo "  - assets/js/node-panel.js"
echo ""
echo "Documentation:"
echo "  - PROFILE_LINKING_FIX.md"
echo "  - PROFILE_LINKING_DEPLOYMENT.md"
echo "  - PROFILE_LINKING_QUICK_REFERENCE.md"
echo "  - HIDDEN_PROFILES_FILTER_FIX.md"
echo "  - HIDDEN_PROFILES_QUICK_REFERENCE.md"
echo "  - PROFILE_FIXES_COMPLETE_SUMMARY.md"
echo "  - test-profile-linking.js"
echo "  - profile-linking-diagnostics.sql"
echo "  - add-hidden-profiles-index.sql"
echo ""

# Confirm deployment
read -p "$(echo -e ${YELLOW}Continue with deployment? [y/N]:${NC} )" -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${RED}❌ Deployment cancelled${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}✅ Starting deployment...${NC}"
echo ""

# Check for uncommitted changes
if [[ -n $(git status -s) ]]; then
    echo -e "${YELLOW}📝 Staging changes...${NC}"
    
    # Stage code files
    git add auth.js
    git add dashboard.js
    git add assets/js/searchEngine.js
    git add assets/data.js
    git add assets/js/matchEngine.js
    git add assets/js/suggestions/queries.js
    git add assets/js/suggestions/engine.js
    git add assets/js/suggestions/engine-v2.js
    git add assets/js/smart-connection-suggestions.js
    git add assets/js/enhanced-search-discovery.js
    git add assets/js/mentor-guide.js
    git add assets/js/start-flow-sequential.js
    git add assets/js/start-ui-enhanced.js
    git add assets/js/node-panel.js
    
    # Stage documentation
    git add PROFILE_LINKING_FIX.md
    git add PROFILE_LINKING_DEPLOYMENT.md
    git add PROFILE_LINKING_QUICK_REFERENCE.md
    git add HIDDEN_PROFILES_FILTER_FIX.md
    git add HIDDEN_PROFILES_QUICK_REFERENCE.md
    git add PROFILE_FIXES_COMPLETE_SUMMARY.md
    git add test-profile-linking.js
    git add profile-linking-diagnostics.sql
    git add add-hidden-profiles-index.sql
    git add deploy-profile-fixes.sh
    
    echo -e "${GREEN}✅ Changes staged${NC}"
    echo ""
    
    # Commit changes
    echo -e "${YELLOW}💾 Committing changes...${NC}"
    git commit -m "Fix: Implement profile linking and hidden profiles filter

Profile Linking Fix (OAuth Migration Support):
- Implements 3-step profile resolution algorithm
- Links OAuth sign-ins to existing migrated profiles by email
- Handles duplicate emails (selects canonical, hides others)
- Detects collisions to prevent unauthorized takeover
- Enforces onboarding for incomplete profiles
- Comprehensive logging with [PROFILE-LINK] prefix

Hidden Profiles Filter:
- Adds is_hidden filter to all search/discovery queries
- Prevents duplicate profiles from appearing in search results
- Backward compatible (handles NULL values)
- Performance optimized with partial index
- 13 files updated across search, suggestions, and UI

Files Modified:
- auth.js (profile linking logic)
- dashboard.js (onboarding + search filter)
- 13 search/discovery files (is_hidden filter)

Documentation:
- Complete technical documentation
- Deployment checklists
- Quick reference guides
- Test scripts and SQL diagnostics

Resolves: OAuth migration duplicate profiles issue
Resolves: Hidden profiles appearing in search results"
    
    echo -e "${GREEN}✅ Changes committed${NC}"
    echo ""
else
    echo -e "${YELLOW}⚠️  No changes to commit${NC}"
    echo ""
fi

# Push to remote
echo -e "${YELLOW}🚀 Pushing to remote...${NC}"
BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo "   Branch: $BRANCH"
echo ""

git push origin "$BRANCH"

echo ""
echo -e "${GREEN}✅ Deployment complete!${NC}"
echo ""
echo -e "${YELLOW}📋 Post-Deployment Checklist:${NC}"
echo ""
echo "1. Database Setup:"
echo "   - Run add-hidden-profiles-index.sql in Supabase SQL Editor"
echo "   - Verify index creation (Section 1)"
echo "   - Run verification queries (Sections 2-7)"
echo ""
echo "2. Testing:"
echo "   - Test OAuth sign-in with migrated profile"
echo "   - Test search for duplicates (should find none)"
echo "   - Run testProfileLinking() in browser console"
echo "   - Check console for [PROFILE-LINK] logs"
echo ""
echo "3. Monitoring:"
echo "   - Watch for [PROFILE-LINK] logs during sign-ins"
echo "   - Monitor orphaned profile count (should decrease)"
echo "   - Check for duplicate emails in visible profiles"
echo "   - Verify no JavaScript errors"
echo ""
echo "4. Documentation:"
echo "   - Review PROFILE_FIXES_COMPLETE_SUMMARY.md"
echo "   - Share quick reference guides with team"
echo "   - Update team on new logging format"
echo ""
echo -e "${GREEN}🎉 Profile fixes deployed successfully!${NC}"
echo ""
echo "For detailed information, see:"
echo "  - PROFILE_FIXES_COMPLETE_SUMMARY.md (overview)"
echo "  - PROFILE_LINKING_FIX.md (technical details)"
echo "  - HIDDEN_PROFILES_FILTER_FIX.md (filter details)"
echo ""
