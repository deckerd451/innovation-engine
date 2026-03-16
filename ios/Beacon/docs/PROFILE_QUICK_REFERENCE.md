# Profile System - Quick Reference

## Profile States

```swift
.missing    // No community row exists
.incomplete // Row exists, lacks required fields  
.ready      // Has minimum required data
```

## Readiness Check

```swift
Ready = name.notEmpty AND (bio OR skills OR interests)
```

## Key Services

### ProfileService
```swift
// Resolve profile
let result = try await ProfileService.shared.resolveCurrentProfile()

// Update profile
try await ProfileService.shared.updateProfile(
    profileId: profile.id,
    name: "Doug",
    bio: "Designer",
    skills: ["Swift"],
    interests: ["AI"]
)
```

### AuthService
```swift
// Access profile
AuthService.shared.currentUser  // User with all fields
AuthService.shared.profileState // .ready, .incomplete, .missing

// Refresh after update
await AuthService.shared.refreshProfile()
```

## Routing Logic

```swift
if authenticated {
    switch profileState {
    case .ready:
        MainTabView
    case .incomplete, .missing:
        ProfileCompletionView
    }
} else {
    LoginView
}
```

## User Model Fields

```swift
struct User {
    let id: UUID
    let userId: UUID?
    let name: String
    let email: String?
    let bio: String?
    let skills: [String]?
    let interests: [String]?
    let imageUrl: String?
    let profileCompleted: Bool?
    let connectionCount: Int?
    let createdAt: Date?
    let updatedAt: Date?
    
    // Computed
    var isMissing: Bool
    var isReady: Bool
    var isIncomplete: Bool
    var profileState: ProfileState
}
```

## Resolution Flow

```
1. Fetch by user_id
2. If not found → Create minimal profile
3. Re-fetch
4. Evaluate state
5. Return result
```

## Minimal Profile

```swift
{
    user_id: auth.users.id,
    name: from OAuth,
    email: auth.email,
    image_url: from OAuth (optional),
    profile_completed: false
}
```

## Logging

```
[Profile] 🔍 Starting profile resolution
[Profile] ✅ Profile found: <uuid>
[Profile]    State: ready
[Profile] 📝 Creating minimal profile
[Profile] 💾 Updating profile
```

## Common Patterns

### Check if profile ready
```swift
if AuthService.shared.profileState == .ready {
    // Use profile data
}
```

### Access profile fields
```swift
let user = AuthService.shared.currentUser
let name = user?.name
let bio = user?.bio
let skills = user?.skills ?? []
```

### Trigger profile completion
```swift
// Automatically shown by BeaconApp routing
// when profileState is .incomplete or .missing
```

### Refresh after external update
```swift
await AuthService.shared.refreshProfile()
```

## Database Queries

### Fetch by user_id
```swift
.from("community")
.select()
.eq("user_id", value: userId.uuidString)
.single()
```

### Create profile
```swift
.from("community")
.insert(newProfile)
.execute()
```

### Update profile
```swift
.from("community")
.update(payload)
.eq("id", value: profileId.uuidString)
.execute()
```

## Test Checklist

- [ ] Ready profile → MainTabView
- [ ] Incomplete profile → ProfileCompletionView
- [ ] Missing profile → Auto-create → ProfileCompletionView
- [ ] Complete profile → Save → Refresh → MainTabView
- [ ] Network error → LoginView
- [ ] Rapid saves → Only one request
