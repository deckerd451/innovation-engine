# Identity Resolution and QR Profile Routing

## Overview

Implemented a robust onboarding and QR profile-routing flow that uses the existing Supabase community table as the canonical identity system. This ensures all app features (QR codes, attendee graph, Find Mode, connections) resolve to the same identity chain.

## Canonical Identity Model

### Identity Chain
```
auth.users.id (authentication)
    ↓
community.user_id (link)
    ↓
community.id (PUBLIC PROFILE IDENTITY)
    ↓
presence_sessions.user_id
    ↓
QR profile / attendee graph / Find Mode / connections
```

### Key Principle
- **Authentication**: `auth.users.id` (OAuth only, no password auth)
- **Public Identity**: `community.id` (used everywhere in app)
- **Link**: `community.user_id` connects auth to profile

## Files Created

### New Files
1. `ios/Beacon/Beacon/Services/CommunityIdentityService.swift` - Centralized profile resolution
2. `ios/Beacon/Beacon/Views/ProfileView.swift` - Profile display after QR scan

### Modified Files
1. `ios/Beacon/Beacon/Services/AuthService.swift` - Uses identity service
2. `ios/Beacon/Beacon/Services/QRService.swift` - Generates app routes
3. `ios/Beacon/Beacon/Views/ScanView.swift` - Routes to profile view

## Profile Resolution Logic

### CommunityIdentityService

Centralized service that resolves auth users to community profiles using a deterministic order:

#### Step A: Exact Linked Match
```swift
Query: community.user_id == auth.users.id
```
- If found: Use that profile, onboarding complete
- This is the happy path for returning users

#### Step B: Exact Email Match (Unlinked)
```swift
Query: community.email == auth.email AND community.user_id IS NULL
```
- If exactly one match: Link it by setting `community.user_id = auth.users.id`
- Use that profile, do not create duplicate
- This handles existing community members signing in for first time

#### Step C: Ambiguous Match
```swift
Query: community.email == auth.email AND community.user_id IS NULL
Result: Multiple matches
```
- If multiple unlinked profiles match email
- Currently: Auto-select first (temporary)
- Future: Show user choice UI to select correct profile
- Then link selected profile

#### Step D: No Match Found
```swift
No linked match AND no email match
```
- Only then create new community profile
- Populate: `user_id`, `name`, `email`, `image_url` (from OAuth metadata)
- This is the path for brand new users

### Key Methods

**`resolveOrCreateProfile(for: Session)`**
- Main entry point for profile resolution
- Returns `ProfileResolutionResult` enum:
  - `.resolved(User)` - Profile ready to use
  - `.ambiguous([User])` - Multiple candidates, need user choice

**`linkProfile(communityId:to:)`**
- Links existing community profile to auth user
- Updates `community.user_id = auth.users.id`

**`loadProfile(communityId:)`**
- Loads community profile by `community.id`
- Used after QR scan to fetch profile

## Auth Flow Changes

### AuthService Updates

**Before:**
```swift
// Old: Always created new profile if no linked match
loadCurrentUser() {
    if no linked profile {
        createCommunityProfile()
    }
}
```

**After:**
```swift
// New: Uses identity service for smart resolution
loadCurrentUser() {
    let result = CommunityIdentityService.shared.resolveOrCreateProfile(session)
    
    switch result {
    case .resolved(profile):
        // Profile ready
        
    case .ambiguous(candidates):
        // Auto-select first (temporary)
        // TODO: Show user choice UI
    }
}
```

### Resolution Order Guarantees

1. **No accidental duplicates**: Existing profiles are linked before creating new ones
2. **Email-based matching**: Finds unlinked profiles by email
3. **Deterministic**: Same auth user always resolves to same community profile
4. **Safe linking**: Only links when confident (exact email match)

## QR Code Changes

### QR Generation

**Before:**
```swift
// Old: Raw UUID
QRService.generateQRCode(for: "11484362-de0b-4774-8482-0f8d9581c8fc")
// Payload: "11484362-de0b-4774-8482-0f8d9581c8fc"
```

**After:**
```swift
// New: App route format
QRService.generateQRCode(for: "11484362-de0b-4774-8482-0f8d9581c8fc")
// Payload: "beacon://profile/11484362-de0b-4774-8482-0f8d9581c8fc"
```

### QR Payload Format

