#!/bin/bash

# BLE Passive Networking - Verification Script
# Run this script to verify your setup is ready

echo "🔍 BLE Passive Networking - Setup Verification"
echo "=============================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counters
PASSED=0
FAILED=0
WARNINGS=0

# Check function
check() {
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓${NC} $1"
        ((PASSED++))
    else
        echo -e "${RED}✗${NC} $1"
        ((FAILED++))
    fi
}

warn() {
    echo -e "${YELLOW}⚠${NC} $1"
    ((WARNINGS++))
}

# 1. Check Swift files exist
echo "📱 Checking Swift Implementation..."
echo "-----------------------------------"

FILES=(
    "InnovationEngine/Models/Beacon.swift"
    "InnovationEngine/Models/InteractionEdge.swift"
    "InnovationEngine/Models/PresenceSession.swift"
    "InnovationEngine/Services/BeaconRegistryService.swift"
    "InnovationEngine/Services/BLEService.swift"
    "InnovationEngine/Services/SuggestedConnectionsService.swift"
    "InnovationEngine/Views/EventModeView.swift"
    "InnovationEngine/Views/SuggestedConnectionsView.swift"
)

for file in "${FILES[@]}"; do
    if [ -f "$file" ]; then
        check "$file exists"
    else
        check "$file exists"
    fi
done

echo ""

# 2. Check SQL migrations exist
echo "🗄️  Checking Database Migrations..."
echo "-----------------------------------"

MIGRATIONS=(
    "migrations/001_create_beacons_table.sql"
    "migrations/002_create_interaction_edges_table.sql"
    "migrations/003_create_rpc_functions.sql"
    "migrations/004_example_beacon_data.sql"
)

for migration in "${MIGRATIONS[@]}"; do
    if [ -f "$migration" ]; then
        check "$migration exists"
    else
        check "$migration exists"
    fi
done

echo ""

# 3. Check documentation exists
echo "📚 Checking Documentation..."
echo "-----------------------------------"

DOCS=(
    "BLE_PASSIVE_NETWORKING_GUIDE.md"
    "SETUP_CHECKLIST.md"
    "BEACON_CONFIGURATION_GUIDE.md"
    "QUICK_REFERENCE.md"
    "ARCHITECTURE_DIAGRAM.md"
    "SYSTEM_FLOW_DIAGRAM.md"
)

for doc in "${DOCS[@]}"; do
    if [ -f "$doc" ]; then
        check "$doc exists"
    else
        check "$doc exists"
    fi
done

echo ""

# 4. Check Info.plist has required permissions
echo "🔐 Checking Permissions..."
echo "-----------------------------------"

if [ -f "InnovationEngine/Supporting/Info.plist" ]; then
    if grep -q "NSLocationWhenInUseUsageDescription" "InnovationEngine/Supporting/Info.plist"; then
        check "Location permission description exists"
    else
        check "Location permission description exists"
    fi
    
    if grep -q "NSBluetoothAlwaysUsageDescription" "InnovationEngine/Supporting/Info.plist"; then
        check "Bluetooth permission description exists"
    else
        check "Bluetooth permission description exists"
    fi
else
    check "Info.plist exists"
fi

echo ""

# 5. Check AppEnvironment configuration
echo "⚙️  Checking Configuration..."
echo "-----------------------------------"

if [ -f "InnovationEngine/App/AppEnvironment.swift" ]; then
    if grep -q "your-project.supabase.co" "InnovationEngine/App/AppEnvironment.swift"; then
        warn "Supabase URL needs to be updated in AppEnvironment.swift"
    else
        check "Supabase URL appears to be configured"
    fi
    
    if grep -q "your-anon-key" "InnovationEngine/App/AppEnvironment.swift"; then
        warn "Supabase anon key needs to be updated in AppEnvironment.swift"
    else
        check "Supabase anon key appears to be configured"
    fi
else
    check "AppEnvironment.swift exists"
fi

echo ""

# 6. Check Package.swift
echo "📦 Checking Dependencies..."
echo "-----------------------------------"

if [ -f "Package.swift" ]; then
    check "Package.swift exists"
    
    if grep -q "supabase-swift" "Package.swift"; then
        check "Supabase Swift dependency declared"
    else
        check "Supabase Swift dependency declared"
    fi
else
    check "Package.swift exists"
fi

echo ""

# 7. Summary
echo "=============================================="
echo "📊 Verification Summary"
echo "=============================================="
echo -e "${GREEN}Passed:${NC} $PASSED"
echo -e "${RED}Failed:${NC} $FAILED"
echo -e "${YELLOW}Warnings:${NC} $WARNINGS"
echo ""

if [ $FAILED -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✅ All checks passed! Ready to proceed.${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Run database migrations"
    echo "2. Update AppEnvironment.swift with Supabase credentials"
    echo "3. Register beacons in database"
    echo "4. Build and test"
    exit 0
elif [ $FAILED -eq 0 ]; then
    echo -e "${YELLOW}⚠️  Setup is mostly complete, but check warnings above.${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Address warnings (likely Supabase credentials)"
    echo "2. Run database migrations"
    echo "3. Register beacons in database"
    echo "4. Build and test"
    exit 0
else
    echo -e "${RED}❌ Some checks failed. Please review errors above.${NC}"
    echo ""
    echo "Common issues:"
    echo "- Missing files: Ensure all files were created"
    echo "- Wrong directory: Run this script from ios/ directory"
    exit 1
fi
