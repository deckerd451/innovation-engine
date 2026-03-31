import Foundation
import Supabase

@MainActor
final class ProfileService {

    static let shared = ProfileService()

    private let supabase = AppEnvironment.shared.supabaseClient

    private init() {}

    // MARK: - Resolve Profile

    func resolveCurrentProfile() async throws -> ResolvedProfileResult {
        let session = try await supabase.auth.session
        let authUser = session.user

        #if DEBUG
        print("[Profile] 🔍 Resolving Nearify profile")
        print("[Profile]    Auth ID: \(authUser.id)")
        print("[Profile]    Email: \(authUser.email ?? "none")")
        #endif

        if let profile = try await fetchProfile(userId: authUser.id) {
            #if DEBUG
            print("[Profile] ✅ Existing profile found: \(profile.id)")
            #endif
            return ResolvedProfileResult(
                authUser: authUser,
                profile: profile,
                state: .ready
            )
        }

        #if DEBUG
        print("[Profile] 📝 No profile found, creating via ensure_profile RPC")
        #endif

        let profile = try await ensureProfile(authUser: authUser)

        #if DEBUG
        print("[Profile] ✅ Profile ensured: \(profile.id)")
        #endif

        return ResolvedProfileResult(
            authUser: authUser,
            profile: profile,
            state: .ready
        )
    }

    // MARK: - Fetch Profile

    private func fetchProfile(userId: UUID) async throws -> User? {
        do {
            let profiles: [NearifyProfile] = try await supabase
                .from("profiles")
                .select("id,user_id,name,email,avatar_url,bio")
                .eq("user_id", value: userId.uuidString)
                .limit(1)
                .execute()
                .value

            guard let profile = profiles.first else {
                return nil
            }

            return mapToUser(profile)

        } catch {
            let message = String(describing: error)

            if message.contains("0 rows") || message.contains("PGRST116") {
                return nil
            }

            #if DEBUG
            print("[Profile] ❌ Fetch failed: \(error)")
            #endif
            throw error
        }
    }

    // MARK: - Ensure Profile (RPC)

    private func ensureProfile(authUser: Supabase.User) async throws -> User {
        let email = authUser.email ?? "user@example.com"
        let name = email

        let params = EnsureProfileParams(
            p_name: name,
            p_email: email,
            p_avatar_url: ""
        )

        let profile: NearifyProfile = try await supabase
            .rpc("ensure_profile", params: params)
            .execute()
            .value

        return mapToUser(profile)
    }

    // MARK: - Update Profile

    func updateProfile(
        profileId: UUID,
        name: String?,
        bio: String?,
        skills: [String]?,
        interests: [String]?
    ) async throws {
        #if DEBUG
        print("[Profile] 💾 Updating Nearify profile: \(profileId)")
        #endif

        let payload = ProfileUpdatePayload(
            name: name,
            bio: bio
        )

        try await supabase
            .from("profiles")
            .update(payload)
            .eq("id", value: profileId.uuidString)
            .execute()

        #if DEBUG
        print("[Profile] ✅ Nearify profile updated")
        #endif
    }

    // MARK: - Mapping

    private func mapToUser(_ profile: NearifyProfile) -> User {
        User(
            id: profile.id,
            userId: profile.user_id,
            name: profile.name ?? "User",
            email: profile.email,
            bio: profile.bio,
            skills: nil,
            interests: nil,
            imageUrl: profile.avatar_url,
            imagePath: nil,
            profileCompleted: true,
            connectionCount: nil,
            createdAt: nil,
            updatedAt: nil
        )
    }
}

// MARK: - RPC / Payload Models

private struct EnsureProfileParams: Encodable {
    let p_name: String
    let p_email: String
    let p_avatar_url: String
}

private struct ProfileUpdatePayload: Encodable {
    let name: String?
    let bio: String?
}

// MARK: - Models

struct NearifyProfile: Decodable {
    let id: UUID
    let user_id: UUID
    let name: String?
    let email: String?
    let avatar_url: String?
    let bio: String?
}

struct ResolvedProfileResult {
    let authUser: Supabase.User
    let profile: User
    let state: ProfileState
}
