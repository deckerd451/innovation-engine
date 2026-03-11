# Identity System - Quick Reference

## Core Principle

**community.id is the canonical public identity**

Everything in the app uses `community.id`:
- QR codes
- Presence sessions
- Attendee graph
- Find Mode
- Connections
- Profile routing

## Resolution Flow

```
OAuth Sign In
    ↓
CommunityIdentityService.resolveOrCreateProfile()
    ↓
Step A: Linked profile? → Use it ✅
    ↓
Step B: Unlinked email match? → Link it ✅
    ↓
Step C: Multiple matches? → Auto-select (temp) ⚠️
    ↓
Step D: No match? → Create new ✅
```

## QR Format

**Generated:**
```
beacon://profile/11484362-de0b-4774-8482-0f8d9581c8fc
```

**Parsed:**
- New format: `beacon://profile/<uuid>` ✅
- Legacy format: Raw UUID ✅ (backward compatible)

## Key Services

### CommunityIdentityService
- `resolveOrCreateProfile(for: Session)` - Main resolution
- `linkProfile(communityId:to:)` - Link existing profile
- `loadProfile(communityId:)` - Load by community.id

### AuthService
- Uses CommunityIdentityService for all profile resolution
- No longer creates profiles directly

### QRService
- `generateQRCode(for:)` - Creates beacon://profile/<id>
- `parseCommunityId(from:)` - Parses both formats

## User Flows

### Returning User
```
Sign in → Linked profile found → Continue
```

### Existing Community Member (First Sign In)
```
Sign in → Email match found → Link profile → Continue
```

### New User
```
Sign in → No match → Create profile → Continue
```

### QR Scan
```
Scan → Parse ID → Load profile → Show ProfileView → Connect
```

## Database Queries

### Find Linked Profile
```swift
community.user_id == auth.users.id
```

### Find Unlinked by Email
```swift
community.email == auth.email AND user_id IS NULL
```

### Load Profile
```swift
community.id == <scanned-uuid>
```

## Logging Patterns

```
[Identity] 🔍 Resolving profile
[Identity] ✅ Found linked profile
[Identity] 🔗 Linking profile
[Identity] 📝 Creating new profile
[Scan] 📷 QR scanned
[Scan] ✅ Profile loaded
[Auth] ⚠️ Ambiguous profiles
```

## Common Issues

### Duplicate Profiles
- **Cause**: Old code created profile on every sign-in
- **Fix**: New code links existing profiles first
- **Prevention**: Resolution order A → B → C → D

### Wrong Identity in QR
- **Cause**: Using auth.users.id instead of community.id
- **Fix**: QR now uses community.id
- **Verify**: Check QR payload format

### Profile Not Found After Scan
- **Cause**: QR has invalid community.id
- **Fix**: Regenerate QR from MyQRView
- **Verify**: Check community.id exists in database

## Testing Commands

### Check Profile Link
```sql
SELECT id, user_id, name, email 
FROM community 
WHERE user_id = '<auth-user-id>';
```

### Find Unlinked Profiles
```sql
SELECT id, name, email 
FROM community 
WHERE user_id IS NULL;
```

### Verify QR Identity
```sql
SELECT id, name 
FROM community 
WHERE id = '<qr-community-id>';
```
