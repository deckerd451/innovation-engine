# Concurrent Profile Creation Fix

## Problem Diagnosis

Profile resolution was failing when multiple concurrent attempts tried to create a profile for the same user. Logs showed:

```
[Profile] 🔍 Starting profile resolution
[Profile] 📝 No profile found, creating minimal profile
[Profile] 🔍 Starting profile resolution
[Profile] 📝 No profile found, creating minimal profile
[Profile] ✅ Minimal profile created
[Profile] ❌ Error: PostgrestError code 23505
  duplicate key value violates unique constraint "community_user_id_key"
```

### Root Causes

1. **No concurrency protection**: Multiple calls to `resolveCurrentProfile()` could run simultaneously
2. **Duplicate key treated as fatal**: When concurrent inserts raced, the second one failed with constraint violation
3. **No retry logic**: After duplicate key error, the task failed instead of re-fetching the profile
4. **Race condition**: OAuth callback and auth state change could both trigger profile resolution simultaneously

## Solution Implemented

### 1. In-Flight Task Reuse

Added task tracking to prevent concurrent resolution attempts:

```swift
private var resolutionTask: Task<ResolvedProfileResult, Error>?

func resolveCurrentProfile() async throws -> ResolvedProfileResult {
    // If resolution is already in flight, wait for it
    if let existingTask = resolutionTask {
        print("[Profile] ⏳ Profile resolution already in flight, waiting...")
        do {
            let result = try await existingTask.value
            print("[Profile] ✅ Reused in-flight resolution result")
            return result
        } catch {
            print("[Profile] ⚠️ In-flight resolution failed, starting new attempt")
            // Fall through to start new resolution
        }
    }
    
    // Create new resolution task
    let task = Task<ResolvedProfileResult, Error> {
        try await self.performProfileResolution()
    }
    
    resolutionTask = task
    
    do {
        let result = try await task.value
        resolutionTask = nil
        return result
    } catch {
        resolutionTask = nil
        throw error
    }
}
```

Now:
- First call creates a task and stores it
- Concurrent calls reuse the existing task
- Task is cleared after completion (success or failure)
- Failed tasks allow retry with new task

### 2. Duplicate Key Error Handling

Added graceful handling of duplicate key constraint violations:

```swift
var wasDuplicateKey = false

do {
    try await createMinimalProfile(for: authUser)
    print("[Profile] ✅ Profile insert succeeded")
} catch {
    // Check if this is a duplicate key error
    if isDuplicateKeyError(error) {
        print("[Profile] ⚠️ Duplicate key error detected (concurrent creation)")
        print("[Profile]    Another task created the profile, re-fetching...")
        wasDuplicateKey = true
    } else {
        print("[Profile] ❌ Profile creation failed with unexpected error")
        throw error
    }
}

// Re-fetch the profile (either we created it, or another task did)
guard let createdProfile = try await fetchProfileByUserId(authUser.id) else {
    print("[Profile] ❌ Profile still not found after creation attempt")
    throw ProfileError.creationFailed
}
```

Now:
- Duplicate key errors are caught and handled
- Instead of failing, we re-fetch the profile
- Works whether this task or another task created the profile
- Only real errors are propagated

### 3. Duplicate Key Error Detection

Added helper to identify PostgreSQL unique constraint violations:

```swift
private func isDuplicateKeyError(_ error: Error) -> Bool {
    let errorString = String(describing: error)
    
    // PostgreSQL error code 23505 is unique constraint violation
    if errorString.contains("23505") {
        return true
    }
    
    // Also check for the specific constraint name
    if errorString.contains("community_user_id_key") {
        return true
    }
    
    // Check error description
    if errorString.contains("duplicate key value violates unique constraint") {
        return true
    }
    
    return false
}
```

Checks for:
- PostgreSQL error code `23505` (unique_violation)
- Specific constraint name `community_user_id_key`
- Error message text

### 4. Idempotent Resolution

The resolution flow is now fully idempotent:

```
1. Check if profile exists → Return it
2. Profile doesn't exist → Try to create it
3. Creation succeeds → Re-fetch and return
4. Creation fails with duplicate key → Re-fetch and return
5. Creation fails with other error → Propagate error
```

Result: Always returns a valid profile, regardless of concurrent attempts.

## How Duplicate Profile Creation Is Now Safe

### Scenario: Concurrent Resolution Attempts

```
Time  Task A                          Task B
----  -----                           -----
T0    resolveCurrentProfile()         
T1    Check in-flight task: none      
T2    Create new task                 
T3    Fetch profile: not found        resolveCurrentProfile()
T4    Create minimal profile          Check in-flight task: Task A exists
T5    Insert succeeds                 Wait for Task A...
T6    Re-fetch profile                
T7    Return profile                  Receive Task A result
T8                                    Return same profile
```

