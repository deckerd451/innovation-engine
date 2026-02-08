#!/bin/bash
# Add standard header to all SQL files

HEADER="-- ============================================================================
-- MANUAL SUPABASE SCRIPT
-- ============================================================================
-- Applied via Supabase Dashboard or CLI
-- Not executed by application code
-- ============================================================================

"

echo "📝 Adding headers to SQL files..."

find supabase/sql -name "*.sql" -type f | while read -r file; do
    # Check if file already has the header
    if ! grep -q "MANUAL SUPABASE SCRIPT" "$file"; then
        # Create temp file with header + original content
        printf "%s" "$HEADER" | cat - "$file" > "$file.tmp"
        mv "$file.tmp" "$file"
        echo "   ✓ $file"
    else
        echo "   - $file (already has header)"
    fi
done

echo ""
echo "✅ Headers added to all SQL files!"