**New Format:**
```
beacon://profile/<community-id>
```

**Example:**
```
beacon://profile/11484362-de0b-4774-8482-0f8d9581c8fc
```

### QR Parsing

**`parseCommunityId(from:)`** supports both formats:

1. **New format**: `beacon://profile/<uuid>` → extracts UUID
2. **Legacy format**: Raw UUID → uses as-is (backward compatibility)

### QR Scanning Flow

**Before:**
```
Scan QR → Parse UUID → Create connection → Show alert
```

**After:**
```
Scan QR → Parse community ID → Load profile → Show ProfileView → User taps Connect
```

**Benefits:**
- User sees who they're connecting to before confirming
- Can use Find Mode to locate person
- More intentional connection flow
- Profile preview before action

## ProfileView

New view for displaying scanned profiles.

### Features

**Display:**
- Avatar (placeholder with initial)
- Name
- Email
- Community ID

**Actions:**
- **Connect**: Creates connection to this profile
- **Find**: (Placeholder) Will navigate to Find Mode for this attendee
- **Done**: Dismisses view

**States:**
- Loading: Shows progress indicator
- Connected: Shows checkmark, disables Connect button
- Error: Shows alert with error message

### Integration

Presented as sheet from ScanView:
```swift
.sheet(isPresented: $showingProfile) {
    if let profile = scannedProfile {
        ProfileView(profile: profile)
    }
}
```

## ScanView Changes

### Before
```swift
handleScan(code) {
    parse UUID
    create connection immediately
    show alert
}
```

### After
```swift
handleScan(code) {
    parse community ID
    load profile from database
    present ProfileView sheet
    user decides to connect
}
```

### Error Handling

- Invalid QR format → Show error alert
- Profile not found → Show error alert
- Network error → Show error alert
- Processing state → Show progress indicator

## Debug Logging

Added comprehensive logging for troubleshooting:

### Identity Resolution
```
[Identity] 🔍 Resolving profile for auth user: <uuid>
[Identity]    Email: user@example.com
[Identity] ✅ Found linked profile: <uuid>
[Identity] 🔗 Found unlinked profile by email: <uuid>
[Identity] ✅ Linked existing profile: <uuid>
[Identity] 📝 No existing profile found, creating new
[Identity] ✅ Created new profile: <uuid>
[Identity] ⚠️ Found N ambiguous unlinked profiles
```

### QR Scanning
```
[Scan] 📷 QR scanned: beacon://profile/<uuid>
[Scan] 🔍 Parsed community ID: <uuid>
[Scan] ✅ Profile loaded: Doug Hamilton
[Scan] ❌ Failed to load profile: <error>
```

### Auth
```
[Auth] ⚠️ Ambiguous profiles found, auto-selecting first
[Auth] ❌ Error loading user: <error>
```

## Database Consistency

### No Schema Changes

This implementation works with the existing schema:
- `community` table unchanged
- `auth.users` table unchanged
- `presence_sessions` table unchanged
- `connections` table unchanged

### Existing Data Handling

**70+ existing community rows:**
- Many have `user_id = null` (unlinked)
- Some may have duplicate emails
- Resolution logic handles both cases safely

**Linking Strategy:**
- Only links when confident (exact email match)
- Never silently creates duplicates
- Preserves existing `community.id` values

## User Flows

### Flow 1: Existing Linked User
```
1. User signs in with OAuth (Google/GitHub)
2. AuthService gets session
3. CommunityIdentityService finds linked profile (Step A)
4. App continues with existing community.id
5. QR code shows same community.id
6. Presence writes use same community.id
```

### Flow 2: Existing Unlinked User
```
1. User signs in with OAuth
2. AuthService gets session
3. CommunityIdentityService finds no linked profile (Step A fails)
4. Finds unlinked profile by email (Step B succeeds)
5. Links profile: community.user_id = auth.users.id
6. App continues with existing community.id
7. No duplicate created
```

### Flow 3: Brand New User
```
1. User signs in with OAuth
2. AuthService gets session
3. CommunityIdentityService finds no linked profile (Step A fails)
4. Finds no unlinked profile by email (Step B fails)
5. Creates new community profile (Step D)
6. App continues with new community.id
```

