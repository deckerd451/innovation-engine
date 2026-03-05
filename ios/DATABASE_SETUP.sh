#!/bin/bash

# BLE Passive Networking - Database Setup Script
# Run this script to set up your Supabase database

echo "🗄️  BLE Passive Networking - Database Setup"
echo "=============================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if psql is available
if ! command -v psql &> /dev/null; then
    echo -e "${YELLOW}⚠️  psql not found. You can:${NC}"
    echo "   1. Install PostgreSQL client tools"
    echo "   2. Use Supabase Dashboard SQL Editor instead"
    echo ""
    echo "To use Supabase Dashboard:"
    echo "   1. Go to your Supabase project"
    echo "   2. Navigate to SQL Editor"
    echo "   3. Copy/paste each migration file"
    echo "   4. Execute in order (001, 002, 003, 004)"
    echo ""
    exit 1
fi

# Prompt for connection details
echo -e "${BLUE}Enter your Supabase connection details:${NC}"
echo "(You can find these in Supabase Dashboard → Settings → Database)"
echo ""

read -p "Host (e.g., db.xxxxx.supabase.co): " DB_HOST
read -p "Database name (default: postgres): " DB_NAME
DB_NAME=${DB_NAME:-postgres}
read -p "Username (default: postgres): " DB_USER
DB_USER=${DB_USER:-postgres}
read -sp "Password: " DB_PASSWORD
echo ""
echo ""

# Test connection
echo -e "${BLUE}Testing connection...${NC}"
export PGPASSWORD="$DB_PASSWORD"

if psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" &> /dev/null; then
    echo -e "${GREEN}✓ Connection successful${NC}"
else
    echo -e "${RED}✗ Connection failed${NC}"
    echo "Please check your credentials and try again."
    exit 1
fi

echo ""

# Run migrations
echo -e "${BLUE}Running migrations...${NC}"
echo "-----------------------------------"

MIGRATIONS=(
    "migrations/001_create_beacons_table.sql"
    "migrations/002_create_interaction_edges_table.sql"
    "migrations/003_create_rpc_functions.sql"
)

for migration in "${MIGRATIONS[@]}"; do
    if [ -f "$migration" ]; then
        echo -e "${BLUE}Running $migration...${NC}"
        if psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -f "$migration" &> /dev/null; then
            echo -e "${GREEN}✓ $migration completed${NC}"
        else
            echo -e "${RED}✗ $migration failed${NC}"
            echo "Check the error above and fix before continuing."
            exit 1
        fi
    else
        echo -e "${RED}✗ $migration not found${NC}"
        exit 1
    fi
done

echo ""

# Ask about example data
read -p "Install example beacon data for testing? (y/n): " INSTALL_EXAMPLES

if [ "$INSTALL_EXAMPLES" = "y" ] || [ "$INSTALL_EXAMPLES" = "Y" ]; then
    echo -e "${BLUE}Installing example beacon data...${NC}"
    if psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -f "migrations/004_example_beacon_data.sql" &> /dev/null; then
        echo -e "${GREEN}✓ Example data installed${NC}"
    else
        echo -e "${YELLOW}⚠️  Example data installation failed (non-critical)${NC}"
    fi
fi

echo ""

# Verify installation
echo -e "${BLUE}Verifying installation...${NC}"
echo "-----------------------------------"

# Check tables
TABLES=("beacons" "interaction_edges" "presence_sessions" "connections")
for table in "${TABLES[@]}"; do
    if psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1 FROM $table LIMIT 1;" &> /dev/null; then
        echo -e "${GREEN}✓ Table '$table' exists${NC}"
    else
        echo -e "${RED}✗ Table '$table' not found${NC}"
    fi
done

echo ""

# Check RPC functions
FUNCTIONS=("upsert_presence_ping" "infer_ble_edges" "promote_edge_to_connection")
for func in "${FUNCTIONS[@]}"; do
    if psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1 FROM pg_proc WHERE proname = '$func';" | grep -q 1; then
        echo -e "${GREEN}✓ Function '$func' exists${NC}"
    else
        echo -e "${RED}✗ Function '$func' not found${NC}"
    fi
done

echo ""

# Check active beacons
BEACON_COUNT=$(psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM beacons WHERE is_active = true;" 2>/dev/null | xargs)

if [ -n "$BEACON_COUNT" ] && [ "$BEACON_COUNT" -gt 0 ]; then
    echo -e "${GREEN}✓ Found $BEACON_COUNT active beacon(s)${NC}"
else
    echo -e "${YELLOW}⚠️  No active beacons found. You'll need to register beacons.${NC}"
fi

echo ""
echo "=============================================="
echo -e "${GREEN}✅ Database setup complete!${NC}"
echo "=============================================="
echo ""
echo "Next steps:"
echo "1. Register your physical beacons (see BEACON_CONFIGURATION_GUIDE.md)"
echo "2. Update AppEnvironment.swift with Supabase credentials"
echo "3. Build and test the app"
echo ""
echo "To register a beacon:"
echo "  psql -h $DB_HOST -U $DB_USER -d $DB_NAME"
echo "  Then run:"
echo "    INSERT INTO beacons (beacon_key, label, kind, group_id, is_active)"
echo "    VALUES ('uuid:YOUR-UUID|major:100|minor:1', 'Location Name', 'event', gen_random_uuid(), true);"
echo ""

unset PGPASSWORD
