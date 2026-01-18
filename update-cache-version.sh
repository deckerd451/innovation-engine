#!/bin/bash
# Updates cache-busting version in dashboard.html to current git commit hash
# Run this before deploying to production

COMMIT_HASH=$(git rev-parse --short HEAD)
echo "🔄 Updating cache-busting version to: $COMMIT_HASH"

# Update all ?v= parameters in dashboard.html to use current commit hash
sed -i.bak -E "s/\?v=[a-f0-9]{7}/\?v=$COMMIT_HASH/g" dashboard.html

# Check how many updates were made
COUNT=$(grep -c "v=$COMMIT_HASH" dashboard.html)
echo "✅ Updated $COUNT script tags with version $COMMIT_HASH"

# Remove backup file
rm -f dashboard.html.bak

echo "📝 Changes ready. Review with: git diff dashboard.html"
echo "💾 Commit with: git add dashboard.html && git commit -m 'chore: update cache version to $COMMIT_HASH'"
