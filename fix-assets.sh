#!/bin/bash

# ============================================================================
# Asset Fix Script
# Automatically fixes filename typos and broken references
# ============================================================================

set -e  # Exit on error

echo "🔧 CharlestonHacks Asset Fix Script"
echo "===================================="
echo ""

# Track changes
CHANGES=0

# ============================================================================
# 1. Fix Image Filename Typos
# ============================================================================

echo "📸 Fixing image filename typos..."
echo ""

cd images/

# Fix: dougexplaning.jpg -> dougexplaining.jpg
if [ -f "dougexplaning.jpg" ]; then
    mv dougexplaning.jpg dougexplaining.jpg
    echo "✅ Renamed: dougexplaning.jpg → dougexplaining.jpg"
    ((CHANGES++))
else
    echo "ℹ️  dougexplaining.jpg already correct"
fi

# Fix: mikeexplaning.jpg -> mikeexplaining.jpg
if [ -f "mikeexplaning.jpg" ]; then
    mv mikeexplaning.jpg mikeexplaining.jpg
    echo "✅ Renamed: mikeexplaning.jpg → mikeexplaining.jpg"
    ((CHANGES++))
else
    echo "ℹ️  mikeexplaining.jpg already correct"
fi

# Fix: participants.JPG -> participants.jpeg
if [ -f "participants.JPG" ]; then
    mv participants.JPG participants.jpeg
    echo "✅ Renamed: participants.JPG → participants.jpeg"
    ((CHANGES++))
else
    echo "ℹ️  participants.jpeg already correct"
fi

# Fix: participants2.JPG -> participants2.jpeg
if [ -f "participants2.JPG" ]; then
    mv participants2.JPG participants2.jpeg
    echo "✅ Renamed: participants2.JPG → participants2.jpeg"
    ((CHANGES++))
else
    echo "ℹ️  participants2.jpeg already correct"
fi

cd ..

echo ""

# ============================================================================
# 2. Fix mm2.jpg Reference in HTML
# ============================================================================

echo "📝 Fixing HTML references..."
echo ""

# Fix: mm2.jpg -> mm25.jpg in meetupmashup2.html
if [ -f "meetupmashup2.html" ]; then
    if grep -q "mm2\.jpg" meetupmashup2.html; then
        # Create backup
        cp meetupmashup2.html meetupmashup2.html.bak
        
        # Fix the reference
        sed -i.tmp 's/mm2\.jpg/mm25.jpg/g' meetupmashup2.html
        rm meetupmashup2.html.tmp 2>/dev/null || true
        
        echo "✅ Updated: meetupmashup2.html (mm2.jpg → mm25.jpg)"
        ((CHANGES++))
    else
        echo "ℹ️  meetupmashup2.html already correct"
    fi
else
    echo "⚠️  meetupmashup2.html not found"
fi

echo ""

# ============================================================================
# 3. Summary
# ============================================================================

echo "===================================="
echo "📊 Summary"
echo "===================================="
echo ""

if [ $CHANGES -eq 0 ]; then
    echo "✅ No changes needed - all assets already correct!"
else
    echo "✅ Applied $CHANGES fix(es)"
    echo ""
    echo "Changes made:"
    echo "  - Renamed image files to match HTML references"
    echo "  - Updated HTML to match existing image files"
    echo ""
    echo "Next steps:"
    echo "  1. Test affected pages:"
    echo "     - summerhack.html"
    echo "     - harborhack23.html"
    echo "     - meetupmashup2.html"
    echo "  2. Commit changes:"
    echo "     git add images/ meetupmashup2.html"
    echo "     git commit -m 'Fix asset filename typos and references'"
    echo "     git push"
fi

echo ""
echo "🎉 Asset fix complete!"
