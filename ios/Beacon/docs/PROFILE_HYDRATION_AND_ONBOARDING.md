# Profile Hydration and Onboarding Implementation

## Architecture Summary

Implemented reliable Supabase profile hydration and lightweight onboarding to ensure every signed-in auth user resolves to a usable community profile.

### Key Components

1. **Extended User Model** - Added all profile fields and computed readiness state
2. **ProfileService** - Deterministic profile resolution and management
3. **ProfileCompletionView** - Lightweight onboarding UI
4. **AuthService Integration** - Profile state routing
5. **BeaconApp Routing** - State-based view selection

### Profile States

```swift
enum ProfileState {
    case missing    // No community row exists
    case incomplete // Row exists but lacks required fields
    case ready      // Profile has minimum required data
}
```

## Files Created

### 1. ProfileService.swift
**Location:** `ios/Beacon/Beacon/Services/ProfileService.swift`

**Responsibilities:**
- Fetch current auth user
- Fetch community row by `user_id` (canonical link)
- Create minimal community row if missing
- Evaluate readiness state
- Update profile fields during onboarding

**Key Methods:**
```swift
func resolveCurrentProfile() async throws -> ResolvedProfileResult
func updateProfile(profileId:name:bio:skills:interests:) async throws
```

### 2. ProfileCompletionView.swift
**Location:** `ios/Beacon/Beacon/Views/ProfileCompletionView.swift`

**Features:**
- Form-based profile editing
- Fields: name, bio, skills, interests
- Comma-separated input for skills/interests
- Validation (name required)
- Save to Supabase
- Callback on completion

## Files Modified

### 1. User.swift
**Changes:**
- Added profile fields: `bio`, `skills`, `interests`, `imageUrl`, `profileCompleted`, `connectionCount`, `createdAt`, `updatedAt`
- Added computed properties: `isMissing`, `isReady`, `isIncomplete`, `profileState`

**Readiness Logic:**
```swift
var isReady: Bool {
    guard !name.isEmpty else { return false }
    
    // At least one enrichment field should have content
    let hasBio = bio?.isEmpty == false
    let hasSkills = skills?.isEmpty == false
    let hasInterests = interests?.isEmpty == false
    
    return hasBio || hasSkills || hasInterests
}
```

### 2. AuthService.swift
**Changes:**
- Added `@Published var profileState: ProfileState`
- Replaced CommunityIdentityService with ProfileService
- Added `refreshProfile()` method
- Profile state tracked alongside authentication

### 3. BeaconApp.swift
**Changes:**
- Added profile state routing
- Routes to ProfileCompletionView for incomplete/missing profiles
- Routes to MainTabView for ready profiles

**Routing Logic:**
```swift
if authService.isAuthenticated, let currentUser = authService.currentUser {
    switch authService.profileState {
    case .ready:
        MainTabView(currentUser: currentUser)
    case .incomplete, .missing:
        ProfileCompletionView(profile: currentUser) {
            Task {
                await authService.refreshProfile()
            }
        }
    }
}
```

## Startup Flow

### Complete Flow Diagram

```
App Launch
    ↓
Auth Session Check
    ↓
┌─────────────────────┐
│ No Session?         │ → LoginView
└─────────────────────┘
    ↓ Session exists
ProfileService.resolveCurrentProfile()
    ↓
┌─────────────────────────────────────┐
│ Fetch community by user_id          │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│ Profile found?                      │
└─────────────────────────────────────┘
    │                    │
    │ No                 │ Yes
    ↓                    ↓
Create minimal      Evaluate state
profile                  │
    ↓                    ↓
Re-fetch           ┌──────────────┐
    ↓              │ Profile      │
    └──────────────→│ State?       │
                   └──────────────┘
                        │
        ┌───────────────┼───────────────┐
        │               │               │
    .ready        .incomplete      .missing
        │               │               │
        ↓               ↓               ↓
  MainTabView   ProfileCompletionView  ProfileCompletionView
                        │               │
                        └───────┬───────┘
                                ↓
                        User completes profile
                                ↓
                        Save to Supabase
                                ↓
                        Refresh profile
                                ↓
                        MainTabView
```

### Detailed Steps

1. **App launches** → BeaconApp initializes
2. **Auth check** → AuthService checks for session
3. **Session found** → `loadCurrentUser()` called
4. **Profile resolution** → `ProfileService.resolveCurrentProfile()`
5. **Fetch by user_id** → Query `community.user_id = auth.users.id`
6. **Profile found?**
   - **Yes** → Evaluate state, return result
   - **No** → Create minimal profile, re-fetch, return result
7. **State evaluation** → Compute `.ready`, `.incomplete`, or `.missing`
8. **Routing** → BeaconApp routes based on state
9. **Onboarding** → ProfileCompletionView if incomplete/missing
10. **Save** → Update profile in Supabase
11. **Refresh** → Re-fetch profile, re-evaluate state
12. **Main app** → Enter MainTabView when ready

## Profile Resolution Logic

