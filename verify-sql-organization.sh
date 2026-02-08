#!/bin/bash
# Verify SQL organization is complete

echo "�� Verifying SQL Organization..."
echo ""

# Check 1: All SQL files in supabase/sql
SQL_IN_SUPABASE=$(find supabase/sql -name "*.sql" -type f | wc -l | tr -d ' ')
echo "✓ SQL files in supabase/sql/: $SQL_IN_SUPABASE"

# Check 2: No SQL files in root
SQL_IN_ROOT=$(find . -maxdepth 1 -name "*.sql" -type f | wc -l | tr -d ' ')
if [ "$SQL_IN_ROOT" -eq 0 ]; then
    echo "✓ No SQL files in root directory"
else
    echo "✗ Found $SQL_IN_ROOT SQL files in root (should be 0)"
fi

# Check 3: All files have headers
FILES_WITH_HEADERS=$(grep -r "MANUAL SUPABASE SCRIPT" supabase/sql --include="*.sql" | wc -l | tr -d ' ')
echo "✓ Files with standard header: $FILES_WITH_HEADERS"

# Check 4: Directory structure exists
echo ""
echo "📁 Directory Structure:"
for dir in tables functions policies fixes diagnostics reference migrations; do
    COUNT=$(find supabase/sql/$dir -name "*.sql" 2>/dev/null | wc -l | tr -d ' ')
    echo "   $dir/: $COUNT files"
done

# Check 5: Documentation exists
echo ""
echo "�� Documentation:"
[ -f "supabase/sql/README.md" ] && echo "   ✓ README.md" || echo "   ✗ README.md missing"
[ -f "supabase/sql/QUICK_START.md" ] && echo "   ✓ QUICK_START.md" || echo "   ✗ QUICK_START.md missing"

echo ""
if [ "$SQL_IN_ROOT" -eq 0 ] && [ "$SQL_IN_SUPABASE" -gt 0 ]; then
    echo "✅ SQL organization verified successfully!"
else
    echo "⚠️  Issues found - review output above"
fi
