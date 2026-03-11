# Attendee Count Zero - Root Cause and Fix

## Problem

After fixing the timing bug in EventAttendeesService, attendee count is still 0 even though:
- ✅ Both devices are authenticated
- ✅ Both devices detect MOONSIDE-S1 beacon
- ✅ Both devices write presence_sessions rows successfully
- ✅ Supabase shows 2 rows with same context_id
- ✅ EventAttendeesService starts refreshing at the correct time
- ✅ Query is constructed correctly

## Root Cause: RLS Policy Too Restrictive

The SELECT policy on `presence_sessions` table only allows users to view their own rows:

```sql
CREATE POLICY "Users can view their own presence sessions"
  ON presence_sessions FOR SELECT
  USING (auth.uid() = user_id);
```

### Why This Breaks Attendee Discovery

**iOS App Query:**
```swift
let sessions: [AttendeePresenceRow] = try await supabase
    .from("presence_sessions")
    .select("user_id, energy, created_at")
    .eq("context_type", value: "beacon")
    .eq("context_id", value: contextId.uuidString)
    .neq("user_id", value: userId.uuidString)  // Exclude current user
    .gte("created_at", value: fiveMinutesAgoISO)
    .execute()
    .value
```

**What Happens:**
1. Device A (Doug Hamilton) queries for attendees
2. RLS policy filters: `WHERE auth.uid() = user_id`
3. Only Doug's own rows are visible
4. Query excludes Doug: `.neq("user_id", value: dougId)`
5. Result: 0 rows (Doug's rows are excluded, Descartes' rows are invisible)
6. Attendee count: 0

**Device A sees:**
```
presence_sessions (filtered by RLS)
├─ Doug's row (visible, but excluded by .neq)
└─ Descartes' row (INVISIBLE due to RLS)
Result: 0 rows
```

**Device B sees:**
```
presence_sessions (filtered by RLS)
├─ Descartes' row (visible, but excluded by .neq)
└─ Doug's row (INVISIBLE due to RLS)
Result: 0 rows
```

## Solution: Allow Reading All Presence Sessions

Replace the restrictive SELECT policy with one that allows viewing all presence sessions:

```sql
DROP POLICY IF EXISTS "Users can view their own presence sessions" ON presence_sessions;

CREATE POLICY "Users can view all presence sessions"
  ON presence_sessions FOR SELECT
  USING (true);
```

### Why This Is Safe

1. **No Sensitive Data**: Presence sessions only contain:
   - `user_id` (UUID reference to community table)
   - `context_id` (beacon/event UUID)
   - `context_type` (string: "beacon", "theme", etc.)
   - `energy` (double: 0.0 to 1.0)
   - Timestamps

2. **Write Protection Remains**: Users can still only INSERT/UPDATE/DELETE their own rows:
   ```sql
   CREATE POLICY "Users can insert their own presence sessions"
     ON presence_sessions FOR INSERT
     WITH CHECK (auth.uid() = user_id);
   
   CREATE POLICY "Users can update their own presence sessions"
     ON presence_sessions FOR UPDATE
     USING (auth.uid() = user_id);
   
   CREATE POLICY "Users can delete their own presence sessions"
     ON presence_sessions FOR DELETE
     USING (auth.uid() = user_id);
   ```

3. **Core Feature Requirement**: Event attendee discovery requires seeing who else is present at the same beacon/event.

4. **Privacy by Design**: 
   - User IDs are UUIDs (not personally identifiable)
   - Actual names/profiles come from separate `community` table
   - Users control their community profile visibility
   - Presence is ephemeral (TTL-based expiration)

## How to Apply the Fix

### Option 1: Run SQL Migration (Recommended)

```bash
# From project root
psql $DATABASE_URL -f supabase/sql/fixes/FIX_PRESENCE_SESSIONS_SELECT_POLICY.sql
```

### Option 2: Supabase Dashboard

1. Go to Supabase Dashboard
2. Navigate to Database → Policies
3. Find `presence_sessions` table
4. Delete policy: "Users can view their own presence sessions"
5. Create new policy:
   - Name: "Users can view all presence sessions"
   - Command: SELECT
   - Target roles: authenticated
   - USING expression: `true`

### Option 3: SQL Editor

Run this in Supabase SQL Editor:

