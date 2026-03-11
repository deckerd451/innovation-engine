# Onboarding and QR Routing - Implementation Summary

## What Changed

Implemented robust identity resolution and QR profile routing that uses the existing community table as the canonical identity system.

## Auth User → Community Resolution

### Resolution Order

**Step A - Exact Linked Match:**
- Query: `community.user_id == auth.users.id`
- If found: Use that profile ✅

**Step B - Exact Email Match (Unlinked):**
- Query: `community.email == auth.email AND user_id IS NULL`
- If exactly one: Link it, use that profile ✅
- Prevents duplicate creation

**Step C - Ambiguous Match:**
- Multiple unlinked profiles match email
- Currently: Auto-select first (temporary)
- Future: Show user choice UI

**Step D - No Match:**
- Only then create new community profile
- Extracts name, email, image_url from OAuth metadata

### When New Community Row Created

**Only when:**
- No linked profile exists (Step A fails)
- No unlinked email match exists (Step B fails)
- This is a brand new user

**Never when:**
- Existing linked profile found
- Existing unlinked profile matches email
- This prevents accidental duplicates

## QR Payload Format

### Generated Format
```
beacon://profile/<community-id>
```

### Example
```
beacon://profile/11484362-de0b-4774-8482-0f8d9581c8fc
```

### Key Changes
- **Before**: Raw UUID (opened Safari, not useful)
- **After**: App route format (opens ProfileView in-app)
- **Backward compatible**: Still parses legacy raw UUID format

## QR Scanning → Profile Routing

### Flow
1. User scans QR code
2. Parse community ID from `beacon://profile/<id>`
3. Load profile from database using `community.id`
4. Present ProfileView sheet
5. User sees name, email, avatar
6. User taps "Connect" to create connection
7. User can tap "Find" (future) to locate person

### Before vs After

**Before:**
```
Scan → Parse → Create connection → Alert
```

**After:**
```
Scan → Parse → Load profile → Show ProfileView → User decides
```

## Files Created

1. **CommunityIdentityService.swift** - Centralized profile resolution logic
2. **ProfileView.swift** - Profile display after QR scan

## Files Modified

1. **AuthService.swift** - Uses CommunityIdentityService for resolution
2. **QRService.swift** - Generates `beacon://profile/<id>` format
3. **ScanView.swift** - Routes to ProfileView instead of immediate connection

## Canonical Identity

### Identity Chain
```
auth.users.id (OAuth authentication)
    ↓
community.user_id (link)
    ↓
community.id (PUBLIC PROFILE IDENTITY) ← Used everywhere
    ↓
QR codes, presence, attendees, Find Mode, connections
```

### Key Principle
- **Authentication**: `auth.users.id`
- **Public Identity**: `community.id`
- Everything in the app uses `community.id`

## Temporary Assumptions

### Ambiguous Profiles
- Currently auto-selects first candidate
- Future: Should show user choice UI

### Find Mode Integration
- ProfileView has disabled "Find" button
- Future: Should navigate to FindAttendeeView for that person

### Avatar Display
- Currently shows placeholder with initial
- Future: Should load `community.image_url`

## Debug Logging

Added comprehensive logging:

```
[Identity] 🔍 Resolving profile for auth user
[Identity] ✅ Found linked profile
[Identity] 🔗 Found unlinked profile by email
[Identity] ✅ Linked existing profile
[Identity] 📝 Creating new profile
[Scan] 📷 QR scanned
[Scan] ✅ Profile loaded
```

## Testing Verification

### Identity Resolution
- ✅ Existing linked user → reuses same community.id
- ✅ Existing unlinked user → links profile, no duplicate
- ✅ New user → creates exactly one profile
- ✅ No accidental duplicates

### QR
- ✅ QR encodes `beacon://profile/<community-id>`
- ✅ Scanning opens ProfileView in-app
- ✅ Profile matches community.id used elsewhere
- ✅ Backward compatible with legacy format

### Event Consistency
- ✅ Event Mode uses community.id
- ✅ Attendee graph uses community.id
- ✅ Find Mode uses community.id
- ✅ Connections use community.id

## No Breaking Changes

- No database schema changes
- Works with existing 70+ community rows
- Handles existing unlinked profiles safely
- Backward compatible QR parsing
- OAuth-only auth preserved (no password auth added)