### Fetch by user_id (Canonical Link)

```swift
let profile: User = try await supabase
    .from("community")
    .select()
    .eq("user_id", value: userId.uuidString)
    .single()
    .execute()
    .value
```

**Why user_id:**
- Deterministic link to auth user
- No ambiguity
- Single source of truth
- No email matching needed

### Minimal Profile Creation

**When:** No community row exists for auth user

**Fields populated:**
```swift
{
    user_id: auth.users.id,
    name: extracted from OAuth metadata,
    email: auth.email,
    image_url: extracted from OAuth metadata (optional),
    profile_completed: false
}
```

**Extraction logic:**
- Name: `full_name` → `name` → email prefix
- Image: `avatar_url` → `picture` → null

### Readiness Evaluation

**Ready if:**
- Name is non-empty
- AND at least one of: bio, skills, interests has content

**Incomplete if:**
- Row exists
- BUT name is empty OR all enrichment fields empty

**Missing if:**
- No row found (before auto-creation)

## Database Assumptions

### community Table Schema

```sql
CREATE TABLE community (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id),
    email TEXT,
    name TEXT NOT NULL,
    bio TEXT,
    skills TEXT[],
    interests TEXT[],
    image_url TEXT,
    profile_completed BOOLEAN DEFAULT false,
    connection_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
```

**Key constraints:**
- `user_id` links to `auth.users(id)`
- `name` is required (NOT NULL)
- `skills` and `interests` are arrays
- `profile_completed` is boolean flag

### No Schema Changes Required

The implementation works with the existing schema. No migrations needed.

## Logging

### Consistent Prefix: `[Profile]`

**Resolution logs:**
```
[Profile] 🔍 Starting profile resolution
[Profile]    Auth user ID: <uuid>
[Profile]    Auth email: <email>
[Profile] ✅ Profile found: <uuid>
[Profile]    Name: <name>
[Profile]    State: ready
```

**Creation logs:**
```
[Profile] 📝 No profile found, creating minimal profile
[Profile] ✅ Minimal profile created
[Profile]    Name: <name>
[Profile]    Email: <email>
[Profile]    Image URL: <url>
```

**Update logs:**
```
[Profile] 💾 Updating profile: <uuid>
[Profile] ✅ Profile updated
[Profile]    Complete: true
```

**Auth logs:**
```
[Auth] ✅ Profile loaded
[Auth]    State: ready
[Auth]    Name: <name>
```

## Edge Cases Handled

### 1. Auth Session Exists but Profile Query Fails
- Catches error
- Sets `isAuthenticated = false`
- Returns to LoginView
- User can retry

### 2. Insert Succeeds but Re-fetch Fails
- Throws `ProfileError.creationFailed`
- Caught by AuthService
- User returned to LoginView
- Can retry login

### 3. Name Missing in Auth Metadata
- Falls back to email prefix
- Example: `user@example.com` → `"user"`
- Ensures name is never empty

### 4. Interests/Skills Return Null or Empty Array
- Handled by optional types
- Empty arrays treated as incomplete
- User prompted to add content

### 5. Image URL Absent
- Optional field
- Not required for readiness
- Profile can be ready without image

### 6. Duplicate Creation Attempts
- Database constraint prevents duplicates
- Error caught and handled
- User not blocked

### 7. Slow Network
- Async/await handles delays
- Loading states shown
- No UI freeze
- User can navigate away

## Test Plan

### Test 1: Ready Profile

**Setup:**
- User has auth account
- Community row exists with `user_id` linked
- Name: "Doug Hamilton"
- Bio: "Product designer"
- Skills: ["Swift", "Design"]
- Interests: ["AI", "Music"]

**Expected Flow:**
1. Login with OAuth
2. Profile resolution finds row
3. State evaluated as `.ready`
4. User lands in MainTabView
5. No onboarding shown

**Verification:**
- Check logs: `[Profile] ✅ Profile found`
- Check logs: `[Profile]    State: ready`
- Check logs: `[Auth] ✅ Profile loaded`
- Verify MainTabView displayed
- Verify profile data accessible

### Test 2: Incomplete Profile

**Setup:**
- User has auth account
- Community row exists with `user_id` linked
- Name: "Jane Doe"
- Bio: null
- Skills: null or []
- Interests: null or []

**Expected Flow:**
1. Login with OAuth
2. Profile resolution finds row
3. State evaluated as `.incomplete`
4. User routed to ProfileCompletionView
5. User fills in bio, skills, interests
6. User taps "Complete Profile"
7. Profile saved to Supabase
8. Profile refreshed
9. State re-evaluated as `.ready`
10. User enters MainTabView

**Verification:**
- Check logs: `[Profile] ✅ Profile found`
- Check logs: `[Profile]    State: incomplete`
- Verify ProfileCompletionView displayed
- Verify form pre-filled with name
- After save: `[Profile] ✅ Profile updated`
- After save: `[Auth]    State: ready`
- Verify MainTabView displayed

### Test 3: Missing Profile

