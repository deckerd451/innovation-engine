#!/bin/bash
# ================================================================
# LOGGING MIGRATION HELPER SCRIPT
# ================================================================
# This script helps migrate JavaScript files to use the centralized logger
# 
# Usage: ./assets/js/migrate-to-logger.sh <file.js>
#
# What it does:
# 1. Adds logger import at the top
# 2. Converts console.log to log.debug or log.info (manual review needed)
# 3. Converts console.warn to log.warn
# 4. Converts console.error to log.error
#
# NOTE: This is a helper script. Always review changes manually!
# ================================================================

if [ $# -eq 0 ]; then
    echo "Usage: $0 <javascript-file>"
    echo "Example: $0 assets/js/my-module.js"
    exit 1
fi

FILE="$1"

if [ ! -f "$FILE" ]; then
    echo "Error: File '$FILE' not found"
    exit 1
fi

echo "🔄 Migrating $FILE to use centralized logger..."

# Create backup
BACKUP="${FILE}.backup.$(date +%Y%m%d_%H%M%S)"
cp "$FILE" "$BACKUP"
echo "✅ Backup created: $BACKUP"

# Create temporary file
TEMP="${FILE}.tmp"

# Check if file already has logger import
if grep -q "const log = window.log" "$FILE"; then
    echo "⚠️  File already has logger import, skipping..."
    rm -f "$TEMP"
    exit 0
fi

# Add logger import after first comment block or at top
awk '
BEGIN { added = 0; in_comment = 0; }
/^\/\*/ { in_comment = 1; }
/\*\/$/ { in_comment = 0; print; next; }
{
    if (!added && !in_comment && NF > 0 && !/^\/\//) {
        print "// Import centralized logger";
        print "const log = window.log || console;";
        print "";
        added = 1;
    }
    print;
}
' "$FILE" > "$TEMP"

# Replace console.log with log.debug (will need manual review for log.info)
sed -i.bak 's/console\.log(/log.debug(/g' "$TEMP"

# Replace console.warn with log.warn
sed -i.bak 's/console\.warn(/log.warn(/g' "$TEMP"

# Replace console.error with log.error
sed -i.bak 's/console\.error(/log.error(/g' "$TEMP"

# Replace console.info with log.info
sed -i.bak 's/console\.info(/log.info(/g' "$TEMP"

# Clean up sed backup files
rm -f "${TEMP}.bak"

# Move temp file to original
mv "$TEMP" "$FILE"

echo "✅ Migration complete!"
echo ""
echo "⚠️  IMPORTANT: Manual review required!"
echo "   1. Review all log.debug() calls"
echo "   2. Change important milestones to log.info()"
echo "   3. Add log.moduleLoad('$(basename $FILE)') after logger import"
echo "   4. Consider using log.once() for repeated messages"
echo "   5. Consider using log.throttle() for polling loops"
echo ""
echo "   Backup saved to: $BACKUP"
echo "   To restore: mv $BACKUP $FILE"