```sql
DROP POLICY IF EXISTS "Users can view their own presence sessions" ON presence_sessions;

CREATE POLICY "Users can view all presence sessions"
  ON presence_sessions FOR SELECT
  USING (true);
```

## Verification

### 1. Check Policy in Supabase

```sql
SELECT 
  policyname,
  cmd,
  qual
FROM pg_policies 
WHERE tablename = 'presence_sessions'
  AND cmd = 'SELECT';
```

**Expected result:**
```
policyname                           | cmd    | qual
-------------------------------------|--------|------
Users can view all presence sessions | SELECT | true
```

### 2. Test Query as User A

```sql
-- Should return rows from ALL users, not just current user
SELECT 
  user_id,
  context_type,
  context_id,
  energy,
  created_at
FROM presence_sessions
WHERE context_id = '8b7c40b1-0c94-497a-8f4e-a815f570cc25'
  AND expires_at > NOW()
ORDER BY created_at DESC;
```

**Expected result:** Rows from both Doug and Descartes

### 3. Check iOS App

After applying the fix:

1. Turn Event Mode ON on both devices
2. Both detect MOONSIDE-S1
3. Wait for green "Presence updated" timestamp
4. Check Network view
5. **Expected:** Attendee count = 1 on each device

### 4. Console Logs

Look for:
```
[Attendees] 📥 Raw query results:
[Attendees]    Total rows returned: 1
[Attendees] 🔍 After deduplication:
[Attendees]    Unique user_ids: 1
[Attendees] 👤 Fetching community profiles for 1 user(s)
[Attendees] ✅ Final attendee count: 1
```

## Timeline of the Full Bug

### Initial State
- RLS policy: Users can only view their own presence sessions
- iOS app: Queries for other users' sessions
- Result: 0 rows returned (RLS blocks them)

### After Timing Fix
- EventAttendeesService: Starts refresh at correct time
- Query: Constructed correctly with proper context_id
- RLS: Still blocks other users' rows
- Result: Still 0 attendees

### After RLS Fix
- RLS policy: Users can view all presence sessions
- Query: Returns other users' rows
- Profile resolution: Fetches names from community table
- Result: Attendee count > 0 ✅

## Related Issues This Fixes

1. **Network View Empty**: Will now show attendees
2. **Suggested Connections**: Will have data to work with
3. **Event Analytics**: Can track actual attendance
4. **Real-time Updates**: Periodic refresh will show new attendees

## Security Considerations

### What's Exposed
- User UUIDs (not personally identifiable)
- Beacon/event context UUIDs
- Energy values (signal strength proxy)
- Timestamps

### What's Protected
- User names (separate community table with own RLS)
- User emails (auth.users table, not exposed)
- User profiles (community table with own RLS)
- Write access (users can only modify their own presence)

### Privacy Controls
- Users control their community profile visibility
- Presence is ephemeral (auto-expires)
- No location data stored
- No device identifiers exposed

## Alternative Approaches Considered

### 1. Service Role Key (Rejected)
- Would bypass RLS entirely
- Requires server-side endpoint
- Adds complexity
- Not necessary for this use case

### 2. Postgres Function (Rejected)
- Could use SECURITY DEFINER function
- Adds indirection
- Harder to debug
- Overkill for simple SELECT

### 3. Separate Attendees Table (Rejected)
- Would duplicate data
- Adds sync complexity
- Presence sessions already have all needed data
- Not worth the overhead

### 4. Allow Reading All Presence (Chosen)
- Simple, direct solution
- No sensitive data exposed
- Enables core feature
- Easy to understand and maintain

## Testing Checklist

After applying the fix:

- [ ] Run SQL migration successfully
- [ ] Verify policy in Supabase dashboard
- [ ] Test query returns multiple users' rows
- [ ] Turn Event Mode ON on Device A
- [ ] Turn Event Mode ON on Device B
- [ ] Both devices detect beacon
- [ ] Both devices write presence
- [ ] Device A shows attendee count = 1
- [ ] Device B shows attendee count = 1
- [ ] Network view shows attendee names
- [ ] Periodic refresh updates count
- [ ] Turn Event Mode OFF → count clears
- [ ] Turn Event Mode ON → count reappears

## Success Criteria

✅ Attendee count > 0 when multiple users are present
✅ Network view shows other attendees
✅ Names resolved from community table
✅ Periodic refresh works (every 15 seconds)
✅ No security issues introduced
✅ Write protection still enforced
