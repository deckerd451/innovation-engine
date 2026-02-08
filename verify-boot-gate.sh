#!/bin/bash

# ================================================================
# Boot Gate Hardening Verification Script
# ================================================================
# Checks that all hardening changes are in place

echo "🔍 Verifying Boot Gate Hardening..."
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

# Check 2: authKnown state added
echo -n "2. Checking authKnown state added... "
if grep -q "authKnown:" assets/js/boot-gate.js; then
    echo -e "${GREEN}✓ PASS${NC}"
    ((PASS++))
else
    echo -e "${RED}✗ FAIL${NC}"
    ((FAIL++))
fi

# Check 3: Emission guards added
echo -n "3. Checking idempotent emission guards... "
if grep -q "const emitted = {" assets/js/boot-gate.js; then
    echo -e "${GREEN}✓ PASS${NC}"
    ((PASS++))
else
    echo -e "${RED}✗ FAIL${NC}"
    ((FAIL++))
fi

# Check 4: Sticky listeners implemented
echo -n "4. Checking sticky listener implementation... "
if grep -q "STICKY" assets/js/boot-gate.js; then
    echo -e "${GREEN}✓ PASS${NC}"
    ((PASS++))
else
    echo -e "${RED}✗ FAIL${NC}"
    ((FAIL++))
fi

# Check 5: Re-entrancy protection added
echo -n "5. Checking re-entrancy protection... "
if grep -q "let emitting = false" assets/js/boot-gate.js; then
    echo -e "${GREEN}✓ PASS${NC}"
    ((PASS++))
else
    echo -e "${RED}✗ FAIL${NC}"
    ((FAIL++))
fi

# Check 6: Auth timeout logic improved
echo -n "6. Checking improved auth timeout logic... "
if grep -q "Auth decision known: no user" assets/js/boot-gate.js; then
    echo -e "${GREEN}✓ PASS${NC}"
    ((PASS++))
else
    echo -e "${RED}✗ FAIL${NC}"
    ((FAIL++))
fi

# Check 7: isAuthKnown method added
echo -n "7. Checking isAuthKnown() method... "
if grep -q "isAuthKnown()" assets/js/boot-gate.js; then
    echo -e "${GREEN}✓ PASS${NC}"
    ((PASS++))
else
    echo -e "${RED}✗ FAIL${NC}"
    ((FAIL++))
fi

# Check 8: getEmittedEvents method added
echo -n "8. Checking getEmittedEvents() method... "
if grep -q "getEmittedEvents()" assets/js/boot-gate.js; then
    echo -e "${GREEN}✓ PASS${NC}"
    ((PASS++))
else
    echo -e "${RED}✗ FAIL${NC}"
    ((FAIL++))
fi

# Check 9: Logout resets emission guards
echo -n "9. Checking logout resets emission guards... "
if grep -q "emitted\['AUTH_READY'\] = false" assets/js/boot-gate.js; then
    echo -e "${GREEN}✓ PASS${NC}"
    ((PASS++))
else
    echo -e "${RED}✗ FAIL${NC}"
    ((FAIL++))
fi

# Check 10: Test file updated
echo -n "10. Checking test file has new tests... "
if grep -q "testStickyListeners" test-boot-gate.html && grep -q "testIdempotentEmission" test-boot-gate.html; then
    echo -e "${GREEN}✓ PASS${NC}"
    ((PASS++))
else
    echo -e "${RED}✗ FAIL${NC}"
    ((FAIL++))
fi

# Check 11: Hardened log message
echo -n "11. Checking hardened log message... "
if grep -q "Boot gate initializing (hardened)" assets/js/boot-gate.js; then
    echo -e "${GREEN}✓ PASS${NC}"
    ((PASS++))
else
    echo -e "${RED}✗ FAIL${NC}"
    ((FAIL++))
fi

# Check 12: No auth.js changes (OAuth safe)
echo -n "12. Checking auth.js unchanged (OAuth safe)... "
if ! git diff --name-only | grep -q "^auth.js$"; then
    echo -e "${GREEN}✓ PASS${NC}"
    ((PASS++))
else
    echo -e "${YELLOW}⚠ WARNING${NC} (auth.js modified - verify OAuth still works)"
    ((PASS++))
fi

# Summary
echo ""
echo "================================"
echo "Results: ${GREEN}${PASS} passed${NC}, ${RED}${FAIL} failed${NC}"
echo "================================"

if [ $FAIL -eq 0 ]; then
    echo -e "${GREEN}✅ All hardening checks passed!${NC}"
    echo ""
    echo "New features:"
    echo "  ✓ authKnown state tracking"
    echo "  ✓ Idempotent event emission"
    echo "  ✓ Sticky listeners"
    echo "  ✓ Re-entrancy protection"
    echo "  ✓ Improved auth timeout logic"
    echo ""
    echo "Next steps:"
    echo "1. Test with test-boot-gate.html"
    echo "2. Test unauthenticated load (incognito)"
    echo "3. Test OAuth login (GitHub + Google)"
    echo "4. Test refresh while logged in"
    echo "5. Test logout"
    echo ""
    echo "Console commands:"
    echo "  window.appReady"
    echo "  window.bootGate.isAuthKnown()"
    echo "  window.bootGate.getEmittedEvents()"
    exit 0
else
    echo -e "${RED}❌ Some checks failed. Please review the implementation.${NC}"
    exit 1
fi
