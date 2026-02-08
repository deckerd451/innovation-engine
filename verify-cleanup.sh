#!/bin/bash
# Verify folder cleanup is complete and safe

echo "🔍 Verifying Folder Cleanup..."
echo ""

# Check 1: Migrations folder removed
if [ -d "migrations" ]; then
    echo "✗ migrations/ folder still exists"
else
    echo "✓ migrations/ folder removed"
fi

# Check 2: Archive structure created
if [ -d "_archive" ]; then
    echo "✓ _archive/ directory created"
    if [ -f "_archive/README.md" ]; then
        echo "  ✓ _archive/README.md exists"
    else
        echo "  ✗ _archive/README.md missing"
    fi
    if [ -d "_archive/2026-02-08_migrations" ]; then
        echo "  ✓ _archive/2026-02-08_migrations/ exists"
        if [ -f "_archive/2026-02-08_migrations/ARCHIVE_INFO.md" ]; then
            echo "    ✓ ARCHIVE_INFO.md exists"
        else
            echo "    ✗ ARCHIVE_INFO.md missing"
        fi
    else
        echo "  ✗ _archive/2026-02-08_migrations/ missing"
    fi
else
    echo "✗ _archive/ directory missing"
fi

# Check 3: Documentation created
echo ""
echo "📖 Documentation:"
[ -f "docs/reference/CLEANUP_ANALYSIS.md" ] && echo "   ✓ CLEANUP_ANALYSIS.md" || echo "   ✗ CLEANUP_ANALYSIS.md missing"
[ -f "docs/reference/CLEANUP_COMPLETE.md" ] && echo "   ✓ CLEANUP_COMPLETE.md" || echo "   ✗ CLEANUP_COMPLETE.md missing"

# Check 4: Active folders still present
echo ""
echo "🟢 Active Folders:"
for dir in assets docs supabase images icons demos tests; do
    if [ -d "$dir" ]; then
        echo "   ✓ $dir/ present"
    else
        echo "   ✗ $dir/ missing (PROBLEM!)"
    fi
done

# Check 5: No broken references (basic check)
echo ""
echo "🔗 Reference Check:"
if grep -r "migrations/" *.html *.js 2>/dev/null | grep -v "Binary" | grep -v ".git" > /dev/null; then
    echo "   ⚠️  Found references to migrations/ in code"
    grep -r "migrations/" *.html *.js 2>/dev/null | grep -v "Binary" | grep -v ".git"
else
    echo "   ✓ No references to migrations/ found"
fi

echo ""
echo "✅ Cleanup verification complete!"
echo ""
echo "Next steps:"
echo "  1. Test application in browser"
echo "  2. Verify GitHub Pages deployment"
echo "  3. Commit changes if all tests pass"