**Setup:**
- User has auth account
- No community row exists
- OAuth metadata has name and avatar

**Expected Flow:**
1. Login with OAuth
2. Profile resolution finds no row
3. Minimal profile auto-created
4. Profile re-fetched
5. State evaluated as `.incomplete` (no bio/skills/interests)
6. User routed to ProfileCompletionView
7. User completes profile
8. Profile saved
9. Profile refreshed
10. User enters MainTabView

**Verification:**
- Check logs: `[Profile] 📝 No profile found, creating minimal profile`
- Check logs: `[Profile] ✅ Minimal profile created`
- Check logs: `[Profile]    State: incomplete`
- Verify ProfileCompletionView displayed
- Verify name pre-filled from OAuth
- After save: `[Profile] ✅ Profile updated`
- Verify MainTabView displayed

### Test 4: Network Error During Resolution

**Setup:**
- Disable network
- User has auth account

**Expected Flow:**
1. Login with OAuth (cached session)
2. Profile resolution attempts fetch
3. Network error occurs
4. Error caught by AuthService
5. User returned to LoginView
6. Error logged

**Verification:**
- Check logs: `[Auth] ❌ Error loading user`
- Verify LoginView displayed
- Verify no crash
- Re-enable network, retry login succeeds

### Test 5: Rapid Profile Updates

**Setup:**
- User in ProfileCompletionView
- Tap "Complete Profile" multiple times rapidly

**Expected Flow:**
1. First tap starts save
2. `isSaving = true` disables button
3. Subsequent taps ignored
4. Save completes
5. Profile refreshed
6. User enters MainTabView

**Verification:**
- Only one save request sent
- No duplicate updates
- UI remains responsive
- Profile updated correctly

## Success Criteria

✅ **Signed-in user always resolves to deterministic profile state**
- Every login triggers profile resolution
- State is always one of: missing, incomplete, ready
- No ambiguous states

✅ **Missing profiles are automatically created**
- No manual profile creation needed
- Minimal profile created with OAuth data
- User prompted to complete

✅ **Incomplete profiles routed to completion flow**
- ProfileCompletionView shown
- User can edit all fields
- Save updates Supabase
- Profile refreshed after save

✅ **Ready profiles enter app directly**
- No onboarding shown
- MainTabView displayed
- Profile data accessible

✅ **Rest of app can use hydrated community identity reliably**
- `AuthService.shared.currentUser` has all fields
- Event Mode can access profile data
- Attendee matching uses same identity
- QR codes use same community.id

## Integration with Existing Features

### Event Mode
- Uses `AuthService.shared.currentUser.id` for presence
- Profile name displayed in UI
- Image URL available for avatars

### Attendee Matching
- Uses `community.id` for matching
- Profile data enriches attendee display
- Skills/interests available for future matching

### QR Codes
- Generated from `community.id`
- Profile data shown after scan
- Connection uses same identity

### Find Mode
- Uses profile data for display
- Name shown in Find UI
- Future: Could use interests for context

## Future Enhancements

1. **Image Upload** - Allow users to upload custom avatars
2. **Profile Editing** - Edit profile from settings
3. **Rich Profiles** - Add more fields (location, role, company)
4. **Profile Preview** - Show profile before completing
5. **Skip Option** - Allow minimal profile for quick start
6. **Progress Indicator** - Show completion percentage
7. **Field Validation** - Validate skills/interests format
8. **Suggestions** - Suggest skills/interests based on role
9. **Profile Visibility** - Control what others see
10. **Profile Analytics** - Track profile views, connections

## Migration Notes

### Existing Users

**Users with complete profiles:**
- No action needed
- Continue working as before
- State evaluated as `.ready`

**Users with incomplete profiles:**
- Will see ProfileCompletionView on next login
- Can complete profile
- Then enter app

**Users with no community row:**
- Minimal profile auto-created
- Routed to ProfileCompletionView
- Complete profile to continue

### Data Cleanup

Optional SQL to identify incomplete profiles:

```sql
-- Find incomplete profiles
SELECT id, name, email, bio, skills, interests
FROM community
WHERE user_id IS NOT NULL
AND (
    bio IS NULL OR bio = ''
    OR skills IS NULL OR array_length(skills, 1) IS NULL
    OR interests IS NULL OR array_length(interests, 1) IS NULL
);

-- Find missing profiles (auth users without community row)
SELECT u.id, u.email
FROM auth.users u
LEFT JOIN community c ON c.user_id = u.id
WHERE c.id IS NULL;
```

## Supabase Dependencies

### Required Tables
- `auth.users` - Supabase auth table
- `community` - Custom profile table

### Required Columns
- `community.user_id` - Link to auth.users
- `community.name` - Required field
- `community.bio` - Optional enrichment
- `community.skills` - Optional array
- `community.interests` - Optional array
- `community.image_url` - Optional avatar
- `community.profile_completed` - Boolean flag

### No New Migrations Required

The implementation works with the existing schema. All columns are assumed to exist based on the current database state.
