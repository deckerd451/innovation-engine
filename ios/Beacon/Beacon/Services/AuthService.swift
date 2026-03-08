import Foundation
import Combine
import Supabase
import UIKit

final class AuthService: ObservableObject {
    static let shared = AuthService()

    @Published var isAuthenticated = false
    @Published var currentUser: User?

    private let supabase = AppEnvironment.shared.supabaseClient
    private var authStateTask: Task<Void, Never>?

    private init() {
        observeAuthState()
    }

    deinit {
        authStateTask?.cancel()
    }

    private func observeAuthState() {
        authStateTask?.cancel()

        authStateTask = Task { [weak self] in
            guard let self else { return }

            await self.checkInitialSession()

            for await (_, session) in supabase.auth.authStateChanges {
                await self.handleAuthStateChange(session: session)
            }
        }
    }

    private func checkInitialSession() async {
        do {
            let session = try await supabase.auth.session
            await handleAuthStateChange(session: session)
        } catch {
            await MainActor.run {
                self.isAuthenticated = false
                self.currentUser = nil
            }
        }
    }

    private func handleAuthStateChange(session: Session?) async {
        guard let session = session, !session.isExpired else {
            await MainActor.run {
                self.isAuthenticated = false
                self.currentUser = nil
            }
            return
        }

        await loadCurrentUser()
    }

    func signIn(email: String, password: String) async throws {
        try await supabase.auth.signIn(email: email, password: password)
        await loadCurrentUser()
    }

    func signOut() async throws {
        try await supabase.auth.signOut()

        await MainActor.run {
            self.isAuthenticated = false
            self.currentUser = nil
        }
    }

    // MARK: - OAuth

    @MainActor
    func signInWithOAuth(provider: Provider) async throws {
        let url = try supabase.auth.getOAuthSignInURL(
            provider: provider,
            redirectTo: URL(string: "beacon://callback")
        )

        await UIApplication.shared.open(url)
    }

    @MainActor
    func handleOAuthCallback(url: URL) async {
        do {
            _ = try await supabase.auth.session(from: url)
            await loadCurrentUser()
        } catch {
            print("OAuth callback error: \(error)")
            self.isAuthenticated = false
            self.currentUser = nil
        }
    }

    private func loadCurrentUser() async {
        do {
            let session = try await supabase.auth.session
            let userId = session.user.id

            do {
                let response: User = try await supabase
                    .from("community")
                    .select()
                    .eq("user_id", value: userId.uuidString)
                    .single()
                    .execute()
                    .value

                await MainActor.run {
                    self.currentUser = response
                    self.isAuthenticated = true
                }
            } catch {
                print("Community profile not found, creating new profile...")
                try await createCommunityProfile(session: session)

                let response: User = try await supabase
                    .from("community")
                    .select()
                    .eq("user_id", value: userId.uuidString)
                    .single()
                    .execute()
                    .value

                await MainActor.run {
                    self.currentUser = response
                    self.isAuthenticated = true
                }
            }
        } catch {
            print("Error loading user: \(error)")

            await MainActor.run {
                self.currentUser = nil
                self.isAuthenticated = false
            }
        }
    }

    private func createCommunityProfile(session: Session) async throws {
        let userId = session.user.id
        let email = session.user.email ?? "user@example.com"
        let metadata = session.user.userMetadata

        let name: String
        if let fullName = metadata["full_name"]?.stringValue {
            name = fullName
        } else if let userName = metadata["name"]?.stringValue {
            name = userName
        } else {
            name = email.components(separatedBy: "@").first ?? "User"
        }

        let newProfile = NewCommunityProfile(
            user_id: userId.uuidString,
            name: name,
            email: email
        )

        try await supabase
            .from("community")
            .insert(newProfile)
            .execute()

        print("Created community profile for user: \(userId)")
    }
}

private struct NewCommunityProfile: Encodable {
    let user_id: String
    let name: String
    let email: String
}

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
