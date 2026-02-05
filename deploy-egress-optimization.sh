#!/bin/bash

# ================================================================
# Supabase Egress Optimization Deployment
# ================================================================
# Deploys the three low-risk, high-impact egress reduction fixes
#
# Expected Results:
# - 60-75% reduction in Supabase cached egress
# - No breaking changes
# - Improved performance
#
# Files Modified:
# - assets/data.js (community query optimization)
# - assets/js/synapse/data.js (synapse data optimization)
# - assets/js/synapse/realtime.js (reload cooldown)
# - assets/js/presence-session-manager.js (heartbeat optimization)
# ================================================================

set -e

echo "🚀 Deploying Supabase Egress Optimization..."
echo ""

# Check if we're in the right directory
if [ ! -f "dashboard.html" ]; then
  echo "❌ Error: Must run from project root directory"
  exit 1
fi

# Verify all modified files exist
echo "📋 Verifying files..."
files=(
  "assets/data.js"
  "assets/js/synapse/data.js"
  "assets/js/synapse/realtime.js"
  "assets/js/presence-session-manager.js"
)

for file in "${files[@]}"; do
  if [ ! -f "$file" ]; then
    echo "❌ Error: File not found: $file"
    exit 1
  fi
  echo "  ✅ $file"
done

echo ""
echo "📊 Changes Summary:"
echo "  Fix #1: Community table query optimization (70% payload reduction)"
echo "  Fix #2: Synapse reload cooldown (80% reload reduction)"
echo "  Fix #3: Presence heartbeat optimization (90% update reduction)"
echo ""
echo "  Expected egress reduction: 60-75%"
echo "  Expected monthly egress: 2-4 GB (within free tier)"
echo ""

# Commit changes
echo "💾 Committing changes..."
git add "${files[@]}"
git add SUPABASE_EGRESS_ANALYSIS.md
git add EGRESS_OPTIMIZATION_COMPLETE.md
git commit -m "feat: optimize Supabase egress (60-75% reduction)

- Optimize community table queries (select specific columns, reduce limits)
- Add 5-minute cooldown to synapse realtime reloads
- Increase presence heartbeat interval to 5 minutes with idle detection

Expected impact:
- Community query payload: 2 MB → 600 KB (70% reduction)
- Synapse reloads per session: 20 → 4 (80% reduction)
- Presence updates per hour: 120 → 12 (90% reduction)
- Total monthly egress: 8-12 GB → 2-4 GB (60-75% reduction)

Fixes #egress-spike
"

echo ""
echo "✅ Changes committed!"
echo ""

# Push to GitHub (which auto-deploys via GitHub Pages)
echo "🌐 Pushing to GitHub..."
git push origin main

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📊 Next Steps:"
echo "  1. Monitor Supabase dashboard for egress reduction (24-48 hours)"
echo "  2. Check browser console for any errors"
echo "  3. Verify dashboard, synapse, and presence still work correctly"
echo ""
echo "🔍 Monitoring:"
echo "  - Supabase Dashboard: Project Settings → Usage → Egress"
echo "  - Browser Console: Look for cooldown/idle detection logs"
echo "  - Network Tab: Verify smaller payload sizes (~600 KB vs 2 MB)"
echo ""
echo "🚨 Rollback (if needed):"
echo "  git revert HEAD"
echo "  git push origin main"
echo ""
echo "📖 Documentation:"
echo "  - Analysis: SUPABASE_EGRESS_ANALYSIS.md"
echo "  - Implementation: EGRESS_OPTIMIZATION_COMPLETE.md"
echo ""
