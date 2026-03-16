# Profile Hydration & Onboarding - Implementation Summary

## What Was Built

Reliable Supabase profile hydration and lightweight onboarding ensuring every signed-in auth user resolves to a usable community profile.

## Files Created

1. **ProfileService.swift** - Deterministic profile resolution and management
2. **ProfileCompletionView.swift** - Lightweight onboarding UI

## Files Modified

1. **User.swift** - Added profile fields and computed readiness state
2. **AuthService.swift** - Integrated ProfileService, added profile state tracking
3. **BeaconApp.swift** - Added profile state routing

## Profile States

```swift
enum ProfileState {
    case missing    // No community row
    case incomplete // Row exists, lacks required fields
    case ready      // Has minimum required data
}
```

## Readiness Logic

**Ready if:**
- Name is non-empty
- AND at least one of: bio, skills, interests has content

**Incomplete if:**
- Row exists but name empty OR all enrichment fields empty

**Missing if:**
- No community row found (before auto-creation)

## Startup Flow

```
Login → Profile Resolution → State Evaluation → Routing

States:
- .ready → MainTabView
- .incomplete/.missing → ProfileCompletionView → Save → Refresh → MainTabView
```

## Profile Resolution

### 1. Fetch by user_id
```swift
community.user_id = auth.users.id  // Canonical link
```

### 2. If Not Found
- Create minimal profile with OAuth data
- Re-fetch created profile

### 3. Evaluate State
- Compute readiness from actual fields
- Return result with state

## Minimal Profile Creation

**Auto-populated fields:**
- `user_id` = auth user id
- `name` = from OAuth metadata
- `email` = auth email
- `image_url` = from OAuth metadata (optional)
- `profile_completed` = false

**Not fabricated:**
- bio, skills, interests left empty

## ProfileCompletionView

**Fields:**
- Name (required)
- Bio (optional)
- Skills (comma-separated)
- Interests (comma-separated)

**Flow:**
1. User edits fields
2. Tap "Complete Profile"
3. Save to Supabase
4. Callback triggers profile refresh
5. Re-evaluation → MainTabView if ready

## Logging

**Prefix:** `[Profile]`

**Key logs:**
```
[Profile] 🔍 Starting profile resolution
[Profile] ✅ Profile found: <uuid>
[Profile]    State: ready
[Profile] 📝 No profile found, creating minimal profile
[Profile] ✅ Minimal profile created
[Profile] 💾 Updating profile: <uuid>
[Profile] ✅ Profile updated
```

## Edge Cases Handled

- Auth session exists but profile query fails
- Insert succeeds but re-fetch fails
- Name missing in auth metadata
- Interests/skills return null or empty array
- Image URL absent
- Duplicate creation attempts
- Slow network

## Test Scenarios

### Ready Profile
- Login → Profile found → State: ready → MainTabView

### Incomplete Profile
- Login → Profile found → State: incomplete → ProfileCompletionView → Complete → MainTabView

### Missing Profile
- Login → No profile → Auto-create → State: incomplete → ProfileCompletionView → Complete → MainTabView

## Database

**No schema changes required**

**Assumptions:**
- `community.user_id` links to `auth.users.id`
- `community.name` is required
- `community.skills` and `interests` are arrays
- `community.profile_completed` is boolean

## Integration

**AuthService:**
- `@Published var profileState: ProfileState`
- `currentUser` has all profile fields
- `refreshProfile()` method

**BeaconApp:**
- Routes based on `authService.profileState`
- Shows ProfileCompletionView for incomplete/missing
- Shows MainTabView for ready

**Rest of App:**
- Access via `AuthService.shared.currentUser`
- All fields available: name, bio, skills, interests, imageUrl
- Event Mode, attendee matching, QR codes use same identity

## Success Criteria

✅ Signed-in user always resolves to deterministic profile state
✅ Missing profiles automatically created
✅ Incomplete profiles routed to completion flow
✅ Ready profiles enter app directly
✅ Rest of app can use hydrated community identity reliably

## No Breaking Changes

- Existing ready profiles work as before
- Existing incomplete profiles prompted to complete
- No database migrations required
- No changes to BLE/event logic
- Fits into existing app architecture
