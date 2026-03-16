# Profile Fetch/Decode Fix

## Problem

User with auth ID `4ef90cc6-0c9d-4e43-bf9b-c11b14f6ccfc` had an existing community row in Supabase, but the app still reported:
- "No profile found, creating minimal profile"
- Duplicate key conflict on insert
- "Profile still not found after creation attempt"

This occurred with both Google and GitHub OAuth, proving it was NOT provider-specific.

## Root Cause

The database has a **schema mismatch** with the Swift model:
- Database stores `skills` and `interests` as **TEXT** (comma-separated strings)
- Swift model expects `[String]?` (array of strings)

When Supabase tries to decode the profile, it fails with:
```
typeMismatch(Swift.Array<Any>, Swift.DecodingError.Context(
  codingPath: [CodingKeys(stringValue: "skills", intValue: nil)], 
  debugDescription: "Expected to decode Array<Any> but found a string instead."
))
```

This decode failure was being caught and treated as "no profile found", triggering the profile creation path, which then failed with duplicate key errors.

## Solution

Implemented flexible JSON decoding that handles both string and array types:

1. **Created FlexibleStringArray decoder**
   - Tries to decode as `[String]` first (proper array)
   - Falls back to decoding as `String` and splits on commas
   - Handles empty strings gracefully
   - Never fails - defaults to empty array

2. **Used FlexibleProfile intermediate struct**
   - All fields use flexible types where needed
   - Decodes whatever the database returns
   - Converts to proper Swift types after successful decode

3. **Single-phase fetch with robust error handling**
   - Fetch all fields in one query
   - Distinguish "no rows" (PGRST116) from real errors
   - Convert flexible types to User model after decode succeeds

4. **Clear error distinction maintained**
   - "No rows" → returns nil → triggers profile creation
   - Decode succeeds with flexible types → returns User
   - Network/auth errors → thrown as real errors

## Changes Made

### ProfileService.swift

- Created `FlexibleStringArray` helper struct with custom `init(from:)` decoder
  - Tries array decode first
  - Falls back to string split on comma
  - Handles empty strings
  - Never fails
- Created `FlexibleProfile` struct using flexible types for skills/interests
- Single fetch query with all fields
- Converts flexible types to User model after successful decode
- Enhanced logging shows skill/interest counts

## Why Provider Type Was Not The Issue

Both Google and GitHub OAuth returned the same auth user ID (`4ef90cc6-0c9d-4e43-bf9b-c11b14f6ccfc`), proving:
- Authentication worked correctly for both providers
- The community row was linked to the correct user_id
- RLS policies were not blocking SELECT
- The bug was purely in the app's fetch/decode logic

## How True Missing Profile Is Distinguished

1. **Zero rows returned** (PGRST116 error)
   - Query returns no results
   - Error string contains "PGRST116" or "0 rows"
   - `fetchProfileByUserId()` returns nil
   - Triggers profile creation path

2. **Row exists with schema mismatch** (NOW HANDLED)
   - FlexibleStringArray handles string vs array mismatch
   - Decode succeeds with flexible types
   - User model constructed with converted values
   - Returns profile successfully

3. **Network/auth errors**
   - Real errors are still thrown
   - Do not trigger profile creation
   - Bubble up to caller for proper error handling

## Testing

To verify the fix works:
1. Sign in with the failing user (auth ID `4ef90cc6-0c9d-4e43-bf9b-c11b14f6ccfc`)
2. Check logs for "✅ Minimal profile found"
3. Verify no "No profile found, creating minimal profile" message
4. Verify no duplicate key errors
5. Confirm profile state is correctly determined (missing/incomplete/ready)

## Expected Log Output

```
[Profile] 🔍 Starting profile resolution
[Profile]    Auth user ID: 4EF90CC6-0C9D-4E43-BF9B-C11B14F6CCFC
[Profile]    Auth email: dmhamilton1@live.com
[Profile] 🔍 Fetching profile with flexible decoding
[Profile]    Querying user_id: 4EF90CC6-0C9D-4E43-BF9B-C11B14F6CCFC
[Profile] ✅ Profile found and decoded
[Profile]    Profile ID: <profile-uuid>
[Profile]    Name: User Name
[Profile]    Email: dmhamilton1@live.com
[Profile]    Profile completed: false
[Profile]    Skills: 3 items
[Profile]    Interests: 2 items
[Profile] ✅ User model constructed
[Profile]    State: incomplete
[Profile] ✅ Profile found: <profile-uuid>
[Profile]    Name: User Name
[Profile]    State: incomplete
[Auth] ✅ Profile loaded
[Auth]    State: incomplete
[Auth]    Name: User Name
```

## Benefits

1. **Handles database schema mismatches** - String vs array types decoded flexibly
2. **Resilient to data format variations** - Comma-separated strings converted to arrays
3. **Clear error distinction** - No rows vs real errors
4. **No false profile creation** - Existing profiles always found regardless of format
5. **Better debugging** - Explicit logging shows decoded field counts
6. **Future-proof** - Can handle database migrations from string to array types
