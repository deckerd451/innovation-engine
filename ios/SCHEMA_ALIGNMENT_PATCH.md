# Schema Alignment Patch - Applied

## Critical Fixes Applied

### 1. ✅ Energy Scale Corrected (0-1 instead of 0-10)

**Problem**: Original implementation used 0-10 energy scale, but database constraint requires `energy BETWEEN 0 AND 1`.

**Fix Applied**:
- Updated `BLEService.calculateEnergy()` to return values in [0, 1] range
- New scale:
  - `0.4` = tab hidden / baseline
  - `0.6` = normal presence
  - `0.75` = active interaction
  - `0.9` = very active / very close
- Added explicit clamping: `max(0, min(1, energy))`
- Updated upload function to clamp before sending

**Code Changed**:
```swift
// OLD: energy [0, 10]
var energy = (median + 90) / 4  // 0-10 scale

// NEW: energy [0, 1]
let normalizedRSSI = (median + 90) / 50.0
var energy = 0.4 + (normalizedRSSI * 0.5)  // [0.4, 0.9] scale
energy = max(0, min(1, energy))  // Clamp to [0, 1]
```

### 2. ✅ User ID Mapping Fixed (auth.uid → community.id)

**Problem**: Original implementation assumed `presence_sessions.user_id = auth.uid()`, but actual schema has `presence_sessions.user_id REFERENCES public.community(id)`.

**Fix Applied**:
- Client NEVER inserts directly into `presence_sessions`
- Client ONLY calls `upsert_presence_ping()` RPC
- RPC handles `auth.uid() → community.id` mapping internally
- Added explicit comments in code about this critical requirement

**RPC Function Updated**:
```sql
-- Maps auth.uid() to community.id
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

### 3. ✅ Suggested Connections User Resolution Fixed

**Problem**: Original implementation didn't properly resolve `community.id` for current user.

**Fix Applied**:
- Added `resolveCurrentUserCommunityId()` method to `SuggestedConnectionsService`
- Prefers: `community.auth_user_id = auth.uid()`
- Fallback: `community.email = session.user.email`
- View now resolves `community.id` on load
- All queries use `community.id` (not `auth.uid()`)

**Code Added**:
```swift
func resolveCurrentUserCommunityId() async throws -> UUID {
    let session = try await supabase.auth.session
    let authUserId = session.user.id
    
    // Prefer: community.auth_user_id = auth.uid()
    let response = try await supabase
        .from("community")
        .select("id, name")
        .eq("auth_user_id", value: authUserId.uuidString)
        .limit(1)
        .execute()
        .value
    
    if let profile = response.first {
        return profile.id
    }
    
    // Fallback: community.email = session.user.email
    // ...
}
```

### 4. ✅ Batch User Profile Resolution

**Problem**: Original implementation fetched user profiles one-by-one (N+1 query problem).

**Fix Applied**:
- Added `fetchUserProfiles(for: [UUID])` method
- Batches all user IDs into single query
- Uses OR filter for efficient lookup
- Returns dictionary for O(1) lookup

**Code Added**:
```swift
private func fetchUserProfiles(for userIds: [UUID]) async -> [UUID: String] {
    let filters = userIds.map { "id.eq.\($0.uuidString)" }.joined(separator: ",")
    
    let response = try await supabase
        .from("community")
        .select("id, name")
        .or(filters)
        .execute()
        .value
    
    return Dictionary(uniqueKeysWithValues: response.map { ($0.id, $0.name) })
}
```

### 5. ✅ RPC Functions Updated

**All 3 RPC functions updated**:

**upsert_presence_ping**:
- Maps `auth.uid() → community.id` before insert
- Clamps energy to [0, 1]
- Inserts `community.id` into `presence_sessions.user_id`

**infer_ble_edges**:
- Works with `community.id` values from `presence_sessions`
- Stores `community.id` in `interaction_edges`
- No changes to logic, just clarified comments

**promote_edge_to_connection**:
- Maps `auth.uid() → community.id` before checking access
- Verifies user is involved using `community.id`
- Inserts `community.id` into `connections` table

## Files Changed

### Swift Files (3 files)
1. `ios/InnovationEngine/Services/BLEService.swift`
   - Energy calculation: [0, 1] scale
   - Upload function: explicit clamping
   - Added critical comments

2. `ios/InnovationEngine/Services/SuggestedConnectionsService.swift`
   - Added `resolveCurrentUserCommunityId()` method
   - Added `fetchUserProfiles()` batch method
   - Updated `fetchSuggestions()` to use `community.id`
   - All queries now use `community.id`

3. `ios/InnovationEngine/Views/SuggestedConnectionsView.swift`
   - Added `currentCommunityId` state
   - Added `resolveCommunityId()` on view load
   - Updated all service calls to use `community.id`

### SQL Files (1 file)
1. `ios/migrations/003_create_rpc_functions.sql`
   - Updated all 3 RPC functions
   - Added `auth.uid() → community.id` mapping
   - Added energy clamping
   - Added detailed comments

## Testing Checklist

### ✅ Energy Scale
- [ ] Verify energy values are [0, 1] in database
- [ ] Check console logs show energy like "0.75" not "7.5"
- [ ] Query: `SELECT energy FROM presence_sessions WHERE context_type = 'beacon' ORDER BY created_at DESC LIMIT 10;`

### ✅ User ID Mapping
- [ ] Verify `presence_sessions.user_id` contains `community.id` values
- [ ] Check RPC doesn't fail with "Could not resolve community.id"
- [ ] Query: `SELECT ps.user_id, c.name FROM presence_sessions ps JOIN community c ON c.id = ps.user_id LIMIT 10;`

### ✅ Suggested Connections
- [ ] Verify suggestions load without errors
- [ ] Check display names appear (not UUIDs)
- [ ] Verify Accept promotes to connections
- [ ] Query: `SELECT * FROM interaction_edges WHERE status = 'suggested';`

### ✅ RPC Functions
- [ ] Test `upsert_presence_ping()` directly in SQL editor
- [ ] Test `infer_ble_edges()` generates edges
- [ ] Test `promote_edge_to_connection()` creates connection
- [ ] Verify no "auth.uid not found" errors

## Migration Path

### If Database Already Exists

**Option 1: Drop and Recreate (Development Only)**
```sql
DROP FUNCTION IF EXISTS public.upsert_presence_ping;
DROP FUNCTION IF EXISTS public.infer_ble_edges;
DROP FUNCTION IF EXISTS public.promote_edge_to_connection;

