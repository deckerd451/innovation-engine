import Foundation
import Supabase

/// Dedicated service for profile hydration and management
@MainActor
final class ProfileService {
    
    static let shared = ProfileService()
    
    private let supabase = AppEnvironment.shared.supabaseClient
    
    // Track in-flight profile resolution to prevent concurrent attempts
    private var resolutionTask: Task<ResolvedProfileResult, Error>?
    
    private init() {}
    
    // MARK: - Profile Resolution
    
    /// Resolves the current auth user to a usable community profile.
    /// Handles missing profiles, incomplete profiles, and ready profiles.
    /// Prevents concurrent resolution attempts by reusing in-flight tasks.
    func resolveCurrentProfile() async throws -> ResolvedProfileResult {
        // If resolution is already in flight, wait for it
        if let existingTask = resolutionTask {
            #if DEBUG
            print("[Profile] ⏳ Profile resolution already in flight, waiting...")
            #endif
            do {
                let result = try await existingTask.value
                #if DEBUG
                print("[Profile] ✅ Reused in-flight resolution result")
                #endif
                return result
            } catch {
                print("[Profile] ⚠️ In-flight resolution failed, starting new attempt")
                // Fall through to start new resolution
            }
        }
        
        #if DEBUG
        print("[Profile] 🔍 Starting profile resolution")
        #endif
        
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
    
    /// Performs the actual profile resolution logic
    private func performProfileResolution() async throws -> ResolvedProfileResult {
        // Get current auth session
        let session = try await supabase.auth.session
        let authUser = session.user
        
        #if DEBUG
        print("[Profile]    Auth user ID: \(authUser.id)")
        print("[Profile]    Auth email: \(authUser.email ?? "none")")
        #endif
        
        // Try to fetch community profile by user_id
        let profile = try await fetchProfileByUserId(authUser.id)
        
        if let profile = profile {
            #if DEBUG
            print("[Profile] ✅ Profile found: \(profile.id)")
            print("[Profile]    Name: \(profile.name)")
            print("[Profile]    State: \(profile.profileState.rawValue)")
            #endif
            
            return ResolvedProfileResult(
                authUser: authUser,
                profile: profile,
                state: profile.profileState
            )
        }
        
        // No profile found - create minimal one
        #if DEBUG
        print("[Profile] 📝 No profile found, creating minimal profile")
        #endif
        
        var wasDuplicateKey = false
        
        do {
            try await createMinimalProfile(for: authUser)
            #if DEBUG
            print("[Profile] ✅ Profile insert succeeded")
            #endif
        } catch {
            // Check if this is a duplicate key error
            if isDuplicateKeyError(error) {
                #if DEBUG
                print("[Profile] ⚠️ Duplicate key error detected (concurrent creation)")
                print("[Profile]    Another task created the profile, re-fetching...")
                #endif
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
        
        #if DEBUG
        print("[Profile] ✅ Profile resolved: \(createdProfile.id)")
        print("[Profile]    State: \(createdProfile.profileState.rawValue)")
        print("[Profile]    Source: \(wasDuplicateKey ? "concurrent creation" : "this task")")
        #endif
        
        return ResolvedProfileResult(
            authUser: authUser,
            profile: createdProfile,
            state: createdProfile.profileState
        )
    }
    
    // MARK: - Profile Fetching
    
    /// Fetches community profile by user_id (canonical link)
    /// Handles database schema mismatches by using flexible JSON decoding
    private func fetchProfileByUserId(_ userId: UUID) async throws -> User? {
        #if DEBUG
        print("[Profile] 🔍 Fetching profile with flexible decoding")
        print("[Profile]    Querying user_id: \(userId)")
        #endif
        
        // Use a flexible struct that can handle both string and array types
        struct FlexibleProfile: Codable {
            let id: UUID
            let user_id: UUID
            let name: String
            let email: String?
            let profile_completed: Bool?
            let bio: String?
            let skills: FlexibleStringArray?
            let interests: FlexibleStringArray?
            let image_url: String?
            let image_path: String?
            let connection_count: Int?
            let created_at: Date?
            let updated_at: Date?
        }
        
        let flexible: FlexibleProfile
        
        do {
            flexible = try await supabase
                .from("community")
                .select("id, user_id, name, email, profile_completed, bio, skills, interests, image_url, image_path, connection_count, created_at, updated_at")
                .eq("user_id", value: userId.uuidString)
                .single()
                .execute()
                .value
            
            #if DEBUG
            print("[Profile] ✅ Profile found and decoded")
            print("[Profile]    Profile ID: \(flexible.id)")
            print("[Profile]    Name: \(flexible.name)")
            print("[Profile]    Email: \(flexible.email ?? "none")")
            print("[Profile]    Profile completed: \(flexible.profile_completed ?? false)")
            print("[Profile]    Skills: \(flexible.skills?.values.count ?? 0) items")
            print("[Profile]    Interests: \(flexible.interests?.values.count ?? 0) items")
            #endif
            
        } catch {
            let errorString = String(describing: error)
            
            // Check if this is a "no rows" error
            if errorString.contains("PGRST116") || errorString.contains("JSON object requested, multiple") || errorString.contains("0 rows") {
                #if DEBUG
                print("[Profile] ℹ️ No profile found (zero rows returned)")
                #endif
                return nil
            }
            
            // This is a real error (network, auth, decode failure, etc.)
            print("[Profile] ❌ Profile fetch failed: \(error)")
            throw error
        }
        
        // Convert flexible profile to User model
        let user = User(
            id: flexible.id,
            userId: flexible.user_id,
            name: flexible.name,
            email: flexible.email,
            bio: flexible.bio,
            skills: flexible.skills?.values,
            interests: flexible.interests?.values,
            imageUrl: flexible.image_url,
            imagePath: flexible.image_path,
            profileCompleted: flexible.profile_completed,
            connectionCount: flexible.connection_count,
            createdAt: flexible.created_at,
            updatedAt: flexible.updated_at
        )
        
        #if DEBUG
        print("[Profile] ✅ User model constructed")
        print("[Profile]    State: \(user.profileState.rawValue)")
        #endif
        
        return user
    }
    
    // MARK: - Profile Creation
    
    /// Creates a minimal community profile for an auth user
    private func createMinimalProfile(for authUser: Supabase.User) async throws {
        let email = authUser.email ?? "user@example.com"
        let metadata = authUser.userMetadata
        
        // Extract name from OAuth metadata
        let name: String
        if let fullName = metadata["full_name"]?.stringValue {
            name = fullName
        } else if let userName = metadata["name"]?.stringValue {
            name = userName
        } else {
            name = email.components(separatedBy: "@").first ?? "User"
        }
        
        // Extract avatar URL if available
        let imageUrl: String?
        if let avatarUrl = metadata["avatar_url"]?.stringValue {
            imageUrl = avatarUrl
        } else if let picture = metadata["picture"]?.stringValue {
            imageUrl = picture
        } else {
            imageUrl = nil
        }
        
        struct NewProfile: Encodable {
            let user_id: String
            let name: String
            let email: String
            let image_url: String?
            let profile_completed: Bool
        }
        
        let newProfile = NewProfile(
            user_id: authUser.id.uuidString,
            name: name,
            email: email,
            image_url: imageUrl,
            profile_completed: false
        )
        
        try await supabase
            .from("community")
            .insert(newProfile)
            .execute()
        
        #if DEBUG
        print("[Profile] ✅ Minimal profile created")
        print("[Profile]    Name: \(name)")
        print("[Profile]    Email: \(email)")
        print("[Profile]    Image URL: \(imageUrl ?? "none")")
        #endif
    }
    
    // MARK: - Error Handling
    
    /// Checks if an error is a PostgreSQL duplicate key constraint violation
    private func isDuplicateKeyError(_ error: Error) -> Bool {
        // Check for PostgrestError with code 23505 (unique_violation)
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
    
    // MARK: - Profile Updates
    
    /// Updates profile fields during onboarding
    func updateProfile(
        profileId: UUID,
        name: String?,
        bio: String?,
        skills: [String]?,
        interests: [String]?
    ) async throws {
        #if DEBUG
        print("[Profile] 💾 Updating profile: \(profileId)")
        #endif
        
        struct UpdatePayload: Encodable {
            let name: String?
            let bio: String?
            let skills: [String]?
            let interests: [String]?
            let profile_completed: Bool
        }
        
        // Determine if profile should be marked complete
        let isComplete = isProfileComplete(
            name: name,
            bio: bio,
            skills: skills,
            interests: interests
        )
        
        let payload = UpdatePayload(
            name: name,
            bio: bio,
            skills: skills,
            interests: interests,
            profile_completed: isComplete
        )
        
        try await supabase
            .from("community")
            .update(payload)
            .eq("id", value: profileId.uuidString)
            .execute()
        
        #if DEBUG
        print("[Profile] ✅ Profile updated")
        print("[Profile]    Complete: \(isComplete)")
        #endif
    }
    
    /// Determines if profile has minimum required fields
    private func isProfileComplete(
        name: String?,
        bio: String?,
        skills: [String]?,
        interests: [String]?
    ) -> Bool {
        guard let name = name, !name.isEmpty else {
            return false
        }
        
        let hasBio = bio?.isEmpty == false
        let hasSkills = skills?.isEmpty == false
        let hasInterests = interests?.isEmpty == false
        
        return hasBio || hasSkills || hasInterests
    }
}

// MARK: - Result Types

struct ResolvedProfileResult {
    let authUser: Supabase.User
    let profile: User
    let state: ProfileState
}

// MARK: - Errors

enum ProfileError: Error {
    case creationFailed
    case updateFailed
    case notAuthenticated
    case decodeFailed(underlying: Error)
    
    var localizedDescription: String {
        switch self {
        case .creationFailed:
            return "Failed to create profile"
        case .updateFailed:
            return "Failed to update profile"
        case .notAuthenticated:
            return "User not authenticated"
        case .decodeFailed(let error):
            return "Failed to decode profile: \(error.localizedDescription)"
        }
    }
}

// MARK: - AnyJSON Extension

private extension AnyJSON {
    var stringValue: String? {
        switch self {
        case .string(let value):
            return value
        default:
            return nil
        }
    }
}
