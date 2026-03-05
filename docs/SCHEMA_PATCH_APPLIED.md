# ✅ Schema Alignment Patch Applied

## Critical Fixes Completed

The BLE Passive Networking implementation has been patched to align with the existing Supabase schema.

### Issues Fixed

1. **✅ Energy Scale**: Changed from [0-10] to [0-1] per database constraint
2. **✅ User ID Mapping**: Fixed `auth.uid() → community.id` mapping in RPC functions
3. **✅ Client Behavior**: Client now ONLY calls RPC (never inserts directly)
4. **✅ User Resolution**: Added proper `community.id` resolution for current user
5. **✅ Batch Queries**: Optimized user profile fetching (no N+1 queries)

### Files Changed

**Swift Code (3 files)**:
- `ios/InnovationEngine/Services/BLEService.swift` - Energy scale [0-1]
- `ios/InnovationEngine/Services/SuggestedConnectionsService.swift` - User ID mapping
- `ios/InnovationEngine/Views/SuggestedConnectionsView.swift` - Community ID resolution

**SQL Migrations (1 file)**:
- `ios/migrations/003_create_rpc_functions.sql` - All 3 RPC functions updated

**Documentation (2 files)**:
- `ios/SCHEMA_ALIGNMENT_PATCH.md` - Detailed patch notes
- `ios/BLE_PASSIVE_NETWORKING_GUIDE.md` - Updated energy scale docs

## Key Changes

### Energy Scale: [0, 1]
```swift
// OLD: [0, 10]
var energy = (median + 90) / 4

// NEW: [0, 1]
let normalizedRSSI = (median + 90) / 50.0
var energy = 0.4 + (normalizedRSSI * 0.5)
energy = max(0, min(1, energy))
```

**Scale**:
- `0.4` = baseline / tab hidden
- `0.6` = normal presence
- `0.75` = active interaction
- `0.9` = very active / very close

### User ID Mapping
```sql
-- RPC now maps auth.uid() → community.id
SELECT id INTO v_community_id
FROM public.community
WHERE auth_user_id = auth.uid()
LIMIT 1;

-- Fallback to email
IF v_community_id IS NULL THEN
    SELECT id INTO v_community_id
    FROM public.community
    WHERE email = auth.email()
    LIMIT 1;
END IF;

-- Insert with community.id (not auth.uid)
INSERT INTO presence_sessions (user_id, ...)
VALUES (v_community_id, ...);
```

### Client Behavior
```swift
// CRITICAL: Client NEVER inserts directly
// Client ONLY calls RPC
try await supabase.rpc(
    "upsert_presence_ping",
    params: [
        "p_context_type": "beacon",
        "p_context_id": beaconId.uuidString,
        "p_energy": clampedEnergy,  // [0, 1]
        "p_ttl_seconds": 25
    ]
).execute()
```

## Migration Steps

### 1. Update RPC Functions
```bash
# Drop old functions (if they exist)
psql -c "DROP FUNCTION IF EXISTS public.upsert_presence_ping;"
psql -c "DROP FUNCTION IF EXISTS public.infer_ble_edges;"
psql -c "DROP FUNCTION IF EXISTS public.promote_edge_to_connection;"

# Run updated migration
psql -f ios/migrations/003_create_rpc_functions.sql
```

Or via Supabase Dashboard:
1. Go to SQL Editor
2. Copy/paste `ios/migrations/003_create_rpc_functions.sql`
3. Execute (CREATE OR REPLACE will update existing functions)

### 2. Rebuild iOS App
```bash
cd ios
swift build
# Or rebuild in Xcode
```

### 3. Verify
Run verification queries from `ios/SCHEMA_ALIGNMENT_PATCH.md`:

```sql
-- Check energy values are [0, 1]
SELECT energy, COUNT(*) 
FROM presence_sessions 
WHERE context_type = 'beacon' 
GROUP BY energy;

-- Check user ID mapping works
SELECT ps.user_id, c.name 
FROM presence_sessions ps 
JOIN community c ON c.id = ps.user_id 
LIMIT 10;

-- Check suggestions resolve names
SELECT ie.id, c1.name, c2.name 
FROM interaction_edges ie 
JOIN community c1 ON c1.id = ie.from_user_id 
JOIN community c2 ON c2.id = ie.to_user_id 
WHERE ie.status = 'suggested';
```

## Testing Checklist

- [ ] Energy values in database are [0, 1] (not [0, 10])
- [ ] Console logs show energy like "0.75" (not "7.5")
- [ ] `presence_sessions.user_id` contains `community.id` values
- [ ] RPC doesn't fail with "Could not resolve community.id"
- [ ] Suggestions load with display names (not UUIDs)
- [ ] Accept promotes to connections successfully
- [ ] All joins with `community` table work

## Documentation Updated

All documentation has been updated to reflect the correct schema:

- ✅ `ios/BLE_PASSIVE_NETWORKING_GUIDE.md` - Energy scale and user ID mapping
- ✅ `ios/SCHEMA_ALIGNMENT_PATCH.md` - Detailed patch notes
- ✅ `ios/QUICK_REFERENCE.md` - Updated examples
- ✅ Code comments - Added CRITICAL notes

## No Breaking Changes

- ✅ No database schema changes required
- ✅ No table structure changes
- ✅ Only RPC functions and client code updated
- ✅ Existing data unaffected

## Summary

The implementation now correctly:
1. Uses energy scale [0, 1] per database constraint
2. Maps `auth.uid() → community.id` in RPC functions
3. Never inserts directly into `presence_sessions`
4. Resolves `community.id` for current user properly
5. Batches user profile queries for performance

**Status**: ✅ READY FOR TESTING

**Next Steps**:
1. Update RPC functions in database
2. Rebuild iOS app
3. Test with verification queries
4. Deploy to production

See `ios/SCHEMA_ALIGNMENT_PATCH.md` for complete details.