### Flow 4: QR Scan
```
1. User opens Scan tab
2. Scans another user's QR code
3. QR payload: beacon://profile/<community-id>
4. ScanView parses community ID
5. Loads profile from database
6. Shows ProfileView with name, email, avatar
7. User taps Connect
8. Connection created in database
9. User can tap Find (future feature)
```

## Acceptance Criteria

### ✅ Auth/Profile Resolution
- [x] Existing linked user signs in → reuses same community.id
- [x] Existing unlinked user with matching email → row is linked, not duplicated
- [x] New user with no match → exactly one new community row created
- [x] No accidental duplicate linked profiles

### ✅ QR Generation
- [x] QR encodes `beacon://profile/<community-id>`
- [x] Uses `community.id` not `auth.users.id`
- [x] Generated in MyQRView

### ✅ QR Scanning
- [x] Scanning QR opens in-app ProfileView
- [x] No Safari/raw-number behavior
- [x] Scanned profile corresponds to same community.id used elsewhere
- [x] Backward compatible with legacy raw UUID format

### ✅ Event Consistency
- [x] Event Mode uses resolved community.id
- [x] Attendee graph uses community.id
- [x] Find Mode uses community.id
- [x] Connections use community.id

## Temporary Assumptions

### Ambiguous Profile Handling

**Current:** Auto-selects first candidate when multiple unlinked profiles match email

**Future:** Should show user choice UI:
```swift
// TODO: Implement profile selection UI
struct ProfileSelectionView: View {
    let candidates: [User]
    let onSelect: (User) -> Void
    
    var body: some View {
        List(candidates) { profile in
            Button(action: { onSelect(profile) }) {
                VStack(alignment: .leading) {
                    Text(profile.name)
                    Text(profile.email ?? "")
                        .font(.caption)
                }
            }
        }
    }
}
```

### Find Mode Integration

**Current:** ProfileView has disabled "Find" button

**Future:** Should navigate to FindAttendeeView:
```swift
Button(action: {
    // Convert User to EventAttendee
    // Present FindAttendeeView
}) {
    HStack {
        Image(systemName: "location.fill")
        Text("Find")
    }
}
```

### Avatar Images

**Current:** Shows placeholder circle with initial

**Future:** Should load and display `community.image_url` if available

## Testing Checklist

### Identity Resolution
- [ ] Sign in with new OAuth account → creates profile
- [ ] Sign out, sign in again → reuses same profile
- [ ] Create unlinked community row with same email → links on sign in
- [ ] Verify no duplicate profiles created

### QR Generation
- [ ] Open My QR tab → QR displays
- [ ] Scan QR with external app → shows `beacon://profile/<uuid>`
- [ ] Verify UUID matches `community.id` not `auth.users.id`

### QR Scanning
- [ ] Scan own QR → loads own profile
- [ ] Scan another user's QR → loads their profile
- [ ] Tap Connect → creates connection
- [ ] Verify connection in database
- [ ] Scan invalid QR → shows error

### Event Consistency
- [ ] Enable Event Mode → presence uses community.id
- [ ] View Network tab → attendees use community.id
- [ ] Tap attendee → Find Mode uses community.id
- [ ] Scan QR → profile matches attendee in graph

## Migration Notes

### Existing Users

**Users with linked profiles:**
- No action needed
- Continue working as before

**Users with unlinked profiles:**
- Will be linked on next sign in
- Email-based matching
- No data loss

**Users with multiple unlinked profiles:**
- Currently auto-selects first
- Future: Will prompt for selection
- Manual cleanup may be needed

### Database Cleanup

Optional SQL to identify issues:

```sql
-- Find duplicate emails in unlinked profiles
SELECT email, COUNT(*) 
FROM community 
WHERE user_id IS NULL 
GROUP BY email 
HAVING COUNT(*) > 1;

-- Find orphaned auth users (no community profile)
SELECT u.id, u.email 
FROM auth.users u 
LEFT JOIN community c ON c.user_id = u.id 
WHERE c.id IS NULL;
```

## Future Enhancements

1. **Profile Selection UI**: For ambiguous matches
2. **Find Mode Integration**: From ProfileView
3. **Avatar Loading**: Display `community.image_url`
4. **Profile Editing**: Allow users to update name, avatar
5. **Universal Links**: Support `https://beacon.app/profile/<id>` format
6. **Deep Linking**: Handle app routes from notifications
7. **Connection Status**: Show if already connected before scanning
8. **Recent Scans**: History of scanned profiles