Task B reuses Task A's work - no duplicate insert attempted.

### Scenario: Race Before Task Tracking

```
Time  Task A                          Task B
----  -----                           -----
T0    resolveCurrentProfile()         resolveCurrentProfile()
T1    Check in-flight: none           Check in-flight: none
T2    Create task A                   Create task B
T3    Fetch profile: not found        Fetch profile: not found
T4    Create minimal profile          Create minimal profile
T5    Insert succeeds                 Insert fails (duplicate key)
T6    Re-fetch profile                Catch duplicate key error
T7    Return profile                  Re-fetch profile
T8                                    Return same profile
```

Both tasks succeed - Task B recovers from duplicate key error.

### Scenario: Profile Already Exists

```
Time  Task A                          Task B
----  -----                           -----
T0    resolveCurrentProfile()         
T1    Check in-flight: none           
T2    Create task                     
T3    Fetch profile: found            resolveCurrentProfile()
T4    Return profile                  Check in-flight: Task A exists
T5                                    Wait for Task A...
T6                                    Receive Task A result
T7                                    Return same profile
```

No creation attempted - profile returned immediately.

## Expected Log Output

### First Call (Profile Created)

```
[Profile] 🔍 Starting profile resolution
[Profile]    Auth user ID: abc-123-def-456
[Profile]    Auth email: user@example.com
[Profile] 📝 No profile found, creating minimal profile
[Profile] ✅ Profile insert succeeded
[Profile] ✅ Profile resolved: profile-789-ghi-012
[Profile]    State: incomplete
[Profile]    Source: this task
```

### Concurrent Call (Reuses In-Flight Task)

```
[Profile] ⏳ Profile resolution already in flight, waiting...
[Profile] ✅ Reused in-flight resolution result
```

### Concurrent Call (Duplicate Key Handled)

```
[Profile] 🔍 Starting profile resolution
[Profile]    Auth user ID: abc-123-def-456
[Profile]    Auth email: user@example.com
[Profile] 📝 No profile found, creating minimal profile
[Profile] ⚠️ Duplicate key error detected (concurrent creation)
[Profile]    Another task created the profile, re-fetching...
[Profile] ✅ Profile resolved: profile-789-ghi-012
[Profile]    State: incomplete
[Profile]    Source: concurrent creation
```

### Subsequent Call (Profile Exists)

```
[Profile] 🔍 Starting profile resolution
[Profile]    Auth user ID: abc-123-def-456
[Profile]    Auth email: user@example.com
[Profile] ✅ Profile found: profile-789-ghi-012
[Profile]    Name: John Doe
[Profile]    State: ready
```

## Files Modified

### ios/Beacon/Beacon/Services/ProfileService.swift

1. **Added in-flight task tracking**:
   - `private var resolutionTask: Task<ResolvedProfileResult, Error>?`
   - Stores currently running resolution task

2. **Modified resolveCurrentProfile()**:
   - Check for in-flight task and reuse if exists
   - Create new task if none in flight
   - Clear task after completion

3. **Created performProfileResolution()**:
   - Extracted actual resolution logic
   - Handles profile fetch, creation, and re-fetch
   - Catches and handles duplicate key errors

4. **Added duplicate key error handling**:
   - Try to create profile
   - If duplicate key error, log and continue
   - If other error, propagate
   - Always re-fetch profile after creation attempt

5. **Added isDuplicateKeyError() helper**:
   - Checks for PostgreSQL error code 23505
   - Checks for constraint name `community_user_id_key`
   - Checks for error message text

6. **Enhanced logging**:
   - Log when reusing in-flight task
   - Log when duplicate key detected
   - Log profile source (this task vs concurrent creation)

## Testing Recommendations

1. Test single profile resolution (normal case)
2. Test concurrent resolution from multiple sources
3. Test OAuth callback + auth state change race
4. Verify no duplicate profiles created
5. Check logs show "in flight" or "duplicate key" messages
6. Test profile resolution after failed attempt
7. Verify profile state is correct after resolution

## Backward Compatibility

All changes are backward compatible:
- Public API unchanged
- Same return type and behavior
- Only adds concurrency protection
- Gracefully handles edge cases
- No breaking changes

## Performance Impact

Positive impacts:
- Prevents duplicate database inserts
- Reuses in-flight work instead of duplicating
- Reduces database load during concurrent auth events
- Faster resolution when task is already running

Minimal overhead:
- Task tracking is lightweight
- Error string checking is fast
- Only adds logic for edge cases

## Future Improvements

1. **Database-level upsert**: Use `INSERT ... ON CONFLICT DO NOTHING`
2. **Optimistic locking**: Use version numbers for updates
3. **Distributed locking**: Use Redis or similar for multi-instance apps
4. **Profile cache**: Cache resolved profiles to avoid repeated queries
5. **Retry with backoff**: Add exponential backoff for transient errors
