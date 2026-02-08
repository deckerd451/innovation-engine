#!/bin/bash
# Verify documentation organization is complete

echo "🔍 Verifying Documentation Organization..."
echo ""

# Check 1: All markdown files in docs/
MD_IN_DOCS=$(find docs -name "*.md" -type f | wc -l | tr -d ' ')
echo "✓ Markdown files in docs/: $MD_IN_DOCS"

# Check 2: Only README.md in root
MD_IN_ROOT=$(find . -maxdepth 1 -name "*.md" -type f | wc -l | tr -d ' ')
if [ "$MD_IN_ROOT" -eq 1 ]; then
    echo "✓ Only README.md in root directory"
else
    echo "✗ Found $MD_IN_ROOT markdown files in root (should be 1)"
    find . -maxdepth 1 -name "*.md" -type f
fi

# Check 3: Directory structure exists
echo ""
echo "📁 Directory Structure:"
for dir in architecture supabase ux features deployment reference summaries; do
    if [ -d "docs/$dir" ]; then
        COUNT=$(find docs/$dir -name "*.md" 2>/dev/null | wc -l | tr -d ' ')
        echo "   ✓ docs/$dir/: $COUNT files"
    else
        echo "   ✗ docs/$dir/ missing"
    fi
done

# Check 4: Documentation exists
echo ""
echo "📖 Documentation:"
[ -f "docs/README.md" ] && echo "   ✓ docs/README.md" || echo "   ✗ docs/README.md missing"
[ -f "docs/INDEX.md" ] && echo "   ✓ docs/INDEX.md" || echo "   ✗ docs/INDEX.md missing"
[ -f "docs/reference/DOCS_ORGANIZATION_COMPLETE.md" ] && echo "   ✓ docs/reference/DOCS_ORGANIZATION_COMPLETE.md" || echo "   ✗ DOCS_ORGANIZATION_COMPLETE.md missing"

# Check 5: No markdown in application code directories
echo ""
echo "🔒 Protection Checks:"
MD_IN_ASSETS=$(find assets -name "*.md" -type f 2>/dev/null | wc -l | tr -d ' ')
if [ "$MD_IN_ASSETS" -eq 0 ]; then
    echo "   ✓ No markdown in assets/ (application code)"
else
    echo "   ✗ Found $MD_IN_ASSETS markdown files in assets/"
fi

echo ""
if [ "$MD_IN_ROOT" -eq 1 ] && [ "$MD_IN_DOCS" -gt 0 ] && [ "$MD_IN_ASSETS" -eq 0 ]; then
    echo "✅ Documentation organization verified successfully!"
else
    echo "⚠️  Issues found - review output above"
fi