-- Then run updated 003_create_rpc_functions.sql
```

**Option 2: Update in Place (Production)**
```sql
-- Run updated 003_create_rpc_functions.sql
-- CREATE OR REPLACE will update existing functions
```

### If Starting Fresh
- Run all migrations in order (001, 002, 003, 004)
- No special steps needed

## Verification Queries

### Check Energy Values
```sql
SELECT 
    energy,
    COUNT(*) as count
FROM presence_sessions
WHERE context_type = 'beacon'
GROUP BY energy
ORDER BY energy;

-- Should show values like 0.4, 0.6, 0.75, 0.9 (not 4, 6, 7.5, 9)
```

### Check User ID Mapping
```sql
SELECT 
    ps.user_id,
    c.name,
    c.email
FROM presence_sessions ps
JOIN community c ON c.id = ps.user_id
WHERE ps.context_type = 'beacon'
LIMIT 10;

-- Should successfully join (no orphaned user_ids)
```

### Check Interaction Edges
```sql
SELECT 
    ie.id,
    c1.name as from_user,
    c2.name as to_user,
    ie.overlap_seconds / 60 as overlap_minutes,
    ie.confidence
FROM interaction_edges ie
JOIN community c1 ON c1.id = ie.from_user_id
JOIN community c2 ON c2.id = ie.to_user_id
WHERE ie.status = 'suggested'
ORDER BY ie.confidence DESC;

-- Should show user names (not fail to join)
```

### Check Connections
```sql
SELECT 
    c.id,
    u1.name as from_user,
    u2.name as to_user,
    c.type,
    c.created_at
FROM connections c
JOIN community u1 ON u1.id = c.from_user_id
JOIN community u2 ON u2.id = c.to_user_id
WHERE c.type = 'ble_proximity'
ORDER BY c.created_at DESC;

-- Should show promoted connections
```

## Summary

All critical schema alignment issues have been fixed:

1. ✅ Energy scale: [0, 1] (was [0, 10])
2. ✅ User ID mapping: `auth.uid() → community.id` in RPC
3. ✅ Client never inserts directly into `presence_sessions`
4. ✅ Suggested connections resolve `community.id` properly
5. ✅ Batch user profile resolution (performance)
6. ✅ All RPC functions updated with mapping logic

**No database schema changes required** - only RPC functions and client code updated.

**Next Steps**:
1. Drop and recreate RPC functions (or run CREATE OR REPLACE)
2. Rebuild iOS app
3. Test with verification queries above
4. Verify energy values are [0, 1]
5. Verify user names appear in suggestions
