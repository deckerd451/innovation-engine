import Foundation
import Supabase

/// Centralized service for resolving auth users to community profiles.
/// Ensures canonical identity: community.id is the public profile identity.
@MainActor
final class CommunityIdentityService {
    
    static let shared = CommunityIdentityService()
    
    private let supabase = AppEnvironment.shared.supabaseClient
    
    private init() {}
    
    // MARK: - Profile Resolution
    
    /// Resolves the authenticated user to exactly one community profile.
    /// Resolution order:
    /// A. Exact linked match (community.user_id == auth.users.id)
    /// B. Exact email match to unlinked profile
    /// C. Ambiguous match (multiple unlinked profiles) - returns candidates
    /// D. No match - creates new profile
    func resolveOrCreateProfile(for session: Session) async throws -> ProfileResolutionResult {
        let authUserId = session.user.id
        let authEmail = session.user.email ?? ""
        
        print("[Identity] 🔍 Resolving profile for auth user: \(authUserId)")
        print("[Identity]    Email: \(authEmail)")
        
        // Step A: Check for exact linked match
        if let linkedProfile = try await findLinkedProfile(authUserId: authUserId) {
            print("[Identity] ✅ Found linked profile: \(linkedProfile.id)")
            return .resolved(linkedProfile)
        }
        
        // Step B & C: Check for unlinked profiles by email
        let unlinkedProfiles = try await findUnlinkedProfilesByEmail(email: authEmail)
        
        if unlinkedProfiles.isEmpty {
            // Step D: No match found, create new profile
            print("[Identity] 📝 No existing profile found, creating new")
            let newProfile = try await createNewProfile(session: session)
            print("[Identity] ✅ Created new profile: \(newProfile.id)")
            return .resolved(newProfile)
        }
        
        if unlinkedProfiles.count == 1 {
            // Step B: Exactly one unlinked match, link it
            let profile = unlinkedProfiles[0]
            print("[Identity] 🔗 Found unlinked profile by email: \(profile.id)")
            try await linkProfile(communityId: profile.id, to: authUserId)
            print("[Identity] ✅ Linked existing profile: \(profile.id)")
            
            // Reload to get updated user_id
            let linkedProfile = try await loadProfile(communityId: profile.id)
            return .resolved(linkedProfile)
        }
        
        // Step C: Multiple unlinked matches, need user choice
        print("[Identity] ⚠️ Found \(unlinkedProfiles.count) ambiguous unlinked profiles")
        return .ambiguous(unlinkedProfiles)
    }
    
    /// Links an existing community profile to an auth user.
    func linkProfile(communityId: UUID, to authUserId: UUID) async throws {
        print("[Identity] 🔗 Linking community \(communityId) to auth user \(authUserId)")
        
        struct UpdatePayload: Encodable {
            let user_id: String
        }
        
        try await supabase
            .from("community")
            .update(UpdatePayload(user_id: authUserId.uuidString))
            .eq("id", value: communityId.uuidString)
            .execute()
        
        print("[Identity] ✅ Link complete")
    }
    
    /// Loads a community profile by community.id
    func loadProfile(communityId: UUID) async throws -> User {
        print("[Identity] 📥 Loading profile: \(communityId)")
        
        let profile: User = try await supabase
            .from("community")
            .select()
            .eq("id", value: communityId.uuidString)
            .single()
            .execute()
            .value
        
        return profile
    }
    
    // MARK: - Private Helpers
    
    private func findLinkedProfile(authUserId: UUID) async throws -> User? {
        do {
            let profile: User = try await supabase
                .from("community")
                .select()
                .eq("user_id", value: authUserId.uuidString)
                .single()
                .execute()
                .value
            
            return profile
        } catch {
            // No linked profile found
            return nil
        }
    }
    
    private func findUnlinkedProfilesByEmail(email: String) async throws -> [User] {
        guard !email.isEmpty else {
            return []
        }
        
        let profiles: [User] = try await supabase
            .from("community")
            .select()
            .eq("email", value: email)
            .is("user_id", value: nil)
            .execute()
            .value
        
        return profiles
    }
    
    private func createNewProfile(session: Session) async throws -> User {
        let authUserId = session.user.id
        let email = session.user.email ?? "user@example.com"
        let metadata = session.user.userMetadata
        
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
        }
        
        let newProfile = NewProfile(
            user_id: authUserId.uuidString,
            name: name,
            email: email,
            image_url: imageUrl
        )
        
        try await supabase
            .from("community")
            .insert(newProfile)
            .execute()
        
        // Load the created profile
        let profile: User = try await supabase
            .from("community")
            .select()
            .eq("user_id", value: authUserId.uuidString)
            .single()
            .execute()
            .value
        
        return profile
    }
}

// MARK: - Resolution Result

enum ProfileResolutionResult {
    case resolved(User)
    case ambiguous([User])
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
