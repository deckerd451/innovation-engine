#!/bin/bash

# ================================================================
# Boot Gate Implementation Verification Script
# ================================================================
# Checks that all required changes are in place

echo "🔍 Verifying Boot Gate Implementation..."
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PASS=0
FAIL=0

# Check 1: Boot gate file exists
echo -n "1. Checking boot-gate.js exists... "
if [ -f "assets/js/boot-gate.js" ]; then
    echo -e "${GREEN}✓ PASS${NC}"
    ((PASS++))
else
    echo -e "${RED}✗ FAIL${NC}"
    ((FAIL++))
fi

# Check 2: Boot gate loaded in dashboard.html
echo -n "2. Checking boot-gate.js loaded in dashboard.html... "
if grep -q "boot-gate.js" dashboard.html; then
    echo -e "${GREEN}✓ PASS${NC}"
    ((PASS++))
else
    echo -e "${RED}✗ FAIL${NC}"
    ((FAIL++))
fi

# Check 3: Synapse uses boot gate
echo -n "3. Checking synapse-init-helper.js uses bootGate... "
if grep -q "bootGate" assets/js/synapse-init-helper.js; then
    echo -e "${GREEN}✓ PASS${NC}"
    ((PASS++))
else
    echo -e "${RED}✗ FAIL${NC}"
    ((FAIL++))
fi

# Check 4: START integration uses boot gate
echo -n "4. Checking start-integration.js uses bootGate... "
if grep -q "bootGate" assets/js/suggestions/start-integration.js; then
    echo -e "${GREEN}✓ PASS${NC}"
    ((PASS++))
else
    echo -e "${RED}✗ FAIL${NC}"
    ((FAIL++))
fi

# Check 5: Synapse retry loop removed
echo -n "5. Checking synapse retry loop removed... "
if ! grep -q "fallbackAttempts" assets/js/synapse-init-helper.js; then
    echo -e "${GREEN}✓ PASS${NC}"
    ((PASS++))
else
    echo -e "${RED}✗ FAIL${NC} (retry loop still present)"
    ((FAIL++))
fi

# Check 6: START retry loop removed
echo -n "6. Checking START retry loop removed... "
if ! grep -q "tryInitialize" assets/js/suggestions/start-integration.js; then
    echo -e "${GREEN}✓ PASS${NC}"
    ((PASS++))
else
    echo -e "${RED}✗ FAIL${NC} (retry loop still present)"
    ((FAIL++))
fi

# Check 7: Engagement warning silenced
echo -n "7. Checking engagement container warning silenced... "
if ! grep -q "Engagement displays container not found" assets/js/critical-ux-fixes.js; then
    echo -e "${GREEN}✓ PASS${NC}"
    ((PASS++))
else
    echo -e "${RED}✗ FAIL${NC} (warning still present)"
    ((FAIL++))
fi

# Check 8: No duplicate adminPeopleService
echo -n "8. Checking no duplicate adminPeopleService.js... "
COUNT=$(grep -c "adminPeopleService.js" dashboard.html)
if [ "$COUNT" -eq 1 ]; then
    echo -e "${GREEN}✓ PASS${NC}"
    ((PASS++))
else
    echo -e "${RED}✗ FAIL${NC} (found $COUNT instances)"
    ((FAIL++))
fi

# Check 9: No duplicate node-panel
echo -n "9. Checking no duplicate node-panel.js... "
COUNT=$(grep -c "node-panel.js" dashboard.html)
if [ "$COUNT" -eq 1 ]; then
    echo -e "${GREEN}✓ PASS${NC}"
    ((PASS++))
else
    echo -e "${RED}✗ FAIL${NC} (found $COUNT instances)"
    ((FAIL++))
fi

# Check 10: No duplicate logger
echo -n "10. Checking no duplicate logger.js... "
COUNT=$(grep -c "logger.js" dashboard.html)
if [ "$COUNT" -eq 1 ]; then
    echo -e "${GREEN}✓ PASS${NC}"
    ((PASS++))
else
    echo -e "${RED}✗ FAIL${NC} (found $COUNT instances)"
    ((FAIL++))
fi

# Summary
echo ""
echo "================================"
echo "Results: ${GREEN}${PASS} passed${NC}, ${RED}${FAIL} failed${NC}"
echo "================================"

if [ $FAIL -eq 0 ]; then
    echo -e "${GREEN}✅ All checks passed!${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Test unauthenticated load (incognito mode)"
    echo "2. Test OAuth login (GitHub + Google)"
    echo "3. Test refresh while logged in"
    echo "4. Test logout"
    echo ""
    echo "Open test-boot-gate.html in browser for interactive testing"
    exit 0
else
    echo -e "${RED}❌ Some checks failed. Please review the implementation.${NC}"
    exit 1
fi
